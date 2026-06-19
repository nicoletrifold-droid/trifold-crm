# Story 63-9 — Badge de Janela de 24h na Lista de Leads

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-9
- **Status:** Ready for Review
- **Validated:** 2026-06-18 by @po (Pax) — verdict **GO (8/10)**. Status Draft → Ready. **Confirmado pelo PO:** a query da lista (`broker/leads/page.tsx` L37-48) NÃO busca `conversations` — só `leads` + joins `kanban_stages`/`properties`; e a interface `Lead` em `leads-list-with-drawer.tsx` L11-22 não inclui `last_message_at`. Logo a extensão de query é **OBRIGATÓRIA** (não condicional como sugere a redação de AC5/T1): exige novo embed de `conversations(last_message_at)` + estender a interface `Lead` + ajustar o cast de props em `page.tsx` L202. Helper `getWindowStatus` (63-4) confirmado em `lib/broker/window-status.ts`. NFR-4 (sem query extra) aplica só à Fase 1 — 63-9 é Fase 3, query nova permitida. **Should-fix não-bloqueantes:** (a) tratar múltiplas `conversations` por lead — selecionar a mais recente (como `page.tsx` do detalhe faz com `order created_at desc` + `[0]`); (b) usar embed único/agregação, NUNCA N+1 (R1 já orienta); (c) badge só no card mobile é escopo aceitável. Independe de 63-8 e 63-10 — pode ir em paralelo. CON-1/CON-2 OK. Liberada para @dev.
- **Priority:** P2 — corretor não consegue priorizar atendimentos urgentes na lista
- **Complexity:** S/M (3h)
- **Fase:** 3 (Inteligência)
- **Created:** 2026-06-18
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[badge_list_check, sort_check]`
- **Depende de:** Story 63-4 Done (helper `getWindowStatus` reutilizável)

---

## User Story

**Como** corretor que olha a lista de leads,
**Quero** ver diretamente na lista o status da janela de 24h de cada lead WhatsApp,
**Para que** eu priorize responder os leads com janela fechando antes de perder a oportunidade de enviar mensagem freeform.

---

## Context

A Story 63-4 cria o helper `getWindowStatus` em `packages/web/src/lib/broker/window-status.ts`.
Esta story reutiliza esse helper na lista de leads (`leads-list-with-drawer.tsx`) para exibir
badges de status diretamente nos cards/linhas da lista.

Para exibir o badge, a lista precisa ter acesso a `conversations.last_message_at` por lead. Verificar
se esse campo já é buscado na query da lista ou se é necessário uma query adicional.

### Ordenação por urgência (opcional P2)
Opção de ordenar leads por "janela fechando primeiro" (leads com janela ativa ordenados pelo
`last_message_at` mais antigo primeiro — menos tempo restante no topo).

---

## Acceptance Criteria

- [x] **AC1:** Cada card de lead na lista mobile exibe um badge de status de janela WhatsApp (reutilizando lógica de `getWindowStatus` da Story 63-4): verde (aberta), âmbar (fechando), cinza (fechada)
- [x] **AC2:** Para leads Telegram (`phone.startsWith('tg:')`), o badge NÃO é exibido
- [x] **AC3:** O badge é renderizado compactamente no card (ex.: badge pequeno `text-xs` no canto do card) sem comprometer a leitura das informações principais do lead
- [x] **AC4:** Existe uma opção de ordenação "Janela fechando primeiro" na lista — quando selecionada, leads com janela ativa são ordenados por menor tempo restante
- [x] **AC5:** Se `conversations.last_message_at` não está disponível na query atual da lista, a query é estendida para incluí-lo (via join em `conversations` por `lead_id`) — documentar se nova query é necessária
- [x] **AC6:** TypeScript compila sem erros; ESLint passa

---

## Tasks / Subtasks

- [x] **T1 — Verificar se `last_message_at` está na query da lista**
  - Auditado: a query em `broker/leads/page.tsx` NÃO buscava `conversations`. Estendida com embed `conversations(last_message_at)` (LEFT JOIN único, sem N+1)
  - `last_message_at` da conversa mais recente derivado em JS via `selectLatestMessageAt` (helper puro testado)

- [x] **T2 — Adicionar badge ao card mobile**
  - Reusa `getWindowStatus` da Story 63-4
  - Badge compacto (`text-[11px]` + dot colorido) no canto inferior direito do card, ao lado do timestamp
  - `LeadWindowBadge` retorna `null` para Telegram (AC2)

- [x] **T3 — Adicionar opção de ordenação "Janela fechando primeiro"**
  - Toggle (`aria-pressed`) no topo da lista, alvo ≥44px, cores laranja
  - Sort client-side via `sortByWindowUrgency` (helper puro): `open`/`closing` por menor `remainingMs`; `closed`/sem-janela ao final
  - Aplicado a mobile e desktop; não muta o array original

- [x] **T4 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros NOS ARQUIVOS DA STORY (erros pré-existentes em `email-templates/visual-editor.tsx` — `react-email-editor` ausente — não relacionados)
  - ESLint → zero erros nos arquivos da story (1 erro pré-existente em `page.tsx` L90 `Date.now()`, linha intocada)

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/broker/leads/_components/leads-list-with-drawer.tsx  ← EDITAR (T2, T3)
packages/web/src/lib/broker/window-status.ts                              ← REUSAR (63-4, não modificar)
```

### Gotchas
- **Query da lista:** se a lista já busca `conversations` (via join), verificar se `last_message_at` está incluído no select; se não, adicionar — é um campo simples, não aumenta significativamente o payload
- **Performance:** `getWindowStatus` é síncrono e leve (comparação de datas) — sem preocupação de performance para N leads na lista

---

## File List

### Criar
- `packages/web/src/lib/broker/leads-window.ts` — helpers puros: `selectLatestMessageAt` (conversa mais recente) + `sortByWindowUrgency`/`windowUrgencyKey` (ordenação)
- `packages/web/src/lib/broker/leads-window.test.ts` — testes Vitest dos helpers (12 casos)

### Modificar
- `packages/web/src/app/broker/leads/page.tsx` — embed `conversations(last_message_at)` na query + derivação de `last_message_at` por lead (T1)
- `packages/web/src/app/broker/leads/_components/leads-list-with-drawer.tsx` — interface `Lead` estendida, `LeadWindowBadge`, badge no card mobile + toggle de ordenação (T2, T3)

### Referência (não modificar)
- `packages/web/src/lib/broker/window-status.ts` — helper reutilizado da Story 63-4

---

## Testing

### Smoke pós-deploy
- Lista de leads: cards WhatsApp exibem badge colorido; cards Telegram sem badge
- Ativar sort "Janela fechando primeiro": leads com menor tempo restante no topo

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `last_message_at` ausente na query da lista — N+1 queries se adicionado ingenuamente | T1: adicionar no SELECT com LEFT JOIN em conversations, não N queries separadas |
| R2 | Badge poluí visualmente a lista — muita informação por card | Usar badge mínimo (dot colorido + texto curto); testar visualmente antes de marcar Done |

---

## Out of Scope

- Badge em desktop table (linhas da tabela) — apenas mobile nesta story; desktop pode ser adicionado depois
- Contagem regressiva dinâmica (countdown animado) na lista — estático no momento do load é suficiente

---

## Definition of Done

- [ ] AC1–AC6 marcados como completos
- [ ] T1–T4 marcados como done
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Dev Agent Record

### Agent Model Used
- Dex (Builder) — Claude Opus 4.8 (YOLO autônomo)

### Completion Notes
- **Query sem N+1 (AC5/should-fix):** a query da lista recebeu o embed `conversations(last_message_at)` (LEFT JOIN único do PostgREST — uma só round-trip, sem fetch por lead). Como um lead pode ter várias conversas, o embed retorna um array e a conversa **mais recente** é selecionada em JS pelo helper puro `selectLatestMessageAt` (reduz o array ao timestamp máximo, robusto a array/objeto/null). Optou-se por reduzir em JS em vez de `order/limit` aninhado no embed para não depender de sintaxe frágil do PostgREST e manter a lógica testável.
- **Badge (AC1/AC2/AC3):** `LeadWindowBadge` reutiliza `getWindowStatus` (63-4) e renderiza um badge compacto (`text-[11px]` + dot colorido: verde/âmbar/cinza). Retorna `null` para leads Telegram (`tg:`). Posicionado no canto inferior direito do card mobile, acima do timestamp — sem poluir as infos principais. Desktop fora de escopo (conforme story).
- **Ordenação (AC4):** toggle `aria-pressed` (alvo ≥44px) ordena via `sortByWindowUrgency`. Chave de urgência: `closed`/sem-janela → `+Infinity` (final); `open`/`closing` → `remainingMs` (menor tempo no topo). Comparador evita `NaN` de `Infinity - Infinity`. Sort aplicado a mobile e desktop; não muta o array.
- **Filtros/contadores preservados:** nenhuma alteração na lógica de filtros nem nos contadores de `page.tsx` (o embed só adiciona um campo ao select).
- **CON-1:** nenhum `tel:`/`wa.me`/click-to-call introduzido. **CON-3:** `is_ai_active` não tocado.

### Validações
- Vitest (`leads-window.test.ts`): **12/12 passaram**.
- Type-check: zero erros nos arquivos da story (pré-existentes em `email-templates/visual-editor.tsx`, não relacionados).
- ESLint: zero erros nos arquivos da story (1 erro pré-existente em `page.tsx` L90, linha intocada).

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-18 | 0.1 | Story drafted — Epic 63, Fase 3, badge de janela na lista | @sm (River) |
| 2026-06-18 | 1.1 | **Implementação (@dev).** Query estendida com embed `conversations(last_message_at)` (sem N+1); helpers puros `selectLatestMessageAt`/`sortByWindowUrgency` + 12 testes; `LeadWindowBadge` no card mobile; toggle de ordenação. AC1–AC6 e T1–T4 done. Status Ready → Ready for Review. | @dev (Dex) |
| 2026-06-18 | 1.0 | **Validação PO — verdict GO (8/10). Status Draft → Ready.** Confirmado que a query da lista (`broker/leads/page.tsx` L37-48) não busca `conversations`/`last_message_at` e a interface `Lead` (L11-22) não tem o campo — extensão é OBRIGATÓRIA (novo embed + interface + cast de props L202), não condicional. Helper `getWindowStatus` (63-4) confirmado. Should-fix não-bloqueantes: selecionar a conversation mais recente por lead; embed único (não N+1); badge desktop fora de escopo é aceitável. Independe de 63-8/63-10. CON-1 OK. Liberada para @dev. | @po (Pax) |
