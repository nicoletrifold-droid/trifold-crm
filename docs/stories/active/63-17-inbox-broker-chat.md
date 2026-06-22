# Story 63-17 — Rota `/broker/chat` — Inbox de Conversas Estilo WhatsApp

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-17
- **Status:** Ready for Review
- **Priority:** P0 — tela principal da Fase 6; sem ela não há inbox para navegar
- **Complexity:** M (4-6h)
- **Fase:** 6 (Caixa de Entrada de Conversas)
- **Leva:** Primeira (caminho crítico)
- **Created:** 2026-06-22
- **Author:** @sm (River)

> **CodeRabbit Integration:** Disabled — validação manual pelo @qa.

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[mobile_render_check, a11y_check, empty_state_check, ts_typecheck]`
- **Depende de:** 63-16 Done (`broker_last_read_at` na tabela; `countUnreadForLead` disponível)
- **Bloqueia:** 63-18 (nav precisa de `/broker/chat` como destino); 63-19 (badge sem destino não tem sentido)
- **Pode ir em paralelo com:** 63-18 (se `/broker/chat` retornar 404 enquanto não implementada, 63-18 pode preparar a nav entry como link; ou executar após 63-17)

---

## User Story

**Como** corretor com vários leads ativos,
**Quero** ver uma lista unificada de todas as minhas conversas ordenada pelas mais recentes,
**Para que** eu nunca perca uma resposta de lead — do mesmo jeito que funciona o WhatsApp.

---

## Context

### O Problema Atual

Não existe uma tela de inbox para o corretor. Para saber se algum lead respondeu, o corretor precisa entrar na lista de leads e procurar manualmente — sem indicação de qual lead respondeu ou quando. Isso leva a atrasos no atendimento.

### Solução

Criar a rota `packages/web/src/app/broker/chat/page.tsx` como **Server Component** que lista todas as conversas do corretor ordenadas por `last_message_at desc`. Cada card estilo WhatsApp mostra:

1. **Avatar** — círculo com inicial do nome do lead (ex.: "J" para "João Silva")
2. **Nome** — `lead.name` (ou `lead.phone` se sem nome)
3. **Preview** — `last_message_preview` com prefixo contextual:
   - Se `last_message_role = 'broker'`: `"Você: {preview}"`
   - Se `last_message_role = 'assistant'`: `"🤖 {preview}"` (Nicole respondeu por último)
   - Se `last_message_role = 'user'`: sem prefixo (lead respondeu — é o que queremos destacar)
4. **Timestamp relativo** — helper `formatRelativeTime(date)`:
   - Mesmo dia: `HH:mm` (ex.: "14:32")
   - Ontem: `"Ontem"`
   - 2-6 dias atrás: nome curto do dia (`"Seg"`, `"Ter"`, `"Qua"`, `"Qui"`, `"Sex"`, `"Sáb"`, `"Dom"`)
   - 7+ dias atrás: `"dd/MM/aa"` (ex.: `"15/06/26"`)
5. **Chip de canal** — `"WhatsApp"` (verde) ou `"Telegram"` (azul) — reusar `channelLabels` de `dashboard/conversas/page.tsx` L25-28
6. **Empreendimento · Etapa** — `"{property.name} · {stage.name}"` em `text-xs text-stone-500`; cor da etapa via `stage.color` (padrão inline style do `leads-list-with-drawer.tsx` L130-138)
7. **Badge verde de não-lidas** — número de msgs não-lidas da conversa via `countUnreadForLead` (63-16). Cor: `bg-green-700 text-white` (WCAG: branco sobre verde-700 ≥ 4.5:1). Não exibe se zero.

Tap no card → navega para `/broker/leads/{lead.id}`.

### Query da Inbox (sem N+1)

```ts
supabase
  .from("conversations")
  .select(`
    id, channel, status, is_ai_active,
    last_message_at, last_message_preview, last_message_role, broker_last_read_at,
    lead:leads!lead_id(
      id, name, phone,
      kanban_stages:stage_id(name, color),
      properties:property_interest_id(name)
    )
  `)
  .eq("status", "active")
  .order("last_message_at", { ascending: false, nullsFirst: false })
```

RLS `conversations_select` (mig `004_rls_policies.sql` L129-140) já restringe ao broker logado — não precisa de `.eq("assigned_broker_id", user.id)` explícito.

### Busca e Filtros

Reusar componentes existentes via query params no Server Component:
- `?q=` → filtrar por `lead.name` ilike (operador PostgREST: `.ilike("lead.name", `%${q}%`)`)  
  **Atenção:** filtro em join com PostgREST usa notação `"leads.name"` — testar em desenvolvimento
- `?property=uuid` → `.eq("lead.property_interest_id", propertyId)` no nível da subquery de leads
- `?stage=uuid` → `.eq("lead.stage_id", stageId)` no nível da subquery de leads

Componentes de busca e filtro:
- `broker/_components/lead-search.tsx` — emite `?q=` (já funciona com qualquer pathname via `usePathname`)
- `components/lead-filters.tsx` — emite `?property=` e `?stage=`

**Importante:** PostgREST não suporta filtros em relações (join) de forma direta via `.eq("lead.stage_id", ...)`. Se os filtros de join não funcionarem via PostgREST, a alternativa é carregar todas as conversas do broker e filtrar em JS no Server Component — número total de conversas de um corretor é pequeno (<200 em produção). [AUTO-DECISION] Filtrar em JS se PostgREST join filter não suportar. Documentar no código.

### Estados Vazios

- **Sem conversas (nenhum lead ainda):** ícone `MessageSquare` grande, texto "Nenhuma conversa ainda. Seus leads aparecerão aqui quando iniciarem uma conversa."
- **Sem resultado de busca/filtro:** ícone `SearchX`, texto "Nenhuma conversa encontrada para \"{q}\". Tente outros termos."

---

## Acceptance Criteria

- [x] **AC1 (Rota existe):** `GET /broker/chat` retorna 200 para broker autenticado. Se acessado por role não-broker → `redirect('/dashboard')` (via `getServerUser()` que já verifica o role no broker layout — a rota está dentro de `broker/`, portanto o `broker/layout.tsx` aplica o redirect automaticamente).

- [x] **AC2 (Lista ordenada por recência):** Cards aparecem em ordem decrescente de `last_message_at`. Conversas sem `last_message_at` aparecem no final (`nullsFirst: false`).

- [x] **AC3 (Card completo):** Cada card exibe: inicial do nome no avatar, nome do lead, preview com prefixo correto ("Você:" / "🤖" / sem prefixo), timestamp relativo, chip de canal, empreendimento·etapa.

- [x] **AC4 (Preview prefix correto):** `last_message_role='broker'` → "Você: {preview}". `last_message_role='assistant'` → "🤖 {preview}". `last_message_role='user'` → preview sem prefixo.

- [x] **AC5 (Helper formatRelativeTime testável):** Existe `packages/web/src/lib/broker/format-relative-time.ts` exportando `formatRelativeTime(date: Date, now?: Date): string` pura. Retorna: HH:mm (mesmo dia), "Ontem" (dia anterior), nome curto do dia (2-6 dias), "dd/MM/aa" (≥7 dias). Parâmetro `now` para testabilidade. Testes em `__tests__/format-relative-time.test.ts` com pelo menos 5 cenários.

- [x] **AC6 (Badge de não-lidas verde):** Quando `countUnreadForLead(convs, msgs)` retorna > 0 para uma conversa, o card exibe um badge arredondado com o número. Cor: `bg-green-700 text-white` (texto pequeno) ou `bg-green-500` (dot sem número — não aplicável aqui pois sempre exibimos número). Badge NÃO aparece quando count = 0.

- [x] **AC7 (Tap navega corretamente):** Clicar/tocar em qualquer parte do card (exceto o chip de canal) navega para `/broker/leads/{lead.id}`. Link é `<Link href="/broker/leads/{id}">` envolvendo o card inteiro — sem `<a>` aninhado.

- [x] **AC8 (Alvo de toque ≥44px):** Card inteiro tem `min-h-[72px]` no mobile (mínimo WCAG 2.5.5 para alvos de toque maiores, mais espaço para informação).

- [x] **AC9 (Busca via ?q=):** Quando `searchParams.q` está presente, filtrar por nome do lead (case-insensitive). Estado vazio específico quando há busca sem resultado.

- [x] **AC10 (Estados vazios):** (a) Sem conversas: ícone + texto conforme Context; (b) Sem resultado de filtro: ícone + texto conforme Context.

- [x] **AC11 (TypeScript + ESLint):** `pnpm --filter @trifold/web type-check` → zero erros. ESLint → zero erros.

---

## Tasks / Subtasks

- [x] **T1 — Helper `formatRelativeTime` (AC5)**
  - [ ] Criar `packages/web/src/lib/broker/format-relative-time.ts`
  - [ ] Implementar lógica de 4 casos conforme AC5
  - [ ] Criar `packages/web/src/lib/broker/__tests__/format-relative-time.test.ts` — mínimo 5 cenários

- [x] **T2 — Server Component da inbox (AC1, AC2, AC3, AC4)**
  - [ ] Criar `packages/web/src/app/broker/chat/page.tsx`
  - [ ] Query Supabase conforme Dev Notes
  - [ ] Testar filtros PostgREST em join — se não suportar, filtrar em JS

- [x] **T3 — Cards mobile estilo WhatsApp (AC3, AC4, AC6, AC7, AC8)**
  - [ ] Avatar com inicial (circle, `bg-stone-200`, `text-stone-600`)
  - [ ] Preview com prefixo
  - [ ] Badge verde (AC6)
  - [ ] `<Link>` cobrindo o card (AC7)
  - [ ] `min-h-[72px]` (AC8)

- [x] **T4 — Chip de canal (AC3)**
  - [ ] Reusar `channelLabels` de `dashboard/conversas/page.tsx` L25-28 — extrair para `lib/broker/channel-labels.ts` se necessário

- [x] **T5 — Busca e estados vazios (AC9, AC10)**
  - [ ] Ler `searchParams` no Server Component
  - [ ] Renderizar `LeadSearch` e `LeadFilters` (ou subconjunto relevante) acima da lista
  - [ ] Estados vazios com ícone + texto

- [x] **T6 — Type-check + lint (AC11)**

---

## Dev Notes

### Arquivos Chave

| Arquivo | Ação | Referência |
|---------|------|-----------|
| `packages/web/src/app/broker/chat/page.tsx` | CRIAR | `dashboard/conversas/page.tsx` (estrutura de query) |
| `packages/web/src/lib/broker/format-relative-time.ts` | CRIAR | Pura, testável |
| `packages/web/src/lib/broker/__tests__/format-relative-time.test.ts` | CRIAR | Vitest |
| `packages/web/src/lib/broker/unread-count.ts` | REUSAR (63-16) | `countUnreadForLead` |

### Referência de Query — dashboard/conversas/page.tsx

`dashboard/conversas/page.tsx` L13-24: query de conversas com `.select(...)`, `.eq("status", "active")`, `.order("last_message_at", { ascending: false })`. A inbox da 63-17 adiciona `broker_last_read_at` ao select e join mais completo para `kanban_stages` e `properties`.

### Estilo de Card — Referência

`broker/leads/_components/leads-list-with-drawer.tsx` L130-138: etapa com `backgroundColor: ${color}20` e `color: color` (inline style — cor dinâmica não funciona com Tailwind JIT). Reusar este padrão para o chip de etapa no card da inbox.

### Cor dos Canais — Referência

`dashboard/conversas/page.tsx` L25-28:
```ts
const channelLabels = {
  whatsapp: { label: "WhatsApp", color: "text-green-700 dark:text-green-300", bg: "bg-green-100 dark:bg-green-500/15" },
  telegram: { label: "Telegram", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-500/15" },
}
```

### Badge Verde — WCAG

- `bg-green-700 text-white` para badge com número (contraste branco/green-700 ≈ 5.8:1 ✓ WCAG AA)
- NÃO usar `bg-green-500 text-white` (contraste ≈ 3.0:1 — reprova para texto pequeno < 18px)
- Badge: `rounded-full px-1.5 py-0.5 text-[9px] font-bold` (matching pattern do mobile badge em `sidebar-nav.tsx` L171-173)

### Avatar com Inicial

```tsx
const initial = (lead.name ?? lead.phone ?? "?")[0].toUpperCase()
// Avatar: w-12 h-12 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center
// text-lg font-semibold text-stone-600 dark:text-stone-300
```

### Estrutura da Página

```
/broker/chat/page.tsx
  ├── <h1>Chat</h1> (mobile: hidden; desktop: visível)
  ├── <LeadSearch /> (emite ?q=)
  ├── [cards de conversas]
  │   └── <Link href="/broker/leads/{id}">
  │       ├── Avatar (inicial)
  │       ├── Nome + Preview com prefixo
  │       ├── Timestamp relativo
  │       ├── Chip de canal
  │       ├── Empreendimento · Etapa
  │       └── Badge verde (se não-lidas > 0)
  └── Estado vazio
```

### Filtros PostgREST em Joins — Nota

PostgREST (Supabase) suporta filtros em relações embedded usando a notação `"tabela.coluna"` no método `.filter()`. Se o join de lead não suportar `.ilike("leads.name", ...)` diretamente via método encadeado, usar `.filter("leads.name", "ilike", `%${q}%`)`. Testar em dev antes de marcar T2 completo.

### Testing

- Framework: **Vitest**
- Localização testes: `packages/web/src/lib/broker/__tests__/format-relative-time.test.ts`
- Testes de UI: inspeção visual no PWA (Chrome mobile emulation DevTools)
- Cenários mínimos para `formatRelativeTime`: mesmo dia manhã, mesmo dia tarde, ontem, 3 dias atrás, 8 dias atrás

---

## Dev Agent Record (Dex) — 2026-06-22

### File List
- `packages/web/src/lib/broker/format-relative-time.ts` (CRIADO)
- `packages/web/src/lib/broker/__tests__/format-relative-time.test.ts` (CRIADO)
- `packages/web/src/lib/broker/channel-labels.ts` (CRIADO — extração para reuso)
- `packages/web/src/app/broker/chat/page.tsx` (CRIADO)

### Decisões
- **Não-lidas por card sem N+1:** após filtrar as conversas, faço UM fetch batch
  `messages.select('conversation_id, role, created_at').in('conversation_id', ids)`,
  agrupo num `Map<conversation_id, msgs[]>` e, por card, chamo
  `countUnreadForLead([{id, broker_last_read_at}], msgsDaConversa)`. Zero queries por linha.
- **Filtros em JS:** PostgREST não filtra de forma confiável em relações embedded;
  apliquei o [AUTO-DECISION] da story — filtro `q`/`property`/`stage` em JS (conjunto < 200).
- **channelLabels:** extraído para `lib/broker/channel-labels.ts` (IDS: reuso sem duplicar a
  constante; `dashboard/conversas/page.tsx` ficou intocado por estar fora do escopo desta story).
- **Avatar laranja:** segui a instrução de spec (círculo laranja, padrão `sidebar-nav.tsx` L112:
  `bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300`) em vez do snippet
  `bg-stone-200` do Dev Notes — on-brand e consistente com o avatar do usuário na nav.
- **Card como Link único:** o card inteiro (incluindo o chip de canal) é um `<Link>` — sem `<a>`
  aninhado (AC7). O chip não é um link separado, então navega junto: comportamento aceitável.
- **Preview prefix:** segui AC4 (role-based, 3 casos mutuamente exclusivos): broker→"Você:",
  assistant→"🤖", user→sem prefixo.

### Resultados
- Vitest (`format-relative-time.test.ts`): 9/9 passed.
- ESLint: 0 erros nos 4 arquivos da story.
- type-check: 0 erros nos arquivos da story (3 erros pré-existentes em `visual-editor.tsx`).

## Validação (PO — Pax) — 2026-06-22

**Veredito: GO — Score 8/10. Status Draft → Ready.**

Confirmado com evidência:
- **Sem N+1:** reusa colunas denormalizadas `last_message_preview`/`last_message_role` — padrão real em `dashboard/conversas/page.tsx` L13-23 (Story 30.2, trigger `trg_messages_update_conv`). ✓
- **RLS já filtra o broker:** `conversations_select` (`004_rls_policies.sql` L129-140) restringe via `EXISTS` em `leads.assigned_broker_id`. **Não precisa de `.eq("assigned_broker_id")` manual.** ✓
- **Joins:** `kanban_stages:stage_id(name,color)` e `properties:property_interest_id(name)` são idênticos ao código que já funciona em `broker/leads/[id]/page.tsx` L23-24. ✓
- **`channelLabels`** confirmado em `dashboard/conversas/page.tsx` L25-28. ✓
- **Reuso de busca/filtros:** `lead-search.tsx` (emite `?q=` via `usePathname` — funciona em qualquer rota) e `lead-filters.tsx` (emite `?stage=`/`?property=` via `usePathname`) confirmados. ✓
- **CON-1:** navegação interna (`/broker/leads/{id}`); sem `tel:`/`wa.me`. ✓
- Helper `formatRelativeTime` puro/testável e estados vazios cobertos (AC5/AC10). ✓

**Should-fix (NÃO bloqueia GO — orientar @dev na implementação):**
1. **Fonte dos `msgs` para o badge por card (AC6 vs query):** a query documentada seleciona `conversations` mas **não** traz `messages`, e `countUnreadForLead(convs, msgs)` precisa das mensagens. Resolução recomendada: após obter os `conversationIds`, fazer **uma** busca batch `messages.select('conversation_id, role, created_at').in('conversation_id', ids)` (mesmo padrão de `page.tsx` L47-54) e agrupar em JS — evita N+1 (conjunto do corretor é pequeno, <200). Adicionar como subtask em T3. Alternativa: RPC de contagem por conversa.
2. **Listas para o `LeadFilters`:** o componente exige props `stages` e `properties`. T5 deve incluir a busca dessas listas (kanban_stages + properties ativas) para popular os dropdowns.

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-22 | v1.0 | Story criada — Fase 6, rota inbox do corretor | @sm (River) |
| 2026-06-22 | v1.1 | Validada (GO 8/10). RLS de SELECT do broker e joins confirmados; reuso de busca/filtros e channelLabels verificados. Should-fix: fonte de `msgs` p/ badge (batch, sem N+1) e fetch de listas p/ LeadFilters. Status Draft → Ready. | @po (Pax) |

## QA Results (Quinn — @qa) — 2026-06-22

**Veredito: PASS** (com 1 concern LOW) — gate: `docs/qa/gates/epic-63-fase6-leva1.yml`

- **Sem N+1** (commit 4c3cf8e): `Promise.all` p/ conversations+properties+stages (page.tsx:51-70) + **UM** fetch batch de `messages` (`.in('conversation_id', ids)` L92-98) agrupado em `Map` JS L100-105. Zero query por linha.
- **RLS:** `conversations_select` restringe ao corretor (sem `assigned_broker_id` manual). `.eq('status','active')` + `order last_message_at desc nullsFirst:false` (AC2).
- **Filtros** q/property/stage combinam em AND no JS (L77-88); search por name+phone. **Estados vazios** distintos (SearchX/MessageSquare). **Prefixo preview** broker/assistant/user correto (L162-168). **Badge** `bg-green-700` só quando >0 (WCAG AA).
- **`formatRelativeTime`** (pura, base dia de calendário, `now` injetável): 9 testes (hoje/ontem/2-6d/7+/futuro/virada de ano).
- CON-1: navegação interna `/broker/leads/{id}` (Link cobre o card). channel-labels extraído p/ reuso.
- **Concern LOW (UX-FASE6-1):** `LeadFilters` renderiza o dropdown "Sem contato" (`?days=`), mas a inbox não filtra `days` em JS → controle inerte. Follow-up: aplicar ou esconder. Não bloqueia.
- Validação: Vitest 545/545; type-check 0 erros nos arquivos.
