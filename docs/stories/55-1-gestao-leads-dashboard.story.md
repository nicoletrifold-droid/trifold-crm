# Story 55-1 — Dashboard: Transferir Corretor + Edição de Lead

## Metadata
- **Status:** Done
- **QA:** 2026-06-10 — PASS
- **Validated:** 2026-06-10 by @po (Pax) — GO (9/10)
- **Priority:** P1
- **Complexity:** M (~3-4h)
- **Created:** 2026-06-10
- **Author:** @sm (River)
- **Roles autorizados:** admin, supervisor, gerente-comercial

## User Story
**Como** gerente comercial/admin/supervisor, **quero** transferir um lead para outro
corretor direto do drawer do pipeline E editar os dados do lead na página completa,
**para que** eu possa redistribuir atendimentos e manter o cadastro atualizado sem
precisar de múltiplas navegações.

## Context
**Feature A — Transferir Corretor no Drawer (`lead-detail-drawer.tsx`):**
O drawer já existe e é usado no pipeline. A gestora precisa de acesso rápido à
transferência sem sair do Kanban. O endpoint `POST /api/leads/{id}/assign` existe
mas só aceita `admin/supervisor` — precisa incluir `gerente-comercial`.
Somente corretores **ativos** (`brokers.is_available = true` ou `users.role = 'broker'`
com registro ativo) devem aparecer na lista.

**Feature B — Edição na página `/dashboard/leads/{id}`:**
A página é somente leitura. Precisa de um lápis ao lado do nome que abre
formulário inline na aba "Info". Campos de integração (Origem, Canal, utm_*)
são sempre somente leitura.

## Acceptance Criteria

### AC1 — Transferir Corretor (drawer)
- Botão "Transferir Corretor" visível NO DRAWER apenas para admin/supervisor/gerente-comercial
- Clicar abre um select inline com todos os corretores ativos da org
- Corretor atual é destacado/pré-selecionado
- Confirmar → `POST /api/leads/{id}/assign` com o novo `broker_id`
- Após sucesso: nome do corretor atualiza no drawer, feedback visual de confirmação
- `POST /api/leads/{id}/assign` passa a aceitar role `gerente-comercial`

### AC2 — Lápis de edição na página do dashboard
- Ícone lápis ao lado do nome do lead em `/dashboard/leads/{id}`
- Visível apenas para admin/supervisor/gerente-comercial
- Clicar alterna a aba Info para modo edição (toggle)

### AC3 — Campos editáveis
Editáveis pelo formulário inline:
- Nome, Telefone, E-mail
- Empreendimento (select)
- Calor do Lead (Frio/Morno/Quente)
- Quartos, Andar, Vista, Vagas, Tem entrada
- Etapa qualificação, Visita proposta, Como conheceu

### AC4 — Campos NÃO editáveis (integração)
Sempre somente leitura — nunca editáveis:
- Origem (`source`)
- Canal (`channel`)
- UTM source/campaign/medium/term/content

### AC5 — Salvar
- Botão "Salvar Alterações" → `PATCH /api/leads/{id}`
- Feedback inline de sucesso/erro
- Após salvar: página revalida e exibe dados atualizados

## Scope
**IN:**
- `lead-detail-drawer.tsx` — botão transferir + modal de seleção de corretor
- `api/leads/[id]/assign/route.ts` — adicionar `gerente-comercial` aos roles permitidos
- `/dashboard/leads/[id]/page.tsx` — lápis + formulário de edição inline
- Novo componente `dashboard-lead-edit-form.tsx`

**OUT:**
- Transferência em lote
- Histórico de transferências (já registrado pelo activity log existente)
- Edição para corretores no dashboard (têm `/broker/leads/{id}`)

## Tasks
- [x] T1: Adicionar `gerente-comercial` ao `requireRole` em `assign/route.ts`
- [x] T2: Criar `TransferBrokerSection` no drawer — fetch brokers ativos + select + confirm
- [x] T3: Role verificado via JWT app_metadata no cliente (sem prop-drilling)
- [x] T4: Criar `DashboardLeadEditForm` — campos editáveis + read-only para integração (Origem/Canal)
- [x] T5: Integrar lápis + `EditLeadToggle` na página `/dashboard/leads/{id}`
- [x] T6: Typecheck limpo

## Files
- `packages/web/src/app/api/leads/[id]/assign/route.ts`
- `packages/web/src/components/leads/lead-detail-drawer.tsx`
- `packages/web/src/app/dashboard/leads/[id]/page.tsx`
- `packages/web/src/app/dashboard/leads/[id]/_components/dashboard-lead-edit-form.tsx` (novo)

## Definition of Done
- Gerente pode transferir corretor direto do drawer
- Gerente pode editar dados do lead na página completa
- Campos de integração nunca são editáveis
- Typecheck limpo
