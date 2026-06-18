# Story 63-3 — Composer Mobile-First

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-3
- **Status:** Ready for Review
- **Validated:** 2026-06-18 by @po (Pax) — verdict GO (10/10); refs confirmadas (emoji 📎 em `broker-message-input.tsx` L105; "Enviar" L123; dica de atalho L127; `onKeyDown` L83-88 preservado)
- **Priority:** P0 — compositor de mensagens tem elementos de UI inadequados para mobile
- **Complexity:** S (2h)
- **Fase:** 1 (Quick Win)
- **Created:** 2026-06-18
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[icon_render_check, touch_target_check, aria_check]`

---

## User Story

**Como** corretor que usa o CRM principalmente no celular,
**Quero** um compositor de mensagens com ícones claros, alvos de toque adequados e sem dicas de teclado irrelevantes,
**Para que** eu consiga enviar mensagens rapidamente sem frustração com elementos de UI inadequados para mobile.

---

## Context

O componente atual `broker-message-input.tsx` foi criado na Story 51-1 priorizando funcionalidade.
A UX mobile ficou para depois — este é o "depois".

### Problemas identificados (com localização em código)

| Problema | Linha | Impacto |
|----------|-------|---------|
| Botão de anexo usa emoji 📎 (não ícone vetorial) | L99-106 | Tamanho não controlado; sem aria-label; não segue design system |
| Botão "Enviar" usa texto (não ícone) | L127 | Ocupa espaço horizontal; não é idiomático em apps de chat mobile |
| Dica de atalho "Ctrl/Cmd+Enter" visível em mobile | L127 | Irrelevante no mobile; ocupa espaço; confunde usuários touch |
| Alvos de toque dos botões menores que 44px | L99-106, L127 | Dificulta toque preciso — viola WCAG 2.5.5 |

### O que muda
- `📎` → ícone `Paperclip` de `lucide-react` com `aria-label="Anexar arquivo"`
- Botão "Enviar" (texto) → ícone `Send` de `lucide-react` com `aria-label="Enviar mensagem"`
- Dica de atalho de teclado → ocultar em mobile (classe `hidden lg:inline`) ou remover completamente (se não há plano para desktop separado)
- Padding/min-size dos botões → `min-h-[44px] min-w-[44px]` ou `p-3`

### O que NÃO muda
- Funcionalidade de envio por Ctrl/Cmd+Enter no desktop (se a dica for apenas ocultada com `hidden lg:inline`, a lógica de teclado no `onKeyDown` continua funcionando)
- Lógica de envio em si (já implementada na 51-1)
- Textarea e seu comportamento
- Tratamento de erro `WHATSAPP_WINDOW_CLOSED` (aprimorado na 63-4)

---

## Acceptance Criteria

- [x] **AC1:** O botão de anexo usa o ícone `Paperclip` de `lucide-react` (não emoji 📎) com `aria-label="Anexar arquivo"` no elemento button
- [x] **AC2:** O botão de envio usa o ícone `Send` de `lucide-react` com `aria-label="Enviar mensagem"` (sem texto "Enviar" visível); estado loading usa `Loader2` animado
- [x] **AC3:** A dica de atalho de teclado está oculta em mobile via `hidden lg:inline`
- [x] **AC4:** O botão de anexo e o botão de envio têm área de toque ≥ 44×44px (`min-h-[44px] min-w-[44px]` + `flex items-center justify-center`)
- [x] **AC5:** A lógica de envio por Ctrl/Cmd+Enter no `onKeyDown` continua funcional no desktop (não removida — apenas a *dica visual* foi ocultada no mobile)
- [x] **AC6:** TypeScript compila sem erros; ESLint passa (0 erros); nenhum teste existente regride

---

## Tasks / Subtasks

- [x] **T1 — Substituir emoji 📎 pelo ícone `Paperclip`**
  - `Paperclip` importado de `lucide-react`; emoji substituído por `<Paperclip className="h-5 w-5" />`; `aria-label="Anexar arquivo"`; botão com `min-h-[44px] min-w-[44px] flex items-center justify-center`

- [x] **T2 — Substituir botão "Enviar" pelo ícone `Send`**
  - `Send` e `Loader2` importados; texto substituído por `<Send className="h-5 w-5" />` (e `<Loader2 className="h-5 w-5 animate-spin" />` no loading); `aria-label="Enviar mensagem"`; `min-h-[44px] min-w-[44px]`

- [x] **T3 — Ocultar dica de atalho em mobile**
  - Span da dica recebeu `hidden lg:inline`; container ajustado para `justify-end lg:justify-between` para manter o contador à direita no mobile

- [x] **T4 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos da story
  - `pnpm --filter @trifold/web lint` → zero erros nos arquivos desta story
  - Sem testes unitários existentes para `broker-message-input` — sem regressão

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx  ← EDITAR (T1, T2, T3)
```

### Contexto de código (verificado em auditoria)
- L9-16: definição de `OptimisticMessage` com `pending` e `failed` — NÃO alterar
- L54-59: tratamento de `WHATSAPP_WINDOW_CLOSED` — NÃO alterar (será aprimorado na 63-4)
- L99-106: botão de anexo com emoji 📎 — ESTE É O TRECHO A EDITAR (T1)
- L127: botão "Enviar" e dica de atalho — ESTE É O TRECHO A EDITAR (T2, T3)

### Design system
- `lucide-react` é o padrão de ícones do projeto — `Paperclip` e `Send` estão disponíveis
- Tamanho de ícone padrão no projeto: `h-5 w-5` (20px) ou `h-4 w-4` (16px) dependendo do contexto
- Para botões de ação em composer: `h-5 w-5` é adequado
- Breakpoint mobile/desktop: `lg` = 1024px

### Gotchas
- **Não alterar a lógica `onKeyDown`** que detecta Ctrl/Cmd+Enter — apenas ocultar a *dica visual*
- **Estado de loading:** se o botão de envio tiver estado de loading (spinner), preservar esse comportamento
- **Cor do ícone `Send`:** manter a cor atual do botão (provavelmente azul ou cor primária) — não alterar a cor

---

## File List

### Modificar
- `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx` — ícones, aria-labels, alvos de toque, dica de atalho (T1, T2, T3)

---

## Testing

### Framework
Vitest (padrão do projeto — NÃO Jest)

### Cenários obrigatórios
Não há lógica nova para testar unitariamente. Validação principal é visual + lint/type-check.

### Smoke pós-deploy
- Abrir tela de detalhe do lead no mobile: botão de anexo exibe ícone de clipe (não emoji), botão de enviar exibe ícone de avião
- Inspecionar no DevTools: área de toque dos botões ≥ 44×44px (computed size)
- Verificar que a dica de atalho não aparece no mobile (< 1024px)
- Enviar uma mensagem para confirmar que a funcionalidade não regrediu

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Estado de loading no botão "Enviar" usa texto "Enviando..." — pode quebrar com troca por ícone | Verificar o comportamento de loading no arquivo antes de alterar; preservar o spinner se existir |
| R2 | Dica de atalho está no mesmo elemento que outro conteúdo — ocultar com `hidden` pode ocultar mais do que o desejado | Identificar o elemento exato antes de aplicar a classe |

---

## Out of Scope

- Desabilitar o composer quando a janela de 24h está fechada (→ Story 63-4)
- Funcionalidade real de upload de arquivos/mídia via botão de anexo
- Expandir o textarea automaticamente no mobile
- Sticky positioning do composer (→ Story 63-6)

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
| 2026-06-18 | 0.1 | Story drafted — Epic 63, Fase 1, composer mobile-first | @sm (River) |
| 2026-06-18 | 1.0 | **Implementação @dev (Dex).** `broker-message-input.tsx`: emoji 📎 → `<Paperclip>` com `aria-label="Anexar arquivo"`; botão "Enviar"/"Enviando…" → `<Send>` (e `<Loader2 animate-spin>` no loading) com `aria-label="Enviar mensagem"`; ambos com `min-h/min-w-[44px] flex items-center justify-center`. Dica "Ctrl/Cmd + Enter" → `hidden lg:inline` (container `justify-end lg:justify-between` para manter contador à direita no mobile). Lógica `onKeyDown` (Ctrl/Cmd+Enter) preservada intacta. type-check e ESLint limpos. Sem `tel:`/`wa.me`. Status → Ready for Review. | @dev (Dex) |
| 2026-06-18 | 0.2 | **Validação PO — verdict GO (10/10). Status Draft → Ready.** Refs confirmadas no código `broker-message-input.tsx`: botão de anexo com emoji 📎 em L105 (bloco L99-106); botão "Enviar" texto em L123; dica "Ctrl/Cmd + Enter para enviar" em L127; lógica `onKeyDown` (Ctrl/Cmd+Enter) em L83-88 — AC5 corretamente exige preservar essa lógica e ocultar só a dica visual. `lucide-react` já é padrão do projeto (`Paperclip`/`Send` disponíveis). CON-1/CON-2 respeitados (sem `tel:`/`wa.me`, sem mexer no envio). | @po (Pax) |
