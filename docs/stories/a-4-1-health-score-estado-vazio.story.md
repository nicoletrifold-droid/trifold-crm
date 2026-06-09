# Story A-4.1 — Health Score: estado vazio informativo no dashboard Meta Ads

**Status:** Done
**Epic:** A — Meta Ads Agent Data Foundation
**Criada por:** @sm (River)
**Data:** 2026-06-08

---

## Contexto

O dashboard de campanhas Meta Ads exibe um "Score de Saúde" (0–100) para cada
campanha baseado nos alertas ativos do dia (`active_alert_types`).

Problema: quando o cron `meta-ads-intelligence` ainda não rodou nenhum ciclo com
dados suficientes (ex: instalação recente, sem dados de ontem), a tabela
`meta_alerts` está vazia. Todas as campanhas mostram score **100** — o que
parece saudável mas na verdade significa "sem dados ainda".

O usuário vê 100/100 para tudo, filtra por "Com alertas" ou "Em risco" e não
entende por que está tudo zerado. Não há nenhum indicador de que o sistema ainda
não coletou dados de inteligência.

---

## User Story

> Como **gestor de tráfego**, quero saber se o score de saúde das campanhas
> está baseado em dados reais ou se o sistema ainda não rodou a análise, para
> não confundir "sem alertas = saudável" com "sem alertas = sem dados".

---

## Acceptance Criteria

### AC-1: Detectar se o sistema de alertas já tem dados
- [ ] A API `GET /api/meta-ads/campaigns` retorna um campo `alerts_initialized: boolean`
- [ ] `alerts_initialized = true` quando existe **ao menos 1 registro** em `meta_alerts`
  para a org nos últimos 7 dias
- [ ] `alerts_initialized = false` quando não há nenhum registro

### AC-2: Estado vazio informativo na lista de campanhas
- [ ] Quando `alerts_initialized = false`, o badge de Saúde exibe `—` (traço)
  em vez do score numérico, com tooltip: "Análise ainda não executada"
- [ ] Os filtros "Com alertas", "Em risco", "Candidatas a escalar" ficam
  **ocultos** (não renderizados) quando `alerts_initialized = false`
- [ ] Quando `alerts_initialized = true`, o comportamento atual permanece
  inalterado

### AC-3: Indicador de status na barra de filtros
- [ ] Quando `alerts_initialized = false`, exibir um aviso discreto abaixo dos
  filtros de saúde: "Análise de inteligência ainda não executada —
  scores disponíveis após o primeiro ciclo diário (11h BRT)"
- [ ] O aviso some quando `alerts_initialized = true`

### AC-4: Sem regressões
- [ ] Score numérico (verde/amarelo/vermelho) continua funcionando normalmente
  quando `alerts_initialized = true`
- [ ] Nenhuma mudança no cron ou na tabela `meta_alerts`

---

## Tarefas

- [x] T1: `GET /api/meta-ads/campaigns` — adicionar query para `alerts_initialized`
- [x] T2: `campaigns-meta-client.tsx` — badge `—` quando não inicializado
- [x] T3: `campaigns-meta-client.tsx` — filtros de saúde ocultos + aviso
- [x] T4: TypeScript 0 erros
- [x] T5: QA gate — PASS

---

## Arquivos Afetados

**Modificados:**
- `packages/web/src/app/api/meta-ads/campaigns/route.ts`
- `packages/web/src/app/dashboard/campaigns/meta/campaigns-meta-client.tsx`

---

## Notas Técnicas

- Query para `alerts_initialized`: `SELECT EXISTS (SELECT 1 FROM meta_alerts
  WHERE org_id = ? AND fired_date >= NOW() - INTERVAL '7 days')`
- Custo: 1 query extra no endpoint de campanhas (usa índice `idx_meta_alerts_org_date`)
- Tooltip no badge `—`: usar `title` HTML nativo (sem dependência extra)
- Mensagem sobre 11h BRT: hardcoded no componente (não configurável por ora)

---

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-06-08 | @sm (River) | Story criada a partir do backlog do @po (revisão retroativa Epics A–D) |
| 2026-06-08 | @po (Pax) | Validação GO (9.5/10) — AC-2 ajustado: filtros ocultos (não desabilitados). Status: Draft → Ready |
