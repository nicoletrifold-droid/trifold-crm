# Arquitetura — Campaign Engine + Integração Google Forms

**Agente:** @architect (Aria)
**Data:** 2026-04-16
**Status:** Draft
**Briefing:** `docs/Briefing ação de marketing Supermuffato.docx`

---

## 1. Visão Geral

### 1.1 Problema

A Trifold realiza ações de marketing ao longo do ano (PDV, eventos, feiras, parcerias). Cada ação captura leads de formas diferentes (Google Forms, landing pages, presencial). Hoje não existe sistema para:
- Gerenciar múltiplas campanhas com datas de início/fim
- Rastrear performance real (delivery WhatsApp, open rate e-mail, respostas)
- Validar se os dados fornecidos são reais (e-mail abriu? WhatsApp respondeu?)
- Comparar performance entre ações
- Acionar a Nicole para prospecção ativa nos leads validados

### 1.2 Solução — Campaign Engine

Sistema genérico de campanhas no CRM com 3 camadas:

| Camada | O que faz | Quando |
|--------|-----------|--------|
| **Captura** | Google Forms API polling → Supabase + CRM | Cron a cada 2-3 min |
| **Confirmação** | WhatsApp template + e-mail automáticos | Imediato após processamento |
| **Prospecção** | Nicole inicia conversa via WhatsApp | Pós-ação, seleção manual no painel |

### 1.3 Primeira Ação: Supermuffato

Concurso de estimativa de bolas no PDV Supermuffato para o Vind Residence.
Fluxo: QR code → Google Forms → **API polling automático** → CRM → confirmação WhatsApp + e-mail.
Pós-ação: corretor seleciona leads validados → Nicole prospecta via WhatsApp.

### 1.4 Objetivos Técnicos

1. **Campaign Engine genérico** — suportar N campanhas ao longo do ano
2. Capturar leads via Google Forms API (zero setup manual por campanha)
3. Disparar confirmações automáticas (WhatsApp template + e-mail)
4. **Rastrear engagement** — delivery, open, response por lead por campanha
5. **Painel de performance** — métricas reais por campanha
6. **Nicole outbound** — prospecção ativa em leads selecionados
7. Validar duplicidade por WhatsApp por campanha
8. Desativar automaticamente por data de encerramento

---

## 2. Diagrama de Arquitetura

```
                         CAMADA 1: CAPTURA
┌─────────────┐     ┌──────────────┐
│  QR Code    │────▶│ Google Forms  │  ← participante preenche no celular
│  (banner)   │     │  (mobile)    │
└─────────────┘     └──────┬───────┘
                           │ respostas ficam no Google
                           │
                    ┌──────▼────────────────────────────────────┐
                    │  Cron: /api/cron/campaign-poll (2-3 min)  │
                    │  Google Forms API → busca novas respostas │
                    │  OAuth2 (conta Google da Trifold)         │
                    └──────┬────────────────────────────────────┘
                           │
                         CAMADA 2: PROCESSAMENTO
                           │ Para cada nova resposta:
                           │
                  ┌────────┼─────────┬────────────┐
                  ▼        ▼         ▼            ▼
           ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐
           │ Supabase │ │  leads  │ │ WhatsApp │ │  E-mail  │
           │ campaign │ │  (CRM)  │ │ Meta API │ │ (Resend) │
           │ _entries │ │         │ │ template │ │          │
           └────┬─────┘ └─────────┘ └────┬─────┘ └────┬─────┘
                │                        │             │
                         CAMADA 3: TRACKING
                │                        ▼             ▼
                │                 ┌────────────┐ ┌────────────┐
                │                 │  WhatsApp  │ │  Resend    │
                │                 │  status    │ │  webhook   │
                │                 │  callback  │ │  open/bnc  │
                │                 └─────┬──────┘ └─────┬──────┘
                │                       │              │
                ▼                       ▼              ▼
           ┌────────────────────────────────────────────────┐
           │           campaign_events (tracking)           │
           └────────────────────┬───────────────────────────┘
                                │
                         CAMADA 4: PAINEL
                                ▼
           ┌────────────────────────────────────────────────┐
           │  /dashboard/campaigns                          │
           │  [+ Nova Campanha] ← cola URL do Forms, pronto│
           │                                                │
           │  Cadastros | Delivery | Opens | Válidos        │
           │  ┌──────────────────────────────────────────┐  │
           │  │ [Enviar Nicole] ← seleção manual (futuro)│  │
           │  └──────────────────────────────────────────┘  │
           └────────────────────┬───────────────────────────┘
                                │
                         CAMADA 5: PROSPECÇÃO (futuro)
                                ▼
           ┌────────────────────────────────────────────────┐
           │  Nicole Outbound                               │
           │  Template inicial → conversa → pipeline CRM    │
           └────────────────────────────────────────────────┘
```

---

## 3. Análise de Impacto

### Componentes EXISTENTES (reutilizar)

| Componente | Path | Ação |
|------------|------|------|
| `WhatsAppAdapter` | `packages/bot/src/adapters/whatsapp-adapter.ts` | **ADAPT** — adicionar `sendTemplate()` |
| `MessagingAdapter` interface | `packages/bot/src/adapters/messaging-adapter.ts` | **ADAPT** — adicionar `sendTemplate()` |
| Supabase admin client | `packages/web/src/lib/supabase/admin.ts` | **REUSE** |
| Logger (`logEvent`) | `packages/web/src/lib/logger.ts` | **REUSE** |
| STAGE_IDS | `packages/shared/src/constants/stages.ts` | **REUSE** — `STAGE_IDS.novo` |
| Meta Ads webhook (padrão) | `packages/web/src/app/api/webhooks/meta-ads/route.ts` | **REUSE como referência** |
| Nicole pipeline | `packages/ai/src/chat/pipeline.ts` | **REUSE** — para prospecção outbound (fase futura) |
| Cron pattern | `packages/web/src/app/api/cron/followup/route.ts` | **REUSE como referência** — mesmo padrão de cron |

### Componentes NOVOS (criar)

| Componente | Path proposto | Justificativa |
|------------|---------------|---------------|
| Tabela `campaigns` | migration | Registro de cada ação/campanha |
| Tabela `campaign_entries` | migration | Cadastros por campanha com dados específicos |
| Tabela `campaign_events` | migration | Tracking de engagement (delivery, open, response) |
| Google OAuth2 setup | `packages/web/src/lib/google.ts` | Autenticação com Google Forms API |
| Cron campaign-poll | `packages/web/src/app/api/cron/campaign-poll/route.ts` | Polling de novas respostas |
| Serviço de e-mail (Resend) | `packages/web/src/lib/email.ts` | Nenhuma infra de e-mail existe |
| CRUD Campanhas API | `packages/web/src/app/api/campaigns/` | Gestão de campanhas |
| Painel de Ações (UI) | `packages/web/src/app/dashboard/campaigns/` | Dashboard de performance |

### Alteração de Enum

```sql
ALTER TYPE lead_source ADD VALUE 'google_forms';
ALTER TYPE lead_source ADD VALUE 'campaign';
```

---

## 4. Design Detalhado

### 4.1 Modelo de Dados — Campaign Engine

#### Tabela `campaigns` (NOVA)

Cada ação de marketing é uma campanha.

```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identificação
  name TEXT NOT NULL,                    -- "Concurso Vind — Supermuffato"
  slug TEXT NOT NULL,                    -- "vind-concurso-supermuffato-2026"
  description TEXT,                      -- Contexto da ação

  -- Período
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,

  -- Integração Google Forms
  type TEXT NOT NULL DEFAULT 'google_forms',  -- google_forms, landing_page, manual
  form_url TEXT,                              -- URL completa do Google Forms
  google_form_id TEXT,                        -- Extraído da URL automaticamente
  last_polled_at TIMESTAMPTZ,                 -- Timestamp do último polling
  last_response_at TIMESTAMPTZ,               -- Timestamp da última resposta processada

  -- Mapeamento de campos do Form → campos do sistema
  -- Ex: { "Nome completo": "name", "WhatsApp": "phone", "E-mail": "email", "Palpite": "custom:palpite" }
  field_mapping JSONB DEFAULT '{}',

  -- Confirmações automáticas
  whatsapp_template_name TEXT,          -- nome do template Meta aprovado
  email_enabled BOOLEAN DEFAULT true,
  email_subject TEXT,
  email_body_html TEXT,

  -- Vinculação ao empreendimento
  property_id UUID REFERENCES properties(id),

  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'ended')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, slug)
);
```

#### Tabela `campaign_entries` (NOVA)

Cada cadastro/participação numa campanha.

```sql
CREATE TABLE campaign_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,  -- FK para o CRM

  -- Dados do participante (copiados no momento do cadastro)
  name TEXT NOT NULL,
  phone TEXT NOT NULL,              -- WhatsApp normalizado (apenas dígitos)
  email TEXT NOT NULL,

  -- Dados específicos da campanha (flexível)
  -- Ex: { "palpite": 847, "nascimento": "1990-05-15", "intencao_compra": "Sim" }
  custom_data JSONB DEFAULT '{}',

  -- ID da resposta no Google Forms (para dedup e rastreabilidade)
  google_response_id TEXT,

  -- Status de confirmações
  whatsapp_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (whatsapp_status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  whatsapp_sent_at TIMESTAMPTZ,

  email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'delivered', 'opened', 'bounced', 'failed')),
  email_sent_at TIMESTAMPTZ,

  -- Validação de dados reais
  is_valid_phone BOOLEAN,           -- true se WhatsApp entregou (não failed)
  is_valid_email BOOLEAN,           -- true se não bounced
  has_responded BOOLEAN DEFAULT false, -- true se respondeu ao WhatsApp

  -- Nicole outbound (futuro)
  nicole_outbound_at TIMESTAMPTZ,
  nicole_outbound_by UUID,
  nicole_conversation_id UUID,

  -- Metadata
  raw_payload JSONB,                -- resposta original do Google Forms API
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Duplicidade: 1 cadastro por telefone por campanha
  UNIQUE(campaign_id, phone),
  -- Dedup por response_id do Google
  UNIQUE(campaign_id, google_response_id)
);

-- Indexes
CREATE INDEX idx_campaign_entries_campaign ON campaign_entries(campaign_id);
CREATE INDEX idx_campaign_entries_phone ON campaign_entries(campaign_id, phone);
CREATE INDEX idx_campaign_entries_lead ON campaign_entries(lead_id);
CREATE INDEX idx_campaign_entries_valid ON campaign_entries(campaign_id, is_valid_phone, is_valid_email);
```

#### Tabela `campaign_events` (NOVA)

Log de eventos para tracking granular.

```sql
CREATE TABLE campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES campaign_entries(id) ON DELETE CASCADE,

  -- Evento
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  event_type TEXT NOT NULL,
  -- whatsapp: sent, delivered, read, failed, replied
  -- email: sent, delivered, opened, clicked, bounced, complained

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_events_entry ON campaign_events(entry_id);
CREATE INDEX idx_campaign_events_type ON campaign_events(campaign_id, channel, event_type);
```

#### Tabela `leads` (EXISTENTE — sem alteração de schema)

O lead entra com:
- `name`, `phone`, `email` → do form
- `channel` → `'google_forms'`
- `source` → `'google_forms'` (requer ALTER TYPE)
- `stage_id` → `STAGE_IDS.novo`
- `utm_source` → slug da campanha
- `utm_campaign` → nome da campanha

#### RLS

```sql
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_events ENABLE ROW LEVEL SECURITY;

-- Cron usa service_role (bypass RLS)
-- Dashboard usa anon key com policies por org_id:
CREATE POLICY "org_access" ON campaigns
  FOR ALL USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));
CREATE POLICY "org_access" ON campaign_entries
  FOR ALL USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));
CREATE POLICY "org_access" ON campaign_events
  FOR ALL USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));
```

---

### 4.2 Integração Google Forms — API Polling (sem Apps Script)

**Abordagem:** O sistema se conecta à conta Google da Trifold via OAuth2 e consulta a Google Forms API periodicamente para buscar novas respostas. Zero configuração manual por campanha.

#### 4.2.1 OAuth2 — Conexão Google (uma única vez)

**Tela:** `/dashboard/configuracoes` → seção "Integrações" → botão **"Conectar Google"**

**Fluxo:**
1. Admin clica "Conectar Google"
2. Redirect para Google OAuth2 consent screen
3. Scopes solicitados: `https://www.googleapis.com/auth/forms.responses.readonly`
4. Usuário autoriza → callback salva tokens no Supabase
5. Badge verde: "Google conectado"

**Armazenamento dos tokens:**

```sql
-- Adicionar à tabela organizations (ou criar google_oauth_tokens)
ALTER TABLE organizations ADD COLUMN google_oauth_tokens JSONB;
-- Conteúdo: { "access_token": "...", "refresh_token": "...", "expiry_date": 1234567890 }
```

**Refresh automático:** O `access_token` expira em 1h. O cron faz refresh automático usando o `refresh_token` antes de cada polling.

**Serviço (`packages/web/src/lib/google.ts`):**
```typescript
import { google } from 'googleapis'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export function getFormsClient(tokens: OAuthTokens) {
  oauth2Client.setCredentials(tokens)
  return google.forms({ version: 'v1', auth: oauth2Client })
}

export async function fetchNewResponses(formId: string, afterTimestamp?: string) {
  const forms = getFormsClient(tokens)
  const res = await forms.forms.responses.list({
    formId,
    filter: afterTimestamp ? `timestamp > ${afterTimestamp}` : undefined,
  })
  return res.data.responses ?? []
}
```

**Env vars novas:**
```
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
GOOGLE_REDIRECT_URI=https://trifold.eng.br/api/auth/google/callback
```

**Pré-requisito:** Criar projeto no Google Cloud Console, habilitar Google Forms API, configurar OAuth consent screen.

#### 4.2.2 Cron — Campaign Poll (`/api/cron/campaign-poll`)

**Frequência:** A cada 2-3 minutos (configurável no Vercel Cron)

**Fluxo:**
```
GET /api/cron/campaign-poll
  │
  ├─ Validar CRON_SECRET (mesmo padrão do followup cron)
  │
  ├─ Buscar todas as campanhas: status = 'active' AND type = 'google_forms'
  │
  ├─ Para cada campanha:
  │   │
  │   ├─ Buscar tokens OAuth2 da org
  │   ├─ Refresh token se expirado
  │   │
  │   ├─ GET Google Forms API:
  │   │   forms/{google_form_id}/responses?filter=timestamp > last_polled_at
  │   │
  │   ├─ Para cada nova resposta:
  │   │   │
  │   │   ├─ Extrair campos usando campaigns.field_mapping
  │   │   ├─ Normalizar WhatsApp (apenas dígitos, 11 chars)
  │   │   ├─ Checar duplicidade (phone + campaign_id)
  │   │   ├─ Checar duplicidade (google_response_id)
  │   │   │
  │   │   ├─ Se novo:
  │   │   │   ├─ Inserir/atualizar em leads (CRM principal)
  │   │   │   ├─ Inserir em campaign_entries
  │   │   │   ├─ Disparar WhatsApp template (async)
  │   │   │   ├─ Disparar e-mail (async)
  │   │   │   └─ Inserir eventos em campaign_events
  │   │   │
  │   │   └─ Se duplicado: skip
  │   │
  │   └─ Atualizar campaigns.last_polled_at + last_response_at
  │
  └─ Retornar { processed: N, skipped: N, errors: N }
```

**Mapeamento de campos (field_mapping):**

O Google Forms API retorna respostas com `question_id` como chave. O `field_mapping` mapeia:

```json
{
  "question_id_abc123": "name",
  "question_id_def456": "phone",
  "question_id_ghi789": "email",
  "question_id_jkl012": "custom:palpite",
  "question_id_mno345": "custom:intencao_compra"
}
```

Campos com prefixo `custom:` vão para `campaign_entries.custom_data`. Campos sem prefixo (`name`, `phone`, `email`) vão para as colunas fixas.

**Auto-discovery de campos:** Quando o admin cola a URL do Forms na criação da campanha, o sistema chama `forms.forms.get(formId)` para listar todas as perguntas e sugere o mapeamento automaticamente com base nos títulos das perguntas (match por nome: "Nome completo" → name, "WhatsApp" → phone, "E-mail" → email).

#### 4.2.3 UX: Criar nova campanha → colar link → pronto

**Fluxo do usuário para criar uma campanha:**

```
1. /dashboard/campaigns → [+ Nova Campanha]
2. Preenche: nome, contexto, empreendimento, datas
3. Cola URL do Google Forms
4. Sistema automaticamente:
   a. Extrai google_form_id da URL
   b. Consulta Forms API para listar perguntas
   c. Sugere mapeamento de campos (editável pelo admin)
5. Admin revisa mapeamento → confirma
6. Configura template WhatsApp + e-mail
7. Salva → campanha fica em "Rascunho"
8. Clica "Ativar" → próximo cron já começa a buscar respostas
```

**Nenhum script, nenhum webhook, nenhuma configuração técnica.** O admin só cola o link do Forms.

---

### 4.3 WhatsApp — Template Message

O `WhatsAppAdapter` atual só tem `sendText()`. Para mensagens proativas (fora da janela de 24h), a Meta **exige** template messages.

**Novo método no adapter:**
```typescript
async sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components?: TemplateComponent[]
): Promise<void> {
  await this.callApi("messages", {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components?.length ? { components } : {}),
    },
  })
}
```

**Template a criar na Meta Business:**
- Nome: `concurso_vind_confirmacao`
- Idioma: `pt_BR`
- Categoria: `MARKETING`
- Variáveis: `{{1}}` = nome, `{{2}}` = palpite

**ATENÇÃO:** Template precisa ser aprovado pela Meta (24-48h). Submeter com antecedência.

### 4.4 E-mail — Resend

**Por que Resend?**

| Critério | Resend | SendGrid | Mailgun |
|----------|--------|----------|---------|
| DX com Next.js/TS | Excelente | Boa | Boa |
| Free tier | 3.000/mês | 100/dia | 1.000/mês |
| Webhook de tracking | Sim (open, bounce, click) | Sim | Sim |
| Setup time | ~10min | ~30min | ~30min |

O Resend envia **webhooks de status** (delivered, opened, bounced) que alimentam a tabela `campaign_events` — essencial para o painel de performance.

**Serviço (`packages/web/src/lib/email.ts`):**
```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  tags?: { name: string; value: string }[]
}): Promise<{ id: string | null; error?: string }> {
  const { data, error } = await resend.emails.send({
    from: 'Trifold <contato@trifold.eng.br>',
    to: params.to,
    subject: params.subject,
    html: params.html,
    tags: params.tags,  // tags para tracking: campaign_id, entry_id
  })
  return { id: data?.id ?? null, error: error?.message }
}
```

**Webhook de tracking Resend** (`/api/webhook/resend`):
- Recebe eventos: `email.delivered`, `email.opened`, `email.bounced`
- Atualiza `campaign_entries.email_status` e insere em `campaign_events`
- Usa tag `entry_id` para vincular ao registro correto

**Env vars novas:**
```
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

**Pré-requisito:** Verificar domínio `trifold.eng.br` no Resend (DNS TXT + DKIM).

### 4.5 WhatsApp Status Tracking

A Meta envia status updates no mesmo webhook do WhatsApp (`/api/webhook/whatsapp`):

```json
{ "statuses": [{ "id": "wamid.xxx", "status": "delivered", "recipient_id": "55..." }] }
```

O webhook existente já recebe esses payloads mas **não os processa**. Precisamos:
1. Detectar `entry.changes[0].value.statuses` no webhook existente
2. Buscar `campaign_entries` pelo `phone` + `whatsapp_status = 'sent'`
3. Atualizar status: `sent → delivered → read`
4. Inserir evento em `campaign_events`
5. Se `status = 'read'` → marcar `is_valid_phone = true`

Para **respostas** (lead respondeu ao template):
- O webhook já processa mensagens incoming
- Adicionar check: se lead tem `campaign_entries` com `has_responded = false`
- Atualizar `has_responded = true` e inserir evento `replied`

---

### 4.6 Visualização de Leads — Pipeline Central + Painel de Ações

**Decisão: Pipeline único com filtro de campanha, NÃO pipeline separado.**

Os leads de campanha entram na tabela `leads` e aparecem no Kanban existente (`/dashboard/pipeline`). Já existem filtros por empreendimento, corretor e score. Adicionamos **filtro por campanha/source**.

#### 4.6.1 Filtro de Campanha no Pipeline Existente

**Arquivo:** `packages/web/src/app/dashboard/pipeline/page.tsx`

Novo filtro no filter bar existente:

```typescript
// Novo select no filter bar (ao lado de Empreendimento, Corretor, Score)
<div>
  <label>Campanha</label>
  <select name="campaign_id">
    <option value="">Todas</option>
    {campaigns?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
</div>
```

**Query com filtro de campanha:**
```typescript
if (filters.campaign_id) {
  const { data: campaignLeadIds } = await supabase
    .from("campaign_entries")
    .select("lead_id")
    .eq("campaign_id", filters.campaign_id)

  leadsQuery = leadsQuery.in("id", campaignLeadIds.map(e => e.lead_id))
}
```

Isso permite: ver **todos os leads no Kanban normalmente**, ou filtrar para ver **só os que vieram da ação Supermuffato** (ou qualquer outra campanha futura).

#### 4.6.2 Painel de Ações (`/dashboard/campaigns`)

**Rotas:**
- `/dashboard/campaigns` — lista de campanhas + botão "Nova Campanha"
- `/dashboard/campaigns/nova` — formulário de criação
- `/dashboard/campaigns/[id]` — detalhe com indicadores + participantes
- `/dashboard/campaigns/[id]/editar` — edição da campanha

---

**Tela: Lista de Campanhas (`/dashboard/campaigns`)**

Botão principal: **+ Nova Campanha** (canto superior direito)

| Coluna | Fonte |
|--------|-------|
| Nome da ação | `campaigns.name` |
| Empreendimento | `campaigns.property_id → properties.name` |
| Período | `campaigns.starts_at` / `ends_at` |
| Status | badge: rascunho / ativa / pausada / encerrada |
| Cadastros | `COUNT(campaign_entries)` |
| Válidos | `COUNT WHERE is_valid_phone AND is_valid_email` |
| Taxa validação | `válidos / total * 100` |

Clicar na linha abre o detalhe.

---

**Tela: Nova Campanha (`/dashboard/campaigns/nova`)**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Nome da ação | text | Sim | Ex: "Concurso Vind — Supermuffato" |
| Descrição / Contexto | textarea | Sim | Contexto da ação: onde, por que, objetivo |
| Empreendimento | select | Sim | Vincula à property do CRM |
| Data de início | date | Sim | Quando a campanha ativa |
| Data de encerramento | date | Sim | Quando desativa automaticamente |
| URL do Google Forms | url | Sim | Link do formulário |

**Ao colar a URL do Google Forms:**
1. Sistema extrai `google_form_id` da URL automaticamente
2. Consulta Google Forms API → lista as perguntas do formulário
3. Sugere mapeamento automático:
   - Título contém "nome" → mapeia para `name`
   - Título contém "whatsapp" ou "telefone" → mapeia para `phone`
   - Título contém "e-mail" ou "email" → mapeia para `email`
   - Demais campos → `custom:nome_do_campo`
4. Admin revisa e ajusta se necessário

**Após configurar campos, exibe seção de confirmações:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Template WhatsApp | text | Não | Nome do template Meta aprovado |
| E-mail habilitado | toggle | — | Default: true |
| Assunto do e-mail | text | Se e-mail | Assunto da confirmação |
| Corpo do e-mail | richtext/html | Se e-mail | Template do e-mail de confirmação |

**Ao salvar:**
1. Cria registro em `campaigns` com status `draft`
2. Gera o `slug` a partir do nome (slugify)
3. Salva `field_mapping` com o mapeamento configurado
4. Exibe: "Campanha criada! Clique em Ativar quando estiver pronto."

**Botão "Ativar":** Muda status de `draft` → `active`. A partir desse momento, o próximo cron já começa a buscar respostas.

---

**Tela: Detalhe da Campanha (`/dashboard/campaigns/[id]`)**

**Header:** Nome da ação + status badge + botões [Editar] [Pausar/Ativar] [Ver no Pipeline]

**Cards de métricas (topo):**

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Cadastros│  │WhatsApp  │  │ E-mail   │  │  Leads   │  │Responderam│
│   147    │  │ Entregues│  │ Abertos  │  │ Válidos  │  │  WhatsApp │
│          │  │  132/147 │  │  89/147  │  │   118    │  │    23     │
│          │  │   89.8%  │  │  60.5%   │  │  80.3%   │  │   15.6%  │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

**Detalhamento WhatsApp:**
- Enviados / Entregues / Lidos / Falhados

**Detalhamento E-mail:**
- Enviados / Entregues / Abertos / Bounced

**Tabela de participantes:**

| Coluna | Fonte |
|--------|-------|
| Nome | `campaign_entries.name` |
| WhatsApp | `campaign_entries.phone` |
| E-mail | `campaign_entries.email` |
| Dados custom | `campaign_entries.custom_data` (ex: palpite) |
| WhatsApp | badge: pending/sent/delivered/read/failed |
| E-mail | badge: pending/sent/opened/bounced |
| Válido? | check verde se `is_valid_phone AND is_valid_email` |
| Respondeu? | check verde se `has_responded` |
| Nicole | botão ou status (fase futura) |
| Data | `campaign_entries.created_at` |

**Filtros da tabela:**
- Todos / Válidos / Inválidos / Responderam / Sem resposta

**Ações:**
- **Ver no Pipeline** → abre `/dashboard/pipeline?campaign_id=X`
- **Selecionar leads → "Enviar Nicole"** (fase futura)
- **Exportar CSV**
- **Editar campanha** → `/dashboard/campaigns/[id]/editar`

---

**Tela: Editar Campanha (`/dashboard/campaigns/[id]/editar`)**

Mesmo formulário da criação, preenchido com os dados atuais. Permite:
- Alterar datas, descrição, templates
- Pausar/reativar campanha
- Re-mapear campos (se o Forms foi alterado)
- **NÃO permite** alterar slug (usado como identificador)

#### 4.6.3 Resumo: Onde ver o quê

| Quero ver... | Onde | Como |
|-------------|------|------|
| Todos os leads no funil de vendas | Pipeline `/dashboard/pipeline` | Sem filtro |
| Só leads da ação Supermuffato no funil | Pipeline `/dashboard/pipeline?campaign_id=X` | Filtro campanha |
| Performance da ação (delivery, opens, válidos) | Painel `/dashboard/campaigns/[id]` | Dashboard dedicado |
| Comparar performance entre ações | Painel `/dashboard/campaigns` | Lista com métricas |
| Selecionar leads para Nicole prospectar | Painel `/dashboard/campaigns/[id]` | Seleção + botão |
| Criar nova campanha | Painel `/dashboard/campaigns/nova` | Cola link do Forms |

### 4.7 Nicole Outbound (Fase Futura)

**Conceito:** Após a ação encerrar, o corretor acessa o painel, filtra leads válidos (WhatsApp entregou + e-mail não bounced), e seleciona um ou mais para Nicole iniciar prospecção.

**Fluxo técnico:**

```
Corretor seleciona leads no painel
       ↓
POST /api/campaigns/[id]/outbound
Body: { entry_ids: [...], template_name?: "nicole_prospeccao_vind" }
       ↓
Para cada entry_id:
  1. Enviar template WhatsApp de abertura (Meta API)
  2. Criar conversation + conversation_state no Supabase
  3. Marcar conversation.is_ai_active = true
  4. Atualizar campaign_entries: nicole_outbound_at, nicole_conversation_id
       ↓
Quando lead responde ao template:
  → Webhook WhatsApp processa normalmente
  → Nicole (pipeline.ts) assume a conversa
  → Qualificação segue o fluxo padrão do CRM
```

**Pré-requisitos para esta fase:**
- Template Meta aprovado para prospecção (diferente do de confirmação)
- Lógica no pipeline.ts para contexto de campanha (Nicole saber que o lead veio do concurso)
- Rate limiting para envio em massa (Meta tem limites por tier)

**IMPORTANTE:** Esta fase NÃO faz parte da implementação inicial. A arquitetura do banco de dados já prevê os campos (`nicole_outbound_at`, `nicole_conversation_id`), mas a implementação da API e UI serão stories separadas.

---

## 5. Decisões de Arquitetura

| # | Decisão | Alternativa rejeitada | Justificativa |
|---|---------|----------------------|---------------|
| D1 | Google Forms (não custom form) | Form Next.js custom | Urgência + zero infra + Sheets nativo como backup |
| D2 | Google Forms API polling (não Apps Script) | Webhook via Apps Script | UX: admin só cola link do Forms, zero config manual por campanha |
| D3 | Cron polling 2-3min (não Pub/Sub) | Google Pub/Sub push | Latência de 2-3min OK para PDV; evita infra GCP pesada |
| D4 | Dual write (campaign_entries + leads) | Só campaign | Leads precisam entrar no CRM para funil de vendas + Neriah |
| D5 | Resend para e-mail | SendGrid, Mailgun | Melhor DX, free tier suficiente, webhooks de tracking nativos |
| D6 | Template message WhatsApp | sendText | Mensagem proativa fora da janela de 24h exige template |
| D7 | 3 tabelas (campaigns + entries + events) | Tudo em 1 tabela | Separação de concerns: config vs dados vs tracking |
| D8 | custom_data JSONB + field_mapping | Colunas fixas por campanha | Cada ação tem campos diferentes; mapeamento dinâmico |
| D9 | Nicole outbound como fase separada | Tudo junto | Reduz escopo inicial; a ação precisa sair urgente |
| D10 | Pipeline central + filtro campanha | Pipeline separado | Lead é um só; evita duplicação; Kanban já tem filtros |
| D11 | Auto-discovery de campos via Forms API | Mapeamento manual | UX: sistema sugere mapeamento, admin só revisa |

---

## 6. Riscos e Mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Template WhatsApp rejeitado pela Meta | ALTO | Média | Submeter template genérico; fallback sendText se lead iniciar conversa |
| DNS do Resend não propagado a tempo | MEDIO | Baixa | Verificar domínio ANTES de implementar |
| OAuth2 Google token expirado/revogado | MEDIO | Baixa | Refresh automático no cron; alerta no painel se falhar |
| Google Forms API rate limit | BAIXO | Baixa | Limite é 300 req/min; com poucas campanhas ativas, impossível atingir |
| Google Forms API indisponível | MEDIO | Muito Baixa | Cron retry no próximo ciclo; nenhum dado perdido (respostas ficam no Google) |
| Status webhooks da Meta inconsistentes | MEDIO | Média | Tratar como best-effort; UNIQUE constraint protege |
| Nicole outbound rate limited pela Meta | MEDIO | Alta se bulk | Implementar queue com delay entre envios |

---

## 7. Fases de Implementação

### Fase 1 — MVP (Ação Supermuffato) — URGENTE

| Story | Componente | Complexidade |
|-------|-----------|-------------|
| S1 | Migration: `campaigns` + `campaign_entries` + `campaign_events` + enum | Simples |
| S2 | Google OAuth2: setup + tela de conexão nas configurações | Média |
| S3 | `sendTemplate()` no WhatsApp adapter | Simples |
| S4 | Serviço de e-mail Resend (`lib/email.ts`) | Simples |
| S5 | Cron `/api/cron/campaign-poll` (polling Google Forms API) | Média |
| S6 | QR Code geração com UTM | Simples |

### Fase 2 — Painel de Ações + Tracking

| Story | Componente | Complexidade |
|-------|-----------|-------------|
| S7 | CRUD Campanhas: API routes (`/api/campaigns`) | Média |
| S8 | UI: Lista de campanhas + criação com auto-discovery de campos | Média |
| S9 | UI: Detalhe da campanha + cards de métricas + tabela participantes | Média |
| S10 | Filtro de campanha no Pipeline existente (Kanban) | Simples |
| S11 | Webhook `/api/webhook/resend` (email open/bounce tracking) | Simples |
| S12 | WhatsApp status tracking no webhook existente | Média |

### Fase 3 — Nicole Outbound

| Story | Componente | Complexidade |
|-------|-----------|-------------|
| S13 | API `/api/campaigns/[id]/outbound` | Média |
| S14 | Template Meta de prospecção + rate limiting | Média |
| S15 | Integração pipeline Nicole com contexto de campanha | Complexa |
| S16 | UI: botão "Enviar Nicole" no painel + seleção batch | Média |

---

## 8. Pré-requisitos Externos (não-código)

Antes ou em paralelo à implementação:

1. **Criar projeto Google Cloud Console** — habilitar Google Forms API, configurar OAuth consent screen, gerar client_id + client_secret
2. **Criar Google Forms** com os campos do briefing (seção 4 do briefing)
3. **Submeter template WhatsApp** na Meta Business (`concurso_vind_confirmacao`)
4. **Criar conta Resend** e verificar domínio `trifold.eng.br` (DNS TXT + DKIM)
5. **Gerar QR Code** com URL do Forms + UTM params

---

## 9. Próximo Passo

Este documento serve como input para `@sm` criar as stories da **Fase 1** (MVP urgente).

Após validação do `@po`, o fluxo segue: `@dev` → `@qa` → `@devops`.

---

*— Aria, arquitetando o futuro 🏗️*
