# Story 46-1 — Roleta de Leads: Distribuidor Round-Robin com Notificações

## Metadata
- **Epic:** 46 — Roleta de Leads
- **Story:** 46-1
- **Status:** Approved
- **Created:** 2026-05-28
- **Author:** @sm (River)
- **Validated:** @po (Pax)

---

## User Story

**Como** administrador da construtora,  
**Quero** que novos leads sejam distribuídos automaticamente aos corretores via round-robin,  
**Para que** o atendimento seja ágil, justo e rastreável, sem intervenção manual.

---

## Context

O CRM recebe leads via Meta Ads webhook e formulários manuais. Hoje os leads caem sem atribuição automática. A roleta deve:

- Distribuir para o próximo corretor da fila round-robin (global, não por empreendimento)
- Filtrar: só recebe o lead o corretor que tiver o empreendimento em `broker_assignments`
- Respeitar horário comercial configurável por dias + horário de início/fim
- Respeitar `brokers.is_available = true` e `brokers.max_leads` (leads ativos)
- Notificar o corretor por: push do sistema, e-mail e WhatsApp
- Registrar log de cada distribuição para auditoria

**Schema existente relevante:**
- `brokers(id, org_id, user_id, max_leads, is_available)` — corretor
- `broker_assignments(broker_id, property_id)` — empreendimentos que o corretor atende
- `leads(id, org_id, name, phone, property_interest_id, assigned_broker_id)` — lead com empreendimento de interesse
- `users(id, name, email, phone)` — dados de contato do corretor
- `whatsapp_config(org_id, phone_number_id, access_token, status)` — config WA por org

---

## Acceptance Criteria

- [ ] AC1: Quando um lead é criado (ou marcado como "novo"), `distributeLeadToNextBroker(leadId, orgId)` é chamado automaticamente
- [ ] AC2: A função seleciona o próximo corretor na fila round-robin que:
  - Tem `broker_assignments` contendo o `property_interest_id` do lead
  - Tem `is_available = true`
  - Tem leads ativos < `max_leads`
  - (Se fora do horário comercial, enfileira para distribuição posterior)
- [ ] AC3: O corretor selecionado recebe:
  - Push notification: título "Novo Lead", corpo com nome do lead e empreendimento, URL para o lead no CRM
  - E-mail via Resend: template com nome, telefone do lead, empreendimento, link direto
  - WhatsApp via Meta Cloud API: mensagem com nome do lead, telefone, empreendimento
- [ ] AC4: `leads.assigned_broker_id` é atualizado com o `user_id` do corretor selecionado
- [ ] AC5: Cada distribuição gera um registro em `lead_distribution_log`
- [ ] AC6: UI admin em `/dashboard/roleta` mostra:
  - Status da roleta (ativa/pausada)
  - Posição de cada corretor na fila (quem é o próximo)
  - Configuração de horário comercial (dias da semana + hora início/fim)
  - Botões para pausar/ativar a roleta globalmente
- [ ] AC7: Se nenhum corretor elegível existe no momento, o lead fica sem atribuição e um log registra `"sem_corretor_disponivel"`
- [ ] AC8: TypeScript compila sem erros, ESLint passa

---

## Tasks

- [ ] **T1** — Migration: criar tabelas `roleta_config`, `roleta_fila`, `lead_distribution_log`
- [ ] **T2** — Engine: `packages/web/src/lib/roleta/distributor.ts` — lógica round-robin + filtros
- [ ] **T3** — Notificações: `packages/web/src/lib/roleta/notify-broker.ts` — push + email + WhatsApp
- [ ] **T4** — Hook de lead: chamar `distributeLeadToNextBroker` quando lead é criado (Meta webhook + criação manual)
- [ ] **T5** — Admin UI: `packages/web/src/app/dashboard/roleta/page.tsx` — status, fila, config de horário
- [ ] **T6** — API routes: `POST /api/roleta/distribute` (manual trigger), `GET/PATCH /api/roleta/config`
- [ ] **T7** — QA: TypeScript + lint + teste manual do fluxo end-to-end

---

## Technical Design

### Novas tabelas (migration `068_roleta_leads.sql`)

```sql
-- Configuração global da roleta por organização
CREATE TABLE roleta_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  business_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 0=dom, 1=seg ... 6=sab
  business_hour_start time NOT NULL DEFAULT '08:00',
  business_hour_end time NOT NULL DEFAULT '18:00',
  timezone varchar(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  notify_push boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  notify_whatsapp boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fila round-robin: cada corretor tem uma posição, next_position define quem é o próximo
CREATE TABLE roleta_fila (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  position integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, broker_id),
  UNIQUE(org_id, position)
);

-- Log de distribuições
CREATE TABLE lead_distribution_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  broker_id uuid REFERENCES brokers(id),
  status varchar(50) NOT NULL, -- 'distributed', 'sem_corretor_disponivel', 'fora_horario', 'roleta_inativa'
  skipped_brokers jsonb DEFAULT '[]', -- brokers pulados e motivo
  notified_push boolean DEFAULT false,
  notified_email boolean DEFAULT false,
  notified_whatsapp boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Distributor engine (`lib/roleta/distributor.ts`)

```
1. Buscar roleta_config da org
2. Verificar is_active — se não, log 'roleta_inativa', return
3. Verificar horário comercial (timezone-aware) — se fora, log 'fora_horario', return
4. Buscar property_interest_id do lead
5. Buscar corretores eligíveis: JOIN brokers + broker_assignments (property_id = lead.property_interest_id) + is_available = true
6. Para cada corretor em ordem de position na roleta_fila:
   a. Contar leads ativos (assigned_broker_id = broker.user_id, sem stage 'lost'/'sold')
   b. Se count < max_leads → este é o selecionado
7. Atualizar leads.assigned_broker_id
8. Avançar posição na fila (próximo da lista circular)
9. Inserir lead_distribution_log
10. Chamar notify-broker.ts
```

### Email template para corretor

Subject: `🏠 Novo lead: {nome} — {empreendimento}`
Body: nome, telefone, empreendimento, link para `/dashboard/leads/{lead_id}`

---

## File List

- `supabase/migrations/068_roleta_leads.sql` (CREATE)
- `packages/web/src/lib/roleta/distributor.ts` (CREATE)
- `packages/web/src/lib/roleta/notify-broker.ts` (CREATE)
- `packages/web/src/app/dashboard/roleta/page.tsx` (CREATE)
- `packages/web/src/app/api/roleta/config/route.ts` (CREATE)
- `packages/web/src/app/api/roleta/distribute/route.ts` (CREATE)
- `packages/web/src/app/api/webhook/meta/route.ts` (MODIFY — chamar distributor após criar lead)

---

## Definition of Done

- [ ] Migration aplicada em produção sem erros
- [ ] Lead criado via Meta webhook recebe corretor atribuído automaticamente
- [ ] Corretor notificado por push, email e WhatsApp
- [ ] Admin consegue ver e configurar a roleta em `/dashboard/roleta`
- [ ] TypeScript + ESLint passam sem erros
- [ ] Log de distribuição registrado para cada lead

---

## Notes

- Round-robin é **global** (uma fila única por org, não por empreendimento)
- A fila é circular: após o último corretor, volta ao primeiro
- Se nenhum corretor cobre o empreendimento, retornar `sem_corretor_disponivel`
- WhatsApp só envia se `whatsapp_config.status = 'active'` para a org
- Push só envia se o broker user tiver push subscription cadastrada
