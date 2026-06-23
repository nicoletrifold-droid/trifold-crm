# Story 75-22 — WhatsApp ligado por padrão nas notificações de obra dos clientes

## Metadata
- **Status:** Done
- **Epic:** 75 (ajustes operacionais)
- **Branch:** main (mudança incremental, padrão do repo)
- **Complexidade:** XS (1 ponto) — flip de default
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story

**As a** Trifold,
**I want** que as notificações de obra dos clientes saiam por WhatsApp por padrão
   (além de e-mail),
**so that** os clientes recebam as atualizações no canal mais usado, agora que o
   telefone está mapeado (75-20/75-21).

## Contexto

Decisão do usuário (2026-06-23). `notifyClientes` (`lib/notificacoes.ts`) usa
`DEFAULT_PREFS` quando o cliente não tem linha em `obra_notificacao_prefs`. Em
prod há **0 linhas** de prefs → todos usam o default. O default tinha
`whatsapp_enabled: false`, então WhatsApp não disparava para ninguém. Telefone já
preenchido (68/72) e `whatsapp_config` da org presente.

## Escopo

**IN:**
- `lib/notificacoes.ts`: `DEFAULT_PREFS.whatsapp_enabled` → `true`.

**OUT:**
- Alterar default da coluna no banco (`obra_notificacao_prefs.whatsapp_enabled`)
  — só relevante quando clientes criarem linhas de pref; tratado se necessário depois.
- Templates/condições de envio (já existentes); preenchimento de telefone (75-21).

## Consideração (aceita pelo usuário)
Liga WhatsApp para TODOS os clientes com telefone. Implica envio em massa nos
próximos eventos de obra (foto, documento, mensagem, progresso). Aspecto de
consentimento/LGPD assumido pelo usuário. Cliente pode desativar nas preferências.

## Acceptance Criteria
1. `DEFAULT_PREFS.whatsapp_enabled === true`.
2. Eventos de obra passam a enviar WhatsApp aos clientes com `users.phone` preenchido e org com `whatsapp_config`.
3. E-mail e demais defaults inalterados.
4. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.22-...yml`, quality_score 90)
- **typecheck/lint:** limpos.
- **Nota:** envio em massa/LGPD aceito pelo usuário; recomendado um disparo de teste real antes de evento em massa.

## File List
- `packages/web/src/lib/notificacoes.ts`
