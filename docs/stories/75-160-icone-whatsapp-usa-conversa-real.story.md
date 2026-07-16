# Story 75-160 — Ícone de WhatsApp na lista usa a conversa/canal real (não só formato do número)

## Metadata
- **Status:** InReview · **Epic:** Atendimento WhatsApp do corretor · **PR:** — · **Complexidade:** S (2 pontos) · **Branch:** feat/75-160-icone-whatsapp-conversa-real
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Caso real (Marcos, 2026-07-16): um lead que **conversou via WhatsApp** não mostra o balão verde na lista — parece que o número não é WhatsApp. Causa: o ícone é decidido só por `phone` + `source` via heurística de formato (`isLikelyMobileBR`), e o número desse lead está gravado **cru** (`554391527555`, 12 dígitos sem o 9º) → a heurística rejeita → sem ícone. Mas nós **temos prova**: `conversations.channel='whatsapp'` (confirmado no banco). O helper `whatsAppState` **já foi feito** pra usar isso (`hasWhatsappConversation` tem prioridade — `lib/leads/whatsapp.ts:58-61`), só que a lista **não passa esse sinal**. Dado do banco: 1060 leads `channel='whatsapp'`; e há leads com conversa WhatsApp cujo `leads.channel` é website/meta_ads (36) → o sinal 100% robusto é a **conversa**.

## Escopo
**IN:**
1. **`dashboard/leads/page.tsx`:** incluir `channel` no select de `leads` (L82); após buscar a página de leads, uma query batelada em `conversations` (`channel='whatsapp'`, `lead_id in [ids da página]`) → `Set` de lead_ids com conversa WhatsApp; no map pra `LeadsBulkTable` (L307-317), passar `hasWhatsappConversation: waSet.has(lead.id) || lead.channel === 'whatsapp'`.
2. **`components/leads/leads-bulk-table.tsx`:** adicionar `hasWhatsappConversation?: boolean` ao tipo `Lead`; passar em `whatsAppState({ phone, source, hasWhatsappConversation })` (L150).

**OUT:** corrigir o telefone gravado cru (número malformado é do lead de teste; helper `toWhatsAppNumber` já normaliza no envio); outras telas (kanban/broker) — se pedirem, replicar o padrão.

## Acceptance Criteria
1. **Given** um lead com `conversations.channel='whatsapp'` (conversou no WhatsApp) mas número atípico, **then** o balão verde **aparece** na lista (via `hasWhatsappConversation` → estado `confirmed`).
2. **Given** um lead com `leads.channel='whatsapp'`, **then** também mostra o ícone.
3. **Given** um lead Telegram (`tg:`) ou sem WhatsApp e sem conversa, **then** **não** mostra (comportamento atual preservado; `whatsAppState` já exclui `tg:`).
4. **Given** número de celular BR válido sem conversa (ex.: meta_ads recém-criado), **then** continua mostrando via `isLikelyMobileBR` ("likely").
5. 1 query batelada a mais por página (não N+1); tsc/lint/vitest limpos.

## Dev Notes
- `whatsAppState` (`lib/leads/whatsapp.ts:53-64`) já prioriza `isWhatsAppConfirmed` (que aceita `hasWhatsappConversation`); só falta a lista alimentar. Zero mudança no helper.
- `page.tsx`: `leads` em L199; select em L80-87; map em L300-318. Query de conversas: `supabase.from("conversations").select("lead_id").eq("channel","whatsapp").in("lead_id", ids)`.
- Tabela: tipo `Lead` em L26-33; render do ícone em L150. Ver [[project-corretor-whatsapp-atendimento]] (ícone verde 75-143/144).

## 🤖 CodeRabbit Integration
- **Story Type:** Frontend + query · **Complexity:** Low.
- **Primary:** @dev · **Quality Gate:** @qa.
- **Focus:** sem N+1 (query batelada), sinal correto (conversa > formato), sem regressão nos ícones atuais.

## Dev Agent Record (@dev — 2026-07-16)
- **`dashboard/leads/page.tsx`:** `channel` no select; query batelada `conversations` (channel='whatsapp', lead_id in página) → `Set` (sem N+1); no map, `hasWhatsappConversation = waSet.has(id) || lead.channel==='whatsapp'`.
- **`leads-bulk-table.tsx`:** `hasWhatsappConversation?` no tipo `Lead`; passado ao `whatsAppState`. Helper `whatsapp.ts` inalterado (já priorizava `confirmed`).
- **Checks:** tsc web 0 · eslint 0 erros (2 warnings pré-existentes na L73) · vitest **1007/1007**. Sem regressão.
- **Branch:** `feat/75-160-icone-whatsapp-conversa-real`.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (conversa whatsapp → ícone mesmo com número atípico) ✓ · AC2 (channel='whatsapp' → ícone) ✓ · AC3 (tg:/sem sinal → sem ícone) ✓ · AC4 (celular válido sem conversa → "likely") ✓ · AC5 (1 query batelada, sem N+1; tsc/eslint/1007) ✓.
- Helper `whatsAppState`/`isWhatsAppConfirmed` já tem testes do caminho `confirmed`; mudança é só plumbing (query + prop).

## Change Log
- 2026-07-16 — @qa — **QA GATE: PASS**. 5 ACs, 1007/1007.
- 2026-07-16 — @dev — Implementado (channel + conversa batelada → hasWhatsappConversation). tsc/eslint/1007. Status Ready → InReview.
- 2026-07-16 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-16 — @sm — Story criada (Draft).
