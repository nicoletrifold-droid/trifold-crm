# Story 75-56 — Regra: Nicole (IA) nunca move etapa do lead

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2-3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** gestão comercial (e diretoria), **I want** que a Nicole (IA) **nunca** mova um lead de etapa no
pipeline — só corretores movem, e a Nicole só posiciona em "Aguardando atendimento" no ato da distribuição
via roleta —, **so that** o funil reflita o trabalho humano real e leads atendidos só pela IA não apareçam
indevidamente em "1º Contato"/"Qualificado".

## Contexto
Regra de negócio inegociável definida pelo usuário (2026-06-25): **a Nicole NUNCA pode mover um lead para
uma etapa diferente de "Aguardando atendimento"** (slug `novo`, `STAGE_IDS.novo`). Quem movimenta
etapas/estágios no pipeline são os **corretores** (humanos). O único momento em que o stage de um lead é
setado para `novo` é a **distribuição via roleta** — e isso já é feito pelo `distributor.ts`, não pela Nicole.

Esta story **estende a Story 65-1** (que só impedia a Nicole de reposicionar lead **já distribuído**). Agora a
regra vale para qualquer lead, com ou sem corretor.

**Bug observado em prod (25/06):** leads "Apenas IA / Sem corretor" apareceram parados em "1º Contato"
(slug `em-qualificacao`). Ex.: leads `554488559829` e `554498413368` (Vind Residence), score 25, sem corretor.
Causa: o pipeline da IA avança o lead por score (`pipeline.ts`). Diagnóstico confirmado pelo lead:
- `pipeline.ts:~720-722` — `novo → em_qualificacao` quando `score > 0`.
- `pipeline.ts:~723-725` — `em_qualificacao → qualificado` quando `score >= 70`.
- `pipeline.ts:~818` — handoff → `qualificado`.

> NOTA (fora de escopo): o fato de esses leads ainda não terem sido distribuídos é **comportamento correto** —
> entraram após as 20:00 e a roleta opera 08:00–20:00 (`roleta_config`), então ficaram represados como
> `fora_horario` até a abertura. Isto NÃO é bug e NÃO faz parte desta story.

## Escopo
**IN:**
1. `packages/ai/src/chat/pipeline.ts` — remover as **3** escritas de `leadPatch.stage_id` feitas pela IA:
   - bloco `if (currentLead?.stage_id === STAGE_IDS.novo && updatedScore > 0) { ... em_qualificacao ... }`
     (incluindo o `emit` `STAGE_CHANGE` correspondente);
   - `else if (... em_qualificacao && updatedScore >= 70) { ... qualificado ... }` (e seu `emit`);
   - no bloco de handoff (`if (handoffResult.trigger ...)`), a linha `leadPatch.stage_id = STAGE_IDS.qualificado`.
2. `packages/ai/src/flows/stage-rules.ts` — `guardStageForAssignedLead` passa a remover `stage_id` do patch
   **incondicionalmente** (independe de ter corretor). Ajustar JSDoc; manter o call-site em `pipeline.ts (~844)`.
3. `packages/ai/src/flows/stage-rules.test.ts` — inverter os casos AC2 (que hoje MANTÊM stage_id p/ lead sem
   dono) para a nova regra: stage_id é sempre removido.
4. **Data-fix (migration única):** para leads com `assigned_broker_id IS NULL`:
   (a) `stage_id` em (`em_qualificacao`, `qualificado`) volta para `STAGE_IDS.novo`;
   (b) **zerar `primeiro_atendimento_em` (= NULL)** — o carimbo da Story 75-45 foi disparado falsamente
   quando a Nicole moveu o lead para fora de "novo". O trigger (`migration 112`) **só carimba quando o
   campo está nulo** (nunca regrava), então sem este reset o atendimento REAL do corretor (pós-distribuição)
   nunca seria registrado e o relatório de tempo de atendimento (75-45/75-46) ficaria com horário errado.
   Conferir próximo número livre em `supabase/migrations/` (a 112 já existe).

**OUT:**
- Handoff continua funcionando (desativa IA, notifica, registra activity) — só NÃO muda mais a etapa.
- Não mexer no `distributor.ts` (continua setando `novo` na distribuição — comportamento legítimo).
- Não mexer no horário da roleta / `fora_horario` (comportamento correto).
- Correção pontual imediata dos 2 leads do print (`554488559829`, `554498413368`) já foi aplicada manualmente
  em prod (stage → `novo` e `primeiro_atendimento_em` → NULL, em 25/06 ~07:48 BRT) para distribuírem às 08:00.
  A migration de data-fix cobre o conjunto histórico completo.

## Acceptance Criteria
1. **Given** qualquer mensagem/qualificação/handoff processada pela Nicole, **when** o pipeline monta o
   `leadPatch`, **then** ele **nunca** contém `stage_id` — a IA não escreve etapa em hipótese alguma.
2. **Given** um handoff disparado, **when** o pipeline executa, **then** desativa a IA na conversa
   (`is_ai_active=false`, `handoff_at`, `handoff_reason`), grava o `ai_summary`, insere a activity de handoff e
   emite `HANDOFF_TRIGGERED` — **sem** alterar a etapa do lead.
3. **Given** o guard `guardStageForAssignedLead`, **when** chamado com qualquer `assignedBrokerId` (null ou não),
   **then** remove `stage_id` do patch; os testes em `stage-rules.test.ts` refletem a regra incondicional.
4. **Given** um lead criado/atendido só pela IA, **when** nenhum corretor agiu e a roleta não distribuiu,
   **then** ele permanece em "Aguardando atendimento" (`novo`).
5. **Given** o data-fix aplicado, **when** consultados os leads sem corretor (`assigned_broker_id IS NULL`),
   **then** nenhum está em `em_qualificacao`/`qualificado` (todos em `novo`) **e** nenhum tem
   `primeiro_atendimento_em` preenchido (carimbo falso zerado p/ o trigger recarimbar no atendimento real).
6. **Given** a distribuição da roleta, **when** um lead é distribuído, **then** continua sendo posicionado em
   `novo` pelo `distributor.ts` (sem regressão).
7. typecheck/lint/vitest limpos.

## Dev Notes
- Constantes de stage: `packages/shared/src/constants/stages.ts` — `novo = 00000000-0000-0000-0001-000000000001`,
  `em_qualificacao = ...0002`, `qualificado = ...0003`.
- Único lugar legítimo que seta `stage = novo`: `packages/web/src/lib/roleta/distributor.ts` (~linhas 147-150 e ~286).
- A ordem em `pipeline.ts` é: monta `leadPatch` → (hoje) escreve stage por score → handoff → `guardStageForAssignedLead`
  → único `update` em `leads`. Com a regra nova, tornar o guard incondicional já garante a invariante mesmo que
  alguma escrita escape; ainda assim, remover as 3 escritas na origem (não basta só o guard).
- Story relacionada: **65-1** (Nicole não move stage de lead distribuído) — esta generaliza a regra.

### Testing
- `packages/ai/src/flows/stage-rules.test.ts` (vitest) — atualizar para a regra incondicional; manter cobertura
  dos casos (com corretor, sem corretor null, sem corretor undefined, broker string vazia, patch sem stage_id).
- Rodar `vitest` no pacote `packages/ai` + `typecheck` + `lint`.
- Migration de data-fix: idempotente (re-rodar não causa efeito colateral).

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.56-nicole-nunca-move-etapa.yml`) · readiness 9/10
- 7/7 checagens OK. **313/313 testes verdes** (inclui `pipeline-broker-guard` e `handoff`); typecheck/lint limpos.
- Confirmado por grep: única escrita em `leads.stage_id` é o `leadPatch` guardado (pipeline.ts:845, guard 839) — nenhuma escrita de etapa escapou.
- **Observação (low, fora de escopo):** pipeline B1/B2 (Story 51-7) atribui corretor do imóvel sem roleta — não fere a regra de etapa, mas é decisão de produto p/ revisar (não bloqueia).
- **Pendente @devops:** aplicar migration 114 em prod no deploy; Status → Done só após push.

## Riscos
- **Regressão silenciosa em outros consumidores do stage:** algum fluxo pode depender de a Nicole ter
  avançado o lead para `em_qualificacao`/`qualificado` (ex.: alertas, follow-up cron, analytics por etapa).
  Mitigação: a etapa nunca foi um sinal confiável (era automática por score); validar follow-up
  (`api/cron/followup`) e relatórios que filtram por stage. **Baixo** — a fonte de verdade de qualificação é
  `qualification_score`/`qualification_status`, que continuam sendo gravados.
- **Data-fix amplo demais:** o UPDATE atinge todos os leads sem corretor em `em_qualificacao`/`qualificado`.
  Mitigação: condição `assigned_broker_id IS NULL` garante que só pega lead nunca distribuído; migration
  idempotente. **Baixo.**
- **Zerar `primeiro_atendimento_em` de lead legítimo:** improvável — lead sem corretor nunca foi atendido,
  então o carimbo só pode ser o falso. **Baixo.**
- **Handoff sem mudança de etapa pode confundir gestão visualmente** (lead entregue continua em "Aguardando
  atendimento"). É exatamente o comportamento desejado pela regra (corretor reposiciona). **Aceito por design.**

## File List
- `packages/ai/src/chat/pipeline.ts` — removidas as 3 escritas de `stage_id` (score-based + handoff); comentários atualizados.
- `packages/ai/src/flows/stage-rules.ts` — guard agora remove `stage_id` incondicionalmente; JSDoc atualizado.
- `packages/ai/src/flows/stage-rules.test.ts` — testes invertidos para a regra incondicional (6 casos).
- `supabase/migrations/114_datafix_nicole_stage_para_novo.sql` — data-fix (stage→novo + zera carimbo falso).

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - `STAGE_IDS` segue importado/usado em `pipeline.ts:413` (`no_show`) → import preservado, sem dead code.
  - Guard mantém a assinatura de 2 args (call-site em `pipeline.ts` inalterado); 2º arg renomeado `_assignedBrokerId` (não usado).
  - **Validação local:** `vitest packages/ai` → **313/313 testes verdes** (inclui `pipeline-broker-guard` e `handoff`); `tsc --noEmit` (packages/ai) limpo.
  - **Migration 114 NÃO aplicada em prod** (responsabilidade @devops no deploy). Os 2 leads do print já foram corrigidos manualmente em 25/06 ~07:48 BRT.

## Change Log
- 2026-06-25 — @sm — Story criada. Regra "Nicole nunca move etapa" (estende 65-1); remoção das 3 escritas de
  stage no pipeline + guard incondicional + data-fix. Ver memória [[feedback-nicole-nunca-move-etapa]].
- 2026-06-25 — @po — Validação (checklist 10 pontos): **GO**, score 9/10. Adicionada seção Riscos (lacuna do
  ponto 8). Status Draft → Ready. Obs.: `quality_gate=@qa` segue a convenção da casa (Story 75-46), embora a
  task 1.1 liste @architect/@dev/@pm — sem bloqueio.
- 2026-06-25 — @dev — Implementado: removidas 3 escritas de stage no pipeline; guard incondicional + testes
  invertidos; migration 114 (data-fix). 313/313 testes verdes, typecheck limpo. Status Ready → Review.
