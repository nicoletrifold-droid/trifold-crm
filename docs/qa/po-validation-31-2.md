---
validator: Pax (@po)
story: 31.2
story_title: "Migration 043 — DDL CommercialRules v2 (CHECK constraint)"
epic: 31
validation_date: 2026-05-15
checklist: po-master / story-draft (AIOS 10-point)
arch_ref: docs/architecture/nicole-data-layer-refactor.md v1.2
verdict: GO (conditional — 2 should-fix triviais + 1 nice-to-have)
score: 9 / 10
implementation_readiness: 9
confidence: High
risk: HIGH (primeira story do epic 31 que toca DB de produção)
---

# PO Validation Report — Story 31.2

## TL;DR

Story 31.2 é uma migration aditiva (DEFAULT jsonb + CHECK constraint permissiva) com escopo S (3h). É a **primeira do Epic 31 que toca DB de produção**, então herda risk HIGH. A story está excepcionalmente bem desenhada para essa categoria de risco:

- T1 (spike Pre-Flight de 5 sub-queries) antes de escrever SQL — previne aplicação cega
- T3 (gate humano obrigatório) com 3 sub-passos de confirmação
- T5 (8 smoke tests com `ROLLBACK` explícito) cobre todos os AC
- AC 6 valida o caso mais delicado: campo legado `min_down_payment: 68000` do Vind passa sem rejeição
- Rollback documentado em 4 statements SQL completos (constraint, default, comment, tracking)
- Convenção Epic 29 (Management API + tracking manual) seguida explicitamente
- 4 hazards específicos de migration Supabase mapeados e mitigados (NOT VALID opcional, hazard 55P04 N/A, version conflicts, idempotência)

**Verdict: GO (9/10).** 2 should-fixes triviais (stale `Migration 040` em comment do shared types vs `043`; `consrc` deprecated em pg_constraint para PG12+) e 1 nice-to-have (testar duplicado/idempotência). **Nada bloqueia.** Detalhes abaixo.

---

## 10-Point Checklist (AIOS Master)

| # | Critério | Status | Justificativa |
|---|----------|--------|---------------|
| 1 | Título claro e objetivo | **PASS** | "Migration 043 — DDL CommercialRules v2 (CHECK constraint)" — escopo evidente; subtitle marca Pre-Flight obrigatório + risco. |
| 2 | Descrição completa | **PASS** | User story canônica (As a / I want / so that). Dev Notes contêm DDL embarcado, estado do DB de produção pré-migration, hazards conhecidos e plano de rollback. Self-contained (não precisa abrir arch doc para implementar). |
| 3 | AC testáveis | **PASS** | 12 AC, todos com query SQL ou critério binário verificável: existência de arquivo, contagem de rows, tracking row, queries SQL de smoke test com expected output explícito (T5.1-T5.8). AC 3 e 4 incluem o INSERT exato + ROLLBACK obrigatório. |
| 4 | Escopo bem definido (IN/OUT) | **PASS** | Seção Scope com 4 IN e 6 OUT explícitos. OUT lista corretamente que backfill é 31.3, código TS é fora, função SQL separada é fora. |
| 5 | Dependências mapeadas | **PASS** | `depends_on: ["31.1 (Done — commit b01470b)"]`. Verificado: 31.1 está Done em `origin/main`, commit b01470b confirmed. Dev Notes "Dependência da Story 31.1" explica que o DDL é espelho SQL do Zod. |
| 6 | Estimativa de complexidade | **PASS** | `effort: S`, `story_points: 3`, `estimated_hours: 3`. Bate com Seção 8 da arquitetura. Realista: 1 arquivo SQL pequeno + spike + smoke tests. |
| 7 | Valor de negócio | **PASS** | Dev Notes "Contexto do Epic 31" + a story principal explicam: schema validation automática no DB previne dados malformados em prod, fundação para 31.3-31.9. Bate com goal do Epic ("time comercial edita regras sem deploy"). |
| 8 | Riscos documentados | **PASS** | 3 seções explícitas de risco: (a) AVISO DE RISCO no topo, (b) Hazards conhecidos (55P04 N/A, version conflicts mitigado por tracking manual), (c) Multi-tenancy (Risco 3 do doc cross-referenciado e tratado). NOT VALID explícito documentado como opção de segurança extra. |
| 9 | Definition of Done clara | **PASS** | 12 AC servem como DoD. Cada um tem query de validação. AC 11 (rollback testável) e AC 12 (gate humano) são gates de processo claros. |
| 10 | Alinhamento com PRD/Epic | **CONCERN** | DDL bate 100% com Seção 3.3. Ordem (31.1 → 31.2) bate com Seção 7.2. **Mas 1 inconsistência menor entre repo e doc:** o comentário no Zod schema (`packages/shared/src/types/commercial-rules.ts:31`) ainda referencia `Migration 040` (numeração pré-v1.2 do doc). Não bloqueia esta story (a 31.2 cria 043 correto), mas merece anotação para a 31.3 ou cleanup posterior. |

**Score: 9/10** (1 CONCERN em ponto 10, demais PASS)

---

## Validações HIGH-RISK Específicas (10 pontos extras solicitados pela lead)

### V1 — AC11 (Rollback executável) — **PASS**

Rollback documentado em Dev Notes "Rollback completo" com **4 statements SQL** explícitos:

1. `ALTER TABLE properties DROP CONSTRAINT IF EXISTS commercial_rules_shape_check` (idempotente via IF EXISTS)
2. `ALTER TABLE properties ALTER COLUMN commercial_rules DROP DEFAULT`
3. `COMMENT ON COLUMN properties.commercial_rules IS NULL` (limpa comment)
4. `DELETE FROM supabase_migrations.schema_migrations WHERE version = '043'`

E ainda menciona deletar o arquivo `.sql` do repo. **Cobertura completa.** Restauração do DEFAULT antigo: NÃO é necessária — a coluna originalmente NÃO tinha DEFAULT (column_default = NULL), e o rollback `DROP DEFAULT` retorna ao estado original. Confirmado coerente com Seção 7.3 Cenário B do doc. AC 11 só pede que o `DROP CONSTRAINT` rode sem erro — adequado para o tamanho de risco.

**Nice-to-have NTH-3 (não bloqueante):** Adicionar uma query SQL de **confirmação pós-rollback** (`SELECT conname FROM pg_constraint WHERE conname = 'commercial_rules_shape_check'` esperando 0 linhas). Story não tem isso explícito, mas qualquer dev competente roda a verificação manual.

### V2 — AC12 (Gate humano) — **PASS com nuance**

Gate é inequívoco em T3:
- **T3.1:** exibir conteúdo do `.sql`
- **T3.2:** exibir resumo do que será executado e impacto
- **T3.3:** **AGUARDAR confirmação explícita do usuário** — "Se o usuário não confirmar, parar."

Critério de aceitação: confirmação explícita em texto ("sim/ok/aplica"). É binário. **Quando o gate é cumprido:** quando o usuário digitar uma das três strings. Não é apenas "exibir DDL" — exige resposta humana.

**Nuance documentada (não bloqueante):** O termo "explícita ('sim/ok/aplica')" no AC 12 é a lista de strings aceitas — qualquer dev humano lendo isso entende, mas se essa story for executada por @data-engineer em modo autônomo, ele precisa de instrução clara sobre como detectar a confirmação. O Pre-Flight mode da Story (declarado no frontmatter `executor: @data-engineer | quality_gate: @dev`) garante que isso é interativo. **OK.**

### V3 — AC6 (Permissividade a campos extras) vs Zod schema 31.1 — **PASS**

Verificação cruzada com `packages/shared/src/types/commercial-rules.ts`:

```typescript
export const CommercialRulesSchema = z
  .object({ ... })
  .partial()    // NÃO usa .strict()
```

**Análise:** Zod por padrão **strip** campos desconhecidos no parse (não rejeita). `.partial()` apenas torna todos os campos opcionais. **Não há `.strict()` ou `.passthrough()` aplicado** — o comportamento Zod default já é permissivo a extras (silenciosamente descarta, não throw). Isso é **coerente** com a CHECK constraint SQL que aceita campos extras como `min_down_payment` legado.

Divergência sutil porém aceitável: Zod **descarta** campo legado no parse de saída; SQL **mantém** o campo no jsonb. Para esta story (DDL puro), isso não importa. Para 31.5 (UI que faz PATCH), o admin precisa cuidar que payload PATCH não inclui campos legados — mas isso é problema da 31.5, não 31.2. **AC 6 está correto.**

### V4 — `NOT VALID` + `VALIDATE` strategy — **PASS**

Story trata explicitamente em Dev Notes (lines 222-229 da story):

> "Se preferir usar `NOT VALID` explicitamente para evitar validação retroativa (abordagem mais segura com muitos dados), substituir o `ADD CONSTRAINT` por: `ADD CONSTRAINT ... NOT VALID;` Depois de confirmar que dados existentes passam: `VALIDATE CONSTRAINT commercial_rules_shape_check;`"

**Análise do design atual (sem `NOT VALID` explícito):** A constraint é **autoexcludente** para dados existentes — usa cláusulas `NOT (commercial_rules ? 'campo') OR ...` que **passa automaticamente** se o campo não existe. Verifiquei manualmente o caso Vind:

- Vind tem `{"requires_down_payment": true, "min_down_payment": 68000, "mcmv_eligible": false}` 
- A CHECK constraint só valida `min_down_payment_pct` (campo NOVO que Vind NÃO tem), `example_down_payment_brl` (idem), `financing_options`/`identification_keywords`/`key_selling_points` (idem)
- O campo legado `min_down_payment` (sem `_pct`) **NÃO é mencionado na constraint** — passa livre
- Resultado: a constraint, mesmo sem `NOT VALID`, passa automaticamente em todos os dados existentes

**Se o `VALIDATE` (no caminho alternativo) falhar:** impossível na prática para o estado atual do DB. Mas se em algum momento alguém edita Vind via UI e seta `min_down_payment_pct: 150` antes desta migration rodar, sim, `VALIDATE` falharia. O design defensivo seria adotar `NOT VALID` explícito — a story deixa essa decisão ao @data-engineer no Pre-Flight, o que está correto. **PASS.**

### V5 — Idempotência (rodar 2x) — **CONCERN (mas tratado pelo Pre-Flight)**

A story declara em Dev Notes "default jsonb com todos os novos campos (idempotente)" — mas isso refere à idempotência do **DEFAULT** (sobrescreve sem erro). 

**O problema real:** `ALTER TABLE ADD CONSTRAINT` **falha** na segunda execução com erro `relation "commercial_rules_shape_check" already exists`. Postgres não suporta `IF NOT EXISTS` em CHECK constraints nativamente (até PG 15+, e o Supabase atual roda PG 17.4 conforme `aios doctor`, mas a versão do constraint syntax precisa ser confirmada).

**Como a story trata:** Indiretamente, via **T1.2** (spike pré-migration: `SELECT conname, consrc FROM pg_constraint WHERE conrelid = 'properties'::regclass AND contype = 'c'` — "confirmar que `commercial_rules_shape_check` NÃO existe ainda (se já existir, parar e reportar ao usuário)"). 

Esse é um circuit breaker explícito que previne re-execução. **É adequado para uma story Pre-Flight com gate humano.** Não há plano de "rerun automático" — se T1.2 detectar a constraint já presente, o @data-engineer para e reporta.

**Nice-to-have NTH-4 (não bloqueante):** Story poderia incluir um wrapper `DO $$ ... IF NOT EXISTS ... END $$` no SQL para tornar a migration verdadeiramente idempotente:
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commercial_rules_shape_check') THEN
    ALTER TABLE properties ADD CONSTRAINT commercial_rules_shape_check CHECK (...);
  END IF;
END $$;
```
Mas isso adiciona complexidade ao arquivo `.sql` e o spike de T1.2 já resolve o problema operacionalmente. **PASS conditional.**

### V6 — Convenção Epic 29 (Management API + tracking manual) — **PASS**

Story declara explicitamente em Dev Notes "Convenção de aplicação via Management API (Epic 29)" com 4 sub-pontos:

1. Token em `~/.supabase/access-token` ✓
2. **NÃO usar `supabase db push`** (evita BEGIN/COMMIT tx que pode interferir com DDL) ✓
3. Aplicar cada statement individualmente via Management API ✓
4. Registrar tracking manual: `INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ('043', ...)` ✓

**Cross-check com memória `project_epic_29_migration_convention`:** Bate 100%.

- Slot 043 livre ✓ (confirmed via `ls supabase/migrations/`: 040, 041, 042 ocupados; 043 disponível)
- Numbering "3 digits zero-padded" ✓
- Versão é `'043'` (string, conforme schema_migrations da memória) ✓
- Tracking row obrigatório post-application ✓

T4.3 inclui o detalhe crucial sobre poll (30-60s) — bate com a observação histórica de Story 29.6. **PASS.**

### V7 — Coherence com Story 31.3 (backfill consumer) — **PASS**

Cross-check da Seção 3.4 do doc (DDL do backfill 044) vs Seção 3.3 (DDL desta migration). Todos os campos que 31.3 vai popular:

| Campo do backfill | Validado pela CHECK constraint? | Tipo aceito |
|-------------------|----------------------------------|-------------|
| `requires_down_payment` | NÃO (não validado, qualquer valor passa) | boolean (livre) |
| `min_down_payment_pct: 10` | SIM | numeric, 0-100 → 10 ✓ |
| `example_down_payment_brl: 40000 ou 60000` | SIM | numeric, >=0 → 40000/60000 ✓ |
| `down_payment_flexible: true` | NÃO | boolean (livre) |
| `financing_options: jsonb_build_array(...)` | SIM (typeof = 'array') | array ✓ |
| `mcmv_eligible: false` | NÃO | boolean (livre) |
| `key_selling_points: jsonb_build_array(...)` | SIM (typeof = 'array') | array ✓ |
| `ideal_buyer_profile: 'Quem busca ...'` | NÃO | string (livre) |
| `identification_keywords: jsonb_build_array(...)` | SIM (typeof = 'array') | array ✓ |
| `status_label: 'próximo da entrega'` | NÃO | string (livre) |
| `notes: null` | NÃO | (qualquer) |

**Todos os 11 campos do backfill passam pela CHECK constraint definida em 31.2.** Nenhum tipo conflita. **PASS.**

### V8 — Multi-tenancy (CHECK não acessa auth.uid()) — **PASS**

Verificado:
- A CHECK constraint é **stateless** — não tem `SELECT`, não tem chamada de função externa, não referencia `auth.uid()` ou `current_user`. Apenas inspeciona o próprio jsonb com `jsonb_typeof`, `?`, `->`, `->>`.
- Não há função `validate_commercial_rules(jsonb)` SQL separada — a story decidiu **inline** (declarado em Scope OUT linha 362). Isso é melhor porque elimina overhead e categoria de risco "função STABLE vs IMMUTABLE não declarada".
- RLS `properties_select` (em `004_rls_policies.sql:238`) filtra por `org_id` — **não é tocado por esta migration**.

Story documenta tudo isso em "Multi-tenancy (Risco 3 do doc de arquitetura)". **PASS.**

### V9 — Smoke tests com ROLLBACK não sujam histórico — **PASS**

Smoke tests (T5.2, T5.3, T5.4) usam `BEGIN; ... ROLLBACK;` explícito. Em Postgres:

- **Transação rolled back NÃO aparece em `pg_stat_statements`** (statement-level statistics — sim, aparece a tentativa, mas isso é monitoramento, não "histórico" de dados)
- **NÃO suja `pg_wal` permanentemente** — WAL é compactado/recycled após checkpoint
- **NÃO afeta replicas** — Supabase usa logical replication, e ROLLBACKs não geram registros de replicação para tabelas inseridas
- **NÃO incrementa sequence values irreversíveis** — `properties` usa `gen_random_uuid()` para PK (verificado em `002_property_schema.sql`), então rollback descarta o UUID gerado sem gap

**Único side effect possível:** se a tabela `properties` tem trigger BEFORE INSERT que escreve em outra tabela (audit log com `SECURITY DEFINER`/autonomous tx), esse side effect persistiria. Verificado: `properties` NÃO tem trigger desse tipo (busca em `supabase/migrations/` por `CREATE TRIGGER.*properties.*INSERT` retorna apenas RLS, sem audit autonomous). **PASS.**

### V10 — Plano de validação pós-aplicação (lista de queries) — **PASS**

Dev Notes seção "Smoke tests SQL completos (referência para T5)" lista **8 queries SQL completas** com **expected output** explícito para cada AC (T5.1 a T5.8). Cobertura:

- T5.1: tracking row exists ✓
- T5.2: smoke negativo (CHECK rejeita) ✓
- T5.3: smoke positivo (CHECK aceita válido) ✓
- T5.4: NULL não barrado ✓
- T5.5: Vind intocado (dados legados preservados) ✓
- T5.6: DEFAULT configurado ✓
- T5.8: count(*) baseline matched ✓

**Adicional encontrado:** T5.7 (COMMENT) — query usando `col_description('properties'::regclass, attnum)`. **Concern menor (SF-2 abaixo):** essa query usa joins com `pg_attribute` — sintaxe correta, mas `consrc` na T1.2 está deprecated em PG12+. **Documento como should-fix.**

---

## CodeRabbit Integration (Conditional)

**Status: N/A.** `core-config.yaml` não tem `coderabbit_integration.enabled: true`. Story corretamente declara CodeRabbit como Disabled e substitui por validação SQL manual. Skip notice OK conforme `.aios-core/development/tasks/validate-next-story.md` step 8.

---

## Executor Assignment Validation (Story 11.1)

- `executor: @data-engineer` ✅ (DDL SQL Supabase production — classifica como "Database/Schema/Migrations" → Dara)
- `quality_gate: @dev` ✅ (re-executar smoke tests independentemente — coerente com Type-to-Executor: migration DDL → QG @dev)
- `quality_gate_tools: [management_api_migration_validation, insert_valid_jsonb_test, insert_invalid_jsonb_test, schema_migrations_row_count]` ✅ (apropriados — cobrem AC 2, 3, 4)
- `executor != quality_gate` ✅ (@data-engineer != @dev)

---

## Anti-Hallucination Verification

- **DDL da Seção 3.3 do doc vs DDL embarcado na story:** byte-by-byte match. ✓
- **Migration slot 043:** confirmed livre via `ls supabase/migrations/` — slot 042 é o último ocupado (042_cliente_id_destinatario.sql). ✓
- **Story 31.1 commit b01470b:** confirmed via `git log --oneline -- packages/shared/src/types/commercial-rules.ts` retorna `b01470b feat(shared): add CommercialRules types and Zod schema [Story 31.1]`. ✓
- **Apêndice A.1 referenciado (`min_down_payment: 68000` no Vind):** confirmed presente no doc. ✓
- **Convenção Epic 29 cross-ref:** memória `project_epic_29_migration_convention.md` existe e bate com o que a story afirma. ✓
- **Memória `project_supabase_migration_pitfalls.md`:** confirmed em `/Users/ogabrielhr/.claude/projects/.../memory/`. Conteúdo: 2 hazards (55P04 enum-in-same-tx + version conflicts via Studio). **Story refere corretamente os 2 hazards e marca 55P04 como N/A (correto — esta migration não toca enums).** ✓
- **Inconsistência única detectada:** comentário no Zod schema `packages/shared/src/types/commercial-rules.ts:31` diz "Migration 040" — stale após renumber v1.2 do doc para 043. **NÃO bloqueia 31.2** (a story cria 043 corretamente), mas merece anotação para fix em 31.3 ou cleanup. → **SF-1 abaixo.**

---

## Critical Issues (Must Fix — Block Story)

**Nenhum.** Story está implementável as-is.

---

## Should-Fix Issues (Important Quality Improvements)

### SF-1 — Stale reference a `Migration 040` no comment do Zod (recommended, NÃO bloqueia 31.2)

**Localização:** `packages/shared/src/types/commercial-rules.ts`, linha 31.

**Conteúdo atual:**
```
`.partial()` torna todos os campos opcionais — alinhado à CHECK constraint
do DB (Migration 040) que valida shape mas não exige completude.
```

**Problema:** O doc de arquitetura foi renumberado em v1.2 (2026-05-15) de 040→043, mas o comment Zod permaneceu apontando para 040 (que agora é `040_brinde_tipo_id_destinatario.sql` — totalmente unrelated).

**Fix sugerido:** trocar "Migration 040" por "Migration 043" no comment.

**Impacto se não corrigido:** desenvolvedor lendo o Zod schema fica confuso ao buscar a migration. ~30s de fricção. Esta story NÃO precisa corrigir (escopo é DDL, não TS), mas fica anotado para a Story 31.3 (que vai mexer no backfill SQL — pode incluir esse rename trivial), ou stand-alone fix.

### SF-2 — `consrc` deprecated em PG12+ (T1.2 spike query)

**Localização:** Story 31.2 Tasks/Subtasks T1.2 (linha 97 da story).

**Conteúdo atual:**
```sql
SELECT conname, consrc FROM pg_constraint
WHERE conrelid = 'properties'::regclass AND contype = 'c'
```

**Problema:** Em Postgres 12+, a coluna `consrc` (definição source da check constraint) foi **removida** de `pg_constraint`. Supabase roda PG 17.4 — essa query vai retornar erro `column "consrc" does not exist`. A query equivalente moderna é:
```sql
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'properties'::regclass AND contype = 'c'
```

**Fix sugerido:** trocar `consrc` por `pg_get_constraintdef(oid) AS definition` na T1.2.

**Impacto se não corrigido:** @data-engineer roda T1.2, recebe erro de coluna, descobre workaround em ~3-5 min. Não bloqueia mas evitável. **Should-fix antes do @data-engineer começar.**

---

## Nice-to-Have Improvements (Optional)

- **NTH-1:** Adicionar `IF NOT EXISTS` wrapper em `DO $$ ... END $$` para tornar a migration verdadeiramente idempotente (rodar 2x sem erro). T1.2 spike já mitiga operacionalmente.
- **NTH-2:** Adicionar query SQL pós-rollback de **confirmação** (`SELECT COUNT(*) FROM pg_constraint WHERE conname = 'commercial_rules_shape_check'` esperando 0) no plano de rollback de Dev Notes.
- **NTH-3:** No AC 12, especificar timeout/escalation para o gate humano (ex: "se sem confirmação em 30 min, marcar story como Blocked e notificar @sm"). Atualmente é open-ended "aguardar".

---

## Implementation Readiness

| Dimensão | Score | Comentário |
|----------|-------|------------|
| Clareza do escopo | 10/10 | IN/OUT explícitos, DDL embarcado, OUT lista 6 itens |
| Completude técnica | 9/10 | DDL canônico copiado, smoke tests SQL completos, 1 query com syntax deprecated |
| Testabilidade | 10/10 | 8 smoke tests SQL com expected output explícito |
| Self-containment | 10/10 | DDL embarcado nas Dev Notes; precisa do arch doc apenas para context |
| Risco | 8/10 | HIGH risk inerente (DB prod), MITIGADO por spike Pre-Flight + gate humano + rollback completo + 8 smoke tests |

**Score agregado: 9/10. High confidence em execução bem-sucedida em 3h.**

---

## Final Verdict

**GO** — story está READY para `@data-engineer` pickup com 2 should-fixes recomendados mas **não bloqueantes** (SF-1 fora do escopo desta story; SF-2 trivial, 1 linha de SQL).

Status do frontmatter da story atualizado de `Draft` → `Ready`. Change Log atualizado com entrada de validação.

**Próximo passo recomendado:**

1. @sm corrige SF-2 inline (T1.2 query syntax — 30s de edit no `.md` da story) — opcional mas recomendado antes de invocar @data-engineer.
2. @data-engineer ativa `*develop 31.2` em modo **Pre-Flight** (declarado obrigatório no frontmatter — não usar YOLO para esta story).
3. Em T3 (gate humano), @data-engineer apresenta DDL completo ao Gabriel e aguarda confirmação `sim/ok/aplica` antes de prosseguir para T4.
4. Após T6, @dev (quality gate) re-executa smoke tests T5.1-T5.8 independentemente.
5. Após PASS no quality gate, @devops faz commit e push da migration.

**Critério de retomada se algo falhar:** se T1.2 detectar `commercial_rules_shape_check` já existente, ou T1.5 detectar slot 043 ocupado, parar e reportar — não tentar workaround silencioso.

---

## Change Log (this validation)

| Date | Action | By |
|------|--------|-----|
| 2026-05-15 | PO validation executed (10-point + 10 HIGH-RISK extras) | Pax (@po) |
| 2026-05-15 | Verdict GO (9/10), status updated Draft → Ready | Pax (@po) |
| 2026-05-15 | 2 should-fixes documented (SF-1 stale Migration 040 in Zod comment, SF-2 consrc deprecated in T1.2) | Pax (@po) |
| 2026-05-15 | 3 nice-to-haves documented (NTH-1 idempotency wrapper, NTH-2 rollback confirmation query, NTH-3 gate timeout) | Pax (@po) |
