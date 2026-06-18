# Story 63-7 — Detalhes do Lead em Sheet/Aba Secundária

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-7
- **Status:** Ready for Review
- **Validated:** 2026-06-18 by @po (Pax) — verdict **GO (9/10)** após revalidação dos fixes do @sm. **FIX 1 RESOLVIDO:** premissa falsa de "Transferir corretor" reconciliada — confirmado por grep que `TransferBrokerSection` existe apenas em `lead-detail-drawer.tsx` (declaração L890, uso L851) e NÃO em `page.tsx` (zero ocorrências); story removeu explicitamente do escopo via [AUTO-DECISION], Out of Scope e nota em T2. **FIX 2 RESOLVIDO:** confirmado que `components/ui/` só tem `scrollable-x.tsx` e `source-badge.tsx` (sem shadcn `Sheet`/`Drawer`); AC3 alinhado ao slide-over Tailwind custom reusando o padrão de overlay existente — `quick-history-modal.tsx` confirmado (`fixed inset-0 z-60` + backdrop `bg-black/40 onClick`, L223-225). Princípio REUSE respeitado. **FIX 3 OK:** dependência declarada (63-5 Done + 63-6 Done); refs de linha atualizadas. CON-1 OK (sem `tel:`/`wa.me` nos arquivos-alvo, verificado). **Nota (não-bloqueante):** `page.tsx` em alteração concorrente pela 63-6 — refs com drift de 1-2 linhas (`LeadEditForm` L127, cards L147/L190, conversa ~L204) e o gotcha "não tocar em `max-h-96` L209" já é histórico (63-6 removeu); marcadores localizáveis por conteúdo, story assume 63-5 + 63-6 Done antes da implementação.
- **Priority:** P1 — formulário de edição bloqueia o acesso ao chat na tela principal
- **Complexity:** M (4-6h)
- **Fase:** 2 (Estrutural)
- **Created:** 2026-06-18
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[sheet_open_check, lead_edit_form_check, chat_primary_check]`
- **Depende de:** Story 63-5 Done (estrutura de tela definida); Story 63-6 Done (layout de chat confirmado)

---

## User Story

**Como** corretor que atende leads pelo celular,
**Quero** que a tela de detalhe do lead abra diretamente no chat,
**Para que** eu responda o lead imediatamente sem ter que rolar além de um formulário de cadastro que raramente preciso editar.

---

## Context

Em `packages/web/src/app/broker/leads/[id]/page.tsx`, o layout atual (refs pós-Fase 1 confirmadas):

- `LeadEditForm` (L126) — formulário completo de dados do lead
- Card "Dados do Lead" (L146) — informações de qualificação
- Card "Resumo IA" (L188) — resumo gerado automaticamente
- Seção de conversa (L202) — empurrada para baixo pelos elementos acima

O corretor raramente precisa editar dados do lead quando está atendendo. A ação principal é
**responder a mensagem**. Os dados são contexto secundário, acessados ocasionalmente.

### Escopo: O que existe em `page.tsx` vs `lead-detail-drawer.tsx`

[AUTO-DECISION] "Transferir corretor" REMOVIDO do escopo desta story.

**Motivo:** O botão "Transferir corretor" (`TransferBrokerSection`) existe exclusivamente em
`packages/web/src/components/leads/lead-detail-drawer.tsx` (L886, visível apenas para
admin/supervisor/gerente-comercial). Ele NUNCA existiu em `page.tsx`. Portá-lo para `page.tsx`
implicaria implementar nova funcionalidade, o que está fora do escopo desta story (que é reorganizar
o que JÁ existe em `page.tsx`). A funcionalidade continua acessível via drawer (kanban do dashboard
ou lista de leads). Se for necessário na `page.tsx`, essa é uma story separada.

### Solução
Mover `LeadEditForm` e os dois cards informativos para um **painel de detalhes** acionado por
um ícone de menu (`MoreVertical` do lucide-react) no header da tela.

O layout padrão da tela vira:
1. Header: nome do lead + badge de stage + botão ⋯ (abre painel "Detalhes")
2. Área de chat (tela inteira — `ConversationThread` da 63-5/63-6)

### Implementação do painel (sem shadcn Sheet/Drawer)

Não existe `Sheet` nem `Drawer` do shadcn/ui em `packages/web/src/components/ui/`.
O padrão de overlay do projeto usa `position: fixed` + `z-index` alto + backdrop escuro.
Exemplo confirmado no código: `quick-history-modal.tsx` (L223):
```
<div className="fixed inset-0 z-60 flex items-center justify-center p-4">
  <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-stone-900">
```

Para a "sheet" de detalhes, usar **slide-over lateral Tailwind** (padrão IDS: REUSE pattern existente,
adaptado para slide do lado direito em vez de modal centrado):
- Backdrop: `fixed inset-0 z-40 bg-black/40` (fecha ao clicar)
- Painel: `fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-xl dark:bg-stone-900 overflow-y-auto`
- Transição: `transition-transform duration-200 translate-x-0 / translate-x-full`
- Fechar ao Escape: `useEffect` com `keydown` listener

Não instalar shadcn Sheet/Drawer nesta story. Se o time decidir instalar no futuro, isso é uma
refatoração de componente, não um requisito desta story.

### Preservação de funcionalidade
- O `LeadEditForm` deve continuar funcional dentro do painel — os dados do lead podem ser editados quando necessário
- A URL da página não muda
- A navegação de volta para a lista de leads não muda

---

## Acceptance Criteria

- [x] **AC1:** A tela `broker/leads/[id]/page.tsx` exibe, como conteúdo principal, a área de chat (`ConversationThread`) sem o `LeadEditForm` nem os cards bloqueando o acesso — `LeadEditForm` + cards "Dados do Lead"/"Resumo IA" removidos do layout principal e movidos para o `LeadDetailsPanel`
- [x] **AC2:** Botão com ícone `MoreVertical` no header (`aria-label="Detalhes do lead"`) abre o painel lateral com `LeadEditForm`, card "Dados do Lead" e card "Resumo IA"
- [x] **AC3:** Painel implementado como slide-over Tailwind custom (`fixed inset-y-0 right-0`, backdrop `fixed inset-0 z-40 bg-black/40`, transição `translate-x-0/translate-x-full duration-200`) — sem shadcn Sheet/Drawer; reusa o padrão de overlay de `quick-history-modal.tsx`
- [x] **AC4:** `LeadEditForm` permanece totalmente funcional dentro do painel (mesmo componente, props inalteradas; server action/PATCH + `router.refresh()` agnósticos ao pai)
- [x] **AC5:** Painel fecha ao pressionar Escape (`keydown` listener) e ao clicar no backdrop; foco volta ao gatilho ao fechar
- [x] **AC6:** TypeScript compila sem erros (apenas 3 erros pré-existentes em `email-templates/react-email-editor`, não relacionados); ESLint passa nos arquivos da story; suíte Vitest 419/419 passando (sem regressão)

---

## Tasks / Subtasks

- [x] **T1 — Confirmar ausência de shadcn Sheet/Drawer e definir implementação**
  - Confirmado: `components/ui/` não tem `sheet.tsx`/`drawer.tsx` (apenas `scrollable-x.tsx` e `source-badge.tsx`). Decisão: slide-over Tailwind custom reusando o padrão de `quick-history-modal.tsx`. Registrado no Change Log.

- [x] **T2 — Extrair conteúdo de "Detalhes" para subcomponente**
  - Criado `_components/lead-details-panel.tsx` com `LeadEditForm` + card "Dados do Lead" + card "Resumo IA" (props/callbacks preservados). "Transferir corretor" NÃO incluído (fora do escopo).

- [x] **T3 — Refatorar `page.tsx`**
  - `LeadEditForm` e os dois cards removidos do layout principal; botão `MoreVertical` adicionado no header via `LeadDetailsPanel` (Client Component que encapsula state `open` + slide-over + Escape listener). Layout principal: header + `ConversationThread`.

- [x] **T4 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos da story (3 pré-existentes não relacionados)
  - `pnpm --filter @trifold/web lint` → zero erros nos arquivos da story
  - `npx vitest run` (raiz) → 419/419 passou

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/broker/leads/[id]/page.tsx                                ← EDITAR (T3)
packages/web/src/app/broker/leads/[id]/_components/lead-details-panel.tsx      ← CRIAR (T2)
```

### Refs de linha confirmadas (pós-Fase 1, em `page.tsx`)
- L86-123: header da tela (onde o botão ⋯ deve ser inserido)
- L126: `LeadEditForm` — a mover para `LeadDetailsPanel`
- L143-200: cards "Dados do Lead" (L146) e "Resumo IA" (L188) — a mover para `LeadDetailsPanel`
- L202: início da seção de conversa — permanece no layout principal
- L209: `max-h-96 overflow-y-auto` — removido pela Story 63-6 (não alterar nesta story)

### "Transferir corretor" — decisão de escopo documentada

[AUTO-DECISION] Localização real (confirmada por grep): `lead-detail-drawer.tsx` L886 (`TransferBrokerSection`), visível apenas para admin/supervisor/gerente-comercial. Ausente em `page.tsx`.

Decisão: REMOVIDO do escopo da 63-7. Razão: portá-lo para `page.tsx` é nova funcionalidade (fora do escopo de reorganização); a funcionalidade continua acessível via drawer no kanban do dashboard. Se necessário em `page.tsx` no futuro, criar story dedicada.

### Slide-over Tailwind (padrão do projeto)

Referência: `quick-history-modal.tsx` usa `fixed inset-0 z-60 flex items-center justify-center p-4`.
Adaptar para slide-over lateral:
```tsx
// Backdrop
<div
  className="fixed inset-0 z-40 bg-black/40"
  onClick={() => setDetailsOpen(false)}
/>
// Painel
<div className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-xl
  dark:bg-stone-900 overflow-y-auto transition-transform duration-200
  ${detailsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
  <LeadDetailsPanel ... />
</div>
```

### page.tsx é Server Component — LeadDetailsPanel precisa ser Client Component

`page.tsx` é Server Component; o painel tem state (`detailsOpen`). Extração para Client Component
dentro da página: criar um componente wrapper `LeadDetailsPanelTrigger` que encapsula o botão +
o state do painel, e é importado em `page.tsx` (o padrão já usado por `BrokerMessageInput`).

### Gotchas
- **`LeadEditForm` pode ter server actions ou `router.refresh()`** — continua funcionando dentro do painel, pois esses mecanismos são independentes do componente pai
- **page.tsx é Server Component:** o state `detailsOpen` deve estar em um Client Component filho; não adicionar `"use client"` diretamente em `page.tsx`
- **NÃO tocar em `max-h-96`** (L209): isso é escopo da Story 63-6 que ocorre antes desta

---

## File List

### Criar
- `packages/web/src/app/broker/leads/[id]/_components/lead-details-panel.tsx` — slide-over de detalhes (botão ⋯ + painel: `LeadEditForm` + cards) (T2) ✅

### Modificar
- `packages/web/src/app/broker/leads/[id]/page.tsx` — `LeadEditForm`/cards removidos do layout principal; `LeadDetailsPanel` adicionado no header (T3) ✅

### Referência (não modificar)
- `packages/web/src/app/broker/_components/quick-history-modal.tsx` — referência do padrão de overlay (T1)
- `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx` — padrão de Client Component filho em Server Component

---

## Testing

### Framework
Vitest (padrão do projeto) — lógica visual testada por smoke

### Smoke pós-deploy
- Abrir tela do lead (`/broker/leads/[id]`): chat visível imediatamente sem scroll — `LeadEditForm` e cards NÃO aparecem no layout principal
- Clicar no ícone ⋯ no header: painel desliza da direita com dados do lead, formulário
- Editar dado no formulário dentro do painel: salvar funciona (router.refresh ou server action OK), dados atualizados
- Clicar no backdrop (área escura): painel fecha
- Pressionar Escape: painel fecha
- Navegar de volta à lista de leads: sem regressão

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `LeadEditForm` tem dependências de contexto da página que não funcionam dentro de um painel Client Component | T2: verificar imports e providers antes de mover; server actions e `router.refresh()` são agnósticos ao componente pai |
| R2 | shadcn/ui `Sheet` ou `Drawer` não instalado | [CONFIRMADO PELO @sm: não instalado] — usar slide-over Tailwind custom conforme especificado no Context e Dev Notes |
| R3 | Corretor acostumado com layout atual — mudança confunde workflow | Manter botão ⋯ proeminente no header; aria-label descritivo; futura onboarding/tooltip (fora do escopo) |

---

## Out of Scope

- Redesign completo do `LeadEditForm`
- Transformar a sheet em página separada
- Anotações ou notas privadas do corretor sobre o lead
- Portar "Transferir corretor" para `page.tsx` (ver decisão de escopo no Context — funcionalidade permanece no drawer)
- Instalar shadcn Sheet/Drawer (é possível no futuro como refatoração de componente, mas não é pré-requisito desta story)

---

## Definition of Done

- [ ] AC1–AC6 marcados como completos
- [ ] T1–T4 marcados como done
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-18 | 0.1 | Story drafted — Epic 63, Fase 2, detalhes do lead em sheet | @sm (River) |
| 2026-06-18 | 0.2 | **Validação PO — verdict NO-GO (6/10). Status mantido Draft.** 3 fixes obrigatórios: (1) "Transferir corretor" não está em `page.tsx` (só no drawer) — reconciliar AC2/AC5; (2) não há `Sheet`/`Drawer` shadcn em `components/ui/` — alinhar AC3 ao fallback de T1 ou instalar o componente; (3) atualizar refs de linha pós-Fase 1 (`LeadEditForm` L126, cards L146/L188, conversa L202). Núcleo da story (mover edição/cards para sheet) é válido. CON-1 OK. Re-validar após fixes do @sm. | @po (Pax) |
| 2026-06-18 | 0.3 | **Correção pós-NO-GO pelo @sm.** Fix 1: "Transferir corretor" REMOVIDO do escopo — confirmado por grep que `TransferBrokerSection` existe em `lead-detail-drawer.tsx` L886 e NUNCA existiu em `page.tsx`; decisão documentada como [AUTO-DECISION] no Context e Out of Scope; AC2 e antigo AC5 atualizados (antigo AC5 removido; renum. de AC6→AC5 e AC7→AC6). Fix 2: AC3 alinhado ao fallback slide-over Tailwind custom (confirmo ausência de `sheet.tsx`/`drawer.tsx` em `components/ui/`; apenas `scrollable-x.tsx` + `source-badge.tsx`); padrão documentado com referência ao `quick-history-modal.tsx`. Fix 3: todos os drifts de linha atualizados: `LeadEditForm` L126, "Dados do Lead" L146, "Resumo IA" L188, conversa L202. Dependência explicitada: 63-7 depende de 63-5 Done + 63-6 Done. Status: Draft — aguardando revalidação do @po. | @sm (River) |
| 2026-06-18 | 1.0 | **Revalidação PO — verdict GO (9/10). Status Draft → Ready.** Os 3 fixes confirmados contra o código real: (1) `TransferBrokerSection` só existe em `lead-detail-drawer.tsx` (decl L890, uso L851), zero ocorrências em `page.tsx` — corretamente removido do escopo; (2) `components/ui/` sem shadcn Sheet/Drawer — AC3 usa slide-over Tailwind reusando padrão de `quick-history-modal.tsx` (L223-225 confirmado), REUSE respeitado; (3) dependência 63-5 + 63-6 declarada. CON-1 OK. Único ponto não-bloqueante: drift de linhas em `page.tsx` por edição concorrente da 63-6 (já em implementação); marcadores localizáveis por conteúdo. Liberada para @dev (após 63-5 e 63-6). | @po (Pax) |
| 2026-06-18 | 1.1 | **Implementação @dev — Status Ready → Ready for Review.** Decisão de implementação (T1): **slide-over Tailwind custom**, sem shadcn Sheet/Drawer (ausente em `components/ui/`), reusando o padrão de overlay de `quick-history-modal.tsx` (`fixed`, backdrop `bg-black/40`, painel à direita com `translate-x`). Criado `_components/lead-details-panel.tsx` (Client Component: botão ⋯ `MoreVertical` + slide-over com `LeadEditForm` + cards "Dados do Lead"/"Resumo IA"; Escape + backdrop fecham; foco move ao abrir e retorna ao gatilho ao fechar; alvos ≥44px; `role="dialog"`/`aria-modal`/`aria-label`). `page.tsx` removeu `LeadEditForm` e os cards do layout principal — tela foca no chat (`ConversationThread`). "Transferir corretor" mantido fora do escopo. CON-1 OK (sem `tel:`/`wa.me`). type-check/lint limpos nos arquivos da story; Vitest 419/419. Construído sobre 63-5 (Opção B). | @dev (Dex) |
