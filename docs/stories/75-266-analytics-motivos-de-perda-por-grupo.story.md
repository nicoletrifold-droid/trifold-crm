# Story 75-266 — O analytics mostra POR QUE perdemos, não 614 frases

**Epic:** 75 (CRM Trifold) · **Status:** InReview
**Criada por:** @sm (River) em 2026-08-04 · **Complexidade:** M (1 migration + 1 lib + 1 card; risco concentrado na paridade da heurística)
**Formato:** Consolidação da 75-264 na tela — é o "passo 2" registrado como fora de escopo naquela story
**Decisões do Marcos (04/08):** analytics primeiro; relatório diário de WhatsApp FICA DE FORA; filtro por corretor é story própria (um corretor por vez).

---

## Story

**Como** quem olha o analytics para decidir onde investir e como cobrar o time,
**Quero** que o card "Motivos de Perda" mostre os 6 grupos estruturados da 75-264,
**Para que** a tela responda "por que perdemos" com a mesma qualidade que o agente de análise já responde — e não com 614 variantes de texto livre.

---

## Context

A 75-264 (mergeada hoje, mig 212 em prod) estruturou a **captura**: todo ponto de UI que marca
lead como perdido agora exige um dos 6 grupos + observação opcional, e a view
`v_lead_lost_reason_grupo` classifica o histórico por heurística (92,0% de cobertura medida).

O analytics ficou de fora **de propósito** ("o passo 2 combinado com o Marcos"). Resultado na
tela hoje: o card "Motivos de Perda" agrega `lost_reason` por **string exata** — "Sem interesse 7",
"sem interesse 3", "nao tem interesse 2", "Não tem interesse 2" aparecem como linhas separadas.
Em prod são 614 textos distintos em 1.042 perdidos. O card é ilegível; o dado bom já existe.

### Por que não é só "trocar a query pela view" — 3 travas medidas no código

1. **A view é admin-strict** (`user_role() = 'admin'` no WHERE, mig 212): o analytics é servido
   também a supervisor/gerente-comercial/SDR (`requireRole` nas rotas) — para eles a view retorna
   **0 linhas em silêncio**. E o cron do relatório semanal usa `createAdminClient()` (service_role),
   onde `user_role()` é NULL — 0 linhas de novo.
2. **A view não filtra segmento nem período** — todo o analytics é `segmento='principal'` +
   janela `[since, until)`.
3. **Universo diferente**: o KPI "Perdidos" da tela conta **presença de `lost_reason`** na janela
   (CTE `lost_agg`, mig 178); a view conta **etapa** (Perdido/Não Qualificado, sem janela). Uma
   seção cuja soma não bate com o KPI logo acima é bug reportado na certa.

---

## Os três itens

### Item 1 — a heurística vira FUNÇÃO SQL única (a chave que destrava tudo)

Criar `public.f_lost_reason_grupo(p_lost_reason text, p_lost_reason_grupo text) RETURNS text`
(`IMMUTABLE PARALLEL SAFE` — pode: `f_unaccent` da mig 174 é IMMUTABLE), cujo corpo é
**exatamente** o `COALESCE(grupo estruturado, CASE heurístico)` que hoje vive dentro da view.

- 🔴 **A ORDEM do CASE é parte da definição** (header da mig 212) — copiar verbatim, na mesma ordem.
- Recriar `v_lead_lost_reason_grupo` para usar a função (comportamento e colunas idênticos —
  o agente não percebe a mudança).
- A função não tem gate de role — quem a envolve (view, RPC) impõe o próprio controle. É isso
  que permite ao analytics (multi-role) e ao futuro PDF (service_role) usarem a MESMA heurística
  sem replicar regex — replicar é a pior opção, já documentado na 212.

### Item 2 — a RPC do analytics agrega por grupo, no MESMO universo de hoje

`get_analytics_summary_ranged` (base atual = mig 178) ganha chave nova no JSONB:

- `lost_reason_groups`: `jsonb_object_agg(grupo, cnt)` onde
  `grupo = f_lost_reason_grupo(lost_reason, lost_reason_grupo)`, sobre o **mesmo** universo do
  `lost_agg` atual (`lost_reason IS NOT NULL` + janela + segmento principal). Soma dos grupos ≡
  KPI Perdidos **por construção** — resolve a trava 3 sem mexer na definição de "perdido".
- `lost_reason_estruturados`: contagem com `lost_reason_grupo IS NOT NULL` (dado novo) — alimenta
  o rodapé de cobertura do card.
- **`lost_reasons` (cru) PERMANECE** — `deriveAnalyticsMetrics` soma esse mapa para o KPI e
  qualquer outro leitor de `AnalyticsSummary` continua íntegro. Chave nova, nada removido.
- Ao recriar, seguir o precedente de escopo da mig 209 (avaliar `assert_org_scope(p_org_id)` —
  a RPC é exposta via PostgREST e hoje aceita qualquer org).

O caminho com **filtro de empreendimento** (a page troca a RPC por queries diretas) ganha uma RPC
pequena `get_lost_reason_groups(p_org_id, p_since, p_until, p_property_id)` usando a mesma função.

### Item 3 — o card, legível e honesto

- Renderiza os grupos com os labels PT da **fonte única** (`LOST_REASON_GROUPS` em
  `lib/constants.ts`). Os 3 grupos só-legado (`duplicado_teste_corretor`, `sem_motivo`,
  `nao_classificado`) têm labels hoje em `LOSS_GROUP_LABELS` no context-builder do agente —
  **içar o mapa completo para `constants.ts`** e o context-builder passa a importar de lá
  (regra da casa: consultar a fonte, não duplicar).
- Derivador compartilhado `deriveLostReasonGroups(summary)` em **`lib/analytics/metrics.ts`** —
  é a lib "fonte única tela+PDF" (75-178/179); a story do PDF (a seguinte) consome dali.
- Rodapé de cobertura com números do período, nunca hardcoded:
  "N escolhidos na hora da perda · M classificados por heurística do texto antigo". O
  `nao_classificado` aparece como linha normal — o card não afirma mais do que o dado suporta.

---

## Acceptance Criteria

- [ ] **AC1** — o card "Motivos de Perda" mostra grupos (labels PT), ordenados por contagem,
      nos DOIS caminhos da page: sem filtro (RPC) e com filtro de empreendimento.
- [ ] **AC2** — a soma das contagens do card = KPI "Perdidos" da mesma tela, no mesmo
      período/filtro. Verificado no dev com dados reais (query no PR).
- [ ] **AC3** — paridade da refatoração: contagem por grupo da view ANTES × DEPOIS de usar a
      função é idêntica no dev (query de paridade no PR). A ordem do CASE não muda.
- [ ] **AC4** — `lost_reasons` (cru) continua no JSONB da RPC; KPI Perdidos e qualquer leitor de
      `AnalyticsSummary` seguem funcionando sem alteração.
- [ ] **AC5** — rodapé de cobertura dinâmico (estruturado × heurística), calculado do período.
- [ ] **AC6** — o card funciona para todos os roles que a página atende hoje (admin, supervisor,
      gerente-comercial, SDR) — nada de 0 linhas silencioso. A view do agente permanece
      admin-only, inalterada em comportamento.
- [ ] **AC7 — sem regressão** — funil, KPIs, demais cards e o agente (fetchLostReasonBreakdown)
      inalterados; vitest + lint + build verdes.

---

## Dev Notes

- Base da RPC é a **mig 178** (a 209 não recriou `get_analytics_summary_ranged` — conferido).
- `sem_motivo` é quase-impossível no card (universo exige `lost_reason IS NOT NULL`), mas a
  função retorna `sem_motivo` para string em branco — deixar o label disponível, não tratar como erro.
- Migration idempotente (padrão da casa) + replicar no dev; prod via Management API **após merge**.
- 🔥 GOTCHA conhecido: PostgREST corta em 1000 linhas — irrelevante aqui (agregação no banco),
  mas NÃO trocar agregação SQL por fetch de linhas no client.

## Fora de escopo

- Filtro por corretor no analytics (story seguinte — decisão: um corretor por vez).
- Seção "Motivos de Perda" no PDF semanal (story seguinte; depende do derivador desta).
- Relatório diário de WhatsApp (DECISÃO Marcos 04/08: fica de fora — template Meta novo + n
  diário minúsculo = ruído).
- Higiene do analytics (PATCH genérico ainda aceita texto livre sem grupo; dropdown de Origem
  hardcoded incompleto; `leads-by-period` sem paginação subcontando janelas grandes) — story própria.
- Drill-down do card para os textos crus.

---

## Dev Agent Record (@dev — 2026-08-04)

### O que foi construído

- **Migration 213** (`213_analytics_motivos_de_perda_por_grupo.sql`):
  `f_lost_reason_grupo(text, text)` (IMMUTABLE, CASE verbatim da 212), view recriada sobre a
  função, `get_analytics_summary_ranged` (base mig 178, sql→plpgsql) com `lost_reason_groups` +
  `lost_reason_estruturados`, e `get_lost_reason_groups(p_org_id, p_since, p_until, p_property_id)`
  p/ o caminho com filtro de empreendimento. `assert_org_scope` nas duas RPCs.
- **Fonte única de labels**: `LOST_REASON_ALL_GROUP_LABELS` em `lib/constants.ts` (7 grupos +
  3 só-legado); o `LOSS_GROUP_LABELS` do context-builder virou alias importado.
- **Derivador compartilhado**: `deriveLostReasonGroups` em `lib/analytics/metrics.ts`
  (ordena, traduz, descarta zero; slug desconhecido aparece cru — nunca some).
- **Card** (`dashboard/analytics/page.tsx`): grupos + % da base + rodapé de cobertura dinâmico
  ("N escolhidos na hora da perda · M por heurística do texto antigo"). KPI Perdidos agora soma
  `lostGroups` (≡ soma do cru, mesmo universo SQL).
- **Testes**: +5 vitest em `metrics.test.ts` (ordenação, label, lixo, soma≡KPI, fonte única
  cobre CHECK + legado). Suíte completa: 1.541 verdes. tsc + eslint + `next build` verdes.

### Descobertas de ambiente (importantes p/ @devops)

- 🔴 **O DEV está MUITO atrás do prod**: `assert_org_scope` (209) não existia e `leads.segmento`
  (mig 136!) NÃO EXISTE lá — a 209 não aplica no dev (`financial_notification_log` ausente).
  Por isso a mig 213 carrega **cópia verbatim e idempotente** do `assert_org_scope` (no prod,
  que já tem a 209 desde hoje cedo, é no-op). Sincronizar o dev = dívida separada.
- **AC3 (paridade)**: 0 divergências no dev (só 4 leads — amostra fraca; função é cópia
  verbatim). **Re-medir em prod logo após aplicar a 213** (query no PR).
- **AC2 validada EM PROD, read-only** (janela 90d, mesmo WHERE do lost_agg):
  soma dos grupos = **992 = soma do cru (KPI)**. Distribuição: nao_conseguimos_falar 429 ·
  sem_interesse 243 · nao_qualifica_preco 102 · nao_classificado 79 · fora_perfil_regiao 41 ·
  foi_para_outro 36 · clicou_sem_intencao 34 · duplicado_teste_corretor 27 · outro 1.
  **6 perdas já estruturadas** pelo modal da 75-264 (em uso desde hoje de manhã).

---

## Change Log

- 2026-08-04 — @sm: story criada (Draft).
- 2026-08-04 — @po: validada 10/10 após correção (estimativa adicionada). GO → Ready.
- 2026-08-04 — @dev: implementação completa; mig 213 aplicada 2× no dev (idempotência OK);
  AC2 validada read-only em prod (992 ≡ 992). Status → InReview.
- 2026-08-04 — @qa (Quinn): **CONCERNS, nenhum HIGH**. Paridade do CASE 212×213 verificada
  byte a byte; CTEs da 178 preservadas; alias do agente íntegro; dark-mode ok; 9/9 testes.
  Fixes aplicados pelo @dev: **QA-001** REVOKE PUBLIC/anon + GRANT na
  get_analytics_summary_ranged (nunca esteve nas 8 da 209) · **QA-002** fallback do KPI
  Perdidos p/ o caminho antigo enquanto a 213 não estiver aplicada (RPC sem a chave/ausente).
  Registrado (low): smoke-test das 2 RPCs + re-medição da paridade em prod logo após aplicar
  a 213 — ver seção Deploy. Status → Done no merge.

---

## Deploy (@devops)

1. 🔴 **Aplicar a mig 213 em prod ANTES do merge** (precedente exato da 212 hoje de manhã):
   o deploy do Vercel dispara no merge, e o card novo depende das chaves/RPC (o fallback
   QA-002 segura o KPI, mas o card ficaria vazio até aplicar).
2. Pós-aplicação (fecha o low do QA): smoke `SELECT get_analytics_summary_ranged(org, now()-interval '90 days', now());`
   e `SELECT get_lost_reason_groups(org, now()-interval '90 days', now(), NULL);` + query de
   paridade (view × função) — deve dar 0 divergências.
3. Dev já está com a 213 (aplicada 3×, idempotente). Dívida separada: dev com drift grande
   (sem mig 136+; a 209 não aplica lá) — sincronizar o schema do dev é story própria.
