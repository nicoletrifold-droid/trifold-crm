# Story 900-60 — Ativar / Desativar Empresa

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** Frente 2 ("Console"), Fase 1 — entrega 1.5 de `docs/ux/console-plataforma.md` §6. **A
  primeira mutação nova do console** (todo o resto da Fase 1 é leitura).
- **Story:** 900-60 — próximo número livre desta leva (sem colisão, verificado 2026-08-31).
- **Status:** Ready for Review
- **Priority:** P1.
- **Complexity:** M — pequena em código, mas é mutação de plataforma: exige confirmação, `reason`
  obrigatório, trilha, e entrada no allowlist do client admin.
- **Depends on:** **`900-58`** (o menu `⋯` da lista, que ganha o 4º item aqui). Recomenda-se
  sequenciar depois de **`900-59`** (trilha) para poder verificar visualmente a linha de
  auditoria gerada — não é bloqueio técnico (a escrita em `platform_audit_log` já funciona sem
  a tela de leitura existir, só fica mais difícil de conferir a olho).

### Executor Assignment
- **Executor:** @dev (Dex).
- **Quality Gate:** @architect (Aria) — mutação de plataforma que altera acesso/processamento de
  uma empresa inteira; mesmo critério de "Security Story" do checklist de criação de story.
- **Quality Gate Tools:** `[code_review, security_review]`.

---

## User Story
**Como** operador da Trifold,
**eu quero** ativar ou desativar uma empresa pelo painel, com confirmação explícita e motivo
obrigatório,
**para que** eu não precise mais pedir um `UPDATE` manual no banco — e para que a ação fique
registrada, porque é a primeira mutação nova que o console ganha.

---

## ⚠️ Achado que corrige a premissa do pedido original — leia antes de implementar

O pedido que originou esta leva de stories dizia: *"Ativar/desativar mexe no acesso de uma
empresa inteira: precisa de trilha de auditoria e confirmação que diz o que vai acontecer."* A
segunda parte da frase é o motivo desta seção: **a consequência real de `organizations.is_active`
hoje é MENOR do que "acesso de uma empresa inteira" sugere**, e a confirmação da AC3 tem que dizer
a verdade medida, não a suposição.

**Medido nesta sessão de draft (`git grep` em `packages/web/src`):**

| Onde `organizations.is_active` É lido hoje | Efeito real |
|---|---|
| `packages/web/src/lib/tenancy/for-each-org.ts:135` — `forEachActiveOrg()` | Os **crons** que iteram empresas (leads, lembretes, campanhas, etc.) pulam a empresa desativada. |
| `packages/web/src/lib/tenancy/trifold-org.ts` — comentário sobre `trifoldOrgId()` | Mesma família: seleção de qual org processar em rotina de fundo. |
| `packages/web/src/lib/tenancy/webhook-org.ts:244-248` — **`resolveSoleOrg()`** | **[@po 2026-08-31 — terceiro consumidor, ausente da v0.1 desta tabela]** Resolve a org de webhooks que **não têm identificador no payload** (`landing-page` e `telegram`) por `.from("organizations").select("id").eq("is_active", true).limit(2)`: só resolve quando existe **exatamente UMA** org ativa. Chamado em produção por `app/api/telegram/webhook/route.ts:367,378` e `app/api/webhooks/landing-page/route.ts:230,252`. |

**⚠️ [@po 2026-08-31] O terceiro consumidor muda a natureza do efeito, e a v0.1 do AC3 estava
incompleta por causa dele.** `resolveSoleOrg()` não lê `is_active` como "esta empresa está
pausada?" — lê como **contagem de empresas ativas**. Então mexer no `is_active` de UMA empresa
altera o denominador que decide o roteamento de **outra**:

- Com 2 orgs ativas, `resolveSoleOrg` devolve `"ambigua"` e o lead de landing-page/telegram **não
  é roteado**. Desativar uma delas faz a contagem cair para 1 → passa a resolver → os leads
  passam a cair **na empresa que sobrou**.
- No sentido inverso: ativar uma segunda empresa faz `"resolvida"` virar `"ambigua"` e **para** o
  roteamento de landing-page/telegram da primeira, sem erro visível.

**Alcance HOJE vs. DEPOIS — medido, e a diferença importa:**
- **Hoje o modo é `both`** (`WEBHOOK_ORG_ROUTING` ausente em produção; `decidirModoRoteamento()`
  em `webhook-org.ts:278-282` devolve `"both"` quando a variável não está setada — confirmado:
  a variável não existe em nenhum arquivo de env do repositório). Em `both`, quem decide o
  `orgId` é o **legado**; `resolveSoleOrg` só alimenta o campo `divergiu` da telemetria do
  dual-run e o `motivo` do ramo não-resolvido. Efeito de roteamento hoje: **nenhum** — mas o
  botão desta story **contamina a evidência do cutover da `900-55`**, que é exatamente o número
  que decide se é seguro promover `identifier`.
- **Depois do corte para `identifier`** (story `900-55`, já drafted), `resolveSoleOrg` passa a
  **decidir o roteamento**. A partir daí este botão tem efeito cross-tenant direto sobre a
  entrada de leads.

Portanto: o texto do AC3 não pode dizer "pausa os crons" e parar aí — isso seria verdade hoje e
mentira depois do cutover, e já hoje omite o efeito sobre a telemetria do dual-run.

**Onde `organizations.is_active` NÃO é lido, e por isso NÃO tem efeito nenhum hoje:**
`packages/web/src/lib/supabase/middleware.ts` (o gate de sessão do App Router) só checa
`users.is_active` — uma coluna **por usuário**, de uma tabela diferente. `packages/web/src/lib/
api-auth.ts:42-51` (o `requireAuth()` usado pelas rotas de API) faz o mesmo. **Nenhum dos dois
lê `organizations.is_active`.** Ou seja: desativar uma empresa hoje **não impede nenhum usuário
dela de logar nem de usar o CRM normalmente** — só pausa o processamento automático em segundo
plano.

**Decisão desta story:** o botão desativa exatamente o que `organizations.is_active` controla
**hoje** — pausa dos crons — e a confirmação (AC3) diz isso com essas palavras, não "bloqueia o
acesso". Prometer um bloqueio de acesso que o sistema não aplica seria o mesmo defeito de classe
já nomeado neste projeto como "a tela afirma o que não lê" (`feedback_a_tela_afirma_o_que_nao_le`)
— só que na direção de escrita, não de leitura. **Se o dono do produto quiser que desativar
também impeça login**, isso é uma mudança em `middleware.ts` e `api-auth.ts` — dois dos arquivos
que o próprio epic nomeia como risco concentrado (R3, §8.1) — e precisa de story e decisão
própria, não deve ser assumido dentro desta.

---

## Acceptance Criteria

**AC1 — Rota `PATCH /api/platform/orgs/[id]/route.ts`.**
Corpo: `{ isActive: boolean, reason: string }`. `reason` obrigatório, não-vazio após `trim()` —
sem mínimo de caracteres inventado (Artigo IV: nenhum número de "tamanho mínimo de motivo" está
especificado em lugar nenhum das fontes; a regra é só "não vazio"). Autorização via
`getPlatformAdmin()` (mesmo padrão de `resend-admin-invite/route.ts`). Org **sempre** do
parâmetro de rota `[id]`, nunca do corpo.

**AC2 — Efeito: `UPDATE organizations SET is_active = {isActive} WHERE id = {id}`.**
Via `createAdminClient()` (service-role — RLS de `organizations` não é o mecanismo aqui, mesma
razão de todo o resto de `/platform`). **Esta rota precisa entrar em
`docs/audits/admin-client-allowlist.json`, seção `plataforma`** — mesmo padrão das rotas irmãs
já registradas ali (`integracoes/route.ts`, `resend-admin-invite/route.ts`), com uma linha de
justificativa própria.

**AC3 — Confirmação explícita, com o texto correto sobre o efeito.**
Modal/diálogo (client component) antes de qualquer chamada à API, disparado pelo 4º item do menu
`⋯` (`900-58`), rotulado "Desativar empresa" ou "Ativar empresa" conforme o estado atual.
Conteúdo obrigatório do diálogo:
1. Nome da empresa.
2. **O texto exato do efeito, sem inflar e sem omitir** — três frases, nesta ordem:
   (i) "Isto pausa o processamento automático desta empresa nos crons da Trifold (leads,
   lembretes, campanhas)."
   (ii) "**Não impede login nem uso do sistema** — o acesso de cada usuário é controlado
   individualmente, não pela empresa."
   (iii) **[@po 2026-08-31 — frase nova, obrigatória]** "Também altera a contagem de empresas
   ativas, que é o que decide o roteamento de leads de landing page e Telegram (webhooks sem
   identificador de empresa no payload). **Isso pode mudar para onde vão os leads de OUTRA
   empresa.**"
   (reativar: as mesmas três, adaptadas — "retoma o processamento automático…" e a mesma frase
   (iii), porque ativar tem o efeito simétrico).
   A frase (iii) **não é opcional e não pode ser suavizada**: ela é a única parte do diálogo que
   fala de consequência fora da empresa que o operador está olhando, que é a consequência que ele
   não tem como adivinhar.
3. Campo de texto obrigatório para `reason`.
4. Botão de confirmação desabilitado até `reason` ter conteúdo.
**Não é o padrão de confirmação destrutiva** (digitar o nome da empresa) usado em outras partes
do sistema para exclusão de dado (ex. Story 36-3, exclusão de obra) — esta ação é reversível
(ativar de novo desfaz), então o padrão mais leve (motivo obrigatório + botão) é suficiente e
proporcional.

**AC4 — Trilha: uma linha por ativação/desativação, via `platform_audit()`.**
`action = 'organization.activated'` ou `'organization.deactivated'`, `target_table =
'organizations'`, `target_id = {orgId}`, `metadata = { reason, is_active_anterior: {bool} }`.
Chamada à função `platform_audit(p_actor_user_id, p_actor_type, p_org_id, p_action,
p_target_table, p_target_id, p_metadata)` já existente desde a migration `248` — **não criar
mecanismo de auditoria novo**, reaproveitar o único ponto de escrita que já existe.
`p_actor_type = 'platform_admin'` sempre (esta rota só é alcançável por quem passa
`getPlatformAdmin()`).

**AC5 — Ambos os sentidos, mesma rota.**
Ativar uma empresa inativa usa a mesma rota (`isActive: true`), mesmo diálogo (texto adaptado
por AC3), mesma trilha (`action` diferente).

**AC6 — O menu `⋯` da lista (`900-58`) ganha o 4º item.**
"Desativar empresa" (ou "Ativar empresa", conforme `is_active` atual) some. Não reescreve o
componente do zero — acrescenta ao array de itens já existente.

**AC7 — Resposta da rota e atualização da UI.**
`200` com o novo estado; a UI local atualiza sem recarregar a página inteira (`router.refresh()`,
mesmo padrão já usado em `integrations-panel.tsx:130`). Falha (`400`/`403`/`500`) mostra o motivo
no próprio diálogo, sem fechar — o operador não perde o `reason` já digitado.

**AC8 — O rótulo do botão nomeia o mecanismo, não a aspiração.**
O item do menu `⋯` e o título do diálogo **não** podem ser "Desativar empresa" seco. Rótulo
exigido: **"Pausar empresa"** / **"Retomar empresa"** (ou "Pausar processamento" / "Retomar
processamento") — a palavra escolhida tem que ser verdadeira sobre o que o sistema faz. "Desativar
empresa" numa tela de plataforma promete, para qualquer leitor razoável, que a empresa perde
acesso; e ela não perde. Um diálogo honesto atrás de um botão que mente ainda é uma armadilha —
o operador que já conhece o botão para de ler o diálogo na terceira vez.
A coluna/badge da lista (`900-58`) segue a mesma palavra: **Ativa / Pausada**, nunca
"Ativa / Inativa".

**AC9 — A dependência do corte de roteamento fica declarada, não descoberta depois.**
A story registra, e o Dev Agent Record confirma, que:
1. `organizations.is_active` é **input de roteamento** de `resolveSoleOrg()` e que o modo vivo
   hoje é `both` (o legado decide) — logo o efeito de roteamento é latente, não ativo.
2. **Quando a `900-55` promover `WEBHOOK_ORG_ROUTING=identifier`, o texto (iii) do AC3 passa de
   "pode mudar" para "muda", e o diálogo precisa ser revisto.** Isso vira um item explícito no
   backlog no momento em que esta story fechar — não uma lembrança.
3. O `reason` gravado na trilha (AC4) é o que permite reconstruir depois "por que a contagem de
   ativas mudou naquele dia" — mais uma razão para ele ser obrigatório.

**AC10 — A trilha registra o efeito colateral, não só a intenção.**
O `metadata` da AC4 ganha um terceiro campo: `orgs_ativas_depois` (inteiro) — a contagem de
`organizations.is_active = true` **após** o `UPDATE`, lida na mesma rota. É o número que explica,
meses depois, por que o roteamento de landing-page/telegram mudou de comportamento. Sem ele a
trilha registra a causa e esconde o mecanismo.

---

## Tasks / Subtasks

- [x] **Task 1 (AC1, AC2) — Rota**
  - [x] 1.1 Criar `PATCH` em `api/platform/orgs/[id]/route.ts` (arquivo novo — hoje só existem
    `resend-admin-invite/` e `integracoes/` como subrotas de `[id]`)
  - [x] 1.2 Validar `reason` não-vazio, `isActive` booleano
  - [x] 1.3 `UPDATE organizations` + chamada a `platform_audit()`
  - [x] 1.4 Registrar a rota em `docs/audits/admin-client-allowlist.json` (seção `plataforma`)
- [x] **Task 2 (AC3, AC6) — UI**
  - [x] 2.1 Componente de diálogo de confirmação (client), com o texto de AC3 verbatim
  - [x] 2.2 4º item no menu `⋯` de `900-58`
- [x] **Task 3 (AC4) — Verificação da trilha**
  - [x] 3.1 Confirmar manualmente (via `900-59`, se já mergeada, ou via SQL direto no ambiente de
    teste) que a linha aparece com `actor_type='platform_admin'`, `action` correto, `reason` no
    `metadata`
- [x] **Task 4 — Testes**
  - [x] 4.1 Teste de rota: `reason` vazio → `400`, sem `UPDATE` nenhum disparado
  - [x] 4.2 Teste de rota: org inexistente → `404`, sem `UPDATE`
  - [x] 4.3 Teste: `metadata.orgs_ativas_depois` gravado com a contagem correta (AC10)
  - [x] 4.4 `pnpm --filter web type-check` limpo

---

## Dev Notes

### Padrão de rota a seguir
`packages/web/src/app/api/platform/orgs/[id]/resend-admin-invite/route.ts` (lido nesta sessão) é
o molde mais próximo: `getPlatformAdmin()` primeiro, busca da org via `platformQuery` antes de
qualquer efeito, org sempre do parâmetro de rota. Esta story usa `createAdminClient()` (não
`platformQuery`) só para o `UPDATE` em si — leituras continuam por `platformQuery()`.

### `platform_audit()` — assinatura exata (migration 248, já lida nesta sessão)
```sql
CREATE OR REPLACE FUNCTION platform_audit(
  p_actor_user_id uuid,
  p_actor_type    text,
  p_org_id        uuid,
  p_action        text,
  p_target_table  text,
  p_target_id     uuid,
  p_metadata      jsonb DEFAULT '{}'
) RETURNS uuid
```
`REVOKE ALL ... FROM PUBLIC, anon, authenticated` — só é chamável via `service_role`
(`createAdminClient()`), consistente com o resto de `/platform`.

### `admin-client-allowlist.json`
`docs/audits/admin-client-allowlist.json`, seção `"plataforma"` (lida nesta sessão) — cada rota
de `/platform` que usa `createAdminClient()` tem uma linha com o caminho relativo e uma
justificativa de uma frase, no mesmo padrão de:
```json
"src/app/api/platform/orgs/[id]/integracoes/route.ts": "Rota do painel /platform que grava... autorização acontece na rota (getPlatformAdmin()...), não no SQL..."
```
A regra é aplicada por `scripts/admin-client-allowlist.test.ts` (roda ESLint por AST dentro do
`pnpm test`) — esquecer de registrar a rota nova faz o teste falhar, não é opcional.

### Efeito real de `is_active` — ver a seção de achado acima
Não repetir aqui; a seção "⚠️ Achado que corrige a premissa" é normativa para o texto do AC3.

---

## Testing

- **Framework:** Vitest para a rota (mock de `createAdminClient`/`platformQuery`, mesmo padrão de
  `resend-admin-invite/route.test.ts`, já existente no repositório).
- **Cenários:**
  1. `reason` vazio ou só espaços → `400`, nenhum `UPDATE` disparado, nenhuma linha de trilha.
  2. `reason` válido, org existente → `200`, `UPDATE` disparado, `platform_audit()` chamado com
     os argumentos corretos.
  3. Org inexistente → `404`.
  4. Sem `platformAdmin` autenticado → `403`.
  5. Ativar (`isActive: true`) sobre org já ativa → ainda funciona (idempotente na prática, sem
     erro), `action='organization.activated'` mesmo assim (não é preciso checar "já estava
     assim" — simplicidade sobre robustez para um caso de baixo risco).
- **Gate de tipos:** `pnpm --filter web type-check` limpo.

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml`. Revisão manual via
> Quality Gate desta story (@architect, dado o caráter de mutação de plataforma).

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-31 | 0.1 | Draft inicial — primeira mutação nova do console. Corrige a premissa do pedido original: `organizations.is_active` hoje só pausa crons (`forEachActiveOrg`), não bloqueia login (`middleware.ts`/`api-auth.ts` checam `users.is_active`, coluna diferente). Confirmação e trilha refletem o efeito real, não o assumido. | @sm (River) |
| 2026-08-31 | 0.2 | **Validada pelo @po (Pax) — GO, nota 6/10.** GO após correção do @po — era NO-GO como estava. O achado do @sm estava certo mas INCOMPLETO: faltava o terceiro consumidor de `organizations.is_active`, `resolveSoleOrg()` (`webhook-org.ts:244-248`), vivo em `telegram/webhook` e `webhooks/landing-page`, que lê a coluna como CONTAGEM de orgs ativas — logo pausar uma empresa altera o roteamento de leads de OUTRA. Tabela do achado completada; AC3 ganhou a terceira frase obrigatória; AC8 (rótulo do botão: Pausar/Retomar), AC9 (dependência do corte `WEBHOOK_ORG_ROUTING`) e AC10 (`orgs_ativas_depois` na trilha) novas. Status Draft → Ready. | @po (Pax) |
| 2026-09-01 | 1.0 | **Implementada — Status Ready → Ready for Review.** Migration `250` (RPC `organization_set_active_as_platform`, mesmo padrão da `248`: `SECURITY DEFINER`, REVOKE + GRANT a `service_role`, reusa `platform_audit()`), rota `PATCH /api/platform/orgs/[id]`, diálogo por portal com as três frases verbatim, 4º item no menu `⋯`, badge Ativa/Pausada. O `UPDATE` foi para a RPC — e não ficou na rota — porque `orgs_ativas_depois` (AC10) só é verdade na MESMA transação, agregado é `PGRST123` neste Supabase, e `app/api/platform/**` proíbe `.from(<literal>)`. **Carona fora do escopo desta story:** `app/page.tsx`, a 2ª porta de entrada, que a `900-56` deixou roteando só por `role`. 21 mutantes medidos com `tsc` rc=0; provado na tela com as 3 contas do banco de teste, nos dois sentidos e no caminho de falha. | @dev (Dex) |

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M) — @dev (Dex), 2026-09-01.

### Branch e pilha
`story/900-60-pausar-retomar-empresa`, criada a partir de `story/900-56-porta-de-entrada-do-console`.
A pilha é **#547 → #549 → porta de entrada (`900-56`) → esta**. `merge-base` com `origin/main` =
`1393fa68`.

### Baselines
- **CI (`main`), run [`33536776948`](https://github.com/nicoletrifold-droid/trifold-crm/actions/runs/33536776948)**,
  job `type-check · lint · test`, `headSha b7a1b64b`: **301 arquivos, 3946 passed | 6 expected fail (3952)**.
- **Local, na ponta da pilha, ANTES desta story:** 305 arquivos, **4134 passed | 6 expected fail (4140)**.
  A diferença para o CI é a própria pilha (900-56/57/58) mais **+9 `it(`** de outra frente que estão
  na árvore de trabalho e **não entram em commit nenhum meu**
  (`whatsapp/__tests__/route.test.ts` 39→43, `meta/process-lead.test.ts` 22→25,
  `tenancy/webhook-org.test.ts` 48→50).
- **Local, DEPOIS:** 308 arquivos, **4187 passed | 6 expected fail (4193)**. **Δ = +3 arquivos, +53 testes**,
  que são exatamente os três arquivos novos (9 + 22 + 22).

### Portões
`pnpm lint --force` → **0 erros** (30 warnings, todos pré-existentes e nenhum nos arquivos desta
story). `pnpm --filter web type-check` (`tsc --noEmit`) → **rc=0**. `pnpm build` → 5/5 tasks,
`/api/platform/orgs/[id]` aparece como rota `ƒ`.

---

### Decisão 1 — o `UPDATE` mora numa RPC (migration `250`), não na rota

A AC2 pede `createAdminClient()`, e ele está lá. O que **não** pôde ficar na rota foi o `.from(
"organizations").update(...)`, por três razões medidas, em ordem de força:

1. **`orgs_ativas_depois` (AC10) só é verdade se for lido na MESMA transação do `UPDATE`.** Ler a
   contagem pela rota, depois do `UPDATE`, são duas viagens; entre elas outra pausa pode entrar, e
   a trilha registraria um número que nunca existiu. A AC10 existe justamente para explicar meses
   depois por que o roteamento mudou — um número aproximado ali não explica nada.
2. **A contagem exata não é alcançável pelo caminho sancionado.** `?select=count()` é
   **HTTP 400 `PGRST123`** neste Supabase (agregados desligados), `platformQuery()` recusa qualquer
   `(` desde a `900-42a`, e `Prefer: count=exact` não passa pela assinatura de um argumento de
   `platformQuery()`. Contar linhas em memória sofreria o corte de 1000 do PostgREST.
3. **`app/api/platform/**` não pode conter `.from(<literal>)`** — `platform-query-scan.ts`
   (`DIRETORIOS_VARRIDOS`) varre esse diretório exigindo zero ocorrências.

A RPC segue o padrão exato da migration `248`: `SECURITY DEFINER`, `REVOKE ALL FROM PUBLIC, anon,
authenticated` + `GRANT EXECUTE ... TO service_role`, e chama o `platform_audit()` que já existe —
**nenhum mecanismo de auditoria novo**. O `platform_audit()` roda como o definer, então a REVOKE
dele continua valendo para todo mundo: a trilha não ganhou porta nova.

Três guardas na função, com código de erro próprio (o contrato que a rota traduz):
`P0021` motivo vazio · `P0022` org inexistente · `P0023` `UPDATE` afetou ≠ 1 linha. O `SELECT …
FOR UPDATE` trava a linha até o `COMMIT`: sem ele, duas pausas simultâneas leriam o mesmo
`is_active_anterior` e a trilha registraria duas vezes a mesma transição.

**Medido contra o banco de teste real** (`xnxvygyfyyyzwhiuoehz`), pelo `service_role` via PostgREST,
que é o transporte exato da rota:

| chamada | resultado |
|---|---|
| `p_reason: "   "` | `P0021` "motivo obrigatório para pausar ou retomar uma empresa" |
| `p_org_id` inexistente | `P0022` "organização … não existe" |
| pausar org ativa | `{"is_active":false,"is_active_anterior":true,"orgs_ativas_depois":2,"action":"organization.deactivated"}` |
| linha de `platform_audit_log` | `actor_type='platform_admin'`, `target_table='organizations'`, `metadata={reason, actor_label, is_active_anterior:true, orgs_ativas_depois:2}` |
| retomar | `orgs_ativas_depois: 3` |

A migration foi aplicada **só ela** no banco de teste (as `246`/`247`/`249` continuam PENDENTE ali,
são de outras frentes) e registrada no ledger. O espelho `docs/audits/migrations-aplicadas.json`
**não** entra neste commit: regenerá-lo capturaria o estado de outras frentes junto.

### Decisão 2 — "não consegui ler" e "não existe" são dois HTTPs diferentes

`platformQuery(...).maybeSingle()` devolve `data: null` nos dois casos. A rota separa:
`error != null` → **503 `LEITURA_FALHOU`**; `data == null` com `error == null` → **404
`ORG_NOT_FOUND`**. Um 404 sobre leitura que falhou diria "essa empresa não existe" sobre uma
empresa que existe, e o operador iria procurá-la em vez de procurar a rede. Os dois ramos têm
carrasco próprio, e os conjuntos de morte são disjuntos (mutantes B1 e B8 abaixo).

⚠️ **`leituraFalhou()` de `console-visao-geral.ts` NÃO serve aqui** e por isso não foi reusado: ele
acende para `data == null` *sem* erro, que é o desfecho legítimo do `maybeSingle()` de uma org
inexistente. Ele é o helper certo para leitura de LISTA, onde `data: null` nunca é resposta válida.

### Decisão 3 — o texto do diálogo mora fora do JSX

`packages/web/src/lib/tenancy/console-pausa-empresa.ts`. Duas razões: (a) o texto **é** o produto
desta story — o @po o escreveu depois de medir três consumidores da coluna, e literal enterrado em
JSX é literal que ninguém reprova quando alguém "melhora" a redação; (b) `vitest.config.ts` inclui
`packages/web/src/**/*.test.ts`, **não `.tsx`** — texto dentro do componente é texto que a suíte
deste repositório não alcança.

A ênfase (`**negrito**` das frases (ii) e (iii)) é um **substring do próprio texto**, não um segundo
texto: assim a frase continua assertável verbatim e a marcação não pode divergir do que o operador
lê. `partirNaEnfase` degrada para texto plano se a ênfase não for substring — um `throw` ali
derrubaria a tela por causa de uma marcação. O invariante "toda ênfase é substring do seu texto" é
medido em teste, que é onde ele pode falhar sem custo.

### Decisão 4 — o diálogo vai por portal ao `<body>`, e é montado sob demanda

Portal porque cada `⋯` vive num `relative z-10`, que é **contexto de empilhamento**: uma
sobreposição `fixed inset-0 z-50` declarada ali dentro ficaria presa nele e por baixo do `⋯` das
linhas seguintes (irmãs de mesmo `z-index`, depois no DOM). É a mesma classe do recorte por
`overflow-hidden` que a `900-58` mediu, por outra porta.

Montado sob demanda (`{dialogo && <PausarEmpresaDialog …/>}`) e **não** por prop `aberto`: com a
prop, o estado interno sobrevive ao fechamento e limpá-lo exigiria `setState` dentro de `useEffect`
— que o ESLint deste repositório reprova como cascata de renderização (**foi erro real de lint,
não hipótese**). Pior: um motivo esquecido de uma confirmação anterior seria enviado para a trilha
de uma ação que ele não explica.

### Decisão 5 — o rótulo do filtro muda, o valor da URL não

AC8 pediu **Ativa / Pausada**. O badge e o rótulo do filtro passaram a dizer isso. O **valor** na
query string continua `?status=inativas`: ele é contrato — está em `FILTROS_DE_STATUS`
(`console-lista-empresas.ts`) e em toda URL que alguém já compartilhou desde a `900-58`. O rótulo é
a promessa ao humano, e era essa que estava errada.

---

### Vermelho → verde: 21 mutantes, `tsc --noEmit` rc=0 em todos os que contam

Cada linha foi aplicada isolada, com o arquivo restaurado por cópia (não por `git checkout` — a
primeira tentativa usou `git checkout` e apagou o trabalho num arquivo rastreado; a lição está
registrada).

**A — porta de entrada (`app/page.tsx`), 9 testes limpos:**

| # | mutante | tsc | mortos |
|---|---|---|---|
| A1 | some o ramo `is_platform_admin` (**o estado de ANTES**) | rc=0 | **2** — só a METADE 1 |
| A2 | `if (true)` → todo mundo vai para `/platform` | rc=0 | **5** — só a METADE 2 |
| A3 | inverte a condição (`!== true`) | rc=0 | **7** — as duas metades |
| A4 | tira `is_platform_admin` da projeção do `.select()` | **RC≠0** | *(não conta — quem reprova é o compilador; o `postgrest-js` narrowa a linha pela string do select)* |
| A5 | `=== true` → truthiness | rc=0 | **1** — o caso do valor não-booleano |

**Os conjuntos de morte de A1 e A2 são disjuntos** (2 nomes × 5 nomes, interseção vazia): a régua
distingue "protegi" de "escondi de todo mundo", e "escondi de todo mundo" é o estado de antes.

**B — rota (`api/platform/orgs/[id]/route.ts`), 22 testes limpos:**

| # | mutante | tsc | mortos |
|---|---|---|---|
| B1 | remove o ramo `if (resposta.error)` (erro de leitura vira 404) | rc=0 | **1** — só o teste do 503 |
| B2 | `Boolean(corpo.isActive)` em vez de checar o tipo | rc=0 | **2** — `isActive` ausente e `"false"` |
| B3 | `orgId` do corpo vence o parâmetro de rota | rc=0 | **1** |
| B4 | `orgsAtivasDepois: 0` (contagem local em vez do retorno da RPC) | rc=0 | **1** |
| B5 | não trima o motivo antes de mandar para a RPC | rc=0 | **1** |
| B6 | erro da RPC vira `200` | rc=0 | **4** — os quatro desfechos de falha |
| B8 | remove o ramo do 404 | rc=0 | **1** — só o teste do 404 |
| B9 | `platformQuery(t, c, orgId)` (aplica `.eq("org_id", …)` numa tabela que tem `id`) | rc=0 | **1** |
| B10 | aceita motivo vazio | rc=0 | **4** |

**B1 e B8 são disjuntos** — é a prova de que os dois modos de "não veio linha" são desfechos
distintos e não um só com duas roupas.

**C — texto e tela (77 testes limpos entre os dois arquivos):**

| # | mutante | tsc | mortos |
|---|---|---|---|
| C1 | rótulo volta a "Desativar empresa"/"Ativar empresa" | rc=0 | **3** |
| C2 | suaviza a frase (iii) | rc=0 | **4** |
| C3 | `rotuloDoEstado` volta a "Inativa" | rc=0 | **1** |
| C4 | rótulo do 4º item vira literal no componente | rc=0 | **2** |
| C5 | badge da lista vira literal `"ativa"/"inativa"` | rc=0 | **1** |
| C6 | `isActiveDesejado` devolve o estado atual (botão que não muda nada) | rc=0 | **1** |
| C7 | apaga a ênfase da frase (ii) | rc=0 | **1** |
| C8 | `motivoEhValido` sem `trim()` | rc=0 | **1** |

⚠️ **Limite declarado das réguas C4/C5:** elas são de **FORMA**. Reprovam qualquer desvio da
expressão esperada, mas "sempre pausa" e "nunca pausa" produziriam o mesmo conjunto de morte, porque
as duas formas erradas são igualmente ≠ da certa. O que fecha o elo de verdade é a prova na tela,
abaixo — e ela é manual.

---

### Prova na tela (`pnpm dev`, banner `Supabase ref: xnxvygyfyyyzwhiuoehz (TESTE)`, 1440×900)

As três contas do banco de teste. Nenhuma sessão foi forjada: login pelo formulário, com a senha
do arquivo entregue fora do repositório.

**A porta de entrada, os dois sentidos:**

| conta | pós-login | abrir `/` com sessão viva |
|---|---|---|
| `plataforma@…` | `/platform` | **`/platform`** |
| `admin-empresa-a@…` | `/dashboard` | **`/dashboard`** |

**O menu e o diálogo:**
- Itens do menu `⋯` da **última** linha (a que a `900-58` mediu como recortada):
  `["Ver empresa","Integrações","Copiar identificador","Pausar empresa"]`.
- **Alcançabilidade medida por `elementFromPoint`, não por `isVisible()`** (que responde `true` para
  elemento recortado por ancestral): centro do 4º item = `(1143, 516)` →
  `BUTTON[menuitem] "Pausar empresa"`. É o próprio item que está no ponto, não um contêiner por cima.
- Título: `Pausar empresa`. Nome da empresa: `Empresa B — Teste`. As três frases apareceram
  **verbatim**, na ordem, com (ii) e (iii) em negrito parcial.
- Botão de confirmação: `disabled` com motivo vazio → `true`; com **só espaços** → `true`; com
  motivo válido → `false`.

**A escrita, e a trilha:**
- `PATCH /api/platform/orgs/c95bc4fa-… → 200`. A lista atualizou **sem recarregar a página**:
  `Empresa B — Teste` passou de `Ativa` para `Pausada`.
- Linha gravada em `platform_audit_log` (lida depois, direto no banco de teste):
  `actor_type='platform_admin'`, `actor_user_id=b99f27b1-…` (o operador que logou),
  `action='organization.deactivated'`, `target_table='organizations'`,
  `metadata={"reason":"validacao visual da story 900-60","actor_label":"Operador da Plataforma",
  "is_active_anterior":true,"orgs_ativas_depois":2}` — a contagem caiu de 3 para 2, como o `UPDATE`
  produziu.

**AC7 — falha não vira "salvo"** (rota interceptada para devolver `500`, o servidor não foi tocado):
diálogo **continuou aberto**; a mensagem do servidor apareceu nele; o motivo já digitado
**permaneceu**; e a linha da lista **continuou `Pausada`** — nada de otimismo.

**AC5 — o sentido inverso**, na sequência e pela mesma rota: título `Retomar empresa`, frase (i)
`"Isto retoma o processamento automático…"`, `PATCH → 200`, linha voltou a `Ativa`, trilha com
`action='organization.activated'`, `is_active_anterior:false`, `orgs_ativas_depois:3`.
**O banco de teste ficou como estava**: as três empresas ativas.

Capturas: `raiz-plataforma.png`, `raiz-empresa-a.png`, `menu-aberto.png`, `dialogo.png`,
`dialogo-preenchido.png`, `dialogo-erro.png`, `lista-depois.png`, `lista-retomada.png` (fora do
repositório — o repo é público e as telas mostram o ambiente de teste).

---

### AC9 — a dependência do corte de roteamento, declarada

1. **Confirmado:** `organizations.is_active` é input de roteamento de `resolveSoleOrg()`
   (`webhook-org.ts:244-248`), e o modo vivo hoje é **`both`** — `WEBHOOK_ORG_ROUTING` não existe em
   nenhum arquivo de env do repositório, e `decidirModoRoteamento()` devolve `"both"` na ausência
   dela. Em `both` quem decide o `orgId` é o legado. **O efeito de roteamento é latente, não ativo.**
2. **Item de backlog criado**, não lembrança: `docs/backlog.md` →
   *"[Epic 900] 🟠 O diálogo de «Pausar empresa» diz «pode» mudar — vira «muda» no dia do corte da
   `900-55`"*, endereçado a quem executar o corte, com o ponteiro para `FRASE_DO_ROTEAMENTO` e para
   a âncora literal `FRASE_III` do teste (que **vai** ficar vermelha, e é para ficar).
3. **Confirmado:** o `reason` obrigatório é o que permite reconstruir depois "por que a contagem de
   ativas mudou naquele dia" — e a AC10 põe o número ao lado do motivo, na mesma linha da trilha.

### Réguas de outras stories que esta mudança MOVEU (e por quê)

Três asserções pré-existentes ficaram vermelhas **corretamente** — elas afirmavam o estado de antes:

1. `scripts/admin-client-allowlist.test.ts` — `TOTAL_ESPERADO` **242 → 243**. É catraca: o número é
   literal de propósito, para que mexer na allowlist apareça em diff com dono.
2. `console-lista-empresas.test.ts`, AC5 — o call site `<OrgRowMenu orgId slug />` ganhou `nome` e
   `isActive`. A asserção passou a medir os **quatro props dentro do recorte do elemento**, e não a
   linha formatada: exigir a formatação exata faria a régua reprovar o Prettier.
3. `console-lista-empresas.test.ts`, AC6 — o `describe` dizia *"os TRÊS itens, e não o quarto (que é
   da `900-60`)"*, com `expect(fonte).not.toContain("is_active")`. Era **fronteira de cronograma**,
   não propriedade do produto, e caducou. O que a substitui não é "nada aqui": é o elo com a fonte
   única do rótulo (`textoDaConfirmacao(isActive).rotuloDoMenu`) mais a proibição que **sobrevive** e
   agora é sobre o produto — `Desativar` não aparece no CÓDIGO de nenhum arquivo de `app/platform/**`.
4. `console-lista-empresas.test.ts`, controle positivo do `Esc` — contava
   `botao.current?.focus()` **no arquivo inteiro** e exigia `toBe(1)`, para garantir que o `replace`
   sem `g` acertasse o alvo único. O arquivo passou a ter **duas** devoluções de foco (a do `Esc` e a
   do fechamento do diálogo) e o `toBe(1)` virou falso sem nada ter quebrado. A unicidade continua
   sendo o que importa; o **escopo** onde ela é medida passou a ser o trecho do `aoTeclar`. E foi
   acrescentada a asserção que faltava: **o veneno acertou o alvo certo** — a outra devolução de foco
   sobrevive à mutação.

### O que NÃO consegui provar

1. **Nada foi verificado em produção.** Só leitura de metadados seria permitida, e nada aqui
   precisou disso. A migration `250` **não** foi aplicada em produção — isso é do `@devops`, na ordem
   do deploy.
2. **A trilha não foi conferida pela TELA** (`/platform/trilha` é a `900-59`, ainda não implementada).
   Ela foi conferida por leitura direta do `platform_audit_log` no banco de teste, que é o que a
   Task 3.1 previa como alternativa.
3. **`resolveSoleOrg` mudando de comportamento não foi observado de ponta a ponta.** Provei o
   mecanismo (`orgs_ativas_depois` caiu de 3 para 2 no `UPDATE`), não o efeito no roteamento — em
   `both` ele não existe, e forçar `identifier` seria executar a `900-55` dentro desta story.
4. **Concorrência real não foi exercitada.** O `FOR UPDATE` está lá e é o mecanismo certo, mas duas
   pausas simultâneas não foram disparadas contra o banco; a afirmação é sobre o SQL, não sobre uma
   medição.
5. **`docs/audits/migrations-aplicadas.json` não foi regenerado.** `pnpm db:status` o reescreve com o
   estado inteiro do banco de teste, que hoje inclui `246`/`247`/`249` como PENDENTE por causa de
   outras frentes — o diff não seria desta story.

### File List

**Criados**
- `supabase/migrations/250_pausar_retomar_empresa.sql`
- `packages/web/src/app/api/platform/orgs/[id]/route.ts`
- `packages/web/src/app/api/platform/orgs/[id]/route.test.ts`
- `packages/web/src/lib/tenancy/console-pausa-empresa.ts`
- `packages/web/src/lib/tenancy/console-pausa-empresa.test.ts`
- `packages/web/src/app/platform/orgs/_components/pausar-empresa-dialog.tsx`
- `packages/web/src/app/page.test.ts`

**Modificados**
- `packages/web/src/app/page.tsx` (porta de entrada — fora do escopo da `900-60`, pendência da `900-56`)
- `packages/web/src/app/platform/orgs/_components/org-row-menu.tsx`
- `packages/web/src/app/platform/orgs/page.tsx`
- `packages/web/src/lib/tenancy/console-lista-empresas.test.ts`
- `scripts/admin-client-allowlist.test.ts`
- `docs/audits/admin-client-allowlist.json`
- `docs/backlog.md` (só o item da AC9.2)
- `docs/stories/900-60-ativar-desativar-empresa.story.md`

### Change Log (Dev)

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-01 | 1.0 | Implementada. Migration `250` (RPC `organization_set_active_as_platform`, padrão da `248`), rota `PATCH`, diálogo por portal, 4º item do menu, badge Ativa/Pausada. Mais a 2ª porta de entrada (`app/page.tsx`), pendência da `900-56`. 3 arquivos de teste novos, +53 testes; 21 mutantes medidos com `tsc` rc=0. Provado na tela com as 3 contas do banco de teste, incluindo os dois sentidos e o caminho de falha. | @dev (Dex) |


## QA Results
_(Preenchido pelo @qa.)_
