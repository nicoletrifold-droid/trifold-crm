# Story 54-4 — Broker: Atendimento Rápido na Lista de Leads

## Metadata
- **Status:** Done
- **QA:** 2026-06-10 — PASS com concerns (botão "Ver completo" redireciona para /dashboard, inócuo pois middleware bloqueia broker)
- **Validated:** 2026-06-10 by @po (Pax) — GO (9/10)
- **Priority:** P1
- **Complexity:** L (~5-6h)
- **Created:** 2026-06-10
- **Author:** @sm (River)

## User Story
**Como** corretor, **quero** clicar em um lápis na lista de leads e registrar meu
atendimento sem sair da tela, incluindo mudar a etapa do lead,
**para que** eu perca menos tempo navegando entre telas e mantenha o histórico atualizado.

## Context
Paridade com o Supremo CRM (sistema legado). O corretor hoje precisa abrir o pipeline
ou navegar para `/broker/leads/{id}` para registrar qualquer atividade. A nova UX
traz o fluxo completo inline via drawer + modal.

**APIs disponíveis (sem novas rotas necessárias):**
- `POST /api/leads/{id}/notes` — cria entrada de histórico (broker autorizado)
- `PATCH /api/leads/{id}` — atualiza `stage_id` e `interest_level` (broker autorizado)
- `GET /api/leads/{id}/notes` — lista histórico existente

**Componentes reaproveitados:**
- `lead-detail-drawer.tsx` — drawer lateral com dados do lead (já usado no pipeline)
- `/broker/leads/{id}` — página de edição completa (link "Editar Lead")

## Acceptance Criteria

### AC1 — Lápis na lista de leads
- Ícone de lápis aparece ao final de cada linha na tabela desktop
- No mobile, botão de lápis aparece no card de cada lead
- Clicar abre o `LeadDetailDrawer` com os dados daquele lead

### AC2 — Dados do Lead no Drawer
O drawer deve exibir (além do que já mostra):
- **Dados do Cliente:** Nome, Telefone, E-mail
- **Informações do Lead:** ID, Data de criação, Origem, Campanha, Situação atual, Temperatura (interest_level)
- Botão **"Editar Lead"** → link para `/broker/leads/{id}`

### AC3 — Histórico de Contatos
- Seção "Histórico de Contatos" lista entradas anteriores (tipo + descrição + data)
- Botão **"+ Novo Histórico"** abre o `QuickHistoryModal`

### AC4 — QuickHistoryModal: seletor de tipo
Modal mostra 4 opções com ícone + label:
- Ligação | E-mail | WhatsApp | Visita
- Clicar em uma opção avança para o formulário de registro

### AC5 — Formulário de registro de contato
Campos do formulário (por tipo selecionado — título muda para "Registrar Ligação" etc.):
- **Agendou algum retorno?** — select (Não / Sim)
- Se Sim: **Data** (date input) + **Hora** (time input)
- **Quem deve retornar?** — select (Corretor)
- **Detalhes do Contato** — textarea
- Seção **"ATUALIZAR LEAD"** (destaque visual):
  - **Situação do Lead** — select com estágios do kanban (`kanban_stages`)
  - **Calor do Lead** — select (Frio / Morno / Quente)
- Botão **"Salvar Informações"**

### AC6 — Salvar
Ao clicar "Salvar Informações":
1. `POST /api/leads/{id}/notes` com `description` + `action_type` + metadata `{return_at, return_by}`
2. Se `stage_id` mudou: `PATCH /api/leads/{id}` com `{stage_id}`
3. Se `interest_level` mudou: `PATCH /api/leads/{id}` com `{interest_level}`
4. Drawer atualiza o histórico com a nova entrada
5. Modal fecha

### AC7 — "Editar Lead"
Botão "Editar Lead" no drawer linka para `/broker/leads/{id}` (página existente)

## Scope
**IN:**
- `broker/leads/page.tsx` — lápis por linha/card
- `lead-detail-drawer.tsx` — exibição de dados + fluxo "+ Novo Histórico"
- Novo componente `quick-history-modal.tsx`

**OUT:**
- Edição inline de dados do lead (usa página existente)
- Push notification ao registrar (fora do escopo)
- Mobile: formulário completo (simplificado para v1)

## Tasks
- [x] T1: Adicionar ícone lápis em cada linha (desktop) e card (mobile) em `broker/leads/page.tsx`
- [x] T2: Wiring: clicar no lápis abre `LeadDetailDrawer` com o `leadId` correto
- [x] T3: Criar `quick-history-modal.tsx` — seletor de tipo (AC4)
- [x] T4: Formulário de registro com todos os campos (AC5)
- [x] T5: Lógica de salvar — 1-3 chamadas de API (AC6)
- [x] T6: Seção "ATUALIZAR LEAD" com estágios do kanban buscados via Supabase client
- [x] T7: Botão "Editar Lead" no drawer (AC7)
- [x] T8: Typecheck limpo

## Files
- `packages/web/src/app/broker/leads/page.tsx`
- `packages/web/src/components/leads/lead-detail-drawer.tsx`
- `packages/web/src/app/broker/_components/quick-history-modal.tsx` (novo)

## Definition of Done
- Fluxo completo funciona: lápis → drawer → + Novo Histórico → tipo → form → salvar
- Stage e interest_level atualizam no banco
- Histórico aparece na lista após salvar
- Typecheck limpo
