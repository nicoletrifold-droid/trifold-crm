# Auditoria 76-2 — Uso dos Índices Meta nas Consultas do Agente (EXPLAIN)

> **Story:** 76-2 — Auditoria de Uso dos Índices Meta nas Consultas do Agente
> **Epic:** 76 — Proveniência e Performance dos Dados Meta Ads no Agente de Tráfego
> **Executor:** @data-engineer (Dara)
> **Data:** 2026-06-22
> **Projeto Supabase:** `dsopqkqjkmhytudaaolv` (PRODUÇÃO — único ambiente, sem staging isolado)

---

## TL;DR — Veredito Geral

**NENHUM gap comprovado. ZERO migrações novas.** Os índices das migrations 015, 075, 076 e 096 cobrem
corretamente os padrões de filtro/ordenação de todas as 4 consultas auditadas. Não há divergência de forma
de expressão (o ponto crítico R1 — índice parcial `idx_leads_metadata_ad_id` — está **alinhado** com a RPC 101).

Criar qualquer índice aqui violaria **CON-6** (redundância) e **Article IV (No Invention)**. A entrega legítima
desta auditoria é: **este relatório + nenhuma DDL**.

---

## ⚠️ Transparência metodológica — Executado vs. Inferido

Esta seção é **obrigatória** para honestidade do relatório (a story exige EXPLAIN ANALYZE real; documento o que
foi possível de fato).

### O que foi EXECUTADO de fato (dados reais de produção)
- **Cardinalidade real de todas as tabelas-alvo**, via PostgREST `Prefer: count=exact` com a service-role key
  contra `dsopqkqjkmhytudaaolv` (ver tabela "Cardinalidade Real" abaixo). Isso é o dado **mais importante** do
  audit, porque a decisão Seq Scan vs Index Scan do planner depende diretamente do tamanho da tabela (Risco R2).
- Leitura das definições exatas de índice (migrations 015/075/076/096) e das queries reais
  (`context-builder.ts`, RPCs 100/101/096).

### O que NÃO foi executado (e por quê)
- **`EXPLAIN (ANALYZE, BUFFERS)` real NÃO foi executado.** Dois caminhos foram tentados e ambos falharam:
  1. **Supabase Management API** (`POST /v1/projects/{ref}/database/query`) — o PAT em
     `~/.supabase/access-token` (`sbp_4681…`) retorna **`401 Unauthorized`**. O token expirou em 2026-06-21
     (registrado na memória do agente). Reautenticação (`supabase login`) é tarefa do operador humano / @devops.
  2. **PostgREST plan header** (`Accept: application/vnd.pgrst.plan`) — retorna **`PGRST107`**: a flag
     `db-plan-enabled` está **desligada em produção** (correto por segurança). Logo o PostgREST não expõe planos.
- Não há `psql` instalado nem `DATABASE_URL`/senha de pooler no ambiente — sem conexão direta possível.

### Consequência
Os **vereditos por target abaixo são INFERIDOS** a partir de: (a) definição exata do índice, (b) forma exata da
query, (c) cardinalidade real medida. Não são leituras de um plano real. **Onde o veredito diz “Index Scan
esperado a escala” vs “Seq Scan provável agora”, isso é uma previsão fundamentada, não um plano observado.**
O comando exato para confirmar com um PAT válido está na seção [Como Executar o EXPLAIN Real](#como-executar-o-explain-real).

---

## Cardinalidade Real (executado — 2026-06-22)

| Tabela | Linhas | Observação |
|--------|-------:|------------|
| `meta_insights_daily` (total) | **1.172** | campaign: 249 · adset: 423 · ad: 500 |
| `meta_insights_placement_daily` | **0** | tabela **vazia** (sync de placement sem dados ainda) |
| `meta_ads` | 581 | |
| `meta_campaigns` | 102 | |
| `leads` (total) | 1.063 | |
| `leads` com `metadata->>'ad_id'` IS NOT NULL | **140** | universo do índice parcial `idx_leads_metadata_ad_id` |
| `kanban_stages` | 14 | |

**Implicação central:** todas são **tabelas pequenas** (≤ ~1,2k linhas, cabendo em dezenas de páginas de heap).
Nessa escala, o planner do PostgreSQL **legitimamente prefere Seq Scan** para predicados pouco seletivos —
ler a tabela inteira sequencialmente é mais barato que descer um índice + heap-fetch. **Isso é o comportamento
correto e ÓTIMO (Risco R2), não um gap.** Os índices existentes são investimento para crescimento futuro
(dezenas de milhares de linhas), quando o planner migrará automaticamente para Index Scan sem nenhuma mudança
de schema.

---

## Índices Existentes (inventário — não recriar, CON-6)

```sql
-- migration 015 (meta_insights_daily)
UNIQUE (org_id, level, entity_id, date)          -- idx implícito p/ lookup exato
idx_meta_insights_org_level_date (org_id, level, date DESC)
idx_meta_insights_entity_date    (entity_id, date DESC)

-- migration 096 (meta_insights_daily) — adicionado pela Story 52-1
idx_meta_insights_org_level_entity (org_id, level, entity_id)

-- migration 076 (meta_insights_placement_daily)
idx_meta_placement_org_date  (org_id, date DESC)
idx_meta_placement_campaign  (campaign_id, date DESC)

-- migration 075 (leads) — índice de EXPRESSÃO PARCIAL
idx_leads_metadata_ad_id  ((metadata->>'ad_id'))  WHERE (metadata->>'ad_id') IS NOT NULL

-- migration 096 (leads) — adicionado pela Story 52-1
idx_leads_org_utm   (org_id, utm_campaign, utm_source)
idx_leads_org_stage (org_id, stage_id)
```

---

## Auditoria por Target

### AC1 — `context-builder.ts` sobre `meta_insights_daily`

Duas formas relevantes da query no código:

**(a) Portfólio global — `buildGlobalContext` (linhas 217-223):**
```sql
SELECT entity_id, spend, leads, landing_page_views, outbound_clicks
FROM   meta_insights_daily
WHERE  org_id = $1 AND level = 'campaign'
   AND date >= $2 AND date <= $3;     -- janela default 30d
```
- **Índice ideal:** `idx_meta_insights_org_level_date (org_id, level, date DESC)` — cobre exatamente
  `org_id =` + `level =` + range de `date`. Forma das colunas idêntica (sem cast).
- **Cardinalidade:** 249 linhas em `level='campaign'`.
- **Veredito (inferido):** **USANDO_INDICE (a escala) / Seq Scan provável agora.** O índice é o correto;
  com 249 linhas o planner provavelmente faz Seq Scan + Filter (ótimo). Sem gap — nenhum índice ajudaria
  a 249 linhas mais que um seq scan.

**(b) Campanha específica — `buildCampaignContext` (linhas 391-398):**
```sql
SELECT date, spend, impressions, ... , landing_page_views
FROM   meta_insights_daily
WHERE  org_id = $1 AND level = 'campaign' AND entity_id = $2
   AND date >= $3
ORDER BY date DESC;
```
- **Índice ideal:** o `UNIQUE (org_id, level, entity_id, date)` cobre o predicado de igualdade completo
  + range de `date` + a ordenação `ORDER BY date DESC` (prefixo perfeito). Alternativamente
  `idx_meta_insights_entity_date (entity_id, date DESC)`.
- **Veredito (inferido):** **USANDO_INDICE (a escala).** Query mais seletiva (uma campanha) → mais propensa a
  Index Scan mesmo em volume baixo, e a ordenação já é coberta (sem Sort). Sem gap.

> **Observação lateral (fora dos 4 alvos):** a query de proveniência da Story 76-1 (`context-builder.ts:238`)
> faz `... level='campaign' AND date range ORDER BY synced_at DESC LIMIT 1`. Não há índice em `synced_at`
> (coluna criada na migration 045). É um **Sort de ≤249 linhas já filtradas** → custo trivial. **Não é gap**
> e não justifica índice (Article IV). Registrado apenas para rastreabilidade.

---

### AC2 — RPC `creative_performance` (migration 101, que substituiu a 100)

```sql
FROM   meta_ads a
JOIN   meta_insights_daily i
       ON i.entity_id = a.meta_ad_id AND i.org_id = a.org_id
       AND i.level = 'ad' AND i.date >= (CURRENT_DATE - p_days)
... + 3 subqueries correlacionadas de ranking, cada uma:
  WHERE i2.entity_id = a.meta_ad_id AND i2.org_id = a.org_id
    AND i2.level = 'ad' AND i2.date >= (CURRENT_DATE - p_days)
  ORDER BY i2.date DESC LIMIT 1
GROUP BY a.meta_ad_id, ...
```
- **Driver:** `meta_ads` filtrada por `org_id` (581 linhas; `idx_meta_ads_org_status` cobre `org_id`).
- **Join + subqueries de ranking:** o ponto mais sensível a índice são as **3 subqueries correlacionadas**
  (`entity_id =` + `date` range + `ORDER BY date DESC LIMIT 1`). O índice
  `idx_meta_insights_entity_date (entity_id, date DESC)` serve esse padrão **perfeitamente** (igualdade no
  prefixo + ordenação descendente coberta → Index Scan ... LIMIT 1 sem Sort).
- **Cardinalidade:** 500 linhas em `level='ad'`, 581 ads.
- **Veredito (inferido):** **USANDO_INDICE (a escala) / parcialmente Seq Scan agora.** Índices corretos
  para todos os acessos. Sem gap.
- **Nota de design (NÃO é índice):** 3 subqueries correlacionadas por grupo é um padrão O(grupos×lookups).
  A própria migration 101 já documenta “otimizar com DISTINCT ON/window se necessário”. Isso é refactor de
  **query** (futuro, se o custo crescer), **não** um índice faltante. Fora de escopo desta story (AC focado
  em uso de índice).

---

### AC3 — RPC `creative_performance_with_crm` (migration 101) — foco em `metadata->>'ad_id'`

Este é o alvo de maior risco (R1). Comparação literal:

| | Expressão |
|---|---|
| **Índice (075)** | `((metadata->>'ad_id'))  WHERE (metadata->>'ad_id') IS NOT NULL` |
| **Join na RPC (101:122)** | `LEFT JOIN leads l ON (l.metadata->>'ad_id') = a.meta_ad_id AND l.org_id = a.org_id` |

- **Forma idêntica:** operador `->>` puro, **sem `CAST`, sem `->`**. A expressão do join bate exatamente
  com a expressão do índice. ✅ **R1 mitigado — não há divergência de forma.**
- **Predicado parcial satisfazível:** o índice é parcial (`WHERE … IS NOT NULL`). A condição de igualdade
  `(l.metadata->>'ad_id') = a.meta_ad_id` **implica** `IS NOT NULL`, então o planner **pode** usar o índice
  parcial (predicado provado pela igualdade). ✅
- **Cardinalidade:** só **140 de 1.063** leads têm `ad_id` (índice parcial cobre 140 linhas). Driver do join
  é `meta_ads` (581). O planner provavelmente escolhe **Hash Left Join** com Seq Scan em `leads`
  (1.063 linhas cabem em poucas páginas; hash de 140 chaves é barato) em vez de Nested Loop + index lookup.
- **Veredito (inferido):** **USANDO_INDICE (a escala) — sem gap, sem divergência de forma.** A escala atual
  favorece Hash Join (ótimo); o índice parcial está disponível e correto para quando Nested Loop for vantajoso.
  **Nenhum ajuste de RPC necessário** (R1 não se concretizou — a forma já está certa).

---

### AC4 — RPC `pipeline_funnel_by_campaign` (migration 096, Story 52-1)

```sql
-- lead_stage: leads l LEFT JOIN kanban_stages ks ON ks.id = l.stage_id  WHERE l.is_active
-- type_thresholds: kanban_stages GROUP BY org_id, type
-- campaign_spend: meta_campaigns mc JOIN meta_insights_daily mid
--    ON mid.org_id=mc.org_id AND mid.level='campaign'
--    AND mid.entity_id=mc.meta_campaign_id AND mid.date >= (current_date - p_days)
-- WHERE user_role()='admin' AND org_id = user_org_id()
```
- **`leads` scan:** filtrado por `is_active` + (no WHERE final) `org_id`. `idx_leads_org_stage`/`idx_leads_org_utm`
  cobrem `org_id`; agregação por `utm_*`. A 1.063 linhas → Seq Scan + HashAggregate provável (ótimo).
- **`campaign_spend` join:** `meta_insights_daily` por `org_id` + `level='campaign'` + `entity_id` + range de
  `date`. Coberto por `idx_meta_insights_org_level_entity (org_id, level, entity_id)` (096) e/ou
  `idx_meta_insights_org_level_date`. ✅
- **`kanban_stages`:** 14 linhas — sempre Seq Scan (trivial).
- **Veredito (inferido):** **USANDO_INDICE (a escala).** Todos os predicados de join têm índice de suporte.
  Em volume atual, mistura de Seq Scan/Hash é esperada e ótima. Sem gap.

> **Nota — query do `context-builder` sobre `meta_insights_placement_daily` (linhas 420-426):** a tabela está
> **vazia (0 linhas)**. Qualquer plano sobre ela é trivial. Os índices `idx_meta_placement_campaign`/
> `idx_meta_placement_org_date` estão prontos para quando o sync de placement começar a popular dados.

---

## Resumo dos Vereditos

| Target | Índice esperado | Veredito | Gap? |
|--------|-----------------|----------|:----:|
| AC1a — global `meta_insights_daily` | `idx_meta_insights_org_level_date` | USANDO_INDICE (a escala) / Seq Scan ótimo agora | ❌ Não |
| AC1b — campanha `meta_insights_daily` | `UNIQUE(org_id,level,entity_id,date)` | USANDO_INDICE (a escala) | ❌ Não |
| AC2 — `creative_performance` | `idx_meta_insights_entity_date` | USANDO_INDICE (a escala) | ❌ Não |
| AC3 — `creative_performance_with_crm` (`ad_id`) | `idx_leads_metadata_ad_id` (parcial) | USANDO_INDICE — **forma alinhada** (R1 mitigado) | ❌ Não |
| AC4 — `pipeline_funnel_by_campaign` | `idx_meta_insights_org_level_entity` | USANDO_INDICE (a escala) | ❌ Não |

---

## Índices Novos Criados

**Nenhum.** Não há gap comprovado. Criar índice aqui violaria CON-6 e Article IV. AC6 satisfeito com **zero DDL**.
(AC7 e AC8 são condicionais à criação de migration → **N/A**.)

---

## Conclusão

1. Os índices das migrations **015, 075, 076 e 096 cobrem corretamente** todos os padrões de filtro,
   ordenação e join das 4 consultas auditadas. **Não são redundantes** e devem ser **mantidos**.
2. Na cardinalidade atual (tabelas ≤ ~1,2k linhas), o planner **provavelmente prefere Seq Scan** em vários
   desses acessos — e isso é **ótimo e correto** (R2), não um problema. Os índices rendem retorno quando as
   tabelas crescerem; a transição para Index Scan será automática.
3. O risco principal (R1 — divergência de forma no índice parcial de `ad_id`) **não se materializou**: a RPC
   101 usa `(metadata->>'ad_id')` exatamente como o índice. **Nenhum ajuste de RPC necessário.**
4. **Entrega final: relatório + zero migrações.** Auditoria concluída sem violar No Invention.

### Pendência para fechamento pleno dos ACs (handoff)
Os vereditos acima são **fundamentados mas inferidos** — falta confirmá-los com `EXPLAIN (ANALYZE, BUFFERS)`
real. Isso requer **um PAT Supabase válido** (o atual expirou) ou ativar `db-plan-enabled` temporariamente.
**Ação:** @devops/operador roda `supabase login` (renova `~/.supabase/access-token`) e então executa os
comandos da seção seguinte; cola a saída neste relatório para promover os vereditos de “inferido” → “confirmado”.

---

## Como Executar o EXPLAIN Real

Após renovar o PAT (`supabase login`), rodar **cada** statement como um POST isolado na Management API
(substituir `$ORG` por `00000000-0000-0000-0000-000000000001`, o org de produção com dados):

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.supabase/access-token'))['access_token'])")
REF=dsopqkqjkmhytudaaolv
run() { curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary @"$1"; echo; }
```

**AC1a** — `context-builder` global:
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT entity_id, spend, leads, landing_page_views, outbound_clicks
FROM meta_insights_daily
WHERE org_id = '00000000-0000-0000-0000-000000000001'
  AND level = 'campaign'
  AND date >= (CURRENT_DATE - 30) AND date <= CURRENT_DATE;
```

**AC1b** — `context-builder` campanha (trocar `<META_CAMPAIGN_ID>` por um real):
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT date, spend, impressions, reach, clicks, ctr, cpm, frequency, leads, outbound_clicks, landing_page_views
FROM meta_insights_daily
WHERE org_id = '00000000-0000-0000-0000-000000000001'
  AND level = 'campaign' AND entity_id = '<META_CAMPAIGN_ID>'
  AND date >= (CURRENT_DATE - 30)
ORDER BY date DESC;
```

**AC2/AC3** — RPCs (rodar como o role do caller exige RLS; via Management API roda como superuser/postgres, então
as funções SECURITY INVOKER avaliam `user_org_id()`/`is_admin_or_supervisor()` como NULL → 0 linhas. Para um
plano representativo, **inline** o corpo da função substituindo os predicados de segurança por literais):
```sql
-- creative_performance_with_crm (corpo inline, foco no join de ad_id):
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT a.meta_ad_id, COUNT(DISTINCT l.id)
FROM meta_ads a
JOIN meta_insights_daily i
     ON i.entity_id = a.meta_ad_id AND i.org_id = a.org_id
     AND i.level = 'ad' AND i.date >= (CURRENT_DATE - 30)
LEFT JOIN leads l
     ON (l.metadata->>'ad_id') = a.meta_ad_id AND l.org_id = a.org_id
LEFT JOIN kanban_stages ks ON ks.id = l.stage_id
WHERE a.org_id = '00000000-0000-0000-0000-000000000001'
GROUP BY a.meta_ad_id;
-- Verificar no plano: uso de idx_leads_metadata_ad_id (ou Hash Join com Seq Scan em leads — ambos OK a esta escala).
```

**AC4** — inline do `campaign_spend` CTE (parte index-sensível):
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT mc.org_id, lower(trim(mc.name)), SUM(mid.spend)
FROM meta_campaigns mc
JOIN meta_insights_daily mid
  ON mid.org_id = mc.org_id AND mid.level = 'campaign'
 AND mid.entity_id = mc.meta_campaign_id AND mid.date >= (CURRENT_DATE - 30)
WHERE mc.org_id = '00000000-0000-0000-0000-000000000001' AND mc.name IS NOT NULL
GROUP BY mc.org_id, lower(trim(mc.name));
```

**Critério de gap (só então criar migration 106):** Seq Scan em tabela que à época já tenha **> ~10k linhas
com predicado seletivo**, **Sort não coberto** pelo índice numa query quente, ou heap-fetch excessivo pedindo
índice de cobertura (`INCLUDE`). Nada disso é esperado na cardinalidade atual.
</content>
</invoke>
