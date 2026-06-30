# Story 75-34 — Botão Ativar/Desativar notificações no menu do corretor

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, build]

## Story
**As a** corretor, **I want** ligar/desligar as notificações push quando quiser,
**so that** eu não dependa do card automático (que some por 7 dias se eu recusar).

## Contexto
Decisão do usuário (2026-06-23): aproveitar a página "Instalar app" (sem poluir o PWA).
Renomear o item de menu e colocar, no topo, um toggle de notificações. API de push já
tem POST (subscribe) e DELETE (unsubscribe).

## Escopo
**IN:**
- Menu `/broker/instalar`: "Instalar app" → **"App e Notificações"**; título da página idem.
- `NotificationToggle` (client) no topo da página: detecta estado (ativadas/desativadas/
  bloqueadas/sem suporte), Ativar (requestPermission + subscribe POST) e Desativar
  (unsubscribe + DELETE). Mensagens p/ bloqueio (config do navegador) e iOS (instalar).
**OUT:** mudar o card automático (BrokerPushPrompt segue como está).

## Acceptance Criteria
1. Item de menu e título viram "App e Notificações".
2. Toggle no topo: Ativar inscreve (POST /api/push/subscribe) e Desativar remove (DELETE + unsubscribe).
3. Estado refletido: Ativadas / Ativar / Bloqueadas (instrução navegador) / Sem suporte (iOS instalar).
4. typecheck, lint e build limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.34-...yml`, quality_score 90)
- **typecheck/lint/build:** limpos.
- **Ressalva:** comportamento de permissão é do navegador → conferência manual.

## File List
- `packages/web/src/app/broker/instalar/_components/notification-toggle.tsx` (novo)
- `packages/web/src/app/broker/instalar/page.tsx`
- `packages/web/src/app/broker/layout.tsx`
