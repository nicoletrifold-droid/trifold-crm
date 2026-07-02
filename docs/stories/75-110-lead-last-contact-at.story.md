# Story 75-110 — Fix: "dias sem contato" ignorava o contato real (usava updated_at)

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (migration 152 + backfill) · **Epic:** Pipeline/SLA · **Branch:** fix/75-110-lead-last-contact-at · **Complexidade:** M (3 pontos)
- **Prioridade:** 🟠 ALTA — dado de gestão errado (card do Pipeline + Alertas mostravam "N dias sem contato" errado; afetava TODOS os leads). Sem perda de dado; correção via backfill (sem pente-fino manual).

## Story
**As a** gestor/corretor, **I want** que "dias sem contato" reflita o **último contato real** (mensagem OU registro no Histórico), **so that** o Pipeline e os Alertas mostrem a verdade e o follow-up dispare na hora certa.

## Contexto (bug confirmado — lead Cleber, 02/07)
Card mostrava "3d sem contato" mas havia nota de contato hoje. Causa: o "dias sem contato" (card + Alertas) usava **`leads.updated_at`**, que NÃO muda ao registrar contato (nota → `activities`) nem em mensagens (→ `conversations.last_message_at`). Três sinais dispersos; a UI usava o pior. Confirmado: Cleber `updated_at`=28/06, última nota=02/07.

## Decisão do dono
"Último contato" zera com: **mensagem real (qualquer role, incl. Nicole) OU registro manual no Histórico**. O **follow-up passa a usar a mesma régua** (registro manual adia o follow-up); a janela de 24h do WhatsApp segue na mensagem real.

## Escopo
**IN:**
1. Migration 152 — coluna `leads.last_contact_at` (DEFAULT now()) + índice + 2 triggers `SECURITY DEFINER` (RLS-safe, só avançam): INSERT em `messages` (via conversations.lead_id) e INSERT em `activities` (WHEN type IN 'broker_note','note_added') + **backfill** de todos os leads = GREATEST(created_at, última mensagem, última nota).
2. `components/pipeline/lead-card.tsx` — "dias sem contato"/timeAgo passam a usar `last_contact_at` (fallback updated_at).
3. `dashboard/pipeline` + `broker/pipeline` — selecionam `last_contact_at`.
4. `dashboard/alertas` + `broker/alertas` — filtro/ordem/cálculo por `last_contact_at`.
5. `cron/followup` — limiares (nicole_takeover/alert) por `daysSinceLastContact` (= last_contact_at); janela 24h/brokerSentRecently seguem na mensagem real.

**OUT:** staleness de CONVERSAS (dashboard/conversas, broker/chat) que já usa `last_message_at` (correto, feature diferente).

## Acceptance Criteria
1. Registrar contato no Histórico → card/alertas passam a contar a partir de agora (não mais updated_at).
2. Mensagem (recebida/enviada/Nicole) também zera o contador.
3. Leads existentes corrigidos via backfill (Cleber: last_contact_at=02/07). Sem pente-fino manual.
4. Follow-up respeita registro manual (adia); janela 24h WhatsApp intacta.
5. Triggers RLS-safe (SECURITY DEFINER); typecheck/lint/testes limpos.

## File List
- `supabase/migrations/152_leads_last_contact_at.sql`
- `packages/web/src/components/pipeline/lead-card.tsx`
- `packages/web/src/app/dashboard/pipeline/page.tsx` · `broker/pipeline/page.tsx`
- `packages/web/src/app/dashboard/alertas/page.tsx` · `broker/alertas/page.tsx`
- `packages/web/src/app/api/cron/followup/route.ts`

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Fonte única `last_contact_at` (triggers + backfill); card/alertas/follow-up passam a usá-la. Cleber verificado. 14/14 testes follow-up, tsc 0, lint 0. Handoff @devops (migration 152 aplicada + backfill).
