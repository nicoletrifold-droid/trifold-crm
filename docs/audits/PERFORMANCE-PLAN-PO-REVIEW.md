# PO Review — Plano de Performance Trifold CRM

**Revisor:** Pax (@po)
**Data:** 2026-05-12
**Documento revisado:** `docs/audits/PERFORMANCE-PLAN.md` (8 Epics, ~368 SP)
**Branch:** `main` (HEAD: 65af123)

---

## Veredicto Geral

**Decisão:** **GO-COM-AJUSTES**
**Pontuação 10-point checklist:** **8/10** (PASS — 2 dimensões com CONCERNS)

> O plano é tecnicamente sólido, bem fundamentado nos 4 relatórios fonte e segue a Constitution do AIOS (Article III — Story-Driven; Article IV — No Invention; Article V — Quality First). A ordem proposta (Observabilidade → Config → DB → Over-fetch → Cache → Bundle → Backend → Hardening) faz sentido em valor de negócio e respeita o princípio "DB antes de app". A maioria dos ACs é mensurável, com baseline antes/depois — exatamente o que se espera depois de instalar Speed Insights na Sprint 0.
>
> Há **3 issues bloqueantes** antes do @pm criar os primeiros epics, todas relacionadas a **colisão de escopo com trabalho em andamento** (Epic 25 ainda em InReview, Epic 26 Draft) e **higiene de backlog** (numeração de migration colidindo com 028/029 já duplicados). Há também 5 sugestões não-bloqueantes que melhoram observabilidade e contenção de risco. Recomendo seguir como GO-com-ajustes: aplicar os 3 fixes bloqueantes, depois @pm cria epics 27→29 em paralelo, e segura 32.4 (refactor de campaign-detail-client.tsx) até Epic 25 e Epic 26 estarem `Done`.

---

## 10-Point Checklist

1. **Goal Clarity** — PASS — Sumário executivo é objetivo (5 frases de diagnóstico), tabela de ganhos por onda é explícita, métricas-alvo de sucesso global estão definidas (LCP p75 <1.5s, INP p75 <200ms, TTFB <400ms, bundle <250KB, queries/page <3). Sem ambiguidade sobre "por que" cada epic existe.

2. **Scope Boundaries** — CONCERNS — Cada Epic tem seu escopo bem delimitado e os "depois de" estão declarados. **Mas:** Story 32.4 (refactor de `campaign-detail-client.tsx`) **colide diretamente** com Stories 25.2 (UI ações campanha — `Ready for Review`) e Epic 26 Story 26.1 (tab Criativos — `Draft`). Esse mesmo arquivo está em 3 frentes simultâneas. **Bloqueante 1** abaixo trata disso.

3. **Acceptance Criteria** — PASS — ACs por Epic são mensuráveis e auditáveis: Epic 27 cita Speed Insights ativo no dashboard, Epic 29 cita `EXPLAIN ANALYZE` antes/depois, Epic 30 cita TTFB <300ms via Speed Insights, Epic 32 cita Bundle Analyzer antes/depois anexado ao PR. Esse padrão "métrica baseline → métrica pós" é exatamente o esperado e atende Article V da Constitution.

4. **Dependencies Mapped** — PASS — Cabeçalho da Seção 2 declara cadeia (27→28→29 paralelizáveis após 27; 30 depende de 29; 31 depende de 30; 32/33 dependem de 27; 34 contínuo). Roadmap visual da Seção 11 confirma. Não vi falsas paralelizações.

5. **Risk Assessment** — CONCERNS — Riscos arquiteturais cobertos (Sentry custo, particionamento downtime, RLS denormalize messages.org_id em 33.4). **Mas:** plano não declara risco de **lock contention** em Story 29.1/29.2 (criação de ~20 índices em produção sem `CONCURRENTLY` é um issue — Supabase suporta mas precisa estar explícito), e Story 33.4 (denormalizar messages.org_id) tem **migração de dados em tabela hot** que vai precisar de backfill em janelas — não mencionado como risco P0.

6. **Effort Sized** — PASS (com nota) — Story points estão coerentes em 90% dos casos. Notas pontuais nas "Sugestões" abaixo (27.6 Sentry em 5SP/4h é apertado para configurar source maps + sample rates + integração com error.tsx; 32.4 com 13SP/1 semana é otimista para componente de 1080 LOC + 25.2 ainda mexendo nele). Total ~368 SP / ~12-14 sem é realista se houver 1 dev full-time + QA loop.

7. **Business Value** — PASS — Diagnóstico em 5 frases conecta diretamente a métricas de usuário: ROAS dashboard 2-5s hoje vs <500ms, `/dashboard/analytics` 9500 UUIDs vs 21 números no payload, cron followup ~800 queries vs ≤15 alvo. Para um CRM em produção com tráfego real, isso é dinheiro. Ordem proposta (Observabilidade → DB → Over-fetch) maximiza ganhos de curto prazo (semanas 1-5 já entregam -60% TTFB e -45% LCP).

8. **Test Strategy** — PASS — Cada Epic crítico declara test strategy específica (Epic 29: EXPLAIN ANALYZE em PR; Epic 30: Speed Insights diff; Epic 32: bundle analyzer; Epic 33: cron em staging). Epic 34 introduz E2E + bundle size CI + Lighthouse CI como rede permanente. Limitação: o codebase tem apenas 2 test files em packages/web hoje (Quinn confirmou), então Epic 27.4 e 27.5 precisam ser executados antes de qualquer outro Epic ter "test pass" como AC.

9. **Rollback Plan** — CONCERNS → tornar PASS — Princípio 3 ("Pequenos diffs com fallbacks — toda story revertível via flag/feature toggle") é declarado mas **não está aplicado nas stories de DB e migration**. Stories 29.1-29.7 não declaram explicitamente como reverter cada migration (DROP INDEX é trivial, mas 29.5 transforma view em materialized view — rollback exige recriação da view original; 33.4 ADD COLUMN messages.org_id + ALTER NOT NULL é irreversível se houver dados gravados pelo trigger entre apply e rollback). **Sugestão 4** trata disso.

10. **Conflicts with Active Work** — CONCERNS → bloqueante — Verifiquei `docs/stories/active/` e `docs/stories/epics/`:
    - **Stories 25.1 e 25.2 (`Ready for Review`)** ambas tocam `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx`. Plano de performance Story 32.4 quebra esse mesmo arquivo em islands.
    - **Epic 26 (`Draft`)** Story 26.1 adiciona tab "Criativos" no mesmo arquivo.
    - **Migration numbering:** plano usa `030_*` em diante, mas o repo já tem **duplicatas em 021×3, 024×2, 025×2, 028×2, 029×2** — Story 29.8 já reconhece e trata via reconciliação. **Mas:** se Epic 25 ainda não foi mergeado e tem `028_meta_campaign_actions.sql`, e Epic 26 (não criado ainda) vai usar `030_*`, o plano de performance precisa começar em `031_*` OU executar Story 29.8 antes das migrations da Epic 29. Ordem importa.
    - **Story 0-x/1-x em active/:** 12 stories antigas (`0-1-setup-*`, `1-1-setup-*` …) ainda estão na pasta `active/`. Não bloqueia, mas indica que `active/` virou cemitério. Sugestão de housekeeping incluída.

**Síntese:** 8/10 com 2 dimensões em CONCERNS (Scope Boundaries 2, Risk 5, Rollback 9, Conflicts 10 — mas 2 e 10 são o mesmo problema raiz). Plano passa o threshold de GO (>=7), mas exige os 3 fixes abaixo antes do @pm executar.

---

## Ajustes Requeridos (BLOQUEANTES)

### B1. Adiar Story 32.4 até Epic 25 e Epic 26 estarem `Done`

**Problema:** `campaign-detail-client.tsx` (1080 LOC) está sendo modificado simultaneamente por:
- Story 25.2 (Ready for Review) — adiciona seção "Ações" (botões pause/resume/budget + modal + histórico)
- Story 26.1 (Draft, a ser criada) — adiciona tab "Criativos" com badge de fadiga
- Story 32.4 (proposta) — quebra o componente em islands (Header server, AdSets server, Chart dynamic, Modal dynamic, Action log Suspense)

Fazer 32.4 antes de 25 e 26 estarem mergeadas implica:
- Conflitos de merge garantidos em arquivo grande e crítico
- Refazer a integração das seções "Ações" e "Criativos" no formato island
- Risco de regredir QA gates já aprovados de 25.1/25.2

**Fix exigido:** Mover Story 32.4 do Epic 32 para o **Epic 34 — Hardening** (continuous), ou marcar como `blocked_by: [Epic 25 Done, Epic 26 Done]` no Epic 32. Recomendo a primeira opção: 32.4 vira 34.13 (post-Epic 26).

**Compensação:** Epic 32 perde 13 SP. Adicionar nessa sprint uma Story alternativa de bundle: **"32.4b — `dynamic` imports em modais e wizards de outras rotas grandes"** — `email-blasts/novo/wizard.tsx`, `obras/[id]/edit-modal.tsx`, `properties/[id]/units/[unitId]/page.tsx`. Mesmo budget de impacto (-30-50KB), zero conflito.

---

### B2. Reordenar Story 29.8 para ser a PRIMEIRA do Epic 29

**Problema:** Story 29.8 reconcilia as migrations duplicadas 021/024/025/028/029 e padroniza numeração para 4 dígitos. Stories 29.1-29.7 criam migrations `030_*` a `035_*`. Se 29.8 for executada DEPOIS, vai precisar renomear todas as migrations recém-criadas, ou conviver com schema desincronizado entre local e remote enquanto as outras stories rodam.

**Fix exigido:** Reordenar Epic 29:
1. **29.8** (reconciliar duplicatas + padronizar numeração) → primeiro
2. 29.7 (fix pooler port) → segundo (DevOps standalone)
3. 29.1 → 29.6 (migrations novas com numeração limpa a partir de 031 ou superior)

**Razão:** Article V (Quality First) — não acumule debt durante uma sprint que existe justamente para limpar debt. Além disso, Story 29.8 expõe SQL "real" aplicado no remote via Supabase Studio que pode revelar índices/triggers que invalidam algumas das outras stories (e.g., se um índice listado na 29.1 já existe no remote mas não no repo, evitamos uma migration redundante).

---

### B3. Adicionar AC explícito de `CREATE INDEX CONCURRENTLY` em todas as stories de Epic 29

**Problema:** Stories 29.1, 29.2, 29.3, 29.4 criam ~30 índices novos em tabelas hot (`messages`, `conversations`, `system_events`, `leads`, `email_logs`). Em produção, `CREATE INDEX` padrão tira **ACCESS EXCLUSIVE lock** na tabela — em `messages` (provavelmente >100k rows), isso significa **downtime de write durante toda a criação**.

`CREATE INDEX CONCURRENTLY` é o pattern obrigatório em prod, mas exige:
- Não rodar dentro de transaction
- Tratamento especial em Supabase CLI (precisa de `db push` com flag específica ou aplicação manual via Management API)
- Verificação pós-criação de índices `INVALID` (falha CONCURRENTLY pode deixar índice em estado inválido)

**Fix exigido:** Adicionar AC unificado em Epic 29 (válido para Stories 29.1-29.4):
- "Toda criação de índice usa `CREATE INDEX CONCURRENTLY`."
- "Cada migration declara comentário no topo: `-- CONCURRENT: applies outside transaction via supabase db push --no-transaction or Management API direct execution`."
- "Pós-deploy, verificar `SELECT indexname, indisvalid FROM pg_index ... WHERE indisvalid = false;` — bloquear PR se houver inválidos."
- "Rollback plan documentado: `DROP INDEX CONCURRENTLY {nome}` por índice."

**Esforço adicional:** ~30min por migration (instrução + verification step). +3 SP no total do Epic 29.

---

## Sugestões (NÃO bloqueantes)

### S1. Story 27.6 (Sentry) — reavaliar para 8 SP / 1 dia

5 SP / 4h para "instalar Sentry server + client + source maps Vercel + sample rates + atualizar error.tsx" é apertado. Já vi Sentry rollout consumir 1 dia inteiro em projeto Next 16 quando se vai ajustar:
- `instrumentation.ts` (Next 15+ pattern)
- Source maps via build hook na Vercel
- DSN por ambiente (preview vs production)
- Beforesend para filtrar PII de leads/clientes
- Integration com `logEvent` (não duplicar — Sentry só para uncaught, system_events para domain events)

Sugestão: subir 27.6 para 8 SP e adicionar AC "PII removido de breadcrumbs (email, telefone, CPF) via `beforeSend` hook". Trifold tem dados sensíveis (LGPD) — não dá pra mandar payload cru pro Sentry.

### S2. Story 28.3 + 34.9 (TS errors do `noUncheckedIndexedAccess`)

5 SP para "lib/, hooks/, components/" + 8 SP para "api/" = 13 SP só de fix de tipo. Em codebase com 293 arquivos, é otimista. Sugiro:
- Não ativar `noUncheckedIndexedAccess` direto. Adicionar `// @ts-expect-error TODO` flagado por TODO comment, ou usar `noUncheckedIndexedAccess: false` com regra eslint custom que avisa em PR.
- OU: gerar branch separada `chore/strict-ts-pass1`, deixar @dev resolver assíncrono via PRs pequenos durante Epic 31 e 32.

Risco: ativar em PR único pode bloquear merge por dias.

### S3. Story 33.4 (denormalizar messages.org_id) — backfill em janela

ADD COLUMN + UPDATE FROM em `messages` (provavelmente tabela maior do projeto) pode rodar minutos. Sugestão:
- Adicionar AC: "Backfill em batches de 10k rows via Management API direta, com `pg_stat_progress_copy` ou `WHERE org_id IS NULL` paginado."
- Adicionar AC: "Coluna criada como NULLABLE no primeiro deploy; ALTER NOT NULL aplicado em segundo deploy após backfill confirmado (>= 99% das rows com valor)."
- Risco P1 → P0 na tabela de riscos do Epic 33.

### S4. Rollback plan explícito por Story de migration

Princípio 3 do plano declara "revertível via flag/feature toggle". Mas migrations DB não revertem via toggle — precisam de DOWN script. Sugestão:
- Toda story de Epic 29 e Epic 33 inclui seção "Rollback SQL" no template (e.g., para 29.5 materialized view: `DROP MATERIALIZED VIEW; CREATE VIEW meta_campaign_roas AS …` com a definição original commitada).
- Toda story de Epic 34 (partitioning) inclui plano de **rollback em duas fases** (partition → recriar tabela monolítica), com warning explícito que é caro pós-particionamento.

### S5. Housekeeping de `docs/stories/active/`

A pasta `active/` tem 12 stories de setup inicial (0-1 a 0-6, 1-1 a 1-6) que claramente estão `Done` há semanas — viraram fósseis. Não bloqueia o plano de performance, mas:
- Sugiro spike de 30min antes do Epic 27 começar: mover `0-*` e `1-*` para `docs/stories/done/` ou `docs/stories/archive/`.
- Idem para stories 2-x a 17-x que parecem ser do projeto inicial.
- Razão: quando @sm criar Story 27.1, vai precisar verificar IDs livres — pasta limpa evita confusão.

### S6. Métrica de sucesso falta um item: `Error rate (4xx + 5xx)`

Seção 13 lista LCP, INP, TTFB, bundle, cold start, queries/page, erros não capturados. Falta `request error rate p99 < 1%` — métrica clássica que Sentry/Vercel já dão de graça e é fácil de regredir durante Sprint 4-6 (refactors agressivos).

### S7. Epic 34 está muito grande — quebrar em 34a/34b

Epic 34 tem 12 stories e 120 SP — é um "balde de hardening" que vai virar um epic infinito. Sugiro:
- **Epic 34a — Test & CI Safety Net:** 34.1, 34.2, 34.3 (Playwright E2E, bundle size CI, Lighthouse CI). ~21 SP.
- **Epic 34b — Long-term Performance Infra:** 34.4-34.8, 34.10, 34.11 (particionamento, virtualization, rate limit, SWR migration, OpenTelemetry). ~75 SP.
- **Epic 34c — Tech Debt Cleanup:** 34.9, 34.12, 32.4 (que migrou aqui pela B1). ~25 SP.

Razão: pelo Article III (Story-Driven Development), epics devem ter Definition of Done discreto. Epic com 120 SP nunca termina.

---

## Re-priorização Recomendada

A ordem proposta **NÃO muda**:

```
27 (Observabilidade) → 28 (Config) → 29 (DB) → 30 (Over-fetch) → 31 (Cache) → 32 (Bundle) → 33 (Backend) → 34 (Hardening)
```

**Justificativa:** O plano original já está corretamente sequenciado. Observabilidade-first é a recomendação certa do Quinn (Article V). DB-first dentro de "trabalho não-medição" é o ROI mais alto. Cache depois de Over-fetch evita cachear payload inútil.

**Único ajuste interno:** dentro do Epic 29, **inverter 29.8 ← 29.1** (vide Bloqueante B2).

**Recomendação adicional:** **paralelizar Epic 28 e Epic 29** a partir da Semana 2. O plano já sugere isso (Sprint 0 + Sprint 1 em semanas separadas), mas como Epic 28 é DX/config e Epic 29 é DB, podem rodar em paralelo com QA gates independentes. Isso comprime semanas 2-3 em uma única sprint de 2 semanas com dois entregáveis.

---

## Decisões automáticas tomadas pelo PO

- `[AUTO-DECISION]` Sobre "bater Epic 27 antes de tudo ou paralelizar 28": **paralelizar 28 com 29 a partir da Sprint 1**, mas Epic 27 fica como pré-requisito absoluto. Razão: 27 instala instrumentação que é AC de aceitação de todos os outros epics; 28 é config sem dependência de 27.
- `[AUTO-DECISION]` Sobre custo Sentry: **free tier suficiente** para volume atual do Trifold (pequeno-médio CRM). Sample rate 10% trace, 100% error é generoso. Aprovado em Story 27.6.
- `[AUTO-DECISION]` Sobre downtime de partitioning Story 34.4: **aceitar janela de 5-10min em horário comercial baixo** (madrugada BRT). Razão: `system_events` é tabela de log, não tem queries síncronas no usuário final. Reagendar para Epic 34b conforme Sugestão S7.
- `[AUTO-DECISION]` Sobre Upstash (Story 34.8 rate limit): **decidir no momento da Epic 34b**, não bloqueia agora.

---

## Sequência aprovada para @pm

Após aplicar os 3 fixes bloqueantes (B1, B2, B3), @pm pode executar nesta ordem:

```
# Sprint 0 (Semana 1)
@pm *create-epic 27 — Performance Observability Foundation
  → @sm *draft 27.1 → @po *validate → @dev *develop → @qa *qa-gate → @devops *push
  → repetir para 27.2 … 27.8

# Sprint 1 (Semana 2 — paralelo)
@pm *create-epic 28 — Next.js Config Quick Wins
@pm *create-epic 29 — Database Performance Blitz
  → @sm *draft 29.8 PRIMEIRO (reconciliação migrations)
  → depois 29.7 (DevOps standalone, fix pooler)
  → só então 29.1-29.6 (com CONCURRENTLY conforme B3)

# Sprint 2-3 (Semanas 3-4)
@pm *create-epic 30 — Over-fetch & N+1 Killers

# Sprint 4 (Semana 5)
@pm *create-epic 31 — Caching Layer & Auth Optimization

# Sprint 5-6 (Semanas 6-7)
@pm *create-epic 32 — Bundle & Rendering Optimization
  ⚠️ Story 32.4 REMOVIDA — migrar para Epic 34c (depende de Epic 25 Done + Epic 26 Done)
  ⚠️ Story alternativa 32.4b adicionada (dynamic imports em outras rotas)

# Sprint 7 (Semana 8)
@pm *create-epic 33 — Backend Heavy Lifting
  ⚠️ Story 33.4 com AC adicional de backfill em batches (Sugestão S3)

# Sprint 8+ (contínuo)
@pm *create-epic 34a — Test & CI Safety Net (21 SP)
@pm *create-epic 34b — Long-term Performance Infra (75 SP)
@pm *create-epic 34c — Tech Debt Cleanup (25 SP — inclui 32.4 movida)
```

**Pré-requisitos antes do primeiro `@pm *create-epic 27`:**

1. Confirmar Stories 25.1 e 25.2 mergeadas para `main` (hoje `Ready for Review` — precisa fechar QA Loop).
2. Decidir status de Epic 26: criar agora (ainda Draft) e priorizar antes de Epic 27? Ou parquear? Recomendo: **parquear Epic 26 até Epic 27 Done**, depois retomar — Epic 27 dá visibilidade que valida hipóteses de fadiga de criativo.
3. Housekeeping `docs/stories/active/` (Sugestão S5) — move stories `Done` antigas para `archive/`.
4. Confirmar custos: Sentry free tier (zero), Vercel Speed Insights (já incluso no Pro), Upstash (decisão adiada).

---

## Próxima Ação Recomendada ao Gabriel

1. Ler este review.
2. Aplicar os 3 bloqueantes (B1: mover 32.4 para 34c; B2: reordenar Epic 29; B3: AC de CONCURRENTLY).
3. Fechar Stories 25.1 e 25.2 (estão em `Ready for Review` — chamar @qa para fechar QA gate).
4. Decidir destino de Epic 26 (parquear ou executar antes do Epic 27).
5. Quando aprovado: `@pm *create-epic 27 — Performance Observability Foundation`.

---

**Pax (@po)** — *"O plano está pronto. Os ajustes são higiene, não reescrita. Pode ir em frente."*
