# Story 75-35 — Botão de notificações para todos os usuários (gestores no Config)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, build]

## Story
**As a** usuário do CRM (admin/supervisor/gerente/obras, além do corretor),
**I want** ligar/desligar notificações push do meu próprio menu,
**so that** todos os perfis recebam avisos (roleta, portal, agenda) e possam gerenciar.

## Contexto
Extensão da 75-34. O `NotificationToggle` é genérico (API de push usa o usuário logado).
Service worker é registrado no layout RAIZ (`PwaInit`, scope '/') → vale p/ /dashboard
também. O dashboard não tinha lugar de notificações; a Config é o lar natural.

## Escopo
**IN:**
- Mover `NotificationToggle` para `components/notification-toggle.tsx` (compartilhado, theme-aware light/dark).
- `/broker/instalar`: passa a importar o compartilhado (remove o local).
- `/dashboard/configuracoes`: seção "Notificações" (toggle) no topo — vale p/ admin/supervisor/gerente/obras.
**OUT:** auto-prompt no dashboard (segue só o botão manual); portal do cliente (já tem card próprio).

## Acceptance Criteria
1. Toggle compartilhado funciona em /broker e /dashboard (SW global garante).
2. Aparece no topo de /dashboard/configuracoes p/ todos os perfis de gestão.
3. Theme-aware (light/dark) — correto no dashboard light e no broker dark.
4. typecheck, lint e build limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.35-...yml`, quality_score 90)
- **typecheck/lint/build:** limpos. SW no layout raiz cobre /dashboard.
- **Ressalva:** permissão/registro dependem do navegador → conferência manual.

## File List
- `packages/web/src/components/notification-toggle.tsx` (movido/compartilhado, theme-aware)
- `packages/web/src/app/broker/instalar/page.tsx` (import compartilhado)
- `packages/web/src/app/dashboard/configuracoes/page.tsx` (seção Notificações)
