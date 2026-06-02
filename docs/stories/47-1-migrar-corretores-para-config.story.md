# Story 47-1 — Migrar Módulo Corretores para Config

## Metadata
- **Epic:** 47 — UX Navegação e Organização do CRM
- **Story:** 47-1
- **Status:** Done
- **Created:** 2026-06-02
- **Author:** @sm (River)
- **Validated:** @po (Pax)

---

## User Story

**Como** usuário do CRM,  
**Quero** encontrar o cadastro de corretores dentro de Configurações,  
**Para que** todos os cadastros fiquem em um único lugar e a navegação principal fique mais limpa.

---

## Context

Corretores é um cadastro estático (não operacional) e deve residir em `/dashboard/configuracoes/corretores`, junto com Clientes, Usuários e Empresa. A rota atual `/dashboard/corretores` será substituída por redirect ou removida, e o item de nav principal será removido do sidebar.

---

## Acceptance Criteria

- [x] AC1: `/dashboard/configuracoes/corretores` exibe a listagem de corretores (conteúdo idêntico ao atual)
- [x] AC2: `/dashboard/configuracoes/corretores/novo` funciona para cadastro de novo corretor
- [x] AC3: `/dashboard/configuracoes/corretores/[id]` funciona para edição de corretor
- [x] AC4: Item "Corretores" removido do sidebar de navegação principal
- [x] AC5: Card "Corretores" adicionado na grade de `/dashboard/configuracoes`
- [x] AC6: Todas as referências internas de href `/dashboard/corretores` atualizadas para `/dashboard/configuracoes/corretores`
- [x] AC7: TypeScript compila sem erros, ESLint passa

---

## Tasks

- [x] **T1** — Mover arquivos: `corretores/{page,_toggle-button,_actions}.tsx` e subpastas `[id]/` e `novo/` para `configuracoes/corretores/`
- [x] **T2** — Remover item nav "Corretores" de `dashboard/layout.tsx` (NAV_ITEMS_BASE + NAV_MODULE_MAP)
- [x] **T3** — Adicionar card "Corretores" em `configuracoes/page.tsx`
- [x] **T4** — Atualizar hrefs internos nos arquivos movidos (`/dashboard/corretores` → `/dashboard/configuracoes/corretores`)
- [x] **T5** — Verificar e atualizar referências externas em: `agenda/page.tsx`, `configuracoes/usuarios/novo/page.tsx`, `roleta/page.tsx`, `roleta/_components/roleta-fila-panel.tsx`, `lib/permissions-modules.ts`
- [x] **T6** — QA: TypeScript + lint

---

## File List

### Modified
- `packages/web/src/app/dashboard/layout.tsx`
- `packages/web/src/app/dashboard/configuracoes/page.tsx`

### Moved (source → dest)
- `dashboard/corretores/page.tsx` → `dashboard/configuracoes/corretores/page.tsx`
- `dashboard/corretores/_toggle-button.tsx` → `dashboard/configuracoes/corretores/_toggle-button.tsx`
- `dashboard/corretores/_actions.ts` → `dashboard/configuracoes/corretores/_actions.ts`
- `dashboard/corretores/novo/page.tsx` → `dashboard/configuracoes/corretores/novo/page.tsx`
- `dashboard/corretores/[id]/page.tsx` → `dashboard/configuracoes/corretores/[id]/page.tsx`
