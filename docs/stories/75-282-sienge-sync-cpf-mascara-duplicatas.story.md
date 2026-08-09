# Story 75-282 — Sync Sienge: CPF com máscara não casa e o cliente duplica a cada sync

**Story ID:** 75-282
**Epic:** 75 (CRM Trifold) · **Status:** Done · **Estimativa:** M (~5 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Dependências:** nenhuma. Toca `lib/integrations/sienge/sync.ts` e as rotas de cadastro de
  cliente; não depende de story em andamento.

**CodeRabbit Integration:** Disabled (`coderabbit_integration` ausente do `core-config.yaml`).

---

## Story

Como **gestor que abre a aba Clientes de uma obra**, quero que o selo "Sienge vinculado" diga a
verdade — hoje um cliente que **existe no Sienge** aparece como não vinculado só porque o CPF dele
foi digitado com pontinhos no CRM.

E como **dono da base**, quero que o sync **nunca** crie um cliente que já existe: hoje o MAKTUB tem
**5 linhas** na tabela `clientes` e ganha uma nova a cada vez que alguém aperta "Sincronizar".

---

## Context

Achado em 07/08 pelo Marcos: **Sônia Berenice Rieiro de Lima** (unidade 502 do Vind Residence)
aparecia com o selo "Sienge não vinculado", embora exista no Sienge (código **1521**, CPF
`207.363.470-20`). Diagnóstico feito contra **produção** (`dsopqkqjkmhytudaaolv`).

### Causa-raiz 1 — o casamento por CPF compara string bruta

`packages/web/src/lib/integrations/sienge/sync.ts:272-278`, em `findOrCreateCliente`:

```ts
const cpfSanitized = customer.cpf?.replace(/\D/g, "") || null   // :193 → '20736347020'
...
.eq("cpf", cpfSanitized)                                        // :277
```

O lado do CRM **não** é normalizado. `POST /api/admin/clientes` grava o CPF exatamente como veio do
formulário (`route.ts:152` — `body.cpf.trim()`, nada mais), e o input tem máscara. A checagem de
unicidade da própria rota também é literal (`route.ts:179`), então o mesmo CPF pode entrar duas
vezes — uma com máscara, uma sem.

Estado medido em prod (07/08):

| `clientes.cpf` | Linhas |
|---|---|
| sem máscara (só dígitos) | 58 |
| **com máscara** | **19** |
| nulo | 13 |

Para qualquer uma dessas 19 linhas, `.eq("cpf", '20736347020')` **nunca** casa.

A Sônia só acabou vinculada porque o sync tem um segundo caminho, o fallback por e-mail
(`sync.ts:302-308`), e o e-mail dela batia. Gravado às **07:19:40** de 07/08, pelo sync do Vind que
terminou 07:19:49 (`obras.sienge_last_synced_at`). O print do Marcos é de 07:20:58 — tela sem
refresh. Hoje ela está com `sienge_customer_id = 1521` e contrato `VIND-502`.

**A Sônia foi salva por sorte. Quando o e-mail também não casa, o sync cria um cliente novo.**

### Causa-raiz 2 — `maybeSingle()` com e-mail repetido cai em "criar novo"

O fallback por e-mail usa `.maybeSingle()`, que **retorna erro** quando a consulta traz mais de uma
linha (PostgREST `PGRST116`). O código lê só `data` e ignora `error`:

```ts
const { data: byEmail } = await supabaseAdmin ... .maybeSingle()   // :303-308
const existing = byEmail as ClienteRow | null
if (existing) { ...atualiza... }
// error ignorado → existing === null → segue para o INSERT de :335
```

Erro de consulta e "não existe" viram a mesma coisa. O sync então **cria** o cliente.

### A prova: o MAKTUB e sua linhagem de duplicatas

Todas as 5 linhas com `email = anicolau0713@gmail.com` e nome MAKTUB, mais a colisão que abriu o
buraco:

| Data | Linha criada | CPF | `sienge_customer_id` | Vínculo |
|---|---|---|---|---|
| 27/05 | MAKTUB **original** | `865.001.559-04` (com máscara) | 1437 | Vind u.804 + Yarden u.301 |
| 15/07 | "Alexandre G. Nicolau" | `52723100987` | null | Vind u.804 |
| 17/07 | MAKTUB duplicata 1 | null | 1437 | — (órfã) |
| 22/07 | MAKTUB duplicata 2 | null | 1437 | — (órfã) |
| 22/07 | MAKTUB duplicata 3 | null | 1437 | — (órfã) |
| **07/08** | MAKTUB duplicata 4 | null | 1437 | Vind, **unidade nula** |

O mecanismo, passo a passo:

1. 15/07 — cadastram "Alexandre G. Nicolau" com **o mesmo e-mail** do MAKTUB. A partir daqui, dois
   registros compartilham `anicolau0713@gmail.com`.
2. Sync roda. CPF do Sienge (`86500155904`) não casa com `865.001.559-04` → causa-raiz 1.
3. Fallback por e-mail: 2 linhas → `maybeSingle()` erra → erro ignorado → causa-raiz 2.
4. `INSERT` de cliente novo. E agora são 3 linhas com o mesmo e-mail — **o defeito se realimenta**.

É por isso que o MAKTUB aparece **duas vezes** na aba Clientes do Vind: a linha de 27/05 (unidade
804) e a de 07/08 (unidade nula), ambas com vínculo na obra.

### Fila de risco (medida, não estimada)

**8 clientes com CPF mascarado e sem vínculo Sienge** — todos vão falhar o casamento por CPF no
próximo sync:

Ary Lucio Fontes · Felipe Henrique Fertonani · **Francisco José Scramin** · José Rodinei Palota ·
Mariana Queiroz Meneguello · Samara F Braz da Cruz · Sandra L de O Cardoso · Walter Palma Seixas Marin

**O Francisco José Scramin duplica no próximo sync do Vind**: CPF `634.220.859-04` (mascarado) e
e-mail `francisco.scramin@gmail.com` **já repetido em 2 linhas** — as duas condições do MAKTUB, já
satisfeitas. Ele tem as unidades 501, 602, 701 e 1004.

### Por que isso é pior do que um selo errado

`sienge_customer_id` é a chave que o portal do cliente usa para buscar extrato, boleto e informe de
IR (`app/cliente/[obra_id]/financeiro/*`). Cliente não vinculado = **cliente sem financeiro no
portal**. E duplicata com vínculo na obra significa que um mesmo comprador pode receber notificação
e documento em dobro, ou nenhum, dependendo de qual linha o código pega.

---

## Acceptance Criteria

- [x] **AC1 — CPF casa por dígitos.** No sync, um cliente do CRM cadastrado com `207.363.470-20`
      casa com o CPF `20736347020` vindo do Sienge (e vice-versa). Vale para todos os 19 registros
      mascarados de hoje, sem depender de a migration do AC5 ter rodado.
- [x] **AC2 — erro de consulta nunca cria cliente.** O ramo de `INSERT` só é alcançado quando as
      buscas **respondem** e vêm vazias. Consulta com erro (incluindo múltiplas linhas) → aborta
      aquele contrato, sem criar nada.
- [x] **AC3 — ordem de casamento explícita**, do forte para o fraco:
      1. `sienge_customer_id` — quando há mais de uma linha (caso MAKTUB, 5 linhas com 1437), usa a
         **mais antiga** (`created_at` asc). É a linha canônica, a que tem os vínculos.
      2. **CPF por dígitos** — mesma regra de desempate.
      3. **E-mail** — chave fraca: se trouxer mais de uma linha, **não escolhe nenhuma e não cria**.
         Pula o contrato e loga (AC4). Duas pessoas diferentes podem compartilhar e-mail — é
         exatamente o caso Alexandre × MAKTUB —, então adivinhar aqui é o que gerou a duplicata.
- [x] **AC4 — ambiguidade grita.** E-mail ambíguo emite `logEvent` (`lib/logger.ts`) com
      `level: "warn"`, `category: "system"`, `event_type: "SIENGE_SYNC_AMBIGUOUS_EMAIL"`, e-mail,
      `sienge_customer_id` e as `clientes.id` candidatas. Hoje o sync erra em silêncio.
      Mantém a postura fail-open: loga e segue para o próximo contrato, não derruba o sync.
- [x] **AC5 — CPF nasce normalizado.** `POST /api/admin/clientes` e `PATCH /api/admin/clientes/[id]`
      gravam só dígitos, e a checagem de unicidade passa a comparar dígitos. Migration **216**:
      backfill das 19 linhas mascaradas + trigger `BEFORE INSERT/UPDATE` que normaliza no banco
      (invariante independe de quem escreve — o CRM tem mais de um caminho de escrita) + índice
      único parcial `(org_id, cpf) WHERE cpf IS NOT NULL`.
      - ✅ **Verificado em prod:** **zero** CPFs duplicados por dígitos → o backfill não colide e o
        índice único é aplicável hoje. Também confirmado que **não existe** constraint/índice de CPF
        em `clientes` atualmente (só `pkey`, `org_id_idx`, `email_idx`).
- [x] **AC6 — teste de regressão do caso real.** Com um fake do Supabase: (a) cliente com CPF
      mascarado + customer Sienge com CPF limpo → **casa, não cria**; (b) e-mail em 2 linhas + CPF
      que não casa → **não cria** e loga `SIENGE_SYNC_AMBIGUOUS_EMAIL`; (c) 5 linhas com o mesmo
      `sienge_customer_id` → casa a mais antiga. O (b) é o teste que reproduz o MAKTUB.
      - ⚠️ O fake do Supabase do repo **ignora `.eq()`** (ver [[project-nicole-envio-midia-proativo]]).
        O fake desta story precisa honrar filtro e ordenação, senão o teste passa sem exercitar a
        regra. Verificar antes de escrever os casos.
- [x] **AC7 — limpeza dos dados.** ✅ APLICADO 07/08 (ver Deploy abaixo). Script SQL idempotente que remove as **3 duplicatas órfãs** do
      MAKTUB (17/07, 22/07 ×2 — sem vínculo, sem uso) e consolida a de 07/08 (vínculo duplicado no
      Vind, unidade nula) na linha canônica de 27/05. Entregue como SQL revisável e **aplicado só
      com aprovação explícita do Marcos**, validado antes em transação revertida
      (ver [[project-migrations]]).
      - ⚠️ Antes de apagar: conferir se as órfãs são referenciadas por `clientes_obras_vinculos`,
        `obra_documentos.cliente_obra_id` ou qualquer FK — a checagem faz parte do entregável, não
        pode ser suposta.

---

## Fora de escopo

- **Unificar `clientes` × `users`(role cliente).** O espelhamento por e-mail é frágil e aparece em
  vários lugares (`sienge-vincular/route.ts:95-101`, `sync.ts:463`), mas trocar isso é épico
  próprio.
- **Deduplicar o resto da base.** Só o MAKTUB tem duplicata comprovada de sync. `francisco.scramin`
  tem e-mail repetido, mas as duas linhas são cadastros distintos — decisão de negócio, não técnica.
- **Sync automático (cron).** Hoje é botão manual por obra; continua sendo.
- **Corrigir o refresh da aba Clientes.** O `router.refresh()` existe (`clientes-tab.tsx:190`); o
  print desatualizado do Marcos foi tela aberta durante o sync, não bug provado. Se reaparecer, story
  própria.
- **Normalizar CPF em outras tabelas** (`users.cpf`, `leads`). Mesma classe de defeito, escopo maior.

---

## Riscos

- **Índice único de CPF (AC5) pode barrar escrita legítima em prod.** Hoje não há colisão, mas o
  índice transforma um cadastro duplicado em erro 500 em vez de 409. Mitigação: a rota já rejeita
  duplicado com 409 **antes** do INSERT (passando a comparar por dígitos), e o @qa valida a migration
  em transação revertida contra prod antes de aplicar.
- **AC3 escolhendo "a mais antiga" mascara o problema de dados.** É determinístico e para de
  duplicar, mas convive com as duplicatas até o AC7 rodar. Aceito de propósito: o código precisa ser
  seguro **antes** de mexer em dado de produção.
- **O trigger de normalização altera dado na escrita.** Se algum fluxo depende do CPF formatado
  para exibir, a tela passa a mostrar dígitos crus. Verificar a formatação na exibição
  (`clientes-tab.tsx:573` imprime `c.cpf` direto) — pode exigir formatar na leitura.

---

## Sequência de implementação (@dev)

1. **Testes primeiro** (AC6) — vermelhos antes da correção. Começar checando o comportamento do fake
   do Supabase com `.eq()`/`.order()`.
2. **AC1/AC2/AC3** em `findOrCreateCliente` — o coração da story. Rodar a suíte de `sienge` inteira.
3. **AC4** (logEvent) — independente, depois do 2.
4. **AC5** rotas + migration 216. A migration é o passo mais arriscado: escrever idempotente,
   arquivo inteiro em um POST via Management API (ver [[project-migrations]]), **nunca `db push`**.
5. **AC7** por último, e só depois do aval do Marcos: dado de produção não volta.

## Notas para o @dev

- `getCustomerById` (`client.ts`) já traz o CPF do Sienge; a sanitização em `sync.ts:193` está certa
  — o defeito é do lado do CRM.
- `searchCustomerByCpf` (`client.ts:84`) faz o caminho inverso (Sienge → CPF) e **já normaliza os
  dois lados** (`:97`). Serve de referência do que o `sync.ts` deveria fazer.
- Não duplicar a função de sanitização (ver [[feedback-consultar-fonte-nao-duplicar-constante]]) —
  ver onde ela mora no achado @po-1 abaixo.

---

## Validação @po (07/08) — GO

Checklist de 10 pontos: **9 GO / 1 ajuste**, aplicado direto na story (achados abaixo). Nenhum AC
depende de informação que não esteja no repo ou medida em prod.

- **@po-1 — o helper de CPF já existe, mas não em `@trifold/shared`.** `packages/shared/src` **não
  tem nada de CPF** (verificado). O que existe é `packages/web/src/lib/validation/contato.ts`:
  `maskCpf`, `maskCpfCnpj` (`:73`) e `isValidCpf` (`:78`, com dígito verificador). **A normalização
  (`só dígitos`) deve nascer ali**, ao lado das irmãs, e ser importada pelo sync e pelas rotas.
  Corrige a nota que mandava procurar em `@trifold/shared`.
- **@po-2 — `maskCpfCnpj` não é usada em lugar nenhum hoje** (grep: zero consumidores fora do
  próprio módulo). Isso resolve o Risco 3 de graça: `clientes-tab.tsx:570` imprime `{c.cpf}` cru, e
  passar a exibir `maskCpfCnpj(c.cpf)` mantém a tela igual ao que o usuário vê hoje, mesmo com o dado
  normalizado no banco. **Vira parte do AC5**, não item solto — sem isso, os 19 clientes passam a
  aparecer com CPF cru na tela.
- **@po-3 — o alerta do AC6 sobre o fake se confirma.** `google-mirror.test.ts:28-36` tem
  `eq: () => Promise.resolve(...)` — **ignora o filtro**. Um fake nesse molde faria o teste do AC3
  (desempate por `created_at`) passar sem exercitar nada. O fake desta story precisa honrar
  `.eq()`/`.in()`/`.order()`/`.limit()`.
- **@po-4 — AC7 auditado linha a linha em prod.** Três tabelas referenciam `clientes`:
  `clientes_obras_vinculos` (CASCADE), `brindes_destinatarios` (SET NULL) e
  `conversations.relationship_cliente_id` (SET NULL). Contagem por linha do MAKTUB:

  | Linha | `vinculos` | `brindes` | `conversas` | Veredito |
  |---|---|---|---|---|
  | 27/05 (canônica) | **2** | **1** | 0 | preservar |
  | 17/07 | 0 | 0 | 0 | órfã — apagar |
  | 22/07 | 0 | 0 | 0 | órfã — apagar |
  | 22/07 | 0 | 0 | 0 | órfã — apagar |
  | 07/08 | **1** | 0 | 0 | apagar o vínculo duplicado (Vind, unidade nula) e a linha |

  As três de julho estão **provadamente sem uso** — o `DELETE` não perde dado. A de 07/08 tem
  `ON DELETE CASCADE` no vínculo, então apagar a linha leva o vínculo duplicado junto; o contrato
  `VIND-804` já está na canônica. **Nenhuma dedução: contagens medidas.**
- **@po-5 — sequência confirmada:** o AC7 é o último e exige aval do Marcos. O código sai seguro
  antes de qualquer `DELETE` em produção.

---

## Dev Agent Record (@dev, 07/08)

### Red antes de green — provado, não afirmado

`sync.test.ts` foi escrito primeiro e rodado contra o `sync.ts` **original** (via
`git stash push` do arquivo, só dele):

| Teste | Sem o fix | Com o fix |
|---|---|---|
| AC1 — CPF mascarado casa | ❌ falha (criava cliente) | ✅ |
| AC3 — desempata pela linha mais antiga | ❌ falha (criava cliente) | ✅ |
| AC2/AC4 — e-mail ambíguo não cria e loga | ❌ falha (criava cliente) | ✅ |
| cliente realmente novo continua sendo criado | ✅ | ✅ |

> ⚠️ **O fake precisou ser corrigido para o teste ser honesto.** Na 1ª versão, `maybeSingle()`
> devolvia `rows[0]` quando havia várias linhas — assim o teste do AC2 **passava sem o fix**.
> O PostgREST real devolve **erro `PGRST116`**; o fake agora faz isso, e é exatamente essa
> resposta que o código antigo tratava como "não existe". Sem essa correção a suíte teria dado
> falso verde — é o mesmo risco de fake permissivo já registrado em
> [[project-nicole-envio-midia-proativo]].

### Migration 216 validada CONTRA PRODUÇÃO em transação revertida

Rodada dentro de `begin; … rollback;` no projeto `dsopqkqjkmhytudaaolv`:

| Prova | Resultado |
|---|---|
| CPFs mascarados restantes após backfill | **0** (eram 19) |
| CPF da Sônia após backfill | `20736347020` |
| Trigger normaliza escrita mascarada (`update … '111.444.777-35'`) | gravou `11144477735` |
| Índice único barra duplicata (`insert` do mesmo CPF) | `unique_violation` capturada |
| Índice `clientes_org_cpf_uniq` criado | sim |
| **Estado de prod após o rollback** | intacto: 19 mascarados, índice ausente |

### Script de limpeza (AC7) — dry-run, NÃO aplicado

`scripts/75-282-limpeza-duplicatas-maktub.sql`, PASSO 2 rodado com `rollback`:
resultado `linhas_maktub = 1`, `vinculos_restantes = 2`, `unidades = "301, 804"` — as duas
legítimas (Yarden 301 e Vind 804). Produção segue com as 5 linhas. **Aguarda aprovação do
Marcos para o `commit`.**

### Suíte completa

`146 arquivos / 1795 testes` passando · `tsc --noEmit` limpo · `eslint` limpo nos arquivos
tocados (o `no-this-alias` que apareceu no fake foi corrigido reescrevendo a classe como
factory, não silenciando a regra).

### File List

| Arquivo | O que mudou |
|---|---|
| `packages/web/src/lib/integrations/sienge/sync.ts` | ordem de casamento (sienge_id → CPF por dígitos → e-mail único), `Lookup` discriminado, erro nunca vira "não existe", `logEvent` de ambiguidade |
| `packages/web/src/lib/integrations/sienge/sync.test.ts` | **novo** — 4 testes + fake PostgREST que honra `.eq/.in/.order/.limit` e erra em `maybeSingle` com múltiplas linhas |
| `packages/web/src/lib/validation/contato.ts` | **novo** `normalizeCpfCnpj` (ao lado de `maskCpfCnpj`/`isValidCpf`) |
| `packages/web/src/app/api/admin/clientes/route.ts` | grava CPF só-dígitos; unicidade compara os dois formatos |
| `packages/web/src/app/api/admin/clientes/[id]/route.ts` | idem, normalizando antes da checagem de obrigatoriedade |
| `packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx` | exibe `maskCpfCnpj(c.cpf)` — tela não muda para o usuário |
| `packages/web/src/lib/portal/viewer.ts` | máscara na leitura (entra nos PDFs de extrato/informe) |
| `supabase/migrations/216_clientes_cpf_normalizado.sql` | **novo** — backfill + trigger + índice único parcial |
| `scripts/75-282-limpeza-duplicatas-maktub.sql` | **novo** — data fix pontual, com passo de conferência |

### Desvio do plano — justificado

A story previa normalizar apenas nas rotas; o `viewer.ts` entrou porque é ele quem alimenta
`clienteCpf` nos PDFs do portal. Sem isso, os 19 clientes normalizados passariam a ter CPF cru
**no informe de IR** — regressão visível para o cliente final.

---

## QA Results (@qa, 07/08)

**Verdict: PASS** — depois de um **FAIL** na 1ª rodada. O que o gate pegou:

### 🔴 FAIL da 1ª rodada — o AC5 introduzia 4 regressões

Normalizar a coluna sem varrer quem a lê deixaria estes caminhos comparando CPF **literal**
contra dado normalizado:

| Onde | O que quebrava | Gravidade |
|---|---|---|
| `api/admin/obras/[obra_id]/clientes/route.ts:114` | **"Vincular cliente por CPF"** da aba Clientes — o formulário do print do Marcos. Digitar `207.363.470-20` deixaria de achar a Sônia e responderia "CPF não encontrado no cadastro" | **ALTA** |
| mesma rota, `:211` | check anti-duplicata antes de criar cliente: não achando o existente, **criaria cliente duplicado** — o mesmo defeito que a story vem consertar, por outra porta | **CRÍTICA** |
| mesma rota, INSERT do modo A | gravava `cpf: cpf.trim()` mascarado, contra a invariante nova | MÉDIA |
| `api/admin/clientes/search/route.ts:52` e `:57` | busca por CPF exato e o `ilike` da busca livre parariam de casar com termo pontuado | MÉDIA |
| `lib/portal/viewer.ts:116` | comparava `clientes.cpf` (normalizado) com `users.cpf` (**não** normalizado — fora de escopo): a resolução do `portalUserId` passaria a falhar calada | MÉDIA |

Corrigido com um único helper — `cpfLookupValues()` em `lib/validation/contato.ts` — usado em
**todos** os pontos de busca, em vez de cada rota montar o par de formatos por conta
(ver [[feedback-consultar-fonte-nao-duplicar-constante]]). As rotas que eu mesmo havia escrito
com o array inline foram refatoradas para o helper.

### Checks do gate

| # | Check | Resultado |
|---|---|---|
| 1 | Code review (padrões, legibilidade) | ✅ helper único; `Lookup` discriminado explicita erro × vazio × ambíguo |
| 2 | Testes unitários | ✅ 12 novos (4 de sync + 8 de contato); **red provado** sem o fix |
| 3 | ACs atendidos | ✅ AC1–AC6; AC7 entregue como script, pendente de aprovação |
| 4 | **Sem regressão** | ✅ após os 5 consertos acima + `147 arquivos / 1803 testes` verdes |
| 5 | Performance | ✅ o sync passou de 1–2 para até 3 consultas por contrato, todas por índice/PK; `.limit(1)`/`.limit(2)` em vez de varredura |
| 6 | Segurança | ✅ nenhuma policy tocada; `.in()` recebe valor derivado de `replace(/\D/g)` (só dígitos), sem interpolação de string crua no filtro |
| 7 | Documentação | ✅ story + comentários de causa-raiz no código e na migration |

### Observações (não bloqueiam)

- **`users.cpf` continua sem normalização** (declarado fora de escopo). O `viewer.ts` agora
  compara os dois formatos, mas a dívida existe e vale story própria — mesma classe de defeito.
- **O `.limit(1)` antes de `maybeSingle()`** nas checagens de unicidade evita o `PGRST116` que
  originou este bug. Vale como convenção: `maybeSingle()` sem `limit` é uma armadilha quando a
  coluna não tem unique.
- **A migration 216 precisa ser aplicada junto com o deploy.** Se o código subir sem ela, nada
  quebra (a busca cobre os dois formatos), mas os 19 registros seguem mascarados.

---

## Deploy (@devops, 07/08)

PR **#372** squash-merged em `main` (`ada7db42`). Deploy de produção `Ready` **antes** de tocar no
banco — ordem deliberada: se a coluna fosse normalizada primeiro, o código antigo (que comparava CPF
com máscara) quebraria "Vincular cliente por CPF" na janela entre migration e deploy.

### Migration 216 aplicada em produção

Via Management API, arquivo inteiro em um POST (ver [[project-migrations]]). Estado depois:

| Verificação | Antes | Depois |
|---|---|---|
| CPFs mascarados | 19 | **0** |
| Índice `clientes_org_cpf_uniq` | ausente | criado |
| Trigger `normalize_clientes_cpf_trg` | ausente | ativo |
| CPF da Sônia | `207.363.470-20` | `20736347020` |

### Limpeza do MAKTUB aplicada

Passo de conferência rodado primeiro — as 4 linhas a apagar tinham exatamente as contagens
previstas na validação @po. Após o `commit`: **1 linha**, `2 vínculos`, unidades `301, 804` (Yarden
301 + Vind 804, as legítimas). O brinde da linha canônica foi preservado.

### Estado final do Vind — 4 clientes seguem sem vínculo Sienge

`Alexandre G. Nicolau` (804) · `Francisco José Scramin` (501, 602, 701 e 1004) ·
`Samara F Braz da Cruz` (1337) · `Vinicius Nery` (903)

Todos agora com **CPF normalizado**, ou seja: casáveis por CPF no próximo sync, que era o que
falhava. Dois deles (`anicolau0713@gmail.com`, `francisco.scramin@gmail.com`) continuam com e-mail
duplicado — e isso agora é **seguro**: em vez de criar duplicata, o sync loga
`SIENGE_SYNC_AMBIGUOUS_EMAIL` e pula. A duplicidade de e-mail em si é cadastro legítimo (pessoa
física × holding), não lixo a limpar.

### Validação que falta — só o Marcos pode fazer

Apertar **"Sincronizar clientes"** na obra Vind e conferir que (a) os selos ficam verdes para quem
existe no Sienge e (b) **nenhuma linha nova** aparece em `clientes`. Não rodei o sync por conta
própria porque ele cria vínculos e usuários de portal — efeito externo que não estava autorizado.
Depois do sync, conferir o log:

```sql
select created_at, message, metadata from system_events
where event_type = 'SIENGE_SYNC_AMBIGUOUS_EMAIL' order by created_at desc;
```
