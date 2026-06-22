# PO Validation — Epic 51 Google Ads Marketing API

**Reviewer:** @po (Pax — Balancer)
**Date:** 2026-06-08
**Method:** AIOS 10-point checklist por story (`.claude/rules/story-lifecycle.md`)
**Stories revisadas:** 51-0, 51-1, 51-2, 51-3, 51-4 (v0.2 pós-PM review)
**Overall verdict:** **ALL GO** — 5 de 5 stories aprovadas, status atualizado Draft → Ready em todas

---

## Resumo Executivo

| Story | Título | Owner | Score | Verdict | Status |
|-------|--------|-------|-------|---------|--------|
| **51-0** | Setup Externo (Developer Token + OAuth App) | lucas@ (humano) | **10/10** | GO | Draft → Ready |
| **51-1** | Schema Postgres + Auth Storage | @data-engineer | **10/10** | GO | Draft → Ready |
| **51-2** | Cron Sync Diário | @dev | **10/10** | GO | Draft → Ready |
| **51-3** | UI Spend + Substituir Placeholder | @dev | **9/10** | GO (com nota) | Draft → Ready |
| **51-4** | Fluxo OAuth UI | @dev | **10/10** | GO | Draft → Ready |

**Total:** 5/5 GO. AI-1 a AI-13 e AI-15 confirmados aplicados. Único gap residual é AI-14 (non-blocking, registrado abaixo).

---

## Story 51-0 — Setup Externo (Developer Token + OAuth App)

**Path:** `docs/stories/51-0-google-ads-setup-externo.story.md`
**Executor:** lucas@trifold.eng.br (humano, não é code work) | **Quality Gate:** N/A (verificação manual)

### Checklist 10-point (adaptado para story não-técnica)

| # | Critério | Status | Observação |
|---|----------|--------|------------|
| 1 | Clear and objective title | ✓ | "Setup Externo (Developer Token + OAuth App)" — escopo evidente no título |
| 2 | Complete description | ✓ | Context section explica WHY (blocker externo crítico) e quem executa (humano) |
| 3 | Testable acceptance criteria | ✓ | DoD funciona como AC para story humana: 6 critérios verificáveis (token aprovado, env vars no Vercel, doc publicado, escopo OAuth ativo). Cada item é objetivamente checável |
| 4 | Well-defined scope (IN/OUT) | ✓ | IN: T1-T5 explícitos. OUT implícito mas claro: não há code work (executor humano) |
| 5 | Dependencies mapped | ✓ | "Depende de: nenhuma. Bloqueia: 51-4 (env vars), 51-2 prod (developer token)" |
| 6 | Complexity estimate | ✓ | XS (~1h trabalho efetivo + 1-3d latência Google) — adaptação correta para story humana |
| 7 | Business value | ✓ | Desbloqueia todo Epic 51; sem ele, 51-2 não funciona em produção |
| 8 | Risks documented | ✓ | R1 (timeout > 5d), R2 (Google exige Standard Access), R3 (redirect URI errado) + critério de escalação ("5 dias úteis → @pm") |
| 9 | Criteria of Done | ✓ | 6 itens DoD objetivamente verificáveis |
| 10 | Alignment with PRD/Epic | ✓ | Materializa AI-1 do PM review. Resolve "External Blocker" do epic seção dedicada |

**Score:** 10/10
**Verdict:** **GO**
**Status updated:** Draft → Ready (v0.3 logada no Change Log)
**Notas:** Story não-técnica corretamente adaptada — executor humano, DoD substitui AC formal, sem QA gate (verificação manual). Documenta timeout (5 dias úteis) e Plan B alinhado com epic.

---

## Story 51-1 — Schema Postgres + Auth Storage

**Path:** `docs/stories/51-1-google-ads-schema-and-auth.story.md`
**Executor:** @data-engineer (Dara) | **Quality Gate:** @dev (Dex)

### Checklist 10-point

| # | Critério | Status | Observação |
|---|----------|--------|------------|
| 1 | Clear and objective title | ✓ | Título objetivo, escopo SQL/RLS evidente |
| 2 | Complete description | ✓ | User Story + Context explicam o WHY (fundação do epic); diferenças Google vs Meta (OAuth vs System User Token) e hierarquia MCC documentadas |
| 3 | Testable acceptance criteria | ✓ | AC1-AC10 todos verificáveis: migration aplica sem erro, tabelas têm os campos exatos listados, UNIQUE constraints, RLS habilitada, índices criados, idempotência via `IF NOT EXISTS` |
| 4 | Well-defined scope (IN/OUT) | ✓ | IN: T1-T4 + ACs. OUT: "Não é escopo desta story" lista Testes API (51-2), Testes UI (51-3) explicitamente |
| 5 | Dependencies mapped | ✓ | "Depende de: nada (fundacional). Bloqueia: 51-2, 51-3" — também documenta blocker externo (Developer Token) como contexto paralelo |
| 6 | Complexity estimate | ✓ | M (~5h). Pequena divergência com epic (~3h), mas estimativa de story é mais precisa e M é razoável para schema + RLS + 4 tabelas |
| 7 | Business value | ✓ | Fundacional: sem schema, nada do epic acontece. Isolamento por org (RLS) atende requisito multi-tenant |
| 8 | Risks documented | ✓ | R1 (token), R2 (coluna existente), R3 (numeração migration) — R3 especialmente relevante pelo histórico recente (074 conflict) |
| 9 | Criteria of Done | ✓ | 6 itens DoD claros: ACs done, migration aplica, idempotência confirmada, RLS verificada, QA gate, devops push |
| 10 | Alignment with PRD/Epic | ✓ | AC2-AC5 espelham exatamente tabelas listadas no epic ("Schema Google Ads Insights"). Plaintext debt (AC8) e COMMENT ON COLUMN (AC10) materializam AI-10/AI-11/AI-12 |

**Score:** 10/10
**Verdict:** **GO**
**Status updated:** Draft → Ready (v0.3 logada no Change Log)
**Notas:**
- AC10 reescrito corretamente (AI-11): era "TypeScript compila" (redundante para story SQL-only), agora é "`COMMENT ON COLUMN organizations.google_ads_config IS '{shape}'` + handoff de tipos para @dev". Verificado em linha 64 da story.
- AC8 (AI-10) documenta explicitamente débito técnico de plaintext: "decisão consciente aceita para MVP, revisão via story futura de encryption-at-rest". Verificado em linha 62.
- T2.2/T2.3 (AI-12) adicionam `COMMENT ON COLUMN` + comentário TODO de encryption. Verificado em linhas 80-81.

---

## Story 51-2 — Cron Sync Diário de Insights

**Path:** `docs/stories/51-2-google-ads-sync-insights.story.md`
**Executor:** @dev (Dex) | **Quality Gate:** @qa (Quinn)

### Checklist 10-point

| # | Critério | Status | Observação |
|---|----------|--------|------------|
| 1 | Clear and objective title | ✓ | "Cron Sync Diário de Insights" — escopo cirúrgico |
| 2 | Complete description | ✓ | User Story conecta com driving question ("quanto gastamos no Google Ads na semana X?"); Context técnico completo: GAQL via searchStream, obtenção de access_token via refresh_token, convenção micros |
| 3 | Testable acceptance criteria | ✓ | AC1-AC11 todos testáveis. AC5 corrigido (AI-3): `WHERE segments.date = '{YYYY-MM-DD}'` no lugar de `date_preset` (GAQL não suporta). AC6 crava `average_cpc` em micros (AI-4). AC7 testa idempotência via onConflict. AC9 confirma comportamento Vercel (HTTP 200 em erro) |
| 4 | Well-defined scope (IN/OUT) | ✓ | IN: T1-T6 (auth util, REST client, query, handler, vercel.json, QA). OUT explícito: "Testes de UI (Story 51-3)", "Sync ad_group/ad" — limites claros |
| 5 | Dependencies mapped | ✓ | "Depende de: 51-1. Bloqueia: 51-3 (dados)" — também referencia 51-0 como blocker externo via R1 |
| 6 | Complexity estimate | ✓ | M (~6h) — coerente com 4 arquivos novos + integração API externa |
| 7 | Business value | ✓ | Responde diretamente à pergunta de negócio que originou o epic; sem este cron, dados não fluem |
| 8 | Risks documented | ✓ | R1-R5 + R4 explicitamente encerrado ("RESOLVIDO: average_cpc em micros"). R5 trata caso config NULL via critério de query — robustez |
| 9 | Criteria of Done | ✓ | 7 itens DoD claros: ACs, typecheck/lint, cron executado manualmente, log success, idempotência, QA gate, devops push |
| 10 | Alignment with PRD/Epic | ✓ | Materializa AI-3 (date_preset), AI-4 (average_cpc), AI-5 (upsert campaigns), AI-6 (fonte canônica). T4.7 (upsert leve em google_ads_campaigns) resolve o gap crítico identificado pelo PM (51-3 mostraria IDs em vez de nomes) |

**Score:** 10/10
**Verdict:** **GO**
**Status updated:** Draft → Ready (v0.3 logada no Change Log)
**Notas:**
- Cross-check AI-3 (AC5 sem `date_preset`): grep no arquivo confirma AC5 usa `WHERE segments.date = '{YYYY-MM-DD de ontem em UTC}'` com cálculo server-side documentado. Nenhuma menção residual a `date_preset` no escopo da story (apenas no Change Log e R4, ambos corretos).
- Cross-check AI-6 (fonte canônica): AC3, T4.3 e Dev Notes ("Fonte canônica de conta conectada") todos alinhados em `organizations.google_ads_config IS NOT NULL AND google_ads_config->>'status' = 'connected'`. Consistência total.
- Cross-check AI-5 (upsert campaigns): T4.7 e tabela de mapeamento GAQL→DB documentam upsert leve com `onConflict: 'org_id,google_campaign_id'`. Permite Story 51-3 exibir nomes em vez de IDs.

---

## Story 51-3 — UI de Spend + Substituição do Placeholder

**Path:** `docs/stories/51-3-google-ads-spend-ui.story.md`
**Executor:** @dev (Dex) | **Quality Gate:** @qa (Quinn)

### Checklist 10-point

| # | Critério | Status | Observação |
|---|----------|--------|------------|
| 1 | Clear and objective title | ✓ | "UI de Spend + Substituição do Placeholder" — duas entregas explicitadas |
| 2 | Complete description | ✓ | Context inclui código exato do placeholder (linhas 200-216) e referência ao padrão Meta. Boa precisão cirúrgica |
| 3 | Testable acceptance criteria | ✓ | AC1-AC8 testáveis. AC1 inclui botão "Conectar conta Google Ads" (AI-7 ✓). AC2 usa fonte canônica `google_ads_config.status='connected'` (AI-6 ✓). AC6 crava formatação BRL. AC8 crava menu lateral (AI-13 ✓) |
| 4 | Well-defined scope (IN/OUT) | ✓ | IN: T1-T5. OUT: "Não é escopo" (testes API, OAuth UI) implícito via dependência em 51-4 |
| 5 | Dependencies mapped | ✓ | "Depende de: 51-2 (dados), 51-1 (schema), 51-4 (rota OAuth linkada em AC1) — 51-4 adicionada via AI-7" — agora completo |
| 6 | Complexity estimate | ✓ | M (~5h) — coerente com 4 arquivos novos + 1 modificado + query agregada |
| 7 | Business value | ✓ | Substitui "Em breve" por funcionalidade real; única story que entrega valor visível ao usuário final no MVP |
| 8 | Risks documented | ✓ | R1 (sem token = sem dados, mitigado por seed), R2 (menu lateral complexidade), R3 (join falhar — mitigado por LEFT JOIN) |
| 9 | Criteria of Done | ✓ | 6 itens DoD claros |
| 10 | Alignment with PRD/Epic | ✓ | Materializa AI-6, AI-7, AI-13. **Lacuna identificada (AI-14, non-blocking):** AC4 não inclui estado "conectado mas sem sync ainda" (apenas "Não configurado" e "vazio sem dados"). Documentado abaixo |

**Score:** 9/10 (AI-14 não aplicado)
**Verdict:** **GO** (gap é non-blocking e pode ser ajustado durante implementação)
**Status updated:** Draft → Ready (v0.3 logada no Change Log com nota)
**Notas:**
- **AI-14 (non-blocking gap):** O PM review sugeriu adicionar estado intermediário "conectado mas ainda sem sync — mostrar 'Aguardando primeira sincronização (próxima às 07h BRT)'". Esta nuance UX não está em AC4. Não bloqueia GO porque:
  1. PM classificou como non-blocking
  2. Pode ser ajustado pelo @dev durante implementação (microfeature de UX)
  3. Cenário acontece apenas ~24h após primeira conexão (janela curta)
  4. Estado "vazio" atual ("Nenhuma campanha com dados no período selecionado") cobre razoavelmente o caso, ainda que sem CTA temporal explícito
- **Recomendação para @sm:** opcional aplicar AI-14 antes de @dev pegar a story, ou registrar como follow-up no backlog para Phase 2.

---

## Story 51-4 — Fluxo OAuth UI

**Path:** `docs/stories/51-4-google-ads-oauth-ui.story.md`
**Executor:** @dev (Dex) | **Quality Gate:** @qa (Quinn)

### Checklist 10-point

| # | Critério | Status | Observação |
|---|----------|--------|------------|
| 1 | Clear and objective title | ✓ | "Fluxo OAuth UI (Conectar Conta)" — entrega definida |
| 2 | Complete description | ✓ | Context section excelente: explica diferença Google vs Meta (OAuth 3 pernas vs System User Token), documenta gotchas (`access_type=offline`, `prompt=consent` obrigatórios) |
| 3 | Testable acceptance criteria | ✓ | AC1-AC9 todos testáveis. AC2 (validação customer_id 10 dígitos), AC3 (params OAuth), AC4 (troca code→refresh_token), AC8 (4 estados UI distintos). 8 cenários de teste detalhados |
| 4 | Well-defined scope (IN/OUT) | ✓ | IN: T1-T5. Testing section lista cenários cobertos. OUT implícito mas sem ambiguidade (cron e UI de spend são outras stories) |
| 5 | Dependencies mapped | ✓ | **Dupla dependência corretamente capturada:** "51-1 (coluna no banco) + 51-0 (env vars — bloqueia produção mas não dev local com .env.local manual)" — R5 reforça que 51-0 não bloqueia o dev work, apenas o deploy |
| 6 | Complexity estimate | ✓ | M (~6h) — coerente com 4 arquivos novos (página, callback, test-connection, disconnect) + fluxo OAuth completo |
| 7 | Business value | ✓ | **Crítica:** sem ela, DoD do epic é impossível (PM review identificou como gap crítico). Materializa AI-2 |
| 8 | Risks documented | ✓ | R1 (offline), R2 (prompt=consent), R3 (redirect URI mismatch dev/prod), R4 (cookie Safari), R5 (51-0 prod blocker) — 5 riscos relevantes, todos com mitigação |
| 9 | Criteria of Done | ✓ | 6 itens DoD: ACs done, fluxo testado com conta real, config populada, test connection ok, typecheck/lint, QA gate |
| 10 | Alignment with PRD/Epic | ✓ | Materializa AI-2 do PM review. Espelha Meta Story 16.3. AC5 referencia explicitamente shape definido em 51-1 AC8 |

**Score:** 10/10
**Verdict:** **GO**
**Status updated:** Draft → Ready (v0.3 logada no Change Log)
**Notas:**
- Dupla dependência (51-1 + 51-0) está corretamente representada e diferenciada por escopo: 51-1 é hard blocker (precisa da coluna), 51-0 é soft blocker apenas para produção. Permite paralelização — @dev pode começar em dev local enquanto Google aprova o token.
- T3.5 antecipa um risco real: 51-4 pode ser implementada antes de 51-2. Documenta fallback ("criar versão mínima de auth lib se 51-4 antes"). Boa antecipação.

---

## Cross-Story Consistency Checks

Verificações cruzadas obrigatórias antes de liberar para @dev (todas executadas via grep direto nos arquivos):

| # | Check | Status | Evidência |
|---|-------|--------|-----------|
| 1 | Fonte canônica `google_ads_config.status = 'connected'` consistente em 51-2 e 51-3 | ✓ | 51-2 AC3, T4.3, Dev Notes section "Fonte canônica" + 51-3 AC2, T1.2 — todos alinhados |
| 2 | AC5 da 51-2 NÃO usa mais `date_preset` | ✓ | Grep confirma: apenas menções residuais no Change Log e R4 (corretas como "encerrado"). AC5 usa `WHERE segments.date = '{YYYY-MM-DD de ontem em UTC}'` |
| 3 | AC1 da 51-3 inclui botão "Conectar conta Google Ads" | ✓ | Linha 75: "botão 'Conectar conta Google Ads' que navega para /dashboard/configuracoes/integracoes/google-ads (página criada em Story 51-4)" |
| 4 | AC10 da 51-1 reescrito (não é mais typecheck redundante) | ✓ | Linha 64: agora é `COMMENT ON COLUMN organizations.google_ads_config IS '{shape}'` + handoff de regen de tipos |
| 5 | Dependências fecham sem ciclos | ✓ | Grafo: 51-0 (nada) → 51-1 (nada) → 51-4 (51-1, 51-0 prod) → 51-2 (51-1, 51-4 prod) → 51-3 (51-1, 51-2, 51-4). DAG válido sem ciclos. Aceita paralelização parcial (51-3 com seed SQL pode rodar enquanto 51-4 está em dev) |
| 6 | Estimativas batem com action plan | ⚠️ | Action plan: 51-1=3h, 51-4=6h, 51-2=5h, 51-3=3h, total=17h. Stories: 51-1=5h, 51-4=6h, 51-2=6h, 51-3=5h, total=22h. **Divergência de +5h.** Não bloqueia GO — divergência razoável pós-refinamento da story (mais detalhes técnicos = estimativa mais realista). Recomendo @sm atualizar action plan total para 22h dev na próxima revisão |
| 7 | Driving question presente no epic (AI-15) | ✓ | Epic linha 22: "Driving question (origem da demanda): 'Quanto gastamos no Google Ads na semana 01-07/06/2026?'..." |
| 8 | Plan B documentado no epic (AI-9) | ✓ | Epic linha 237-243: seção "External Blocker Plan B (Developer Token)" com B2 (seed SQL) como padrão, timeout de 5 dias úteis para Plan B, 10 dias úteis para escalação @pm |
| 9 | DoD do epic inclui 51-0 e 51-4 (AI-8) | ✓ | Epic linha 247: "Stories 51-0, 51-1, 51-2, 51-3, 51-4 com status Done" — todas 5 referenciadas |
| 10 | Shape de `google_ads_config` consistente em 51-1, 51-2 e 51-4 | ✓ | 51-1 AC10 e Dev Notes definem shape com 6 campos. 51-2 Dev Notes referencia mesmo shape. 51-4 AC5 declara salvar shape "conforme definido em Story 51-1 AC8" — alinhamento explícito |

**Cross-story verdict:** ALL PASS (1 ⚠️ não-blocante — divergência de 5h na estimativa total entre action plan e stories).

---

## Action Items Aplicados — Auditoria

| AI | Descrição | Story alvo | Status | Evidência |
|----|-----------|------------|--------|-----------|
| AI-1 | Criar Story 51-0 | 51-0 | ✓ Aplicado | Story 51-0 existe com executor=lucas@, blocker externo formalizado |
| AI-2 | Criar Story 51-4 | 51-4 | ✓ Aplicado | Story 51-4 existe, escopo OAuth completo |
| AI-3 | Corrigir AC5 (date_preset → WHERE segments.date) | 51-2 | ✓ Aplicado | AC5 linha 101 sem date_preset |
| AI-4 | Cravar average_cpc em micros | 51-2 | ✓ Aplicado | AC6 + R4 encerrado |
| AI-5 | Upsert leve em google_ads_campaigns | 51-2 | ✓ Aplicado | T4.7 + tabela de mapeamento |
| AI-6 | Fonte canônica google_ads_config.status='connected' | 51-2, 51-3 | ✓ Aplicado | AC3 (51-2), AC2 (51-3), T1.2 (51-3), T4.3 (51-2) |
| AI-7 | Botão "Conectar conta" em AC1 51-3 | 51-3 | ✓ Aplicado | AC1 linha 75 |
| AI-8 | DoD do epic inclui 51-0 e 51-4 | Epic | ✓ Aplicado | Epic linha 247 |
| AI-9 | Seção Plan B no epic | Epic | ✓ Aplicado | Epic linha 237-243 |
| AI-10 | Documentar débito plaintext em AC8 51-1 | 51-1 | ✓ Aplicado | AC8 linha 62 |
| AI-11 | Reescrever AC10 51-1 (não typecheck) | 51-1 | ✓ Aplicado | AC10 linha 64 |
| AI-12 | COMMENT ON COLUMN em T2.2 51-1 | 51-1 | ✓ Aplicado | T2.2-T2.3 linhas 80-81 |
| AI-13 | Cravar menu lateral em AC8 51-3 | 51-3 | ✓ Aplicado | AC8 linha 90 |
| AI-14 | Estado "conectado sem sync ainda" em AC4 51-3 | 51-3 | ⚠️ Não aplicado | Não bloqueia GO — registrado como nota |
| AI-15 | Driving question no epic | Epic | ✓ Aplicado | Epic linha 22 |

**14 de 15 action items aplicados.** O único pendente (AI-14) é non-blocking por classificação do próprio PM review.

---

## Decisão Final

**Stories aprovadas (GO):** 51-0, 51-1, 51-2, 51-3, 51-4 (todas 5)
**Stories pendentes (NO-GO):** nenhuma
**Status atualizado em todas:** Draft → Ready, com entrada v0.3 no Change Log

### Fixes opcionais para @sm (todos non-blocking)

1. **AI-14 (51-3 AC4):** opcional adicionar estado "conectado mas sem sync ainda — Aguardando primeira sincronização (próxima às 07h BRT)" entre os cenários cobertos. Decisão: aplicar agora OU registrar como follow-up de Phase 2.
2. **Estimativa total no action plan:** atualizar de "~17h dev" para "~22h dev" para refletir as estimativas refinadas das stories (51-1=5h, 51-2=6h, 51-3=5h, 51-4=6h). Não-blocking.

### Próximo passo

**PRONTO PARA @dev INICIAR.** Sequência recomendada (espelhando o action plan):

```
1. lucas@ inicia Story 51-0 em paralelo (em andamento — aguardando aprovação Google)
2. @data-engineer pega Story 51-1 (fundacional, ~5h) — DESBLOQUEIA TUDO
3. Após 51-1 Done:
   - @dev pega Story 51-4 (OAuth UI, ~6h) — pode rodar com .env.local
   - @dev pega Story 51-3 (UI Spend, ~5h) em paralelo usando seed SQL
4. @dev pega Story 51-2 (Cron, ~6h) — pode iniciar após 51-1; testes end-to-end após 51-4 + 51-0 (token aprovado)
5. @qa quality gate por story; @devops push após cada PASS
```

**Paralelização disponível:** 51-3 + 51-4 (após 51-1) podem rodar simultaneamente. 51-2 pode ser implementada com mock antes do token aprovado.

**Blocker monitorável:** Status do Developer Token (Story 51-0). Timeout: 5 dias úteis → ativar Plan B (seed SQL). Owner: lucas@.

---

*Validação executada por @po (Pax — Balancer) em 2026-06-08. Stories liberadas para Phase 3 (Implementação). Próximo agente: @data-engineer (51-1) → @dev (51-4, 51-3, 51-2) → @qa → @devops.*
