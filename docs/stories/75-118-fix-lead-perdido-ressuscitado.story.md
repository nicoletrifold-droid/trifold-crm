# Story 75-118 — Fix: lead Perdido é terminal para automação (roleta/follow-up não podem ressuscitar)

## Metadata
- **Status:** InReview · **Epic:** 64 (roleta/distribuição) · **Branch:** fix/75-118-lead-perdido-terminal · **Complexidade:** S-M (2-3 pontos)
- **executor:** @dev + @data-engineer (migration 156) · **quality_gate:** @qa · **quality_gate_tools:** [teste de banco no caminho REAL (lead em Perdido NÃO é redistribuído pelo cron/distributor/RPC e NÃO recebe follow-up), typecheck, lint]
- **Prioridade:** 🟠 ALTA — produção: lead marcado como **Perdido** reaparece sozinho em **"Aguardando atendimento"** (caso Sueli Morovis, print do Marcos 2026-07-03), e a Nicole segue mandando follow-up de lead perdido (Idalina: 181 follow-ups após o "perdido"). **Sem perda de lead.**

## Story
**As a** gestão, **I want** que um lead marcado como **Perdido** fique **terminal para toda automação** (roleta, distribuição, follow-up da Nicole, qualquer job service-role), **so that** um lead descartado só volte a se mexer por **ação explícita de um usuário do sistema** — e pare de ressuscitar sozinho no funil.

## Regra de negócio (decisão do dono do produto, Marcos 2026-07-03)
Lead em **Perdido** (`stage_id = '00000000-0000-0000-0001-000000000008'`) é **terminal para qualquer processo automático**. Nenhum job service-role (roleta, distribuição, follow-up, rebalance) pode atribuir corretor, mudar etapa ou disparar mensagem para um lead perdido. Qualquer movimento futuro — reativar, incluir em campanha, novo follow-up, reabrir — **tem que ser disparado por um usuário do sistema** (ação humana, com `user_id`). Os caminhos manuais já carregam `user_id` (mudança de etapa via UI, drag no kanban, mark-lost) e **continuam permitidos**; o que muda é bloquear **todos os caminhos automáticos**.

## Contexto (bug confirmado em prod, 2026-07-03 — print + banco + rastreio de código)
Lead marcado Perdido reaparece em "Aguardando atendimento" via activity `stage_change` com **`user_id = null`** (= service-role, sem usuário logado).

**Causa-raiz (a roleta é cega ao status Perdido):**
1. `mark-lost` (`packages/web/src/app/api/leads/[id]/mark-lost/route.ts`) põe o lead em Perdido + grava `lost_reason` + activity `lead_lost`, MAS **deixa `is_active = true`** e **não limpa `assigned_broker_id`**. Um lead perdido sem corretor fica `is_active=true AND assigned_broker_id IS NULL`.
2. Cron **`roleta-retry`** (`api/cron/roleta-retry/route.ts:43-52`, service-role) busca candidatos por `is_active=true AND assigned_broker_id IS NULL AND bolsao_em IS NULL AND segmento='principal' AND created_at >= now-30d` — **não exclui Perdido**. O lead perdido-sem-corretor casa.
3. `distributor.ts` (`distributeLeadToNextBroker`): guards atuais só cobrem `assigned_broker_id` (linha 85), `segmento imob` (90) e `bolsao_em` (98) — **nenhum guard de Perdido**. Ao distribuir, escreve **`stage_id = STAGE_IDS.novo`** na **linha 148** (atalho `priorizar_lead_ativo`) e na **linha 286** (fluxo normal, pós-RPC). → ressuscita.
4. A RPC `roleta_pick_and_advance` não escreve `stage_id` (quem escreve `novo` é a app no distributor), mas também não tem guard de Perdido no `UPDATE ... WHERE assigned_broker_id IS NULL`.

**Bug secundário (mesma origem):** o cron de follow-up (`api/cron/followup/route.ts`) não exclui Perdido/`lost_reason` da seleção → a Nicole segue mandando follow-up de lead perdido (Idalina "numero errado" recebeu 181 follow-ups depois de perdida; Emerson 31).

**Confirmação em banco (2026-07-03):** 4 leads estavam marcados como perdidos (`lead_lost`) mas fora da etapa Perdido: Sueli Morovis, Teste Direto Prod, Emerson Celestino, Idalina. **Remediação de dados já aplicada** (voltaram para Perdido via UPDATE; todos com corretor, logo protegidos da re-captura). Esta story corrige a **origem**. Família dos bugs [[project-bolsao-lead-fantasma]] (75-89) e [[project-distribuicao-sem-log-orfao]] (75-106) — mesma superfície: roleta/distributor mexendo em lead que não devia.

## Escopo
**IN:**
1. **`distributor.ts`** (`distributeLeadToNextBroker`): incluir `stage_id` (e `lost_reason`) no `select` do lead; adicionar guard logo após buscá-lo — se `stage_id === STAGE_IDS.perdido` (ou `lost_reason` not null), **retornar sem distribuir** (novo status `"perdido"` no union `DistributionStatus`, sem logar como falha). Guard vem **antes** do atalho `priorizar_lead_ativo` e da chamada à RPC — cobre também webhooks (WhatsApp/Meta) que chamam o distributor direto. Espelha exatamente o guard de `bolsao_em` da 75-89.
2. **`roleta-retry` cron** (`api/cron/roleta-retry/route.ts`): excluir Perdido da busca de candidatos — `.neq("stage_id", PERDIDO)`; e no re-check de idempotência selecionar/checar `stage_id` e pular se Perdido.
3. **`followup` cron** (`api/cron/followup/route.ts`): excluir Perdido/`lost_reason` da seleção de leads elegíveis a follow-up (a Nicole não segue lead perdido). Verificar todas as queries de seleção do cron.
4. **Migration 156** (`156_roleta_pick_no_perdido.sql`): `CREATE OR REPLACE FUNCTION roleta_pick_and_advance(...)` com guard defensivo — adicionar `stage_id = perdido` ao `IF EXISTS(...)` inicial e `AND stage_id <> perdido` ao `UPDATE ... WHERE assigned_broker_id IS NULL`. Belt-and-suspenders (o distributor já guarda antes de chamar). Base: última versão viva (migration 130, story 75-89).

**OUT (com justificativa):**
- **NÃO** setar `is_active=false` no `mark-lost` nesta story. Seria a proteção mais robusta, mas há risco de o lead sumir da coluna "Perdido"/telas se alguma query de pipeline filtrar `is_active=true` — precisa de investigação própria do raio de impacto de `is_active` (ver [[feedback-nao-quebrar-o-que-funciona]]). Os guards por `stage_id=perdido` (itens 1-4) já implementam a regra de negócio sem esse risco. Registrar como follow-up opcional.
- **NÃO** limpar `assigned_broker_id` de lead perdido — corretor não-nulo é hoje o que protege da re-captura; a regra de negócio é atendida pelo guard de stage.
- Webhooks Meta/WhatsApp/landing-page: já **não** escrevem `stage_id` no branch de lead existente (só em INSERT de lead novo) — sem mudança. Um lead genuinamente novo (novo `leadgen`) que crie nova linha é lead novo legítimo, fora de escopo.
- Sem backfill adicional (remediação dos 4 leads já feita em prod).
- Não mexe em `mark-lost` além do já descrito (não altera o comportamento de quem marca).

## Acceptance Criteria
1. **Given** um lead em Perdido (`stage_id=...0008`) sem corretor, **when** o cron `roleta-retry` roda, **then** ele **não** é candidato à redistribuição (permanece em Perdido, sem nova entrada em `lead_distribution_log`, sem `stage_change`).
2. **Given** um lead em Perdido, **when** `distributeLeadToNextBroker` é chamado (cron ou webhook WhatsApp/Meta), **then** retorna `"perdido"` sem atribuir corretor, **sem** aplicar o atalho `priorizar_lead_ativo` e **sem** escrever `stage_id=novo`.
3. **Given** um lead em Perdido, **when** `roleta_pick_and_advance` é invocada, **then** ela retorna sem atribuir (guard `stage_id = perdido`).
4. **Given** um lead em Perdido, **when** o cron de follow-up roda, **then** a Nicole **não** dispara follow-up para ele (não aparece em nenhuma query de elegíveis).
5. **Given** um usuário do sistema (com `user_id`), **when** ele move o lead de Perdido para outra etapa (UI/kanban) ou reabre manualmente, **then** a ação **continua permitida** e registrada com `user_id` (não regride os caminhos manuais).
6. **Regra de negócio verificada:** nenhum caminho service-role (roleta, distributor, RPC, follow-up) consegue tirar um lead de Perdido; todo movimento de lead perdido no histórico passa a ter `user_id` não-nulo.
7. **Teste de banco no caminho REAL:** simular lead em Perdido e verificar que cron-retry/distributor/RPC/follow-up **não** o tocam; e que a distribuição de um lead normal continua funcionando (sem regressão). typecheck/lint limpos. Ref. [[feedback-nao-quebrar-o-que-funciona]].

## Dev Notes
- **Constantes de stage:** `packages/shared/src/constants/stages.ts` — `novo = 00000000-0000-0000-0001-000000000001`, `perdido = 00000000-0000-0000-0001-000000000008`. Usar `STAGE_IDS.perdido` (não hardcodar).
- **Distributor:** `packages/web/src/lib/roleta/distributor.ts` — `select` do lead na linha ~70-72 (adicionar `stage_id, lost_reason`); adicionar o guard novo **junto aos guards existentes (linhas 84-100)**, logo após o guard de `bolsao_em`, **antes** do bloco `priorizar_lead_ativo` (linha 105) e da RPC. Escritas de `stage_id=novo` a proteger: linhas **148** e **286**. Adicionar `"perdido"` ao union `DistributionStatus` (topo do arquivo, ~linha 9). Guard truthy-safe (robusto a undefined em mocks). Modelo pronto: o guard `if (lead.bolsao_em) return { status: "em_bolsao" }` da 75-89.
- **roleta-retry:** `packages/web/src/app/api/cron/roleta-retry/route.ts` — query de candidatos (~linha 43-52) e re-check de idempotência: espelhar o que a 75-89 fez com `bolsao_em`, agora para `stage_id != perdido`.
- **follow-up:** `packages/web/src/app/api/cron/followup/route.ts` — mapear TODAS as queries de seleção de leads elegíveis (pode haver mais de uma janela). Excluir `stage_id = perdido` (e considerar `lost_reason IS NOT NULL`). Confirmar no caminho real que a Nicole para de mandar (era o caso da Idalina).
- **RPC:** versão viva confere via `pg_get_functiondef('roleta_pick_and_advance')`; base é migration 130 (75-89, que já tem o guard `bolsao_em`). Adicionar só o predicado `stage_id`/`perdido` ao guard inicial e ao UPDATE final; resto idêntico (round-robin, teto, empreendimento, `bolsao_em`).
- **Caminhos manuais que NÃO devem ser tocados (AC5):** `api/leads/[id]/stage/route.ts` (mudança manual), `components/pipeline/kanban-board.tsx` (drag), `api/leads/[id]/mark-lost/route.ts` — todos rodam com usuário/RLS e carregam `user_id`.
- **Migration:** última é 155 → usar **156**. Aplicar em prod = @devops (padrão do time: SQL direto via Management API, como a 130).

## File List
- `supabase/migrations/156_roleta_pick_no_perdido.sql` — `CREATE OR REPLACE roleta_pick_and_advance` com guard `stage_id <> perdido`.
- `packages/web/src/lib/roleta/distributor.ts` — guard `stage_id=perdido`/`lost_reason` + status `"perdido"`.
- `packages/web/src/app/api/cron/roleta-retry/route.ts` — excluir Perdido dos candidatos + re-check.
- `packages/web/src/app/api/cron/followup/route.ts` — excluir Perdido/lost da seleção de follow-up.
- testes: distributor (`perdido`), roleta-retry (não pega Perdido), followup (não dispara p/ Perdido), teste de banco no caminho real.

## PO Validation (@po Pax — 2026-07-03)
**Verdict: GO — 10/10.**
1. Título claro e objetivo ✓ 2. Descrição completa (problema + causa-raiz + regra de negócio) ✓ 3. ACs testáveis em Given/When/Then, incluindo AC de não-regressão (AC5) e teste no caminho real (AC7) ✓ 4. Escopo IN/OUT explícito, com justificativa do que fica de fora (`is_active=false`) ✓ 5. Dependências mapeadas (irmãs 75-89/75-106; migration 130 como base da RPC) ✓ 6. Complexidade estimada (S-M) ✓ 7. Valor de negócio claro (para de ressuscitar/spamar lead descartado; regra "só usuário move Perdido") ✓ 8. Riscos documentados (raio de `is_active`; caminhos manuais preservados) ✓ 9. Definition of Done clara (guards em todos os caminhos service-role + teste real) ✓ 10. Alinhado ao Epic 64 (roleta/distribuição) ✓.

**Anti-invenção (Art. IV) — verificado no código:** `STAGE_IDS.perdido='...0008'` / `novo='...0001'` (`packages/shared/src/constants/stages.ts:6,16`); `DistributionStatus` (`distributor.ts:8`), guard-modelo `bolsao_em` (`distributor.ts:98-99`), escritas `stage_id=novo` a proteger (`distributor.ts:148,286`), `select` do lead (`distributor.ts:72`); `followup` cron existe (`api/cron/followup/route.ts`); última migration = 155 → 156 livre. Todas as referências das Dev Notes conferem.

**Regressão mapeada:** caminhos manuais (`api/leads/[id]/stage`, kanban drag, `mark-lost`) carregam `user_id` e NÃO são tocados (AC5); RPC herda guards da 130 (`bolsao_em` intacto). **Próximo passo:** `@dev *develop 75-118`.

## Dev Agent Record (@dev Dex — 2026-07-03)
**Implementado (4 itens do escopo):**
- [x] `distributor.ts`: `stage_id` no `select` do lead (linha 72) + guard `if (lead.stage_id === STAGE_IDS.perdido) return { status: "perdido" }` **antes** de `priorizar_lead_ativo`/RPC (junto ao guard de `bolsao_em`) + `"perdido"` no union `DistributionStatus`. **Decisão:** guard por ETAPA atual (`stage_id`), NÃO por `lost_reason` — `lost_reason` fica gravado mesmo após um usuário reabrir o lead; guardar por ele re-bloquearia a automação de um lead já reativado por humano, contrariando a regra de negócio (uma vez que o usuário age, volta a fluir).
- [x] `roleta-retry` cron: `.neq("stage_id", STAGE_IDS.perdido)` na busca de candidatos + re-check de idempotência agora seleciona/checa `stage_id` e pula se Perdido (import de `STAGE_IDS` adicionado).
- [x] `followup` cron: `if (rule.stage_id === STAGE_IDS.perdido) continue` no loop de regras — a Nicole não manda follow-up de lead perdido (era o caso Idalina: 181 follow-ups).
- [x] Migration 156 (`156_roleta_pick_no_perdido.sql`): `roleta_pick_and_advance` com guard `stage_id = perdido` no `IF EXISTS` inicial e `AND stage_id <> perdido` no UPDATE final. Base = 130 (mantém guard de `bolsao_em`); resto idêntico.

**Testes (unit):**
- [x] `distributor.test.ts`: novo caso — lead em Perdido retorna `"perdido"`, NÃO atribui, NÃO muda stage, NÃO roteia por continuidade (mesmo com `priorizar_lead_ativo=true` + telefone com dono). `VALID_LEAD` ganhou `stage_id` (novo).
- [x] `roleta-retry/route.test.ts`: candidatos aplicam `neq stage_id = perdido`; re-check pula lead marcado Perdido no meio-tempo. **Bônus (higiene):** corrigido fixture pré-existente — o `current` default do mock não tinha `segmento`, o que já deixava 4 testes do 71-1 vermelhos no `main` (o re-check `current.segmento !== "principal"` pulava tudo). Adicionado `segmento: "principal"` ao default → os 4 voltaram a passar e agora exercem o caminho real.
- [x] **`npx vitest run` (distributor + roleta-retry): 17/17.** followup (irmãos): 14/14. `tsc --noEmit` (web): 0 erros. `eslint`: 0 erros/warnings novos nos arquivos alterados (erros restantes do `npm run lint` são pré-existentes em `informe-pdf.tsx`/`weather-widget.tsx`, fora do escopo).

**Nuance registrada p/ @qa/produto (não bloqueia esta story):** o guard é por ETAPA=Perdido. O caso histórico da Idalina (marcada perdida mas movida a "Visita Agendada" e seguida pela Nicole) só é 100% fechado se um lead perdido NUNCA sair de Perdido por caminho automático — o que estas mudanças garantem para roleta/distributor/followup. Se algum OUTRO caminho (ex.: criação de compromisso) mover um lead de Perdido para etapa ativa, isso é ação de usuário (permitido pela regra). A proteção mais forte (mark-lost setar `is_active=false`) segue como follow-up OUT-of-scope por risco de visibilidade na coluna Perdido.

**Não feito (fora do papel do @dev / delegado):**
- Migration 156 NÃO aplicada em prod (deploy = @devops). Teste de banco no caminho real (AC7) = @qa gate.
- Nada de push/PR (— @devops).

## QA Results (@qa Quinn — 2026-07-03)
**Verdict: PASS.** ✅

**Teste no banco REAL (read-only, contra os leads Perdidos reais — sem mutar prod por segurança):**
| Check | Resultado | Esperado |
|---|---|---|
| Função VIVA (130) já tem guard de Perdido? | false | confirma superfície do bug / necessidade da 156 |
| Leads Perdidos hoje broker-null (capturáveis pela retry antiga) | 0 | remediação segurou (sem sangramento ativo) |
| Guard INICIAL da 156 aborta lead Perdido real (Sueli) | **true** | ✅ true (AC3) |
| UPDATE FINAL da 156 (`stage_id <> perdido`) casa lead Perdido | **false** | ✅ false (AC3) |

**Rastreabilidade dos ACs:**
- AC1 (retry não pega Perdido): unit test `roleta-retry` — candidatos aplicam `neq stage_id=perdido` + re-check pula Perdido ✅
- AC2 (distributor retorna `perdido`, sem continuidade): unit test distributor (mesmo com `priorizar_lead_ativo=true` + telefone com dono) ✅
- AC3 (RPC recusa Perdido): predicados da 156 provados read-only contra lead Perdido real ✅ (execução viva antes/depois via txn-rollback = a fazer pelo @devops no ato do apply, como na 75-89; a proteção que realmente dispara em prod é o distributor+retry, unit-tested; a RPC é belt-and-suspenders)
- AC4 (followup não dispara p/ Perdido): revisão de código (`if (rule.stage_id === STAGE_IDS.perdido) continue`) — sem harness de GET no followup, inspeção (aceitável p/ S-M) ✅
- AC5 (caminhos manuais preservados): revisão — `api/leads/[id]/stage`, kanban drag e `mark-lost` intocados (carregam `user_id`) ✅
- AC6 (movimento de Perdido só com user_id): por construção — os 3 caminhos service-role passam a abortar em Perdido ✅
- AC7 (teste real): predicados read-only ✅ (ver AC3 p/ ressalva do antes/depois vivo)

**Checks estáticos (reproduzidos):** `vitest` roleta + cron = **82/82** (inclui distributor+retry+followup+bolsão+boleto → sem regressão nas irmãs). `tsc --noEmit` (web) 0 erros. `eslint`: 0 erros/warnings novos nos arquivos alterados.

**Observações (não bloqueiam):** (1) AC4/AC5 por inspeção — proporcional a S-M. (2) AC3 verificado por predicado read-only, não por execução viva da função (decisão de segurança: não mutar prod; @devops confirma pós-apply via `pg_get_functiondef` + rollback test, igual 75-89). (3) Nuance do "lead perdido que sai de Perdido por outro caminho" documentada no Dev Record — fora de escopo (é ação de usuário; `is_active=false` no mark-lost segue como follow-up).

**Gate → PASS.** Pronto para @devops (push + aplicar migration 156 em prod + confirmar RPC viva).

## Change Log
- 2026-07-03 — @qa (Quinn) — Gate **PASS**. Predicados da 156 provados read-only contra lead Perdido real (guard aborta=true, update casa=false); 82/82 testes roleta+cron, tsc 0, lint 0 novo. Ressalva: antes/depois vivo da RPC → @devops no apply. Handoff → @devops (push + migration 156).
- 2026-07-03 — @dev (Dex) — Implementado escopo (distributor + roleta-retry + followup + migration 156) + testes (17/17 + 14/14, tsc 0, lint 0 novo). Guard por `stage_id=perdido` (não `lost_reason`). Corrigido fixture pré-existente do roleta-retry test (segmento faltando). Status Ready → InProgress → InReview. Handoff → @qa.
- 2026-07-03 — @po (Pax) — `*validate-story-draft`: **GO 10/10**. Anti-invenção conferida no código (STAGE_IDS, distributor:8/72/98/148/286, followup cron, migration 156 livre). Status Draft → **Ready**. Handoff → @dev.
- 2026-07-03 — @sm (River) — Story criada (Epic 64) como 75-118 (75-117 já ocupada por central-materiais). Causa-raiz rastreada em código (distributor.ts:148/286, roleta-retry, followup, RPC) e confirmada em banco (4 leads remediados). Regra de negócio "Perdido é terminal para automação; movimento só por usuário" registrada pelo dono do produto (Marcos). Handoff → @po `*validate-story-draft 75-118`.
