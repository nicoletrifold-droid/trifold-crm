---
epic: 19
title: Meta Ads Intelligence — CPL Real, Funil & Alertas IA
status: Draft
created_at: 2026-04-30
updated_at: 2026-04-30
created_by: Morgan (@pm)
priority: High
objetivo_negocio:
  - Reduzir CPL via decisões data-driven
  - Aumentar conversão de leads Meta → clientes
depends_on:
  - Epic 16 (Meta Ads Marketing API) — stories 16.4 e 16.5 devem estar em produção
sub_epics:
  - 19A: CPL Real Qualificado
  - 19B: Funil de Conversão por Campanha
  - 19C: Alertas e Recomendações de IA
stories_planned: [19.1, 19.2, 19.3]
---

# Epic 19 — Meta Ads Intelligence: CPL Real, Funil & Alertas IA

## Objetivo do Epic

Transformar o painel de campanhas Meta de **"relatório de tráfego"** em **"ferramenta de decisão"**:
cruzar dados Meta (leads form) × CRM (leads que responderam, se qualificaram, agendaram visita)
para expor o CPL real qualificado, o funil de conversão completo e receber alertas proativos de IA
quando campanhas saem da curva — permitindo alocar verba com precisão e reduzir CPL de forma estrutural.

## Contexto do Sistema Existente

- **Painel atual** (`/dashboard/campaigns/meta`): lista campanhas com spend, impressões, CTR, CPL Meta, leads Meta, leads CRM — mas CPL Meta = spend / form submissions (não qualificados)
- **Dados disponíveis no CRM:** `leads` com `utm_campaign`, `status` (pipeline stages), `last_response_at`, `metadata.campaign_id`
- **Dados disponíveis no Meta:** `meta_insights_daily` com spend diário, leads, impressões por campanha
- **Crons rodando:** `meta-sync-entities` (4h) + `meta-sync-insights` (diário 06h BRT)
- **Canais de alerta existentes:** Telegram admin (padrão já implementado em vários crons)

## O Problema Hoje

| Métrica | Meta reporta | Realidade CRM |
|---------|-------------|--------------|
| CPL | R$19–R$48 por form submission | Desconhecido — muitos forms sem resposta no bot |
| Leads | 51 em [LEADS_NOVOS CRIATIVOS 13.03.26] | ? realmente responderam e se qualificaram |
| Melhor campanha | CAMPANHA CADASTRO (R$16,99 CPL) | Pode ser pior se qualificação for baixa |
| Remarketing | CPL R$111 (mais caro) | Pode ter a melhor qualificação |

**Insight-chave:** Uma campanha com CPL Meta de R$20 que qualifica 50% é melhor que
uma com R$15 que qualifica 10%. Só cruzando Meta × CRM saberemos.

## Frentes de Inteligência

### 19A — CPL Real Qualificado
Coluna `cpl_real` = spend / leads_crm (leads que responderam no bot).
Taxa de qualificação = leads_crm / leads_meta.
Ranking de campanhas por eficiência real, não por CPL Meta.

### 19B — Funil de Conversão por Campanha
Por campanha: Leads Meta → Respondeu bot → Nicole qualificou → Visita agendada → Proposta.
Visualização de funil vertical na página de detalhe de campanha.
Identifica gargalo: a campanha traz lead mas o bot não converte? ou o lead não agendou?

### 19C — Alertas e Recomendações de IA
Cron diário que analisa performance e envia resumo no Telegram:
- CPL subindo >30% em 3 dias → alerta imediato
- Campanha ativa sem nenhum lead há 7 dias gastando > R$100 → sugestão de pausar
- Campanha com CPL real < 50% da média do portfólio → sugestão de escalar orçamento
- Relatório semanal de performance consolidada (toda segunda)

## Stories

---

### Story 19.1 — CPL Real Qualificado no Painel de Campanhas

**Executor:** `@dev` | **Quality Gate:** `@architect`
**Quality Gate Tools:** `[sql_join_validation, ui_correctness, performance]`
**Complexidade:** M (4h)
**Prioridade:** P0 — quick win com maior impacto imediato

**Descrição:**

Adicionar ao painel `/dashboard/campaigns/meta` as colunas de inteligência que cruzam
dados Meta com CRM:

**Backend — nova query no endpoint `GET /api/meta-ads/campaigns`:**

```sql
-- Enriquecer cada campanha com dados CRM
SELECT
  mc.meta_campaign_id,
  mc.name,
  -- Leads que realmente interagiram no bot
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.last_response_at IS NOT NULL
  ) AS leads_responderam,
  -- Leads qualificados pela Nicole
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.status NOT IN ('new', 'unqualified')
    AND l.last_response_at IS NOT NULL
  ) AS leads_qualificados,
  -- Visitas agendadas
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.status IN ('visit_scheduled', 'visited', 'proposal', 'closed')
  ) AS visitas_agendadas
FROM meta_campaigns mc
LEFT JOIN leads l ON (
  l.utm_campaign = mc.name
  OR l.metadata->>'campaign_id' = mc.meta_campaign_id
)
WHERE mc.org_id = $1
GROUP BY mc.id, mc.meta_campaign_id, mc.name
```

**Cálculos derivados (no TypeScript, não no SQL):**
- `cpl_real` = spend / leads_responderam (null se 0)
- `taxa_qualificacao` = leads_qualificados / leads_meta (%)
- `eficiencia` = taxa_qualificacao / cpl_real (índice de eficiência)

**UI — novas colunas na tabela:**
- **Responderam** (tooltip: "Leads que interagiram com o bot")
- **CPL Real** (em destaque se < CPL Meta)
- **Qualificação %** (badge verde se >40%, amarelo 20-40%, vermelho <20%)

**Ordenação padrão:** por `cpl_real` ASC (null por último)

**Acceptance Criteria:**
- [ ] Coluna `leads_responderam` exibida corretamente na tabela
- [ ] CPL Real calculado: spend / leads_responderam (não / leads_meta)
- [ ] Taxa de qualificação exibida como badge colorido
- [ ] Join por `utm_campaign` e `metadata.campaign_id` (fallback duplo)
- [ ] Performance: query < 500ms para até 50 campanhas
- [ ] Tooltip explicativo nas colunas novas
- [ ] Sem regressão nas colunas existentes

**Risco:** BAIXO — apenas leitura, sem modificação de schema

---

### Story 19.2 — Funil de Conversão por Campanha

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[funnel_logic, ui_accessibility, chart_rendering]`
**Complexidade:** G (5h)
**Prioridade:** P1 — após 19.1

**Descrição:**

Na página de detalhe `/dashboard/campaigns/meta/[campaign_id]`, adicionar seção de funil
de conversão com 5 estágios, mostrando onde os leads dessa campanha estão no pipeline.

**Backend — endpoint `GET /api/meta-ads/campaigns/[campaign_id]/funnel`:**

```typescript
interface FunnelStage {
  label: string
  count: number
  pct_of_top: number  // % em relação ao topo do funil
  pct_of_prev: number // % em relação ao estágio anterior
}

interface CampaignFunnel {
  campaign_id: string
  period_days: number
  stages: {
    leads_meta: FunnelStage       // form submissions reportados pela Meta
    leads_crm: FunnelStage        // criados no CRM com essa campanha
    responderam: FunnelStage      // last_response_at IS NOT NULL
    qualificados: FunnelStage     // status NOT IN ('new', 'unqualified')
    visita_agendada: FunnelStage  // status IN ('visit_scheduled','visited',...)
    proposta: FunnelStage         // status IN ('proposal', 'closed')
  }
  insights: {
    gargalo_principal: string     // estágio com maior queda percentual
    cpl_real: number | null
    taxa_qualificacao: number     // %
    taxa_visita: number           // % de qualificados que agendaram visita
  }
}
```

**UI — componente `<CampaignFunnel />`:**
- Funil visual vertical com barras proporcionais
- Cada estágio mostra: contagem absoluta + % do topo + % do anterior
- Gargalo destacado em amarelo (maior queda)
- Abaixo do funil: card de insights ("O maior gargalo está entre X e Y — apenas Z% avançam")
- Filtro de período: 7d / 30d / 90d (sincronia com filtro da página)

**Acceptance Criteria:**
- [ ] Funil renderiza com os 6 estágios corretos
- [ ] Percentuais calculados corretamente (% do topo e % do anterior)
- [ ] Gargalo identificado e destacado visualmente
- [ ] Card de insights exibe o gargalo em linguagem natural
- [ ] Responsivo (funciona em telas < 1024px)
- [ ] Estado vazio: mensagem se campanha tiver < 5 leads no período
- [ ] Sem regressão na página de detalhe existente

**Risco:** BAIXO — nova seção adicionada à página existente, não substitui nada

---

### Story 19.3 — Alertas e Recomendações de IA via Telegram

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[alerting_logic, telegram_delivery, cron_reliability]`
**Complexidade:** G (5h)
**Prioridade:** P1 — após 19.1 (precisa de cpl_real)

**Descrição:**

Cron `/api/cron/meta-ads-intelligence` que roda diariamente às 08h BRT e analisa
performance das campanhas, enviando alertas proativos ao admin via Telegram.

**Regras de alerta (ordem de prioridade):**

```typescript
type AlertRule = {
  id: string
  priority: 'critical' | 'warning' | 'info'
  condition: (campaign: CampaignWithMetrics) => boolean
  message: (campaign: CampaignWithMetrics) => string
}

const rules: AlertRule[] = [
  {
    id: 'cpl_spike',
    priority: 'critical',
    // CPL dos últimos 3 dias > 130% da média dos 30 dias anteriores
    condition: (c) => c.cpl_3d > c.cpl_30d * 1.3 && c.spend_3d > 50,
    message: (c) => `🚨 CPL disparou em "${c.name}": R$${c.cpl_3d} (era R$${c.cpl_30d} — +${pct}%)`,
  },
  {
    id: 'zero_leads_active',
    priority: 'warning',
    // Campanha ACTIVE há 7+ dias sem nenhum lead, gastando
    condition: (c) => c.status === 'ACTIVE' && c.leads_7d === 0 && c.spend_7d > 100,
    message: (c) => `⚠️ "${c.name}" está ativa há 7 dias sem leads — gasto: R$${c.spend_7d}. Considere pausar.`,
  },
  {
    id: 'scale_candidate',
    priority: 'info',
    // CPL real < 60% da média do portfólio E taxa de qualificação > 35%
    condition: (c) => c.cpl_real < portfolio_avg_cpl * 0.6 && c.taxa_qualificacao > 0.35,
    message: (c) => `💡 "${c.name}" tem CPL R$${c.cpl_real} (${pct}% abaixo da média) com ${taxa}% de qualificação. Candidata a escalar orçamento.`,
  },
]
```

**Resumo diário (sempre enviado se há dados):**

```
📊 Resumo Meta Ads — {data}

🔥 VIND (30d):
  Spend: R$X.XXX | Leads Meta: XX | Responderam: XX | CPL Real: R$XX

Top campanhas por eficiência:
1. [nome] — CPL real R$XX, qualificação XX%
2. [nome] — CPL real R$XX, qualificação XX%

⚠️ Alertas: X críticos, X avisos
```

**Relatório semanal (toda segunda-feira):**
Adicionar às segunda-feiras: ranking completo das últimas 4 semanas por campanha,
tendência de CPL semanal, top 3 e bottom 3 por eficiência.

**Cron registro em `vercel.json`:**
```json
{ "path": "/api/cron/meta-ads-intelligence", "schedule": "0 11 * * *" }
```
(08h BRT = 11h UTC)

**Acceptance Criteria:**
- [ ] Cron protegido por `CRON_SECRET` (padrão existente)
- [ ] Alerta `cpl_spike` disparado quando CPL 3d > 130% da média 30d
- [ ] Alerta `zero_leads_active` disparado para campanha ativa >7d sem leads E spend >R$100
- [ ] Sugestão `scale_candidate` quando CPL real < 60% da média do portfólio
- [ ] Resumo diário sempre enviado (mesmo sem alertas críticos)
- [ ] Relatório semanal às segundas com ranking de eficiência
- [ ] Sem envio se `meta_insights_daily` não tiver dados do dia anterior (skip silencioso)
- [ ] Log em `meta_sync_log` (tipo: `intelligence_alert`, registros processados, alertas disparados)
- [ ] Sem regressão nos outros crons Meta

**Risco:** BAIXO — apenas leitura de dados existentes + Telegram (padrão já testado em outros crons)

---

## Dependências e Pré-requisitos

| Dependência | Status | Necessária para |
|-------------|--------|-----------------|
| `meta_insights_daily` populada com dados | Requer 16.5 em produção | 19.1, 19.3 |
| `meta_campaigns` sincronizada | Requer 16.4 em produção | 19.1, 19.2, 19.3 |
| `leads` com `utm_campaign` preenchido | Já existe | 19.1, 19.2 |
| `leads.last_response_at` | Já existe | 19.1, 19.2 |
| `leads.status` (pipeline stages) | Já existe | 19.2 |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` admin | Já configurado | 19.3 |
| `CRON_SECRET` | Já configurado | 19.3 |

**Nota crítica:** Stories 16.4 e 16.5 devem estar em produção (crons rodando) antes de
começar 19.1. Verificar: `SELECT COUNT(*) FROM meta_insights_daily` deve retornar > 0.

## Estimativa e Sequência

| Story | Complexidade | Estimativa | Bloqueada por |
|-------|-------------|------------|---------------|
| 19.1 — CPL Real Qualificado | M | 4h | 16.4 + 16.5 em prod |
| 19.2 — Funil de Conversão | G | 5h | 19.1 (usa mesma lógica de join) |
| 19.3 — Alertas IA Telegram | G | 5h | 19.1 (usa cpl_real) |

**Total estimado: ~14h** (~2 dias dev dedicado)

**Sequência obrigatória:** 19.1 → 19.2 e 19.3 em paralelo

## Compatibilidade

- [x] Sem modificações de schema (apenas leitura de tabelas existentes)
- [x] Endpoint `/api/meta-ads/campaigns` recebe colunas adicionais (não-breaking)
- [x] Página de detalhe recebe nova seção (não substitui conteúdo existente)
- [x] Novo cron isolado (não afeta outros crons)
- [x] Rollback: remover endpoint e cron sem efeito colateral

## Gestão de Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| `utm_campaign` mal preenchido nos leads | Alta | Join duplo: `utm_campaign` OR `metadata.campaign_id` |
| `meta_insights_daily` vazia (16.5 não rodou) | Alta | Verificar pré-requisito antes de iniciar; cron skip silencioso |
| Falso positivo no alerta `scale_candidate` | Baixa | Threshold conservador (60% abaixo + 35% qualificação) |
| Telegram rate limit | Baixa | Consolidar todos os alertas numa única mensagem por execução |

## Definition of Done

- [ ] Story 19.1: colunas CPL Real e Taxa Qualificação no painel de campanhas
- [ ] Story 19.2: funil de conversão 6 estágios na página de detalhe com gargalo identificado
- [ ] Story 19.3: cron diário disparando alertas corretos e resumo diário no Telegram
- [ ] QA gate PASS em todas as stories
- [ ] @devops push após cada QA gate aprovado
- [ ] Dados reais das contas TRIFOLD-VIND e TRIFOLD-INSTITUCIONAL visíveis no painel

## Handoff para @sm

> "Criar stories detalhadas para o **Epic 19 — Meta Ads Intelligence**.
>
> **Contexto:** Painel Meta Ads já existe em `/dashboard/campaigns/meta`.
> Tabelas `meta_campaigns`, `meta_insights_daily`, `leads` já existem com dados.
> Token das contas `act_324928230003186` (VIND) e `act_10042267189149069` (INSTITUCIONAL)
> já configurado em `meta_ad_accounts`.
>
> **Sequência obrigatória:** 19.1 primeiro → depois 19.2 e 19.3 em paralelo.
>
> **Padrão de cron:** ver `/api/cron/meta-sync-insights/route.ts`
> **Padrão de alerta Telegram:** ver `/api/cron/followup/route.ts` (usa `sendTelegramAdminAlert`)
> **Join leads × campanhas:** `leads.utm_campaign = meta_campaigns.name` OR
>   `leads.metadata->>'campaign_id' = meta_campaigns.meta_campaign_id`
> **Stack:** Next.js 14 App Router, Supabase, TypeScript, Vercel cron"

— Morgan, planejando o futuro 📊
