# Plano de Ação — Epic 51 Google Ads Marketing API

**Status:** Ready to execute (após @po validar stories)
**Owner global:** @pm (Morgan)
**Data:** 2026-06-08
**Estimativa total:** ~17h dev + 1-3 dias latência externa (Developer Token Google)

---

## Driving Question

> "Quanto gastamos no Google Ads na semana 01-07/06/2026?"

Hoje não conseguimos responder porque a integração não existe. Este epic resolve isso de forma permanente: spend diário de campanhas Google Ads visível no CRM, via query SQL ou UI.

---

## Quadro de Stories

| # | Story | Owner | Estimativa | Status | Depende de | Bloqueia |
|---|---|---|---|---|---|---|
| **51-0** | Setup Externo (Developer Token + OAuth App) | lucas@trifold.eng.br | 1h + 1-3d latência | Draft | — | 51-4 (produção), 51-2 (produção) |
| **51-1** | Schema Postgres + Auth Storage | @data-engineer | 3h | Draft | — | 51-4, 51-2, 51-3 |
| **51-4** | Fluxo OAuth UI (Conectar Conta) | @dev | 6h | Draft | 51-1, 51-0* | 51-2 e 51-3 (end-to-end real) |
| **51-2** | Cron Sync Diário de Insights | @dev | 5h | Draft | 51-1, 51-4 | 51-3 (dados reais) |
| **51-3** | UI de Spend + Substituir Placeholder | @dev | 3h | Draft | 51-1 (seed OK para dev) | — |

_* 51-4 pode ser desenvolvida sem 51-0 usando `.env.local` manual; 51-0 bloqueia apenas deploy em produção._

**Total dev estimado: 17h** (3 + 6 + 5 + 3)

---

## Linha do Tempo Recomendada

```
Dia 0  (hoje)  lucas@      Inicia Story 51-0 (solicita Developer Token + cria OAuth App)
               @po          Valida stories 51-0, 51-1, 51-2, 51-3, 51-4 em paralelo

Dia 1          @data-eng   Implementa Story 51-1 (schema, ~3h)
               lucas@      Completa OAuth App (client_id + client_secret) — sem esperar token

Dia 2-3        @dev        Implementa Story 51-4 (OAuth UI, ~6h) — pode usar .env.local
               @dev        Implementa Story 51-3 (UI spend, ~3h) — usando seed SQL em paralelo

Dia 3-4        @dev        Implementa Story 51-2 (cron sync, ~5h)
               lucas@      Developer Token aprovado (esperado Dia 1-3)

Dia 4-5        @qa         Quality gates: 51-1 → 51-4 → 51-2 → 51-3

Dia 5          @devops     Push + deploy de cada story após QA PASS

Dia 5-12       monitoring  Cron diário monitorado por 7 dias (meta: 0 falhas críticas)
```

**Paralelização disponível:**
- 51-3 pode rodar em paralelo a 51-4 (usa seed SQL, não depende de OAuth funcionando)
- 51-2 e 51-4 podem ser implementadas em paralelo por devs diferentes (mesmo schema 51-1)
- QA gates podem ser feitos em paralelo se implementações completarem juntas

---

## Marcos / Milestones

| Marco | Dia | Responsável | Critério |
|-------|-----|------------|---------|
| **M0 — Setup iniciado** | Dia 0 | lucas@ | Pedido de Developer Token submetido ao Google; OAuth App criado |
| **M1 — Stories validadas** | Dia 1 | @po | GO em todas as 5 stories (ou action items documentados) |
| **M2 — Schema deployado** | Dia 2 | @data-engineer | Migration 076 aplicada em staging; RLS verificada |
| **M3 — Developer Token aprovado** | Dia 1-3 | Google (externo) | `GOOGLE_ADS_DEVELOPER_TOKEN` disponível no Vercel |
| **M4 — OAuth funcionando** | Dia 3-4 | @dev | Admin consegue conectar conta real via UI; `google_ads_config.status = 'connected'` no banco |
| **M5 — Primeiro sync real** | Dia 4-5 | @dev | Cron executado manualmente com dados reais; `google_ads_insights_daily` populado |
| **M6 — UI live** | Dia 5 | @dev | Placeholder "Em breve" removido; `/dashboard/campaigns/google` acessível com dados |
| **M7 — Deploy prod** | Dia 5-6 | @devops | Push de todas stories; monitoring ativo |
| **M8 — DoD completo** | Dia 12 | @pm | Cron rodando ≥7 dias sem falhas críticas; pergunta original respondida |

---

## Plan B — Se Developer Token Demorar > 5 Dias Úteis

O Google pode levar até 5 dias úteis para aprovar Basic Access (raro, mas possível).

**Ação imediata se atingir 5 dias úteis:**
1. @dev usa seed SQL para destravar Story 51-3 (UI funcional com dados fictícios)
2. Story 51-2 fica em estado "Implementada, aguardando token" — não marca Done
3. Story 51-4 continua (OAuth UI não depende do token, só de `client_id`+`client_secret`)
4. @pm reavalia prioridade: se > 10 dias úteis, pausar epic e priorizar outro trabalho no backlog

**Seed SQL para Story 51-3:**
```sql
-- Executar em staging após Story 51-1 aplicada
INSERT INTO google_ads_insights_daily
  (org_id, level, entity_id, date, spend, impressions, clicks, ctr, cpc, conversions)
VALUES
  ('{org_id_real}', 'campaign', '111222333444', CURRENT_DATE - 1, 450.00, 18500, 210, 0.0113, 2.14, 7),
  ('{org_id_real}', 'campaign', '555666777888', CURRENT_DATE - 1, 230.50, 9200, 145, 0.0157, 1.59, 3);

INSERT INTO google_ads_campaigns
  (org_id, google_campaign_id, name, status, synced_at)
VALUES
  ('{org_id_real}', '111222333444', 'Campanha Imóveis - Busca', 'ENABLED', NOW()),
  ('{org_id_real}', '555666777888', 'Campanha Lançamento Yarden', 'PAUSED', NOW());
```

---

## Riscos e Mitigações (Top 5)

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R1 | Developer Token não aprovado em 5 dias | Baixa (Basic Access geralmente rápido) | Alto (bloqueia cron real) | Plan B (seed SQL) + Lucas@ monitorar status diariamente |
| R2 | Conflito de numeração de migration | Baixa (verificar `ls supabase/migrations/` antes) | Médio (bloqueia CI) | Confirmar numeração antes de criar 076 — padrão estabelecido |
| R3 | OAuth callback URL errada em produção | Média (URIs devem bater exatamente) | Médio (bloqueia Story 51-4 em produção) | Configurar ambos localhost e prod no Google Cloud Console desde o início |
| R4 | `refresh_token` em plaintext vazado | Baixa (acesso restrito ao banco) | Alto (comprometeria conta Google Ads) | Débito técnico documentado; RLS garante isolamento por org; não logar em produção |
| R5 | `customer_id` com hífens na URL da API | Certeza (é gotcha documentado) | Baixo (trivial de corrigir) | Dev Notes de 51-2 já documenta: `customerId.replace(/-/g, '')` antes de usar na URL |

---

## Definition of Done do Epic

- [ ] Todas 5 stories com status **Done** (51-0, 51-1, 51-4, 51-2, 51-3)
- [ ] Placeholder "Em breve" removido de `dashboard/configuracoes/integracoes` (Story 51-3)
- [ ] Admin de org consegue conectar conta Google Ads via OAuth UI (Story 51-4)
- [ ] Cron diário rodando há ≥7 dias com 0 falhas críticas (Story 51-2)
- [ ] Query SQL `SELECT SUM(spend) FROM google_ads_insights_daily WHERE date BETWEEN '2026-06-01' AND '2026-06-07'` retorna dados reais
- [ ] Pergunta original respondida: "Quanto gastamos no Google Ads na semana 01-07/06/2026?"
- [ ] QA gate PASS (ou CONCERNS documentados) em todas as stories técnicas
- [ ] @devops fez push + confirmou deploy em produção

---

## Próximas Ações (em ordem de execução)

### Agora (Dia 0)

1. **lucas@ → Story 51-0:** Submeter pedido de Developer Token no Google Ads Manager Account → API Center. Criar OAuth App no Google Cloud Console. Não esperar — fazer hoje.
2. **@po → Validar stories:** Executar `*validate` em 51-0, 51-1, 51-4, 51-2, 51-3. Podem ser em paralelo.

### Após M1 (stories validadas)

3. **@data-engineer → Story 51-1:** Implementar migration `076_google_ads_schema.sql`. Prioridade máxima — desbloqueia tudo.
4. **@dev → Story 51-4 (paralelo a 51-1):** Pode iniciar planejamento; aguardar 51-1 Done para testar localmente.
5. **@dev → Story 51-3 (paralelo a 51-4):** Pode implementar UI com seed SQL enquanto OAuth não está pronto.

### Após M2 (schema deployado)

6. **@dev → Story 51-4:** Implementar fluxo OAuth UI completo.
7. **@dev → Story 51-2:** Implementar cron sync (pode rodar em paralelo a 51-4 com mock de resposta GAQL).

### Após M3 + M4 (token aprovado + OAuth funcionando)

8. **Teste end-to-end:** Executar cron manualmente e verificar dados em `google_ads_insights_daily`.
9. **@qa → Quality gates:** 51-1, 51-4, 51-2, 51-3 em sequência.
10. **@devops → Push + monitoring:** Deploy de cada story após QA PASS. Monitorar cron por 7 dias.

---

## Referências

| Documento | Path |
|-----------|------|
| Epic original | `docs/stories/epics/epic-51-google-ads-marketing-api.md` |
| PM Review | `docs/stories/epics/epic-51-pm-review.md` |
| Story 51-0 | `docs/stories/51-0-google-ads-setup-externo.story.md` |
| Story 51-1 | `docs/stories/51-1-google-ads-schema-and-auth.story.md` |
| Story 51-2 | `docs/stories/51-2-google-ads-sync-insights.story.md` |
| Story 51-3 | `docs/stories/51-3-google-ads-spend-ui.story.md` |
| Story 51-4 | `docs/stories/51-4-google-ads-oauth-ui.story.md` |
| Padrão Meta Ads | `supabase/migrations/015_meta_marketing_api.sql` |

---

_Gerado por @sm (River) em 2026-06-08 — após PM review com veredicto NEEDS_CHANGES (AI-1 a AI-15 aplicados)._
