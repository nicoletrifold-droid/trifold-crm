---
epic: 31
title: Workflow de Aprovação de Uploads do Perfil Obras
status: In Progress
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: River (@sm)
priority: P1
depends_on: [30]
blocks: []
stories_planned: [31.1, 31.2, 31.3]
estimated_points: 13
estimated_duration: ~3 dias úteis
---

# Epic 31 — Workflow de Aprovação de Uploads do Perfil Obras

## Objetivo

Garantir que arquivos (fotos e documentos) enviados por usuários com perfil `obras` passem por um fluxo de aprovação antes de serem publicados. Supervisores e administradores recebem notificação imediata e podem aprovar ou rejeitar cada upload via painel dedicado. O objetivo é validar informações e arquivos antes de qualquer publicação.

## Contexto de Negócio

O perfil `obras` tem acesso operacional ao módulo de Obras (criado no Epic 25/Story 25.1). Por ser um perfil de campo (engenheiros, mestres de obra), os uploads que fazem precisam de validação por parte da equipe interna (admin/supervisor) antes de ficarem visíveis para clientes e demais usuários. Hoje o upload de qualquer role vai direto ao ar.

## Fluxo Esperado

1. Usuário `obras` faz upload de foto ou documento em uma obra
2. Arquivo é salvo no Supabase Storage mas **não** publicado
3. Registro criado em `obra_upload_aprovacoes` com `status = 'pendente'`
4. Admin e supervisores da org recebem notificação (email e/ou push) sobre a pendência
5. Admin/supervisor acessa o painel de aprovações na obra
6. Admin/supervisor aprova → arquivo movido para `obra_fotos` ou `obra_documentos` (publicado)
7. Admin/supervisor rejeita → arquivo removido do storage, motivo registrado
8. Usuário `obras` vê o status do upload (pendente / aprovado / rejeitado)

## Escopo

### IN
- Upload de fotos por role `obras` → entra em fluxo de aprovação
- Upload de documentos por role `obras` → entra em fluxo de aprovação
- Upload por `admin` e `supervisor` → publicação direta (sem alteração)
- Painel de aprovações na página da obra (aba exclusiva para admin/supervisor)
- Badge de pendências na sidebar (admin/supervisor)
- Notificação para admin/supervisor ao receber upload pendente (email + push)
- Indicador de status para o role `obras` (pendente / aprovado / rejeitado)
- Motivo de rejeição obrigatório com modal

### OUT
- Alteração de outros módulos além de Obras
- Workflow de aprovação para mensagens de obras
- Fluxo de aprovação para criação/edição de fases, obras ou clientes vinculados

## Stories

| Story | Título | Pontos | Status |
|-------|--------|--------|--------|
| 31.1 | DB Schema: Tabela de Aprovações de Uploads | 3 | Ready for Review |
| 31.2 | API: Upload com Pendência + Aprovação + Notificações | 5 | Draft |
| 31.3 | UI: Painel de Aprovações e Indicadores de Status | 5 | Draft |

## Critérios de Sucesso do Epic

- [ ] Upload por `obras` NÃO aparece imediatamente nas listas de fotos/documentos
- [ ] Admin e supervisor recebem notificação ao receber pendência
- [ ] Admin/supervisor pode aprovar → arquivo publicado imediatamente
- [ ] Admin/supervisor pode rejeitar com motivo → arquivo removido do storage
- [ ] Usuário `obras` vê indicador de status do upload (pendente/aprovado/rejeitado)
- [ ] Badge na sidebar indica o número de aprovações pendentes para admin/supervisor
- [ ] Upload por `admin` e `supervisor` continua publicando diretamente (sem regressão)

## Dependências Técnicas

- `supabase/migrations/033_obra_upload_aprovacoes.sql` — nova migration
- API routes: `/api/admin/obras/[obra_id]/fotos` e `documentos` — modificação de comportamento
- API route nova: `/api/admin/obras/[obra_id]/aprovacoes`
- API route nova: `/api/admin/obras/aprovacoes/pendentes` — para badge global
- `lib/notificacoes.ts` — novo tipo de evento `nova_pendencia_aprovacao`
- UI: nova aba "Aprovações" em `dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx`
