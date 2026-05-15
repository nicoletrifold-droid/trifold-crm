---
storyId: "31.2"
storyTitle: "Migration 043 — DDL CommercialRules v2 (CHECK constraint)"
epic: 31
verdict: PASS
gateBy: "Quinn (@qa)"
gateDate: 2026-05-15
executor: "@data-engineer (Dara)"
migrationApplied: true
gitCommitStatus: "uncommitted (untracked migration file)"
nextStep: "@devops *push"
---

# QA Gate — Story 31.2 (Migration 043)

> **Verdict: PASS** — Migração schema-only aplicada em produção, todos os 12 ACs revalidados independentemente, 3 tentativas explícitas de quebrar a CHECK constraint comportaram-se conforme o design (2 bloqueadas + 1 aceita por design permissivo do schema SQL), tracking inserido, baseline de dados preservado, zero regressões nos pacotes que consomem `properties.commercial_rules`.

## 7 Quality Checks — Score

| # | Check | Score | Status |
|---|-------|-------|--------|
| 1 | Code review (SQL DDL) | 5/5 | PASS |
| 2 | Unit tests (no SQL unit tests; `commercial-rules.test.ts` ainda passa 5/5) | 5/5 | PASS |
| 3 | Acceptance criteria (12/12 revalidados via Management API) | 5/5 | PASS |
| 4 | No regressions (typecheck clean em todos os 5 pacotes; pipeline + flows tests todos passam) | 5/5 | PASS |
| 5 | Performance (DDL trivial em tabela com 2 rows; CHECK é avaliação JSON pura) | 5/5 | PASS |
| 6 | Security (RLS intacta; campo legado aceito por design; proto-pollution não materializa em JS layer aqui) | 4/5 | PASS com observação |
| 7 | Documentation (story File List / Dev Agent Record / Change Log v1.3 OK; memory lesson registrada) | 5/5 | PASS |

**Score agregado: 34/35 (97%) — verdict PASS.**

---

## 1. Code Review (SQL DDL)

Arquivo `supabase/migrations/043_property_commercial_rules_v2.sql` revisado linha-a-linha vs. Seção 3.3 do doc de arquitetura:

- DEFAULT jsonb com 11 campos presentes — bate exatamente.
- `DROP CONSTRAINT IF EXISTS` antes do `ADD CONSTRAINT` — idempotência presente (linha 42).
- CHECK constraint: `commercial_rules IS NULL OR (...)` topo correto, `jsonb_typeof = 'object'` antes dos sub-checks.
- Parentização dos sub-predicados: cada cláusula `(NOT (commercial_rules ? 'campo') OR ...)` está corretamente isolada com paren externo — sem ambiguidade de precedência OR/AND.
- `(commercial_rules->>'min_down_payment_pct')::numeric BETWEEN 0 AND 100` correto.
- `example_down_payment_brl` aceita `'null'::jsonb` explicitamente (linha 55) — bom design para distinguir `{example_down_payment_brl: null}` (presente, valor null) de campo ausente.
- COMMENT ON COLUMN explícito, referenciando o schema Zod em `packages/shared/src/types/commercial-rules.ts`.
- Comentários de seção do arquivo são auto-explicativos.

**Nenhum nit, nenhuma observação.**

---

## 2. Unit Tests

- Não há unit tests SQL clássicos nesta story (DDL puro) — esperado.
- `packages/shared/src/types/commercial-rules.test.ts` (5 testes do schema Zod) — todos PASS.
- `packages/ai/src/chat/pipeline.test.ts` (20 testes, inclui `buildPropertyDataContext`) — todos PASS.
- Suíte completa `pnpm -w run test`: **266 passed / 6 failed** — as 6 falhas estão TODAS em `packages/web/src/app/api/webhook/whatsapp/__tests__/route.test.ts` por erro de path alias (`Cannot find package '@web/lib/supabase/admin'`) — **pré-existente, não relacionado a esta migration**. Arquivo `packages/web/src/lib/supabase/admin.ts` existe (visto em filesystem). Issue de infra de testes herdado da Story 21.1, NÃO regressão.

---

## 3. Acceptance Criteria — Revalidação Independente (NÃO confiei no reporte do Dara)

Todas as 12 ACs foram **re-executadas via Management API por mim mesmo**, com PROJECT_REF=`dsopqkqjkmhytudaaolv` e token `~/.supabase/access-token`. Resultados:

| AC | Descrição | Query / Verificação | Resultado |
|----|-----------|---------------------|-----------|
| AC1 | CHECK constraint `commercial_rules_shape_check` existe | `pg_get_constraintdef` | PASS — definição contém `commercial_rules IS NULL OR (...)` topo, `BETWEEN 0 AND 100`, todos os campos validados |
| AC2 | Migration aplicada (`schema_migrations.version='043'`) | `SELECT version,name FROM supabase_migrations.schema_migrations WHERE version='043'` | PASS — 1 row, `name='043_property_commercial_rules_v2'` |
| AC3 | CHECK bloqueia inválido (`pct=150`) | `BEGIN; INSERT ... pct:150; ROLLBACK;` | PASS — `ERROR 23514 violates check constraint "commercial_rules_shape_check"` |
| AC4 | CHECK aceita válido (`pct=10`) | `BEGIN; INSERT ... pct:10; RETURNING; ROLLBACK;` | PASS — INSERT retornou row, ROLLBACK não persistiu |
| AC5 | CHECK aceita NULL | `BEGIN; INSERT ... commercial_rules=NULL; RETURNING; ROLLBACK;` | PASS — RETURNING devolveu `commercial_rules: null` |
| AC6 | Vind legado intacto (`min_down_payment: 68000`) | `SELECT commercial_rules FROM properties WHERE slug='vind-residence'` | PASS — `{requires_down_payment:true, min_down_payment:68000, mcmv_eligible:false}` — bate exatamente com o baseline da linha 73 da story |
| AC7 | DEFAULT jsonb configurado | `column_default` em `information_schema.columns` | PASS — string `jsonb_build_object(...)` com todos os 11 campos |
| AC8 | COMMENT ON COLUMN registrado | `col_description('properties'::regclass, attnum)` | PASS — string completa retornada, referencia o caminho do Zod |
| AC9 | Count de rows preservado | `SELECT count(*)::int FROM properties` | PASS — 2 (baseline = 2) |
| AC10 | Tracking manual em schema_migrations | (mesma query do AC2) | PASS |
| AC11 | Rollback documentado e testável | DRY-RUN inside BEGIN/ROLLBACK: `DROP CONSTRAINT IF EXISTS ...; ALTER ... DROP DEFAULT; ROLLBACK;` | PASS — 0 erros; post-rollback verificou que constraint e DEFAULT continuam presentes (ROLLBACK funcionou) |
| AC12 | Confirmação prévia do usuário | Registrada na Change Log v1.3 do story | PASS — "se tiver certeza que não vai quebrar nada, pode aplicar" |

**Vind exact baseline check:**
```
SELECT commercial_rules->>'requires_down_payment' AS rd,
       commercial_rules->>'min_down_payment' AS legacy_brl,
       commercial_rules->>'mcmv_eligible' AS mcmv
FROM properties WHERE slug='vind-residence';
-- {rd: "true", legacy_brl: "68000", mcmv: "false"}
```
Bate exatamente com o baseline da story (linha 73).

**Yarden integrity:**
```
{slug:"yarden", commercial_rules:{mcmv_eligible:false, requires_down_payment:true}}
```
Intacto.

**`convalidated=true`** confirmado em `pg_constraint` — a constraint NÃO está marcada `NOT VALID`, ou seja, **foi validada retroativamente contra os 2 rows existentes** e ambos passaram. Isso é o comportamento desejado (per Dev Notes: "design atual sem NOT VALID explícito é seguro porque a constraint é permissiva a dados existentes").

---

## 4. No Regressions

- `pnpm -r type-check` em todos os 5 pacotes (`@trifold/shared`, `@trifold/db`, `@trifold/bot`, `@trifold/ai`, `@trifold/web`): **TODOS clean.**
- `git diff --stat HEAD origin/main`: vazio (nada commitado ainda). Untracked: o migration file `supabase/migrations/043_property_commercial_rules_v2.sql`, o story file, este gate report, e arquivos de memória — exatamente o esperado.
- `packages/ai/src/chat/pipeline.ts:1072-1142` (`buildPropertyDataContext`) — typecheck clean. A função tipa `commercial_rules?: Record<string, unknown>` (linha 100) — leitura tolerante, não impactada pela CHECK constraint.
- `packages/web/src/app/dashboard/properties/[id]/edit/page.tsx` — typecheck clean.
- RLS policies em `properties` (`properties_select` por org_id, `properties_manage` por admin/supervisor) — confirmadas intactas via `pg_policies` query.
- Trigger único em `properties`: `set_updated_at` (BEFORE UPDATE) — intacto e não conflita com `commercial_rules`.

---

## 5. Performance

- ALTER TABLE ADD CHECK em tabela com 2 rows — operação trivial (<10ms).
- CHECK é avaliação puramente sintática sobre o jsonb (sem joins, sem subqueries) — overhead em INSERTs/UPDATEs subsequentes é insignificante.
- `convalidated=true` significa que o full table scan de validação retroativa já rodou (2 rows — instantâneo).
- Não há impacto em planners de query existentes (a constraint não altera estatísticas nem planos).

---

## 6. Security — 1 Observação (CONCERN, não-bloqueante)

**RLS isolation:** Confirmado intacto. Policies `properties_select` (filtro por `org_id = user_org_id()`) e `properties_manage` (admin/supervisor por org) continuam ativas. A CHECK constraint opera no nível de coluna — sem acesso a `org_id`, sem possibilidade de vazamento entre orgs.

**Schema permissivo (BY DESIGN):**
- NEG-ATTEMPT-2 (`financing_options: ["pix"]`) foi **aceito** pela CHECK constraint. Isso NÃO é um bug — o doc de arquitetura (linha 580) explicitamente define que enum-validation é responsabilidade da camada **Zod/CheckboxList** (UI), enquanto a CHECK constraint SQL valida APENAS `jsonb_typeof = 'array'`. Esta escolha é deliberada para preservar dados legados (ex: Vind com `min_down_payment: 68000`).
- **Recommendation (não-bloqueante, para @architect / Story 31.5):** garantir que TODO INSERT/UPDATE em `properties.commercial_rules` na API (`/api/properties/[id]/route.ts`) passe pelo `CommercialRulesSchema.parse()` antes de tocar o DB. Sem isso, um cliente malicioso da API admin poderia injetar `financing_options: ["pix"]` ou outros enum-violators. Story 31.5 já está scopada para adicionar essa validação via Zod no API handler — então o gap é coberto pelo plano do epic.

**Proto-pollution probe (`__proto__`):** Tentei `INSERT ... commercial_rules='{"__proto__":{"isAdmin":true},"min_down_payment_pct":5}'` — aceito pela constraint (pg `jsonb` trata `__proto__` como key literal, sem semântica JS). **No DB layer não há risco.** Risco potencial só materializaria se código JS fizesse `Object.assign({}, rowFromDb)` — não é caso aqui (o pipeline usa `p.commercial_rules as Record<string, unknown>` com leitura tipada). Sem ação necessária.

**Função `validate_commercial_rules(jsonb)`:** Confirmei `SELECT * FROM pg_proc WHERE proname LIKE '%commercial_rules%'` → vazio. A constraint é inline (sem SQL function), exatamente como decidido no scope da story.

---

## 7. Documentation

- Story 31.2 tem File List preenchida (1 arquivo: `supabase/migrations/043_property_commercial_rules_v2.sql` — CREATE).
- Dev Agent Record completo, com detalhes do Management API endpoint, payload encoding e debug log.
- Change Log v1.3 atualizada por @data-engineer com resultado dos smoke tests.
- Memory `feedback_properties_smoke_test_required_columns.md` criada em `.claude/agent-memory/aios-data-engineer/` (verificada — bem estruturada com rule + why + how-to-apply).
- Doc de arquitetura `nicole-data-layer-refactor.md` Seção 3.3 continua coerente com o DDL aplicado (já tinha sido renumerado 040→043 na v1.2).

---

## Atenção Máxima — 4 Itens Verificados

### 1. Drift de tracking (numeric vs. timestamp)

`schema_migrations` mais recentes em produção (ordenadas DESC):
```
20260515134909  042_cliente_id_destinatario        (Epic 33 - Lucas)
20260515132220  041_clientes_crm                   (Epic 33 - Lucas)
20260515125117  040_brinde_tipo_id_destinatario    (Epic 33 - Lucas)
20260515120510  036_brindes_tipos
...
043             043_property_commercial_rules_v2   (Story 31.2 - Dara)  ←  DRIFT VISÍVEL
039             admin_mensagens_rpc_remote_only
038             conversations_last_message_preview_remote_only
```

**Drift confirmado:** Epic 33 (Lucas) usou versions estilo timestamp (`20260515134909` = formato `YYYYMMDDHHMMSS` que o `supabase migration new` gera). Story 31.2 (Dara) usou `'043'` numeric (convenção Epic 29 — `.claude/agent-memory/aios-data-engineer/project_migration_tracking_drift.md`).

**Impacto:**
- `ORDER BY version DESC` faz comparação lexicográfica de string → `'20260515134909' > '043'`, então timestamps aparecem antes em queries de "última migration". Isso é COSMÉTICO, não bloqueante.
- `supabase db pull` e `supabase migration list` (CLI local) podem desordenar quando reconciliando — risco BAIXO porque o file system local usa o prefixo do arquivo `.sql` como source of truth, não a string `version` da tabela.
- Recomendação (não-bloqueante): **decidir entre Lucas e Dara qual convenção segue** — ou Epic 31 também migra para timestamps (alinhar com Epic 33), ou Epic 33 retrocede para numeric (alinhar com convenção Epic 29). Documentar no `.claude/agent-memory/aios-architect/project_epic_29_migration_convention.md` qual venceu.
- **Esta story 31.2 cumpriu sua convenção (Epic 29) corretamente** — não vou bloquear o gate por divergência inter-epic.

### 2. Vind data intactness — CONFIRMADO

```
{requires_down_payment: true, min_down_payment: 68000, mcmv_eligible: false}
```
Bate exatamente com o baseline declarado na linha 73 do story (e Apêndice A.1 do doc de arquitetura). **Zero alteração.**

### 3. Erro silencioso — NEGATIVO (limpo)

`SELECT * FROM properties WHERE slug LIKE '__test_%' OR name LIKE '__test_%'` → **0 rows.**
`SELECT * FROM properties WHERE name LIKE '__qa_%' OR slug LIKE '__qa_%'` → **0 rows** (após minhas tentativas independentes).
`SELECT count(*)::int FROM properties` → **2** (Vind + Yarden, baseline T1.4 preservado).

Todos os smoke tests (do Dara e meus) usaram `BEGIN; ... ROLLBACK;` — nenhuma linha de teste vazou em produção.

### 4. `pg_constraint.convalidated`

```
{convalidated: true}
```
A constraint **não** foi marcada `NOT VALID`. Postgres validou os 2 rows existentes no momento do `ADD CONSTRAINT` e ambos passaram. Comportamento desejado conforme Dev Notes (linha 220 da story).

---

## 3 Tentativas de Quebrar a Constraint

| # | INSERT payload | Esperado | Resultado | Pass/Fail |
|---|----------------|----------|-----------|-----------|
| NEG-1 | `{"min_down_payment_pct": -50}` | Bloqueado (pct < 0) | ERROR 23514 | PASS — constraint cumpre seu papel |
| NEG-2 | `{"financing_options": ["pix"]}` | Aceito (SQL valida só array type, não enum) | INSERT bem-sucedido | **PASS — comportamento esperado** (validação enum é Zod/UI per arch doc linha 580). Não é gap. |
| NEG-3 | `{"example_down_payment_brl": -1000}` | Bloqueado (BRL < 0) | ERROR 23514 | PASS — constraint cumpre seu papel |

**Conclusão:** A constraint comporta-se **exatamente** conforme o design. 2/3 bloqueados (numéricos out-of-range) + 1/3 aceito (enum-validation é responsabilidade da camada superior). **Nenhum gap real de segurança.**

---

## Issues Encontradas

### CONCERN-1 — Drift de migration tracking entre Epic 31 e Epic 33 (LOW)

- **Severity:** LOW (cosmético, não impacta runtime)
- **Category:** docs / convention
- **Description:** Story 31.2 usou `version='043'` numeric (Epic 29 convention) enquanto Epic 33 mergeou com `version='20260515*'` timestamps. `ORDER BY version DESC` lexicográfico desordena.
- **Recommendation:** @architect ou @pm decide qual convenção é canônica e atualiza `project_epic_29_migration_convention.md`. Não bloqueia esta story.

### CONCERN-2 — Enum validation depende exclusivamente de Zod/UI (MEDIUM, mas escopado para Story 31.5)

- **Severity:** MEDIUM (mitigado pelo plano do epic)
- **Category:** security
- **Description:** A CHECK constraint SQL não valida valores de enum em `financing_options` — aceita strings arbitrárias dentro do array. Validação é responsabilidade do app layer (Zod). Sem isso, um cliente admin malicioso da API poderia injetar valores inválidos.
- **Recommendation:** Confirmar na Story 31.5 que `CommercialRulesSchema.parse()` é executado em `/api/properties/[id]/route.ts` PUT/PATCH antes de tocar o DB. **Isto está no scope da Story 31.5** — não bloqueia 31.2.

### Nenhum issue HIGH ou CRITICAL.

---

## Status Final

| Item | Status |
|------|--------|
| Migration aplicada em produção | YES (Sessão 1 + Sessão 2 do Dara) |
| 12/12 ACs revalidados por @qa | PASS |
| 3 tentativas de quebrar a constraint | 2 bloqueadas + 1 aceita por design — PASS |
| Typecheck clean (todos os 5 pacotes) | PASS |
| Tests relevantes passam (commercial-rules, pipeline, flows) | PASS |
| Zero rows de teste persistidas em produção | PASS |
| Vind/Yarden baseline preservado | PASS |
| RLS intacta | PASS |
| Memory lesson registrada | PASS |
| Documentation completa | PASS |
| Issues bloqueantes | 0 |
| Issues CONCERN (não-bloqueantes) | 2 (LOW + MEDIUM-escopada) |

**Verdict: PASS** — Story 31.2 está pronta para git commit + push pelo @devops.

---

## Próximo Passo

```
@devops *push
```

Files para commit:
- `supabase/migrations/043_property_commercial_rules_v2.sql` (CREATE)
- `docs/stories/active/31-2-migration-043-commercial-rules-ddl.md` (UPDATE — QA Results + Change Log v1.4)
- `docs/qa/gates/31-2-qa-gate.md` (CREATE — este arquivo)
- Memory files relevantes em `.claude/agent-memory/aios-data-engineer/`

Commit message sugerido (conventional):
```
feat(db): migration 043 commercial_rules CHECK constraint [Story 31.2]
```

---

*Gate executado por Quinn (@qa) — Synkra AIOS Quality Guardian*
