# Story 75-111 — Origem no cadastro do corretor + nova origem "Patrocinado Corretor"

## Metadata
- **Status:** InReview — @dev + @qa (PASS c/ observação) · pronto p/ @devops (migration 153) · **Epic:** Leads/Cadastro · **Branch:** feat/75-111-origem-lead-corretor · **Complexidade:** S (2 pontos)
- **Prioridade:** 🟠 ALTA (pedido do dono) — corretor cadastra lead sem registrar a origem → dado de origem fica cego para leads de carteira própria/indicação do corretor.

## Story
**As a** corretor, **I want** escolher a **Origem** do lead (e a Campanha/Observação) ao cadastrar manualmente, igual à tela do admin, **so that** todo lead entre com origem correta e a gestão não perca a rastreabilidade de onde o lead veio.

## Contexto (pedido do dono — 02/07)
A tela de cadastro do **admin** (`/dashboard/leads/new`) tem os campos **Origem** e **Campanha/Observação**; o **modal do corretor** (`broker/_components/new-lead-modal.tsx`) **não tem Origem** — só Telefone, Nome, E-mail, Empreendimento e Etapa inicial. O dono quer as duas telas iguais (salvo "Corretor responsável", que não faz sentido no corretor) e **uma nova opção de origem: "Patrocinado Corretor"** (lead vindo de anúncio/patrocínio pago pelo próprio corretor).

Decisão do dono (02/07): **manter** o campo "Etapa inicial" no modal do corretor (a página do admin não tem, mas é útil pro corretor escolher onde o lead cai).

## Achados técnicos (investigação @sm)
- O backend `/api/leads` (POST) **já aceita `source`** (usa `body.source || "other"`) — o modal só não envia.
- `utm_campaign` **NÃO é persistido** hoje no `/api/leads` → precisa ser adicionado ao insert.
- `source` é enum Postgres **`lead_source`** (valores: whatsapp_organic, whatsapp_click_to_ad, meta_ads, website, referral, walk_in, telegram, other, google_forms). "Patrocinado Corretor" **exige `ALTER TYPE`**.
- Bug latente: a tela do admin já oferece **"Google Ads" (`google_ads`)** mas esse valor **não existe no enum** → cadastro com essa origem quebra hoje. Corrigir junto (adicionar ao enum).
- `SOURCE_OPTIONS` está **inline** na página do admin → mover para `lib/constants` (fonte única) e reusar nas duas telas.
- Valores de source desconhecidos já caem em fallback "Outro" no `SourceBadge`/labels → analytics/relatórios não quebram.

## Escopo
**IN:**
1. Migration 153 — `ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'broker_sponsored'` + `... 'google_ads'` (fecha bug latente).
2. `lib/constants.ts` — `SOURCE_OPTIONS` compartilhado (fonte única) + `broker_sponsored: "Patrocinado Corretor"` em `SOURCE_LABELS` e `SOURCE_LABELS_SHORT`.
3. `dashboard/leads/new/page.tsx` — importar `SOURCE_OPTIONS` do constants (remover lista inline) + ajustar o union type do `source`.
4. `broker/_components/new-lead-modal.tsx` — adicionar **Origem** (select) + **Campanha/Observação** (input) ao form; **manter Etapa inicial**; enviar `source` e `utm_campaign` no POST.
5. `api/leads/route.ts` (POST) — persistir `utm_campaign` no insert.
6. `components/ui/source-badge.tsx` — estilo/cor para `broker_sponsored`.

**OUT:**
- Não mexer na regra de atribuição (corretor continua dono do próprio lead cadastrado).
- Não migrar o corretor para a página `/dashboard/leads/new` (segue no modal).
- Sem relatório/dashboard novo — só o novo rótulo aparece via fallback existente.

## Acceptance Criteria
1. **Given** corretor abrindo "Novo Lead", **when** vê o modal, **then** existe o campo **Origem** (mesmas opções do admin, incluindo "Patrocinado Corretor") e **Campanha/Observação**, e o campo **Etapa inicial** continua presente.
2. **Given** corretor cadastra lead com Origem = "Patrocinado Corretor" e Campanha preenchida, **when** salva, **then** o lead grava `source='broker_sponsored'` e `utm_campaign` = valor digitado.
3. **Given** admin seleciona "Patrocinado Corretor" ou "Google Ads", **when** salva, **then** grava sem erro de enum.
4. **Given** um lead `broker_sponsored`, **when** aparece em listas com SourceBadge, **then** mostra rótulo "Patrocinado Corretor" com estilo próprio (não fallback "Outro").
5. As duas telas oferecem a mesma lista de origens (fonte única em constants); typecheck/lint/testes limpos.

## Riscos
- `ALTER TYPE ... ADD VALUE` não pode ser usado na MESMA transação em que é criado → migration isolada (só o ALTER), como já feito na 013. Baixo risco.
- Ordem de deploy: migration 153 antes do frontend que oferece o novo valor (senão insert falha). @devops aplica migration antes/junto.

## File List
- `supabase/migrations/153_lead_source_broker_sponsored.sql`
- `packages/web/src/lib/constants.ts`
- `packages/web/src/app/dashboard/leads/new/page.tsx`
- `packages/web/src/app/broker/_components/new-lead-modal.tsx`
- `packages/web/src/app/api/leads/route.ts`
- `packages/web/src/components/ui/source-badge.tsx`

## Change Log
- 2026-07-02 — @sm — Draft criado a partir do pedido do dono (Origem no modal do corretor + origem "Patrocinado Corretor"); investigação técnica anexada (enum lead_source, /api/leads já aceita source, utm_campaign não persistido, bug latente google_ads).
- 2026-07-02 — @po — Validação GO (10/10 checklist). Status Draft → Ready. Escopo/AC/riscos consistentes com o pedido do dono; ordem de deploy (migration antes do frontend) registrada.
- 2026-07-02 — @dev — Implementado: migration 153 (enum broker_sponsored + google_ads), SOURCE_OPTIONS compartilhado em constants + labels, admin page reusa constants, modal do corretor ganha Origem + Campanha/Observação (mantida Etapa inicial) e envia source/utm_campaign, /api/leads persiste utm_campaign, SourceBadge estilo broker_sponsored/google_ads. Bônus: `<a>`→`<Link>` no botão Cancelar (lint pré-existente). type-check 0, lint 0.
- 2026-07-02 — @qa — QA Gate PASS (7/7). Observação (CONCERNS, não bloqueia): default de Origem no modal do corretor virou "Indicação" (1ª opção, = admin); antes lead do corretor caía em `other`. Mantido igual ao admin por decisão de escopo. Sem regressão de testes (sem suíte nos arquivos). Handoff @devops: aplicar migration 153 ANTES/junto do deploy do frontend.
- 2026-07-02 — @dev — Ajuste pós-QA (a pedido do dono): default de Origem no modal do corretor = "Carteira Própria / Ação Externa" (`other`), não mais "Indicação". type-check 0, lint 0.
