---
epic: 24
title: Central de Mensagens — Admin ↔ Cliente
status: Draft
created_at: 2026-05-11
updated_at: 2026-05-11
created_by: River (@sm)
priority: High
objetivo_negocio:
  - Centralizar toda comunicação cliente-equipe em um único hub no painel admin
  - Garantir que clientes vejam apenas "Trifold" como remetente (privacidade interna)
  - Dar visibilidade ao admin sobre QUEM da equipe enviou cada mensagem (auditoria)
  - Reduzir tempo de resposta eliminando necessidade de navegar por cada obra
depends_on:
  - Epic 20 completo (tabela obra_mensagens, auth cliente, portal do cliente)
  - Epic 23 completo (UX mobile do chat do portal do cliente)
  - users table com campos name/full_name
  - Supabase Auth configurado com roles admin/supervisor/broker/cliente
stories_planned: [24.1, 24.2, 24.3, 24.4]
---

# Epic 24 — Central de Mensagens: Admin ↔ Cliente

## Objetivo do Epic

Criar um **hub unificado de mensagens** no painel administrativo onde a equipe Trifold
(admin, supervisor, broker) possa visualizar e responder mensagens de **todos os clientes**
em todas as obras — sem precisar navegar obra por obra.

Ao mesmo tempo, garantir **anonimização correta**: o cliente sempre vê "Equipe Trifold"
como remetente, mas o admin consegue auditar **quem exatamente** enviou cada mensagem.

## Contexto do Sistema Existente

### O que já existe (não alterar comportamento)

- **`obra_mensagens`** — tabela com `sender_id` (FK → `users`), `sender_type` (`'cliente'`|`'equipe'`),
  `content`, `message_type`, `read_at`, `created_at`
- **Portal do cliente** (`chat-feed.tsx`) — já exibe **"Equipe Trifold"** para `sender_type = 'equipe'`
  (anonimização já funciona no front do cliente ✅)
- **Admin por obra** (`/dashboard/obras/[obra_id]`) — aba "Mensagens" com `admin-chat-feed.tsx`
  embarcada (funcional, mas sem nome do remetente e sem hub central)
- **`sender_id`** é gravado em toda mensagem de equipe via `POST /api/admin/obras/[obra_id]/mensagens`

### Gaps a resolver

1. **Sem hub central** — mensagens só acessíveis dentro de cada obra individualmente
2. **Sem nome real no admin** — `admin-chat-feed.tsx` não exibe quem da equipe enviou
3. **Sem snapshot de auditoria** — se usuário for deletado, `sender_id` perde a referência nominal

## Arquitetura da Solução

```
obra_mensagens
  ├── sender_id (FK existente)           → join com users para nome real
  └── sender_display_name (NOVO)         → snapshot do nome no momento do envio

/dashboard/mensagens (NOVA rota)
  ├── InboxSidebar                        → lista obras com não-lidas + preview
  └── ConversationPanel                   → chat completo + composer

/api/admin/mensagens (NOVA rota)
  └── GET                                 → todas obras com última mensagem + unread count

admin-chat-feed.tsx (ATUALIZAR)
  └── exibe sender_display_name           → visível apenas para equipe
```

## Stories

---

### Story 24.1 — Schema: sender_display_name + View de Auditoria

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Complexidade:** S (1h30)
**Prioridade:** P0 — fundação para as demais stories

Adiciona `sender_display_name` em `obra_mensagens` para garantir integridade do log de
auditoria mesmo após exclusão de usuário. Atualiza a API de envio para gravar o snapshot.
Cria view `v_mensagens_admin` no Supabase para queries eficientes do hub.

**Depende de:** Epic 20 completo
**Bloqueia:** Story 24.2, Story 24.3

---

### Story 24.2 — Central de Mensagens Admin (Inbox Unificado)

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Complexidade:** G (4h)
**Prioridade:** P1 — feature principal do epic

Nova página `/dashboard/mensagens` com layout de inbox de dois painéis:
- **Esquerdo:** lista de obras com mensagens, ordenadas por última atividade,
  badge de não lidas, preview da última mensagem, nome do cliente
- **Direito:** conversa completa da obra selecionada com composer para resposta
- Marca mensagens como lidas ao abrir a conversa
- Exibe nome real do remetente da equipe para o admin (usa `sender_display_name`)

**Depende de:** Story 24.1

---

### Story 24.3 — Admin Chat: Identidade Real do Remetente

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Complexidade:** S (1h30)
**Prioridade:** P2 — auditoria no chat embarcado por obra

Atualiza `admin-chat-feed.tsx` (chat da aba de cada obra em `/dashboard/obras/[obra_id]`)
para exibir `sender_display_name` nas mensagens `sender_type = 'equipe'`.
Admin vê: `"Marco Silva (como Trifold)"`. Cliente continua vendo apenas `"Equipe Trifold"`.
API de GET de mensagens retorna `sender_display_name` apenas para sessões de equipe.

**Depende de:** Story 24.1

---

## Regras de Negócio Críticas

### Anonimização (inviolável)
- Portal do cliente (`/cliente/**`) NUNCA expõe `sender_display_name` nem `sender_id`
- Queries da API cliente retornam apenas `sender_type`, nunca dados de usuário interno
- "Equipe Trifold" é o único label válido para mensagens de equipe no portal do cliente

### Auditoria (admin only)
- `sender_display_name` é snapshotado no momento do envio (imutável após gravação)
- Somente roles `admin` e `supervisor` acessam `sender_display_name` nas APIs admin
- Role `broker` pode ENVIAR mensagens mas não vê quem da equipe enviou (só "Equipe Trifold")

### Leitura / Não-lida
- `read_at` é preenchido quando admin visualiza a conversa (não quando o cliente envia)
- Contagem de não-lidas é por obra (não por mensagem individual no inbox)

## Dependências Técnicas

| Recurso | Situação | Notas |
|---------|---------|-------|
| `obra_mensagens` | ✅ Existe | Adicionar `sender_display_name` (Story 24.1) |
| Supabase Realtime | ✅ Ativo | Reutilizar para inbox em tempo real |
| `users` table | ✅ Existe | Join para nome real (+ snapshot em 24.1) |
| `/api/admin/obras/[obra_id]/mensagens` | ✅ Existe | Atualizar para gravar `sender_display_name` |
| `/dashboard/mensagens` | ❌ Criar | Story 24.2 |
| `v_mensagens_admin` | ❌ Criar | Story 24.1 (migration Supabase) |
