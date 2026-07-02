# Story Lançamentos-01 — Fundação: módulo + menu + permissões

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (push + migration 144) · **Epic:** Lançamentos · **Branch:** feat/lancamentos-01-fundacao · **Complexidade:** S (1-2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, verificação do seed de permissões no banco]
- **Prioridade:** 🟢 — 1ª fatia do épico Lançamentos. Sem risco (só adiciona; não toca módulos existentes).

## Story
**As a** admin/supervisor/obras, **I want** um novo módulo "Lançamentos" no menu (abaixo de Obras), gated por permissão, com uma página inicial navegável, **so that** o épico tenha a fundação (módulo registrado + menu + guard) sobre a qual as próximas stories (índice, board, fornecedores) são construídas.

## Contexto
Épico Lançamentos: cada lançamento = um empreendimento com seu board Kanban (relocação do Kanban dormente `imob_*`, Story 75-88/75-95) + cadastro global de Fornecedores. Escopo aprovado pelo dono + mockup de UX aprovado. Esta é a **fatia 1 (fundação)**: registra o módulo, coloca no menu abaixo de Obras, cria o guard e uma página placeholder gated. Nada de board/entidade/fornecedores ainda (stories seguintes). Acesso = admin + supervisor + obras (mesmos perfis de Obras).

## Escopo
**IN:**
1. `lib/permissions-modules.ts` — adicionar `"lancamentos"` a `ALL_MODULES`, + `MODULE_LABELS.lancamentos = "Lançamentos"` + `MODULE_DESCRIPTIONS.lancamentos`.
2. **Migration 144** `144_seed_module_lancamentos.sql` — seed `role_permissions` p/ o módulo `lancamentos` (can_access = role em admin/supervisor/obras), padrão da migration 132.
3. `lib/lancamentos/guard.ts` — fork do `imobGuard` (checa `canAccess(..., "lancamentos")`), p/ as APIs das próximas stories.
4. `app/dashboard/layout.tsx` — ícone `Rocket` (lucide), `NAV_ITEM_LANCAMENTOS`, entrada em `NAV_MODULE_MAP`, e inserção no `navItems` **logo abaixo de Obras** gated por `permissions["lancamentos"]`.
5. `app/dashboard/lancamentos/page.tsx` — página gated (`canAccess("lancamentos")` senão redirect `/dashboard`), com header + empty state placeholder no design system (será substituída pelo índice real na Story 2).

**OUT:**
- Sem tabela `lancamentos`, sem board, sem fornecedores (stories 2-7).
- Não mexe em nenhum módulo existente (IMOB/Obras/Pastas intactos).
- Não altera a matriz de Perfil de Acesso além de semear o novo módulo (ela lê `ALL_MODULES` + `role_permissions`).

## Acceptance Criteria
1. **Given** um usuário admin/supervisor/obras, **then** vê o item **Lançamentos** no menu, **imediatamente abaixo de Obras**, com ícone de foguete.
2. **Given** um usuário sem permissão (ex.: broker/consultoria), **then** NÃO vê o item e, se acessar `/dashboard/lancamentos` direto, é redirecionado p/ `/dashboard`.
3. **Given** o seed aplicado, **then** `role_permissions` tem linha `module='lancamentos'` p/ cada role, com `can_access=true` só p/ admin/supervisor/obras.
4. **Given** a matriz de Perfil de Acesso (Configurações), **then** "Lançamentos" aparece como módulo (via `ALL_MODULES` + label), podendo ser ligado/desligado por perfil.
5. **Given** a página, **then** renderiza header "Lançamentos" + empty state, sem erro; typecheck/lint limpos.

## Dev Notes
- Menu: Obras é inserido em `navItems` (layout.tsx ~262) fora do `NAV_ITEMS_BASE`; inserir Lançamentos logo após o bloco de Obras, gated por `permissions["lancamentos"]`. Adicionar `import { Rocket }` de lucide-react.
- Guard: espelhar `lib/imob/guard.ts` trocando módulo p/ "lancamentos" e a msg de erro. Usado pelas APIs das próximas stories.
- Seed: padrão da `132_seed_modules_imob_bolsao_fluxo.sql` — `INSERT ... SELECT r.org_id, r.id, 'lancamentos', r.name IN ('admin','supervisor','obras') FROM roles r ON CONFLICT (role_id, module) DO NOTHING`.
- Página: espelhar o gate de `app/dashboard/imob/page.tsx` (`getServerUser` + `canAccess` + redirect). `export const dynamic = "force-dynamic"`.
- `NAV_MODULE_MAP` ganha `"/dashboard/lancamentos": "lancamentos"` (consistência; a inserção real é condicional como Obras).

## File List
- `packages/web/src/lib/permissions-modules.ts` — registra "lancamentos".
- `supabase/migrations/144_seed_module_lancamentos.sql` — seed de permissões.
- `packages/web/src/lib/lancamentos/guard.ts` — guard (fork do imob).
- `packages/web/src/app/dashboard/layout.tsx` — item de menu abaixo de Obras.
- `packages/web/src/app/dashboard/lancamentos/page.tsx` — página placeholder gated.

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Fundação do épico Lançamentos (módulo + menu + permissões + guard + página gated). Handoff @devops.
