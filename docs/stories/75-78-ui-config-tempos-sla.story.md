# Story 75-78 — UI de configuração dos tempos de SLA (self-service)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** feat/75-78-ui-config-tempos-sla · **Complexidade:** S (1-2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste do PATCH (allowlist + validação), permissão]
- Estende o pacote SLA ([[project-sla-atendimento-decisoes]], stories 75-46 a 75-60).

## Story
**As a** gestor (admin/supervisor/gerente-comercial), **I want** ajustar os tempos de SLA pela tela da Roleta,
**so that** eu mude o alerta do corretor, o escalonamento do gestor e o liga/desliga sem depender de dev.

## Contexto
Os tempos de SLA vivem só em `roleta_config` (`sla_alerta_corretor_min`, `sla_alerta_gestor_min`,
`sla_alertas_enabled`) e **não têm UI** — só o cron `sla-alerts/route.ts` lê os valores (dinâmico, vale no
próximo ciclo de 10min). Toda mudança hoje passa por dev/banco (ex.: corretor 30→10 ajustado via UPDATE direto
em 2026-06-30). Já existe a tela da Roleta (`roleta-config-panel.tsx`) que salva via `PATCH /api/roleta/config`,
com um `allowlist` de campos — os 3 campos de SLA NÃO estão nela.

## Escopo
**IN:**
1. **API** (`api/roleta/config/route.ts`): incluir `sla_alertas_enabled`, `sla_alerta_corretor_min`,
   `sla_alerta_gestor_min` no array `allowed`. Validar: minutos inteiros > 0; **corretor < gestor**
   (alerta tem que vir antes da escalada). Permissão já é admin/supervisor/gerente-comercial (reusar).
2. **UI** (`roleta-config-panel.tsx`): nova seção "SLA / Tempo de atendimento" com:
   - toggle **Alertas de SLA** (`sla_alertas_enabled`) — padrão dos toggles `notify_*`;
   - input numérico **Alertar corretor após (min)** (`sla_alerta_corretor_min`) — padrão do `max_leads_per_day`;
   - input numérico **Escalar p/ gestor após (min)** (`sla_alerta_gestor_min`).
   - Salvar via `persist()` (PATCH existente); refletir o estado atual no load (GET já traz tudo).
3. Microcopy curta explicando que o relógio conta da distribuição até o atendimento, em horário comercial.

**OUT:**
- Não muda a lógica do cron, nem o relógio (business-time), nem a agenda (`roleta_schedule`).
- Não cria campo de "meta de SLA" separado (a meta = tempo do gestor = `sla_alerta_gestor_min`).
- Sem histórico/auditoria de mudança dos tempos (follow-up se quiserem).

## Acceptance Criteria
1. **Given** um gestor na tela da Roleta, **when** altera "alertar corretor" para X e salva, **then**
   `roleta_config.sla_alerta_corretor_min = X` e o cron passa a usar X no próximo ciclo.
2. **Given** o toggle de alertas, **when** desligado/ligado, **then** `sla_alertas_enabled` reflete e o cron
   respeita (já tem o kill-switch).
3. **Given** corretor ≥ gestor (ou valor ≤ 0/ não-inteiro), **then** a API rejeita (400) e a UI não salva valor inválido.
4. **Given** um corretor (role broker), **when** tenta o PATCH, **then** 403 (permissão inalterada).
5. **Given** o load da tela, **then** os 3 campos mostram os valores atuais do banco.
6. typecheck/lint limpos; teste do PATCH cobrindo allowlist + validação corretor<gestor + permissão.

## Dev Notes
- Cron lê dinâmico: `sla-alerts/route.ts` ~L122 `cfg.sla_alerta_corretor_min ?? 30`, `~L123 gestorMin ?? 60`.
- Padrões a reusar no painel: input numérico `max_leads_per_day` (~L266-278, valida `v>0` + `persist`); toggles
  `notify_*` (~L302+). Estado/tipo do `config` (~L17-52). `persist()` faz PATCH /api/roleta/config (~L70).
- Valores em MINUTOS. Defaults se nulos: corretor 30, gestor 60 (manter no fallback do cron).

## File List
- `packages/web/src/app/api/roleta/config/route.ts` — +3 campos no allowlist + validação.
- `packages/web/src/app/dashboard/roleta/_components/roleta-config-panel.tsx` — seção SLA (toggle + 2 inputs).
- `packages/web/src/app/api/roleta/config/route.test.ts` — teste (criar se não existir).

## QA Results
- **Verdict: PASS.** API: `allowed` + bloco de validação (inteiro>0, corretor<gestor, com cross-check no config
  atual quando só 1 campo vem). UI: seção "SLA / Tempo de atendimento" (toggle + 2 inputs) seguindo os padrões do
  painel; validação espelhada no client (`persistSlaMin`). 6 testes (broker→403, salva válido, corretor≥gestor→400,
  ≤0→400, cross-check parcial→400, campo não-SLA segue ok). type-check 0, lint 0.
- Real: colunas SLA existem em prod (valores atuais corretor 10/gestor 60/enabled); GET `select("*")` → painel
  carrega os reais. Mudança aditiva (guardada por `touchesSla`) — sem regressão nos demais campos.

## Change Log
- 2026-06-30 — @sm — Story criada. UI self-service pros tempos de SLA na tela da Roleta (estende pacote SLA).
  Hoje sem UI (corretor 30→10 foi via UPDATE direto). Ver [[project-sla-atendimento-decisoes]].
- 2026-06-30 — @po — Validada 10/10. GO. Status Draft → Ready.
