# Migration Plan — `016_meta_campaign_roas_view.sql`

**Story:** 16.10 — ROAS Calculator Imobiliário
**Author:** Dara (@data-engineer)
**Date:** 2026-04-27
**Depends on:** `015_meta_marketing_api.sql`, `007_unit_sales.sql`, `001_base_schema.sql`

---

## 1. Objetivo

Criar a view `public.meta_campaign_roas` que calcula ROAS imobiliário por campanha
Meta Ads, agregando dados de:

- `meta_campaigns` (campanhas Meta sincronizadas)
- `meta_insights_daily` (gastos de mídia)
- `leads` (conversões no CRM via UTM)
- `kanban_stages` (filtro de stage `fechado`)
- `unit_sales` (receita realizada)

A view alimenta o bloco `roas_summary` do endpoint
`GET /api/meta-ads/campaigns/[campaign_id]/route.ts` (Story 16.9), que já consome
`meta_campaign_roas` com fallback gracioso (`try/catch`).

---

## 2. Justificativa

A página de detalhe de campanha (Story 16.9) já está em produção com o card ROAS
preparado para consumir esta view. Atualmente o endpoint retorna `roas_summary: null`
porque a view não existe. Após esta migration:

- O card ROAS na UI passa a renderizar dados reais
- Zero alteração de código de aplicação é necessária
- Gestores conseguem avaliar retorno por campanha sem cálculo manual

---

## 3. Schema confirmado vs. epic

Comparação entre o que o epic descreveu e o que foi confirmado lendo as migrations
reais:

| Epic / Story afirma | Schema real (verificado) | Decisão |
|---|---|---|
| `unit_sales.sale_value` | `unit_sales.sale_price` (migration 007, linha 10) | Usar `sale_price` |
| `leads.metadata->>'campaign_id'` | **`leads.metadata` NÃO existe** em nenhuma migration (001-015) | **Remover branch do OR** |
| `lead_source` enum inclui `whatsapp_click_to_ad` | Confirmado (migration 001, linha 22-31) | OK |
| `stage_type` enum inclui `fechado` | Confirmado (migration 001, linha 33-41) | OK |
| `meta_insights_daily(org_id, level, entity_id, spend, leads)` | Todos confirmados (migration 015) | OK |
| `meta_campaigns(org_id, meta_campaign_id, name)` | Todos confirmados (migration 015) | OK |
| Função `public.user_org_id()` | Confirmado (migration 004, linha 10) | OK (não usada na view) |

### Decisão crítica: remover branch `metadata`

A Dev Note sugere usar `l.metadata::jsonb->>'campaign_id'` como fallback com cast
defensivo. Porém:

- Cast defensivo `::jsonb` **não evita** o erro `column "metadata" does not exist`
  na criação da view — PostgreSQL valida nomes de coluna em parse time, antes do cast
- Se `metadata` não existe, `CREATE VIEW` falha imediatamente, bloqueando a migration

**Decisão:** remover o branch `OR l.metadata::jsonb->>'campaign_id' = mc.meta_campaign_id`
e usar exclusivamente `l.utm_campaign = mc.name` como join. Documentar em
Completion Notes da story que, caso futuras migrations adicionem `leads.metadata`,
basta um ALTER VIEW para incluir o branch.

Isso preserva AC1 (migration aplicável sem erros) e AC8 (idempotência).

---

## 4. Definição da View

```sql
CREATE OR REPLACE VIEW public.meta_campaign_roas AS
SELECT
  mc.org_id,
  mc.meta_campaign_id,
  mc.name AS campaign_name,
  COALESCE(SUM(mid.spend), 0)::numeric(12,2)         AS total_spend,
  COALESCE(SUM(mid.leads), 0)::bigint                AS total_leads_meta,
  COUNT(DISTINCT l.id)::bigint                       AS leads_in_crm,
  COUNT(DISTINCT us.id)::bigint                      AS sales_count,
  COALESCE(SUM(us.sale_price)
    FILTER (WHERE ks.type = 'fechado'), 0)::numeric(12,2) AS total_revenue,
  CASE
    WHEN COALESCE(SUM(mid.spend), 0) > 0
    THEN (COALESCE(SUM(us.sale_price)
            FILTER (WHERE ks.type = 'fechado'), 0)
          / SUM(mid.spend))::numeric(10,4)
    ELSE NULL
  END                                                AS roas,
  CASE
    WHEN COUNT(DISTINCT l.id) > 0
    THEN (COALESCE(SUM(mid.spend), 0)
          / COUNT(DISTINCT l.id))::numeric(12,2)
    ELSE NULL
  END                                                AS cpl_real
FROM public.meta_campaigns mc
LEFT JOIN public.meta_insights_daily mid
  ON mid.entity_id = mc.meta_campaign_id
  AND mid.level = 'campaign'
  AND mid.org_id = mc.org_id
LEFT JOIN public.leads l
  ON l.org_id = mc.org_id
  AND l.source IN ('meta_ads', 'whatsapp_click_to_ad')
  AND l.utm_campaign = mc.name
LEFT JOIN public.kanban_stages ks
  ON ks.id = l.stage_id
LEFT JOIN public.unit_sales us
  ON us.lead_id = l.id
  AND us.org_id = mc.org_id
GROUP BY mc.id, mc.org_id, mc.meta_campaign_id, mc.name;
```

### Por que `LEFT JOIN` em todas as relações?

- `meta_campaigns` é a tabela base — todas as campanhas devem aparecer no resultado
- Campanha sem spend → `total_spend = 0`, `roas = NULL` (AC7)
- Campanha sem leads no CRM → `leads_in_crm = 0`, `cpl_real = NULL` (AC4, AC7)
- Campanha sem vendas → `sales_count = 0`, `total_revenue = 0` (AC7)

### Filtro `org_id` em todos os joins

Cada `LEFT JOIN` inclui `... AND <table>.org_id = mc.org_id`. Isso:

1. Reduz o trabalho do planejador de query
2. Aproveita índices existentes (`idx_meta_insights_org_level_date`, `idx_leads_org_id`)
3. Mantém compatibilidade com RLS das tabelas base (AC3)

### `FILTER (WHERE ks.type = 'fechado')`

Aplica o filtro de stage somente ao agregado de receita. Leads em outros stages
ainda contam para `leads_in_crm`, mas não contribuem para `total_revenue`.

### Sem `SECURITY DEFINER`

Conforme AC3 (decisão de implementação): a view é simples, RLS das tabelas base
aplica-se automaticamente, e o cliente filtra `eq("org_id", appUser.org_id)` na
chamada `.from()`.

---

## 5. Idempotência

```sql
DROP VIEW IF EXISTS public.meta_campaign_roas;
CREATE OR REPLACE VIEW public.meta_campaign_roas AS ...;
```

O `DROP VIEW IF EXISTS` antes do `CREATE OR REPLACE` garante que mudanças de
assinatura (adição/remoção de colunas) não falhem em re-aplicações.
`CREATE OR REPLACE` sozinho falharia se as colunas mudassem.

---

## 6. Performance

A view não cria índices novos — os existentes cobrem os casos de uso:

| Acesso | Índice usado | Vem de |
|---|---|---|
| `mc` filtrado por `(org_id, meta_campaign_id)` | `idx_meta_campaigns_org_campaign_id` | migration 015 |
| `mid` filtrado por `(entity_id, level, org_id)` | `idx_meta_insights_org_level_date` + `idx_meta_insights_entity_date` | migration 015 |
| `l` filtrado por `org_id` | `idx_leads_org_id` | migration 001 |
| `l` filtrado por `stage_id` | `idx_leads_stage` | migration 001 |
| `us` filtrado por `lead_id` | (FK não indexado — ver risco abaixo) | — |
| `ks` lookup por PK | PK implícita | migration 001 |

### Risco residual: `unit_sales.lead_id` sem índice

A migration 007 não cria índice em `unit_sales(lead_id)`. Para o volume atual
(< 10k vendas) isso é tolerável; se virar gargalo, criar índice em migration
futura: `CREATE INDEX idx_unit_sales_lead ON unit_sales(lead_id);`. Não é
escopo desta story (epic é claro: "view não precisa criar índices se existentes
forem suficientes").

---

## 7. RLS

A view não tem RLS própria (views simples não suportam). A segurança vem das
tabelas base, todas com `ENABLE ROW LEVEL SECURITY`:

- `meta_campaigns` → policy `org_isolation` (migration 015)
- `meta_insights_daily` → policy `org_isolation` (migration 015)
- `leads` → policy `org_isolation_leads` (migration 004)
- `unit_sales` → policy `sales_select` (migration 007)
- `kanban_stages` → herda de migration 004

O cliente JS chama `.from("meta_campaign_roas").eq("org_id", X)`. O Postgres
expande para subqueries que respeitam RLS por `auth.uid() → user_org_id()`.

---

## 8. Rollback

Caso a view cause problemas em produção (performance, dados incorretos):

```sql
-- Rollback completo (volta ao estado pré-migration 016):
DROP VIEW IF EXISTS public.meta_campaign_roas;
```

Após rollback, o endpoint 16.9 volta a retornar `roas_summary: null` (fallback
gracioso já em produção). Zero impacto na UI exceto pelo card ROAS deixar de
exibir dados.

**Sem perda de dados**: a view é apenas uma agregação read-only. Nenhuma tabela
é modificada por esta migration.

---

## 9. Validação pós-deploy

1. `supabase db push` aplica sem erro
2. `SELECT * FROM meta_campaign_roas LIMIT 1` retorna sem erro de schema
3. Endpoint `GET /api/meta-ads/campaigns/[id]` passa a retornar `roas_summary` não-nulo
4. `EXPLAIN` da query principal mostra Index Scan, não Seq Scan
5. Re-aplicar migration: `supabase db push` reporta "no changes" ou aplica novamente sem erro

---

## 10. Aprovação

Plano aprovado pelo executor da story (@data-engineer / Dara) conforme regra
SQL Governance: "documentar primeiro em `docs/approved-plans/`, depois criar a
migration".
