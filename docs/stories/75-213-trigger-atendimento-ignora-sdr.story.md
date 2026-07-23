# Story 75-213 — Trigger de 1º atendimento ignora movimentos para a etapa "SDR"

## Metadata
- **Status:** Done
- **Epic:** 75 — Relatório diário do diretor / métricas de leads
- **Branch:** fix/75-213-trigger-atendimento-ignora-sdr
- **Relacionado:** 75-45 (mig 112, trigger `stamp_primeiro_atendimento`), 75-204 (perfil SDR)
- **Tipo:** Fix — incidente 2026-07-23: a Thielly (SDR) moveu 52 leads da base
  antiga (parados em "Aguardando atendimento") para a etapa nova "SDR" e o
  trigger carimbou `primeiro_atendimento_em` em todos como se fossem
  atendimentos reais — 18 tinham distribuição de junho e estourariam o "Tempo
  médio de atendimento" do relatório do Alexandre (~6 semanas de máxima). Os
  dados foram corrigidos à mão no dia (52 carimbos limpos); falta o guard
  definitivo, pois a operação de requalificação da base vai continuar.

## Acceptance Criteria
- [x] AC1: migration nova (`CREATE OR REPLACE` da função
  `stamp_primeiro_atendimento`): saída de "novo" com **destino etapa slug
  `sdr`** NÃO carimba. Qualquer outro destino segue carimbando (comportamento
  da mig 112 intacto, incl. idempotência).
- [x] AC2: fluxo de retorno preservado — lead que sair de SDR → "Aguardando
  atendimento" → corretor move para outra etapa, carimba normalmente nessa
  saída real de "novo". Org sem etapa `sdr` → comportamento idêntico ao atual.
- [x] AC3: migration aplicada em PROD (Management API) + teste vivo com
  rollback comprovando: novo→sdr não carimba; novo→outra etapa carimba.
- [x] AC4: type-check/lint/suíte verdes (mudança só de SQL; sem código web).

## File List
- `docs/stories/75-213-trigger-atendimento-ignora-sdr.story.md` (this file)
- `supabase/migrations/192_stamp_primeiro_atendimento_ignora_sdr.sql`

## Change Log
- @sm (River) / @po (Pax) 2026-07-23: draft + GO (Ready) — guard definitivo do
  incidente do dia; escopo = 1 migration.
- @dev (Dex) 2026-07-23: mig 192 (CREATE OR REPLACE da função; guard destino
  slug 'sdr'; org sem 'sdr' → comportamento mig 112).
- @qa (Quinn) 2026-07-23: PASS — aplicada em prod (Management API) + teste
  vivo em DO block com rollback forçado: novo→sdr NÃO carimba; novo→
  em-qualificacao carimba; lead sintético não persistiu. Suíte 1191/1191.
- @devops (Gage) 2026-07-23: push + PR + merge.
