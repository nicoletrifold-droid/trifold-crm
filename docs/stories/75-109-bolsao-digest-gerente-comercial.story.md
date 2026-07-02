# Story 75-109 — Resumo do bolsão (15 min) vai para a Gerente Comercial via WhatsApp

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (só código, sem migration) · **Epic:** 64 (Bolsão/SLA) · **Branch:** feat/75-109-bolsao-digest-gerente-comercial · **Complexidade:** S (1 ponto)
- **quality_gate_tools:** [teste do cron bolsao-rebalance, typecheck, lint]

## Story
**As a** gerente comercial, **I want** receber no WhatsApp quando houver lead parado no bolsão há ≥15 min, **so that** eu aja rápido no atendimento não realizado.

## Contexto / decisão do dono
Fluxo: corretor tem 15 min p/ atender → não atendeu → cai no bolsão → **15 min parado no bolsão → WhatsApp à gerente comercial** (≈30 min desde a entrada do lead). Antes, o resumo do bolsão (Story 75-82, BOLSAO_DIGEST_MIN=15, já existente) ia para o "gestor" configurado na roleta (`notify_user_on_*`) — que estava **null** (ninguém recebia). Usar esses campos traria efeitos colaterais (spam por distribuição / avisos de fora-de-horário), então roteamos o resumo por **role**.

A escalação de **60 min ao Alexandre** (SLA_ESCALATION_PHONES) é medida **desde a distribuição/entrada** do lead (equivale a 45 min parado no bolsão) — não muda.

## Escopo
**IN:** `cron/bolsao-rebalance` — `sendBolsaoDigest` passa a enviar para **usuários ativos com role `gerente-comercial`** (WhatsApp template `aviso_bolsao_gestor` + push), em loop, em vez do gestor configurado na roleta. Mantém o gatilho (≥15 min parado, template aprovado) e o anti-flood (1 a cada 30 min por org).

**OUT:** não mexe no gatilho de 15 min, no anti-flood, na escalação de 60 min (Alexandre) nem nos campos `notify_user_*`.

## Acceptance Criteria
1. Havendo lead(s) parado(s) ≥15 min no bolsão, a(s) gerente(s) comercial(is) ativa(s) com telefone recebem o WhatsApp `aviso_bolsao_gestor` (+ push).
2. Sem gerente-comercial ativo → não envia (retorna false), sem erro.
3. Anti-flood 30 min mantido; gate `bolsao_enabled` mantido.
4. teste do cron / typecheck / lint limpos.

## File List
- `packages/web/src/app/api/cron/bolsao-rebalance/route.ts` — `sendBolsaoDigest` roteia por role gerente-comercial (loop).
- `packages/web/src/app/api/cron/bolsao-rebalance/route.test.ts` — mock/assert do destinatário por role.

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Resumo do bolsão (≥15 min) passa a notificar a gerente comercial via WhatsApp. 6/6 testes, tsc 0, lint 0. Handoff @devops (sem migration).
