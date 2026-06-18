# Story 72-1 — Imóveis para o corretor (somente visualização) + permissões de edição padronizadas

## Metadata
- **Status:** Done
- **Epic:** — (melhoria de dashboard/imóveis)
- **Branch:** main (mudança incremental, padrão do repo)
- **Complexidade:** M-L (5 pontos)

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, lint]

## Story

**As a** gestor da imobiliária,
**I want** que o corretor consiga ver os empreendimentos (lista + detalhe, sem editar) e que a edição de imóveis fique restrita a admin, supervisor e obras,
**so that** o corretor tenha as infos de produto na mão (disponibilidade, % vendido, tipologias) sem risco de alterar dados, e o controle de edição fique consistente entre UI e API.

## Contexto

Pedido do usuário (conversa 2026-06-18):
1. Seção "Empreendimentos" (com barra de % vendido) no dashboard do corretor, abaixo de "Meus Leads Ativos".
2. Liberar a página de detalhe do empreendimento para o corretor — **somente visualização**.
3. Edição de empreendimento só para **admin + supervisor + obras** (correção do usuário: obras pode editar). Criar/excluir só admin + supervisor. Status da unidade já é read-only (vem de app de terceiro) — sem mudança.

**Inconsistência encontrada:** a UI gateava edição via módulo `sistema` (só admin) `|| role === "obras"`, enquanto as APIs usavam `["admin","supervisor"]`. Resultado: supervisor não via botões mas a API aceitava; obras via botões mas a API (units/property PATCH) recusava. Esta story unifica numa fonte única.

## Escopo

**IN:**
- Fonte única `lib/permissions-imoveis.ts`: `canEditImoveis(role)` = admin/supervisor/obras; `canCreateImoveis(role)` = admin/supervisor.
- UI dashboard (`properties/page.tsx`, `properties/[id]/page.tsx`): botões de editar/criar/gerenciar unidades/obra vinculada gateados pela fonte única.
- APIs alinhadas à fonte única: property PATCH, units POST, typologies POST → edit roles; property POST → create roles; property DELETE → create roles (admin+supervisor).
- Corretor: menu "Imóveis" + `/broker/properties` (lista read-only) + `/broker/properties/[id]` (detalhe read-only).
- Dashboard do corretor: seção "Empreendimentos" com cards + barra de % vendido.

**OUT:**
- Edição de status de unidade (já read-only, integração externa).
- Registro de venda (`units/[id]/sale`) permanece admin+supervisor (comercial).
- Histórico de vendas e gestão de obra **não** aparecem na visão do corretor (dados sensíveis).

## Acceptance Criteria
1. Corretor vê "Imóveis" no menu e abre lista + detalhe sem nenhum botão de edição.
2. Corretor NÃO consegue editar via API (403) — guards inalterados para corretor.
3. admin, supervisor e obras veem "Editar empreendimento" e conseguem salvar (PATCH 200).
4. Criar/excluir empreendimento só admin + supervisor.
5. Seção "Empreendimentos" no dashboard do corretor abaixo de "Meus Leads Ativos", com % vendido.

## QA Results
- **Verdict:** PASS
- **typecheck:** limpo nos arquivos da story (erros remanescentes só em `email-templates/visual-editor.tsx`, pré-existentes e alheios).
- **lint:** 0 erros. 3 warnings pré-existentes em `broker/page.tsx` (`roletaAtiva`/`isOnline`/`roletaPosition`), não introduzidos por esta story.
- **Segurança:** edição enforçada na API via `requireRole` + fonte única `permissions-imoveis.ts`; corretor é bloqueado no layout `/dashboard` e não vê nenhum botão de edição em `/broker`.

## File List
- `packages/web/src/lib/permissions-imoveis.ts` (novo — fonte única)
- `packages/web/src/app/dashboard/properties/page.tsx`
- `packages/web/src/app/dashboard/properties/[id]/page.tsx`
- `packages/web/src/app/api/properties/route.ts`
- `packages/web/src/app/api/properties/[id]/route.ts`
- `packages/web/src/app/api/properties/[id]/units/route.ts`
- `packages/web/src/app/api/properties/[id]/typologies/route.ts`
- `packages/web/src/app/api/units/[id]/route.ts`
- `packages/web/src/app/broker/layout.tsx`
- `packages/web/src/app/broker/properties/page.tsx` (novo)
- `packages/web/src/app/broker/properties/[id]/page.tsx` (novo)
- `packages/web/src/app/broker/page.tsx`
