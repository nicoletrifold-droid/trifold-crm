# Story 900-61 — `org_integrations` ganha `last_error` e `last_check_at`

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** item de fundação isolado, pedido explícito do dono do produto em 2026-08-31 —
  **não faz parte da Fase 1 do console** (`docs/ux/console-plataforma.md` §6 lista isto como
  entrega `2.1`, Fase 2), mas o pedido nomeia as duas colunas como "o item de fundação de melhor
  retorno" e pede que sejam fatiadas AGORA, independente do resto da Fase 2 (que fica bloqueada
  por `900-42a`/SEC-001 — ver "Por que esta story não depende de `900-42a`" abaixo).
- **Story:** 900-61 — próximo número livre desta leva (sem colisão, verificado 2026-08-31).
- **Status:** Ready for Review
- **Priority:** P1.
- **Complexity:** P — uma migration aditiva de 2 colunas + ajuste em 2 funções `SECURITY DEFINER`
  já existentes.
- **Depends on:** recomenda-se sequenciar depois de **`900-57`** (casca da empresa), que é onde o
  dado passa a ter uma tela para aparecer (aba Integrações e card de Integrações do Resumo). Não é
  bloqueio de schema — a migration pode ser aplicada e as funções ajustadas independentemente da
  UI.

### Por que esta story NÃO depende de `900-42a` (SEC-001)
O desenho do @ux gate a Fase 2 inteira atrás do fechamento do SEC-001 ("2.0 ⚠️ Fechar o SEC-001 —
bloqueante"), porque a Fase 2 mostra **contagens agregadas de leads/conversas/mensagens** — dado
de dentro da empresa, o que o furo de embedding poderia vazar. **Esta story é diferente:**
`org_integrations` já está em `PLATFORM_READABLE_TABLES` desde a `900-51`, as duas colunas novas
são metadado técnico sobre a PRÓPRIA integração (mensagem de erro do provider, timestamp da
última tentativa) — não dado de lead, conversa ou mensagem — e nenhuma consulta desta story usa
embedding. **[AUTO-DECISÃO]** Fatiar independente de `900-42a` → decisão: sim, porque o risco que
o SEC-001 fecha não se aplica ao dado que esta story expõe.

### Executor Assignment
- **Executor:** @dev (Dex).
- **Executor (migration):** @data-engineer (Dara).
- **Quality Gate:** @dev (pre-commit).
- **Quality Gate Tools:** `[code_review, migration_review]`.

---

## User Story
**Como** operador da Trifold olhando o painel de integrações de uma empresa,
**eu quero** ver desde quando uma integração está em erro e qual foi a última mensagem de erro,
**para que** eu não precise ligar para o cliente só para descobrir "há quanto tempo isso está
quebrado" — que é justamente a pergunta que evita a ligação.

---

## Acceptance Criteria

**AC1 — Migration aditiva: 2 colunas novas em `org_integrations`.**
```sql
ALTER TABLE org_integrations
  ADD COLUMN last_error text,
  ADD COLUMN last_check_at timestamptz;
```
Nullable, sem default — linhas existentes ficam com `NULL` nas duas (nenhuma integração hoje tem
"última checagem" real; inventar uma data seria dado falso). **Número da migration: NÃO herdar
um número deste rascunho.** No dia da implementação: `git fetch --prune origin` e conferir contra
TODAS as refs — conhecido hoje (2026-08-31): `249` reservada por `900-52` (Draft, não mergeada);
`250` é o início declarado do Epic 91 (`docs/stories/epics/epic-91-business-manager-do-cliente.md`
§"Migrations deste epic começam em `250`", ainda sem stories drafted com número fixo). Começar a
verificação a partir de `251`, e não assumir que nenhuma das duas mudou de estado.

**AC2 — `_org_integration_mark_error` passa a gravar as duas colunas.**
Hoje (migration `248`, linha 410): `UPDATE org_integrations SET status = 'error', updated_at =
now() WHERE id = v_row_id;`. Passa a ser:
```sql
UPDATE org_integrations
   SET status = 'error', updated_at = now(), last_error = p_codigo, last_check_at = now()
 WHERE id = v_row_id;
```
`p_codigo` já é parâmetro da função — hoje ele só vai para o `metadata` da trilha (linha 419), sem
ficar na própria linha. Esta story faz a informação que já existe (mas só na trilha) também
ficar na linha, para leitura direta pela tela.

**AC3 — `_org_integration_mark_connected` limpa o erro anterior ao reconectar.**
Hoje (migration `248`, linha 377): `UPDATE org_integrations SET status = 'connected', updated_at =
now() WHERE id = v_row_id;`. Passa a ser:
```sql
UPDATE org_integrations
   SET status = 'connected', updated_at = now(), last_error = NULL, last_check_at = now()
 WHERE id = v_row_id;
```
**Sem isto, uma integração corrigida continuaria mostrando a mensagem de erro antiga** — pior que
não ter a coluna, porque afirmaria um estado falso com mais confiança visual (data e mensagem
específicas de um erro que já não existe).

**AC4 — `_org_integration_write_secret` NÃO toca as colunas novas.**
Essa função (linha 211 em diante) já é explícita — "NUNCA promove status" — e o mesmo princípio
vale aqui: gravar um segredo novo não é, por si, uma prova de que a integração está saudável (a
prova é o teste HTTP feito em `application code`, ver comentário da própria função). `last_error`/
`last_check_at` só mudam via `mark_error`/`mark_connected`.

**AC5 — Leitura: `platformQuery()` inclui as 2 colunas onde já lê `org_integrations`.**
`integracoes/page.tsx` (linha 47-51, `platformQuery("org_integrations", "provider, status,
config, secret_ref, updated_at", orgId)`) passa a incluir `last_error, last_check_at` na lista de
colunas. **Nenhuma consulta usa embedding** — continua um `select` de colunas simples, dentro da
mesma tabela já permitida.

**AC6 — UI: "em erro desde DD/MM — {mensagem}".**
No tile de status `error` (dentro de `<IntegrationsPanel palette="slate">`, herdado da `900-57`),
quando `last_error`/`last_check_at` existirem, mostrar a data (`toLocaleDateString("pt-BR")`) e a
mensagem traduzida (reaproveitar `MENSAGENS_PT_BR[CodigoDeErro]` de
`packages/web/src/lib/integrations/painel/erros.ts`, já usada para os 6 códigos existentes —
**não inventar um formato de mensagem novo**, `last_error` grava o **código**, não texto livre; a
tradução acontece no render, igual já acontece para a resposta HTTP). Sem os dois campos
(`NULL`), o tile continua mostrando só o badge "Com erro", como hoje.

**[@po 2026-08-31] `last_error` NÃO é um valor confiável por construção — a AC precisa de
fallback.** Medido na migration `248` (linhas 395-421): `_org_integration_mark_error(p_org_id,
p_provider, p_actor_user_id, p_actor_type, **p_codigo text**)` — `p_codigo` é `text` **puro**, sem
`CHECK`, sem enum, sem validação nenhuma dentro da função. A convenção "é sempre um dos 6 códigos
de `erros.ts`" é disciplina do chamador, **não** uma garantia do banco. Logo
`MENSAGENS_PT_BR[last_error]` pode devolver `undefined`, e a tela renderizaria "em erro desde
12/08 — undefined".
**Regra desta AC:** o render usa lookup com fallback explícito — código desconhecido exibe a data
mais um texto genérico ("motivo não reconhecido: `{codigo}`"), **nunca** `undefined`, string vazia
ou o código cru sem rótulo. Teste de unidade obrigatório do helper de formatação com **três**
casos: (i) código conhecido → mensagem PT-BR; (ii) código desconhecido → texto genérico com o
código visível; (iii) `last_error = NULL` → só o badge, sem linha de motivo.
(Endurecer `p_codigo` com um `CHECK` no banco é a correção de raiz, mas mexe numa função
`SECURITY DEFINER` de segurança fora do escopo desta story — registrar como follow-up, não fazer
aqui.)

**AC7 — Card "Integrações com erro" da Visão Geral (`900-56`) e a seção "Precisa de você" ganham
o "desde quando" e "por quê", se essas stories já estiverem em produção.**
Não é obrigatório que `900-56` já exista para esta story ser aceita — se `900-56` já estiver
implementada, este AC pede que ela seja **atualizada** para consumir os campos novos (troca de
texto: "{Empresa} — {Provider} em erro" vira "{Empresa} — {Provider} em erro desde DD/MM
({mensagem})"). Se `900-56` ainda não existir quando esta story for implementada, este AC fica
registrado como pendência de integração para quando ela existir — não bloqueia esta story.

---

## Tasks / Subtasks

- [x] **Task 1 (AC1) — Migration**
  - [x] 1.1 Confirmar número livre via `git fetch --prune` contra todas as refs (não herdar deste
    rascunho)
  - [x] 1.2 `ALTER TABLE org_integrations ADD COLUMN last_error text, ADD COLUMN last_check_at
    timestamptz`
- [x] **Task 2 (AC2, AC3, AC4) — Ajustar as 2 funções `SECURITY DEFINER`**
  - [x] 2.1 `_org_integration_mark_error`: gravar `last_error = p_codigo, last_check_at = now()`
  - [x] 2.2 `_org_integration_mark_connected`: limpar `last_error = NULL, last_check_at = now()`
- [x] **Task 3 (AC5, AC6) — Leitura e UI**
  - [x] 3.1 Estender `platformQuery("org_integrations", ...)` em `integracoes/page.tsx`
  - [x] 3.2 Estender o tipo `LinhaDeIntegracaoDoPainel` (`lib/integrations/painel/providers.ts`)
    e `EstadoDoTile` (`components/integrations/integrations-panel.tsx`) com os 2 campos novos
  - [x] 3.3 Renderizar "em erro desde DD/MM — {mensagem}" no tile
- [x] **Task 4 (AC7) — Integração com `900-56`, se já existir** — ela existe (PR #547/#554), então
  o AC virou trabalho: projeção, `Pendencia.detalhe` e a linha da seção "Precisa de você".
- [x] **Task 5 — Testes**
  - [x] 5.1 Teste de migration: aplicada no `trifold-crm-dev`, as 15 linhas existentes ficaram
    `NULL` nas duas colunas
  - [x] 5.2 Teste de `_org_integration_mark_error`/`_mark_connected` por SQL direto, dentro de uma
    transação abortada (nenhum resíduo no banco)
  - [x] 5.3 Teste do helper de formatação: código conhecido, código desconhecido e `NULL` (AC6)
  - [x] 5.4 `pnpm --filter web type-check` limpo

---

## Dev Notes

### As duas funções a editar (migration 248, já lidas nesta sessão)
`_org_integration_mark_error(p_org_id, p_provider, p_actor_user_id, p_actor_type, p_codigo)` —
linha 395-420. `_org_integration_mark_connected(p_org_id, p_provider, p_actor_user_id,
p_actor_type)` — linha 352-386. As duas são `SECURITY DEFINER`, chamadas pelos wrappers
`_as_platform`/`_as_org` (não precisam mudar — só o corpo interno). `GET DIAGNOSTICS
v_rows_affected = ROW_COUNT` já existe nas duas, então o `UPDATE` estendido com as 2 colunas
novas não muda a contagem de linhas afetadas nem a checagem de `P0016`.

### Códigos de erro — 6, já existentes
`packages/web/src/lib/integrations/painel/erros.ts` (lido nesta sessão): `CODIGOS_DE_ERRO =
["token_invalid", "permission_denied", "not_found", "network_error", "unknown",
"page_id_ja_configurado"]`, com `MENSAGENS_PT_BR` já traduzindo cada um para PT-BR. `last_error`
grava exatamente um desses códigos (é o que `p_codigo` já recebe hoje, só que só vai para o
`metadata` da trilha) — **não um texto livre do provider**, mesma disciplina de "nunca devolver a
mensagem crua do provider" já documentada no topo de `erros.ts`.

### Tipo a estender
`LinhaDeIntegracaoDoPainel` (`packages/web/src/lib/integrations/painel/providers.ts`) e
`EstadoDoTile` (`packages/web/src/components/integrations/integrations-panel.tsx`, linha ~35-42)
— ambos precisam dos 2 campos novos para o dado atravessar de `platformQuery()` até o componente.

### Numeração de migration — não repetir o erro já registrado na memória de processo
`feedback_validate_migration_number_vs_origin_main` e `feedback_recheck_migration_number_at_
deploy` (memórias de @po/@devops): número de migration citado num draft envelhece rápido neste
projeto — já houve colisão nesta mesma leva de trabalho por medir só contra `main`. Reconferir
sempre com `git fetch --prune` contra TODAS as refs, no dia da implementação, não na leitura
desta story.

---

## Testing

- **Framework:** teste de migration/SQL (ambiente de teste `trifold-crm-dev`, nunca produção
  direto) + Vitest para o tipo TS estendido, se houver lógica de formatação a testar (ex. função
  pura "formata `last_error` + `last_check_at` em texto de exibição" — extrair como helper
  testável, não deixar inline no JSX).
- **Cenários:**
  1. Linha existente antes da migration → `last_error`/`last_check_at` ficam `NULL` (não
     inventado).
  2. `mark_error` → as 2 colunas gravadas, `metadata` da trilha continua como antes.
  3. `mark_connected` depois de um `mark_error` → `last_error` volta a `NULL`, `last_check_at`
     atualiza para o momento da reconexão.
  4. `write_secret` sozinho (sem `mark_connected` em seguida) → as 2 colunas **não mudam**.
- **Gate de tipos:** `pnpm --filter web type-check` limpo.

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml`. Revisão manual via
> Quality Gate desta story.

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-31 | 0.1 | Draft inicial — as "duas colunas baratas" pedidas explicitamente, fatiadas independente do resto da Fase 2 (não depende de `900-42a`/SEC-001 porque o dado é metadado técnico de integração, não conteúdo de lead/conversa). | @sm (River) |
| 2026-08-31 | 0.2 | **Validada pelo @po (Pax) — GO, nota 8/10.** GO após correção do @po. `p_codigo` de `_org_integration_mark_error` é `text` sem CHECK (medido na migration 248) — `MENSAGENS_PT_BR[last_error]` podia renderizar `undefined`. AC6 ganhou regra de fallback e 3 casos de teste. Status Draft → Ready. | @po (Pax) |
| 2026-09-01 | 0.3 | **Implementada (@dev).** Migration `253` aplicada no `trifold-crm-dev`; as 2 RPCs gravam e limpam as colunas (provado por SQL em transação abortada); a decisão de render saiu do JSX para `lib/integrations/painel/diagnostico.ts`; 10 mutantes mortos, todos com `tsc` rc=0. Status Ready → Ready for Review. | @dev (Dex) |
| 2026-09-01 | 0.4 | **Validada NA TELA** (escrita no banco de teste autorizada pelo coordenador para esta tarefa, só pela tela). Os quatro casos conferidos no navegador, com o fuso provado contra a virada do dia em UTC. Empresa A fica com Telegram e Meta CAPI em erro para o dono do produto explorar. | @dev (Dex) |
| 2026-09-02 | 0.5 | **Ressalvas do gate fechadas (@dev).** CONCERN-1: sonda P1 reproduzida (suíte inteira VERDE com o bloco de diagnóstico movido para o ramo do WhatsApp) e fechada com âncora de ORDEM no texto-fonte mais ocorrência ÚNICA nos dois lados; a MESMA sonda passa a acender 1 vermelho. CONCERN-3: `15` → `18`, remedido contra o banco antes da troca. CONCERN-2: registrado, sem ação, como o parecer pede. | @dev (Dex) |

## Dev Agent Record

**Agent Model Used:** Opus 5 (1M context) — `claude-opus-5[1m]`.

### Numeração da migration — reconferida no dia (Task 1.1)

`git fetch --prune origin`, e depois a varredura de **todas** as refs (`refs/heads` +
`refs/remotes`), do histórico inteiro (`git log --all --diff-filter=A`), da árvore de trabalho e
dos **20 PRs abertos**. Estado medido em 2026-09-01: `249` (storage policies) e `250`
(kanban stages, na `main`) ocupadas; `251`/`252` vivas nesta pilha (PRs #555 e #557); `253`
**livre em todas as cinco fontes**. O `250_pausar_retomar_empresa.sql` que aparece no
`git log --all` é a numeração antiga da `900-60`, renumerada para `251`.

### O que foi MEDIDO no banco (Task 5.1 / 5.2)

Ambiente `teste` (`xnxvygyfyyyzwhiuoehz`), via Management API. A migration foi aplicada e
registrada no ledger; as provas de comportamento rodaram dentro de um bloco que termina em
`RAISE EXCEPTION` — a exceção é ao mesmo tempo o transporte do resultado e o `ROLLBACK` de tudo,
então **não sobrou resíduo** (conferido depois: a linha usada segue `disconnected`, sem segredo e
com as duas colunas `NULL`).

| Passo | `status` | `last_error` | `last_check_at` |
|---|---|---|---|
| antes (linha existente) | `disconnected` | `NULL` | `NULL` |
| só `write_secret` (AC4) | `disconnected` | `NULL` | `NULL` |
| `mark_error` (AC2) | `error` | `token_invalid` | preenchido |
| `mark_error` com código fora do contrato | `error` | `codigo_que_nao_existe` | preenchido |
| `mark_connected` (AC3) | `connected` | `NULL` | preenchido |

A quarta linha é a confirmação empírica do que o @po tinha medido no texto da migration `248`:
**o banco aceita qualquer texto** em `p_codigo`. Sem o fallback da AC6, aquela linha viraria
"em erro desde 01/09/2026 — undefined" na tela.

As 18 linhas de `org_integrations` que já existiam ficaram com as duas colunas `NULL` — nenhum
backfill, nenhuma data inventada.

### Onde a decisão foi parar, e por quê

`vitest.config.ts` coleta `*.test.ts` e **não** `.tsx`: decisão dentro de componente nasce sem
carrasco. Toda a lógica (fallback do código, fuso da data, encolher a frase quando falta uma
peça, calar quando o status não é `error`) está em `lib/integrations/painel/diagnostico.ts`, com
`.tsx` fazendo só interpolação. Mesmo arranjo de `console-pausa-empresa.ts` (900-60) e
`console-dados-empresa.ts` (900-62).

### Vermelho → verde: 10 mutantes, todos mortos, todos com `tsc` rc=0

Baseline local da base (#557): **311 arquivos / 4.286 passando / 6 expected-fail** — que é o CI
`33567570654` (311 / 4.272 / 6) mais a folga constante de 14 desta árvore, anterior a esta story
(conferida por contagem, não por subtração). Depois desta story: **312 / 4.318 / 6**.

Cada mutante foi aplicado sobre a fonte real, medido com a suíte INTEIRA, e restaurado por `cp`
(nunca `git checkout`); o `shasum -c` final voltou OK para os 6 arquivos.

| # | Mutante | Testes vermelhos |
|---|---|---|
| M1 | a montagem descarta `last_error` (`ultimoErro: null`) | 1 |
| M2 | a projeção do console perde as 2 colunas | 3 |
| M3 | o componente ignora a função (render removido) | 1 |
| M4 | o argumento do call site é rebobinado para `null` | 2 |
| M5 | a data perde o `timeZone` | 1 |
| M6 | código desconhecido volta cru, sem rótulo | 3 |
| M7 | o tile perde a guarda de `status !== 'error'` | 1 |
| M8 | a Visão geral não desenha o rabicho | 2 |
| M9 | a projeção da Visão geral perde as 2 colunas | 1 |
| M10 | a pendência hardcoda `detalhe` vazio | 2 |

M3 e M4 são o par exigido: o componente ignorando a função **e** a função mentindo com o
componente intacto. As âncoras de texto-fonte são de **ordem** e de **igualdade exata de linha**
(nunca de contagem, que é invariante sob mover), e usam `linhasDeCodigo`/`codigoDe` de
`fonte-scan.ts` — comentário citando a chamada não satisfaz nenhuma delas.

### Validações

`pnpm lint --force` (0 erros; os 30 warnings são pré-existentes e nenhum é destes arquivos),
`pnpm type-check --force` rc=0, `pnpm build` completo, suíte inteira verde.

### Validação NA TELA (autorizada pelo coordenador em 2026-09-01, para esta tarefa)

Login pelo formulário com a conta de plataforma (`plataforma@example.com`), Empresa A do
`trifold-crm-dev`. Nenhuma sessão forjada, nenhum `INSERT`/`UPDATE` direto.

| Caso | O que a tela mostrou |
|---|---|
| linha virgem (as 2 colunas `NULL`) | badge "Não conectado", **sem** linha de diagnóstico — o tile de antes, intacto |
| erro produzido pelo BOTÃO "Testar e salvar" | badge "Com erro" + `Em erro desde 01/09/2026 — A credencial foi recusada. Confira se foi copiada sem espaços extras.` |
| código fora do contrato de seis | `Em erro desde 01/09/2026 — motivo não reconhecido: quota_do_provider_estourada` — nem `undefined`, nem vazio, nem código cru sem rótulo |
| reconexão | badge "Conectado" e a linha de diagnóstico **some** — o erro não fica grudado |
| Visão geral, "Precisa de você" | `⚠ Empresa A — Teste — Telegram em erro desde 01/09/2026 (A credencial foi recusada…)` e a linha equivalente do Meta CAPI com o fallback |

**O fuso foi provado contra o relógio, não contra o teste.** O `mark_error` do Meta CAPI rodou de
propósito logo depois da virada do dia em UTC: `last_check_at = 2026-09-02 00:00:02+00`, que em São
Paulo ainda é 01/09. A tela escreveu **01/09/2026**. Sem `timeZone` ela teria escrito 02/09.

**Um degrau NÃO foi dado pelo botão, e é preciso dizer qual.** `gravarIntegracao`
(`escrita.ts:128-134`) só chama `markError` quando o status já é `connected`/`active` — "uma
digitação errada não deixa o tile vermelho para sempre". Como as 18 linhas do ambiente nasceram
`disconnected`, uma tentativa frustrada **não** produz erro (medido: tentei pela tela, e o tile
seguiu "Não conectado"). Chegar a `connected` exige uma credencial que passe numa chamada HTTP real
ao provider, e não existe nenhuma nesta máquina (não há `TELEGRAM_BOT_TOKEN` em `.env`,
`.env.teste` nem `packages/web/.env.development`). Esse único degrau foi dado pelas RPCs
`org_integration_write_secret_as_platform` + `..._mark_connected_as_platform` — **a mesma porta de
escrita que a rota usa**, não um `UPDATE` na tabela. Todo o resto (o erro, a mensagem, a data, o
sumiço na reconexão) veio do botão e da leitura da tela.

**Estado deixado no banco de teste, de propósito, para o dono do produto explorar:** Empresa A com
**Telegram em erro** (código conhecido, produzido pelo botão) e **Meta CAPI em erro** (código
desconhecido, mostrando o fallback). As linhas de `platform_audit_log` geradas ficam — a tabela é
append-only por atributo de nascimento.

### O que ainda NÃO está provado

1. **A aparência.** Não há harness de render para RSC neste repositório; o que existe são as
   capturas de tela desta sessão e o texto lido do DOM. Cor, posição e espaçamento da linha nova
   não foram avaliados por olho humano.
2. **Erro de ponta a ponta com credencial REAL.** O provider nunca foi contatado com uma
   credencial válida — só com uma inválida. "Conectado" nesta empresa de teste é um estado
   fabricado pela porta de escrita, não uma integração que funciona.

### Achados registrados, não consertados

- **`p_codigo` continua `text` sem `CHECK`.** É a correção de raiz do defeito que a AC6 contorna,
  e a própria AC manda registrar como follow-up (mexeria no contrato de uma função
  `SECURITY DEFINER` e nas 2 rotas que a chamam). Está escrito também no cabeçalho da migration
  `253`, para quem for ler o schema em vez da story.
- **O `/dashboard` do cliente NÃO recebe o diagnóstico.** A AC5 nomeia só a projeção de
  `/platform`; o componente é compartilhado, então a tela do cliente chega aqui com as 2 colunas
  `undefined` e simplesmente não desenha a linha (há um `it` que prova isso). Estender a projeção
  do cliente é uma decisão de produto, não um detalhe de implementação.
- **`docs/audits/migrations-aplicadas.json` NÃO vai nesta branch.** Rodar `pnpm db:status`
  regenera o espelho (é o que aquele arquivo existe para fazer), e o retrato que sai carrega um
  desvio **anterior a esta story** no banco de teste: `246`/`247`/`249` marcadas `PENDENTE` embora
  a `248` esteja aplicada, e `250_pausar_retomar_empresa.sql` órfã no banco (a numeração antiga da
  `900-60`). Levar isso no PR seria empurrar o estado da máquina de um desenvolvedor para dentro de
  uma revisão de outra frente. O arquivo foi devolvido byte a byte ao conteúdo da base
  (`277a264e`); o desvio fica registrado aqui, não consertado e não carregado.
- **Aviso de Edge Runtime pré-existente** no log do `pnpm dev`
  (`packages/shared/src/meta/capi-hashing.ts` importa `crypto`), sem relação com esta story.

### Ressalvas do gate fechadas — rodada 1 do @qa (Quinn), 2026-09-02

**CONCERN-1 (medium) — a régua prendia PRESENÇA e ORDEM, não ALCANCE do render.** Reproduzi a
sonda P1 ANTES de aceitar o conserto, e ela é real: mover o bloco `{diagnostico && (…)}` inteiro
— sem trocar UMA letra, conferido por multiconjunto das 360 linhas não vazias — para dentro do
ramo `{somenteLeitura ? (` deixa `tsc --noEmit` em rc=0 e a suíte em **312 / 4318 / 6, ZERO
vermelho**. Com a âncora de ordem no `it` "…nessa ORDEM", a MESMA sonda acende **1 vermelho**
(`o diagnóstico é desenhado ANTES do ramo somenteLeitura: expected 3837 to be less than 3774`),
ainda com `tsc` rc=0. A fonte foi restaurada por `cp` e conferida por `shasum -a 256 -c` nas duas
vezes — nunca por `git checkout`, que apaga o mutante e o vizinho junto.

**O `-1` foi fechado, e o fechamento tem dente.** `indexOf` que não acha devolve `-1`, e `-1` é
menor que qualquer índice: a comparação sozinha passaria por ACIDENTE. As duas pontas exigem
ocorrência ÚNICA antes de comparar posições (`ocorrenciasNoCodigo`, o mesmo padrão de
`console-fail-closed.test.ts`). Controle negativo medido: renomear a âncora no componente para
`{Boolean(diagnostico) && (` — o mutante que produz o `-1` — dá `tsc` rc=0 e **1 vermelho**
(`o bloco do diagnóstico: expected +0 to be 1`). Sem as guardas, esse mutante ficaria VERDE.

**CONCERN-3 (low) — `15` → `18`, remedido antes de trocar.** Não aceitei o número do parecer de
graça: `count(*)` em `org_integrations` no `trifold-crm-dev` (Management API, só leitura, com
`User-Agent`) devolve **18**, com **18** criadas antes da migration
(`min(created_at) = 2026-08-29 21:31:38+00`, `max = 2026-08-31 12:30:22+00`) e **16** ainda com as
duas colunas `NULL` — as 2 que não estão foram escritas depois, pelo `mark_error` da validação na
tela. A afirmação segue verdadeira; só o número estava errado. Trocado nas 2 ocorrências deste
registro.

⚠️ **Uma TERCEIRA ocorrência do `15` ficou de fora, de propósito:** a Task 5.1, em
`## Tasks / Subtasks` — seção em que o @dev marca caixas e não reescreve texto. Fica apontada aqui
para quem tem a caneta daquela seção, em vez de corrigida em silêncio fora do escopo.

**CONCERN-2 (low) — sem ação, como o parecer pede.** A régua de igualdade exata de linha é
satisfeita por um duplo MORTO. É o teto medido da régua de texto-fonte, não defeito acidental: o
conserto real é um harness de render que este repositório não tem.

**Réguas depois do conserto:** suíte **312 / 4318 / 6** (idêntica ao baseline — o conserto entra
como asserção dentro de um `it` que já existia, não como `it` novo), `tsc --noEmit` rc=0,
`pnpm lint --force` e `pnpm type-check --force` limpos, `pnpm build` 5/5.

### File List

**Criados**
- `supabase/migrations/253_diagnostico_integracao.sql`
- `packages/web/src/lib/integrations/painel/diagnostico.ts`
- `packages/web/src/lib/integrations/painel/diagnostico.test.ts`

**Modificados**
- `packages/web/src/lib/integrations/painel/providers.ts`
- `packages/web/src/lib/integrations/painel/providers.test.ts`
- `packages/web/src/components/integrations/integrations-panel.tsx`
- `packages/web/src/app/platform/orgs/[id]/integracoes/page.tsx`
- `packages/web/src/app/platform/page.tsx`
- `packages/web/src/lib/tenancy/console-visao-geral.ts`
- `packages/web/src/lib/tenancy/console-visao-geral.test.ts`
- `packages/web/src/lib/tenancy/console-lista-empresas.test.ts` (só o conserto de compilação: a
  fixture de `Pendencia` ganhou o campo novo)

## QA Results

### Gate: **CONCERNS** (não bloqueante) — @qa (Quinn), 2026-09-02, rodada 1

Arquivo: `docs/qa/gates/900.61-diagnostico-integracao-last-error-last-check-at.yml`
Base: HEAD `11bf1f56`, 4 commits sobre `277a264e`. `merge-base` com `origin/main` = `1393fa68`.

**Nenhum defeito vivo. Nenhuma regressão.** Os 10 mutantes foram REPRODUZIDOS sobre a fonte
real — não lidos — cada um com `tsc --noEmit` rc=0 antes de contar o vermelho e com a suíte
INTEIRA. Os contadores saíram `1,3,1,2,1,3,1,2,1,2`: **idênticos à tabela do @dev, mutante a
mutante**. Restauração por `cp` com conferência de `sha256`; `git diff` dos 6 arquivos vazio ao
final.

**O par exigido tem kill sets DISJUNTOS.** M3 (componente ignora a função) mata só
`o tile chama linhaDeDiagnostico e desenha o retorno, nessa ORDEM`. M4 (argumento rebobinado)
mata `os três argumentos vêm do ESTADO do tile` + `controle positivo (2)`. Interseção vazia.

**O fuso, provado três vezes, nenhuma delas dependente de olho humano.**
1. M5 numa máquina cujo `TZ` **é** `America/Sao_Paulo` — onde o teste de comportamento ficaria
   VERDE — ainda assim mata, pela régua de texto-fonte `timeZone: FUSO,`. O carrasco não depende
   de relógio.
2. Sob `TZ=UTC` (Vercel/CI), o M5 acende **6** testes de comportamento a mais; sem mutação a
   suíte é verde nos dois fusos.
3. Li de `org_integrations` no `trifold-crm-dev` o carimbo que a tela mostrou —
   `last_check_at = 2026-09-02 00:00:02.583706+00`, **2 segundos depois da virada em UTC** — e
   alimentei `dataDeChecagem` com ele sob `TZ=UTC`: devolve **01/09/2026**; o mesmo instante sem
   `timeZone` devolve **02/09/2026**. É condição de fronteira de relógio, não de fixture.

**AC4 provada por estrutura, não por promessa.** O corpo VIVO de
`_org_integration_write_secret` no banco de teste tem **0** ocorrências de `last_`, contra 2 em
cada uma das outras duas RPCs — extraído por LINHA de `pg_get_functiondef`, nunca por `ILIKE`
no blob.

**AC3 corroborada pela trilha, não só pela tela.** `platform_audit_log` reconstrói a sessão na
ordem: `secret_write`+`marked_connected` (23:51:39) → `marked_error` (23:51:50) → `marked_error`
meta_capi (00:00:02, o carimbo da fronteira) → **`marked_connected` (00:00:46, a reconexão)** →
`marked_error` (00:00:57, a fixture). Todas com `actor_type = platform_admin`.

**Procedência da migration.** O `sha256` registrado no ledger `trifold_migrations_aplicadas` para
a `253` (`a1ecbc0d…`) é **igual** ao `shasum -a 256` do arquivo desta branch: o que foi testado é
o que vai ser mergeado. `253` livre em `refs/heads`, `refs/remotes`, `git log --all`, árvore e
nos 20 PRs abertos.

**Higiene conferida.** `docs/audits/migrations-aplicadas.json` **não está no diff** e é byte a
byte o da base (`sha256 90a1fc7c…` nos dois lados). A fixture do banco de teste (Empresa A com
`telegram`/`token_invalid` e `meta_capi`/`quota_do_provider_estourada`) foi **preservada**. Só
leitura nos dois bancos, pela Management API, sem chave de serviço, sem sessão forjada.

**Réguas.** `pnpm lint --force` 0 erros / 30 warnings pré-existentes (nenhum nesta story);
`pnpm type-check --force` 8/8; `pnpm build` 5/5; suíte **312 / 4318 / 6**, rc=0 — bate EXATO com
o declarado. Delta conferido por CONTAGEM: `diagnostico.test.ts` = 26 (rodado sozinho) + 3 em
`providers.test.ts` + 3 em `console-visao-geral.test.ts` = **32**, e +1 arquivo. **Não tentei
fechar a folga de 14 vs CI** — é anterior a esta story.

**A oitava armadilha de comentário: procurei e NÃO achei.** Sonda P3 (`lastError: null, //
lastError: estado.ultimoErro,` mais um `{/* {diagnostico} */}` plantado antes do bloco real)
acendeu 2 vermelhos — `linhasDeCodigo`/`codigoDe` falham FECHADO. E não existe régua por contagem
nesta story: o único `.length` é a guarda de vivacidade, e o único `split` alimenta um `toEqual`
sobre array ORDENADO.

**O degrau que o botão não deu: a declaração do @dev é exata, e BASTA.** `escrita.ts:128-134`
chama `markError` só quando `pedido.statusAtual` já está em `STATUS_JA_CONFIGURADOS` — conferido
na fonte. As RPCs `*_as_platform` são a MESMA porta que a rota usa (a trilha é indistinguível), e
o degrau `disconnected → connected` é pré-existente e fora do território desta story. **Não vira
concern.**

---

#### O que segura o gate — uma ausência medida, não um defeito vivo

**CONCERN-1 (medium, não bloqueante) — a régua do consumo prende PRESENÇA e ORDEM, não ALCANCE
do render.** Sonda minha (P1): mover o bloco `{diagnostico && (…)}` do corpo sempre renderizado
para dentro do ramo `somenteLeitura ? (…)` de `integrations-panel.tsx`, **sem alterar uma letra
do texto**, deixa `tsc` rc=0 e a suíte em **312/4318/6, zero vermelho**. Como `somenteLeitura` só
é verdadeiro para o WhatsApp — e `montarTilesDoPainel` força `ultimoErro: null` para o WhatsApp —
o diagnóstico sumiria da tela inteira e nada acenderia. Mesma classe da 900-62.

**O que mudar (uma linha,** em `packages/web/src/lib/integrations/painel/diagnostico.test.ts`, no
`it` "o tile chama `linhaDeDiagnostico` e desenha o retorno, nessa ORDEM" — âncora de ORDEM, a
mesma família que já usam**):**

```ts
expect(
  codigo.indexOf("{diagnostico && ("),
  "o diagnóstico é desenhado ANTES do ramo somenteLeitura",
).toBeLessThan(codigo.indexOf("{somenteLeitura ? ("))
```

Conferido contra a fonte real: hoje `7881 < 8049`; sob P1 a ordem inverte e a régua acende.

**CONCERN-2 (low, sem ação obrigatória) — a régua de igualdade exata de linha é satisfeita por um
duplo MORTO.** Sonda P2: com o call site real envenenado para `lastError: null`, um objeto morto
carregando as três linhas exatas deixa a suíte VERDE (o `controle positivo (2)` também passa,
porque o `.replace` acerta a cópia morta). Não é defeito acidental — é o alcance medido da régua,
e o conserto real seria um harness de render que este repositório não tem. Fica registrado para a
próxima story da família.

**CONCERN-3 (low) — o registro de evidência diz 15 linhas; o banco diz 18.**
`select count(*) from org_integrations` no `trifold-crm-dev` = **18** (3 orgs × 6 providers),
todas com `created_at` entre 2026-08-29 e 2026-08-31 12:30 — todas anteriores à migration de
2026-09-01. A AFIRMAÇÃO da story é verdadeira e eu a confirmei (16 seguem `NULL`; as 2 que não
seguem foram escritas depois por `mark_error`, com trilha). Só o NÚMERO está errado — mas está na
seção cuja função inteira é ser "o medido".
**O que mudar:** `15` → `18` nas duas ocorrências do Dev Agent Record acima.

---

#### Trace

| AC | Veredicto | Prova |
|---|---|---|
| AC1 | PASS | colunas lidas no `information_schema`: `text`/`timestamptz`, nullable, sem default; 16/18 linhas seguem `NULL` |
| AC2 | PASS | corpo VIVO grava `last_error = p_codigo, last_check_at = now()`; M1/M2/M9 |
| AC3 | PASS | corpo VIVO limpa (`last_error = NULL`); `marked_connected` real na trilha entre dois `marked_error`; M7 |
| AC4 | PASS | 0 ocorrências de `last_` no corpo vivo de `_org_integration_write_secret` |
| AC5 | PASS | M2 (3 vermelhos) + as 7 colunas enumeradas com `toEqual` ordenado + sem `(` e sem `*` |
| AC6 | PASS | os 3 casos, e o (ii) é o valor GRAVADO agora no banco; endurecimento contra cadeia de protótipos além do pedido; M6 |
| AC7 | PASS | rabicho na seção "Precisa de você" (M8/M9/M10). O "card" é um CONTADOR (`contagem={integracoesComErro}`) — não tem onde pendurar data; aponta para a seção que as recebeu |

**Produção:** `org_integrations` tem 6 linhas, 0 em `error`, e ainda não tem as colunas. O
`ALTER TABLE ADD COLUMN` nullable sem default sobre 6 linhas não reescreve tabela.

**Decisão: CONCERNS — não bloqueante para merge.** As duas edições recomendadas somam uma linha
de teste e dois dígitos numa story.

— Quinn, guardião da qualidade 🛡️
