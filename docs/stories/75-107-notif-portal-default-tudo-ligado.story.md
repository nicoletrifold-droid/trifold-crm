# Story 75-107 — Portal do cliente: default de notificações = TUDO habilitado + defaults consistentes

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (push + migration 143) · **Epic:** Portal do Cliente · **Branch:** feat/75-107-notif-default-tudo-ligado · **Complexidade:** S (1-2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, testes existentes de notificacoes, verificação do default no banco]
- **Prioridade:** 🟠 — produção: default inconsistente faz cliente ver WhatsApp OFF na tela mas receber WhatsApp mesmo assim; push nasce off em todo lugar (não é "tudo habilitado").

## Story
**As a** cliente do portal, **I want** que por padrão eu receba as notificações em todos os canais e possa **desmarcar** o que não quiser, **so that** eu fico informado por padrão mas mantenho controle — e a tela reflete exatamente o que o sistema envia.

## Contexto (diagnóstico 2026-07-02)
O opt-out **já é respeitado no envio**: `notifyClientes`/`notifyNovoBoleto` (`lib/notificacoes.ts`) checam canal a canal (`email_enabled`/`whatsapp_enabled`/`push_enabled`) **e** evento a evento (`if (!pref[prefKey]) continue`) antes de enviar, com kill-switch (`PORTAL_NOTIF_PAUSED`), filtro de distrato e coalescing. Um cliente que desmarca realmente para de receber. ✅

O problema é o **default** para quem nunca salvou preferência (hoje: todos os 73 clientes — `obra_notificacao_prefs` está zerada). Havia **3 defaults divergentes**:

| Fonte | email | whatsapp | push |
|---|---|---|---|
| Coluna no banco (mig 020 + push posterior) | true | **false** | false |
| API/UI (`route.ts` GET/PATCH) | true | **false** | false |
| Dispatcher (`notificacoes.ts`) | true | **true** | false |

Efeito: cliente sem linha salva **vê WhatsApp OFF na tela**, mas o dispatcher **envia WhatsApp** (default true). E push nasce off em todo lugar → não é "tudo habilitado".

## Decisão de produto (dono, 2026-07-02)
Default = **TUDO habilitado** (email + WhatsApp + push). Cliente desmarca o que não quiser. Os 73 clientes atuais **herdam** o novo default automaticamente (sem backfill — o código usa DEFAULT quando não há linha).

## Escopo
**IN:**
1. `lib/notificacoes.ts` — `DEFAULT_PREFS.push_enabled: false → true` (whatsapp já era true). Comentário atualizado.
2. `app/api/cliente/obras/[obra_id]/notificacoes/route.ts` — `DEFAULT_PREFS`: `whatsapp_enabled` e `push_enabled` → `true` (tela passa a mostrar tudo ligado p/ quem não salvou).
3. Migration **143** — `ALTER COLUMN whatsapp_enabled SET DEFAULT true`, `push_enabled SET DEFAULT true` (alinha o banco; belt — o upsert já envia todos os campos).

**OUT:**
- Não mexe na enforcement (já respeita opt-out) nem no coalescing/kill-switch/distrato.
- Sem backfill dos 73 clientes (herdam o default).
- Não altera pré-requisitos por canal (email precisa de `users.email`, WhatsApp de `users.phone` + `whatsapp_config`, push de assinatura — sem assinatura o push é no-op).

## Acceptance Criteria
1. **Given** cliente SEM linha em `obra_notificacao_prefs`, **when** abre a tela de Notificações, **then** email, WhatsApp e push aparecem **ligados** (GET retorna DEFAULT com os 3 true).
2. **Given** o mesmo cliente, **when** ocorre um evento de obra, **then** o dispatcher considera os 3 canais ligados (respeitando os pré-requisitos de cada canal) — sem mais a divergência "tela off / envia".
3. **Given** cliente que **desmarca** um canal e salva, **then** aquele canal para de ser enviado (comportamento já existente, não regride).
4. **Given** o default de coluna do banco, **then** `whatsapp_enabled` e `push_enabled` têm `DEFAULT true`.
5. typecheck/lint limpos; testes existentes de `notificacoes` (coalescing/pausa) seguem passando.

## Dev Notes
- Enforcement no dispatcher: `lib/notificacoes.ts` linhas ~219-249 (`pref = prefsMap.get(user.id) ?? DEFAULT_PREFS`; gates por canal/evento). Não alterar.
- Impacto medido em prod: 7 clientes têm assinatura de push (passam a receber push de obra); 68 têm telefone (WhatsApp já saía por padrão — sem mudança de envio); push sem assinatura é no-op.
- `notificacoes.test.ts` cobre só curto-circuito (coalescing/pausa) — `admin.from` lança se chamado; teste de envio completo seria harness desproporcional. Gate = checks estáticos + verificação do default no banco.

## File List
- `packages/web/src/lib/notificacoes.ts` — DEFAULT_PREFS.push_enabled → true + comentário.
- `packages/web/src/app/api/cliente/obras/[obra_id]/notificacoes/route.ts` — DEFAULT_PREFS whatsapp/push → true.
- `supabase/migrations/143_obra_notif_prefs_default_tudo_ligado.sql` — ALTER COLUMN defaults.

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Story criada, validada (default "tudo ligado" confirmado pelo dono), implementada e verificada (checks estáticos + default no banco). Handoff @devops.
