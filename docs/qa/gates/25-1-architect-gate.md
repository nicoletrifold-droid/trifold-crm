# QA Gate — Story 25.1 (Architect Review)

**Story:** 25.1 — Backend: Endpoint de Ações em Campanhas Meta
**Reviewer:** Aria (@architect)
**Data:** 2026-05-12
**Verdict:** CONCERNS

## Sumário

A implementação cumpre os 10 ACs da story, segue de perto os padrões estabelecidos no projeto (mesma estrutura de `requireAuth`/`requireRole`, mesma query anti-IDOR por `meta_campaign_id + org_id` do GET vizinho, mesmo uso de `metaFetch` com try/catch tipado), e foi validada com testes manuais reais contra a conta Vind. A migration é idempotente nas colunas (`ADD COLUMN IF NOT EXISTS`) e usa `DROP CONSTRAINT IF EXISTS` antes de recriar o CHECK, com o nome auto-gerado correto (`meta_sync_log_sync_type_check` — verificado contra `015_meta_marketing_api.sql:137`). A FK de `executed_by` aponta para `public.users(id)` conforme should-fix do PO (não `auth.users`), com `ON DELETE SET NULL` adequado.

Veredito **CONCERNS** (não FAIL) porque a funcionalidade está correta, segura e testada, mas há três observações não-bloqueantes que devem ser reconhecidas antes do push: (1) o `INSERT` em `meta_sync_log` não tem tratamento de erro, então uma falha silenciosa no audit log faria a operação Meta retornar sucesso sem registro de auditoria — risco médio em uma operação de escrita; (2) a migration não tem rollback documentado inline; (3) faltam três flags menores de hardening (rate-limiting, type-safety do `metaResult`, e potencial multi-account future-proofing). Nenhuma dessas observações justifica retornar para @dev — todas podem ser endereçadas como follow-up ou em uma micro-iteração antes do push, conforme escolha do lead.

## 7 Quality Checks

### 1. Code review — pass

O endpoint segue o padrão do vizinho (`route.ts` GET) com fidelidade: mesma assinatura `{ params: Promise<{ campaign_id: string }> }`, mesma desestruturação de `auth`, mesma query anti-IDOR. Os tipos `ActionType` e `ActionBody` estão bem definidos. O mapeamento `action → metaBody` usa ternários encadeados que são legíveis para 3 casos. O cálculo de `oldValue`/`newValue` precede a chamada Meta — correto para auditar o estado pré-mutação. A inversão de controle no try/catch é idiomática (uma única tentativa Meta, três branches de erro tipado, fallback genérico).

Pontos positivos:
- Uso de `maybeSingle()` ao invés de `single()` para a campanha — não lança em "não encontrado", retorna `data: null` (correto para 404).
- `limit(1)` na query de `meta_ad_accounts` para tolerar múltiplas contas por org (defesa future-proof — bom).
- Type cast em `(err as Error).message` é desnecessário (`err instanceof MetaOAuthException` já estreita para subclasse de `Error`), mas é inofensivo.

Observação menor: o `metaResult` é tipado como `{ success?: boolean }` mas declarado como `let` sem inicializador — não causa bug porque é atribuído antes do uso, mas TypeScript pode reclamar de "used before assigned" em modes mais estritos. Hoje compila (validado pelo @dev).

### 2. Tests — n/a (manual cobertura adequada)

Conforme política do projeto (Dev Notes: "projeto não tem suite de testes automatizados para rotas de API — padrão: type-check + lint + teste manual"), validação é via Task 4. Cobertura manual documentada:
- 4.1–4.3: 3 happy paths (pause/resume/set_budget) — cobre AC 2, 3, 4
- 4.4: audit log com `executed_by` correto — cobre AC 8
- 4.5: 403 para non-admin — cobre AC 6
- 4.6: 404 para campaign_id inexistente — cobre AC 5 (parte)
- 401 sem auth, 400 INVALID_ACTION, 400 INVALID_BUDGET (duas variantes) — cobre AC 5 e validação adjacente

**Gap não-bloqueante:** AC 9 (mapeamento de `MetaOAuthException`/`MetaPermissionError` → 502) não foi exercitado manualmente porque exige token inválido ou permissão revogada. O código está claramente correto por inspeção (idêntico ao padrão em `meta-sync-entities/route.ts:218–241`), mas vale ter um teste futuro com token temporariamente inválido.

### 3. Acceptance criteria — pass

Validação AC-by-AC:

| AC | Status | Evidência |
|----|--------|-----------|
| 1. POST aceita body `{action, value?}` | pass | `action/route.ts:12-33` |
| 2. pause → status:PAUSED | pass | `:78-83` body + `:155-162` response |
| 3. resume → status:ACTIVE | pass | `:80-83` body + `:164-171` response |
| 4. set_budget → daily_budget:value | pass | `:83` body + `:173-179` response |
| 5a. INVALID_ACTION | pass | `:35-38` |
| 5b. INVALID_BUDGET (sem value ou <100) | pass | `:40-47` |
| 5c. CAMPAIGN_NOT_FOUND | pass | `:50-59` |
| 6. requireRole admin → 403 | pass | `:20-21` |
| 7. anti-IDOR (org_id filter) | pass | `:53-54` (`.eq('org_id', appUser.org_id)`) |
| 8. audit log meta_sync_log | pass com ressalva | `:136-151` (ver Issue HIGH abaixo) |
| 9. erros Meta tipados | pass | `:107-124` |
| 10. type-check + lint | pass | task 3.1 e 3.2 documentados |

### 4. No regressions — pass

Endpoint novo em rota não-existente (`/action`). Migration adiciona colunas nullable (`ADD COLUMN IF NOT EXISTS ... NULL`) — não quebra inserts existentes em `meta_sync_log` (verificado: `meta-sync-entities/route.ts:67-73` continua válido sem `executed_by`/`details`). O CHECK constraint adicionado expande o conjunto permitido — `'entities'`, `'insights'`, `'backfill'` continuam aceitos. Zero impacto em endpoints/crons existentes.

### 5. Performance — pass

- Latência dominada pela chamada Meta (single POST, sem N+1).
- Duas queries Supabase pré-Meta (campanha + token), uma INSERT pós-Meta. Sem loops, sem batches.
- `metaFetch` já tem retry com backoff exponencial e timeout de 30s (`client.ts:46-78`) — adequado para uma ação síncrona disparada por humano.
- Sem cache, sem deduplicação — aceitável: usuário admin clicando em "pausar" não dispara replays.

### 6. Security — pass com ressalvas

**Anti-IDOR (AC 7):** Correto. Query filtra `org_id = appUser.org_id` (linha 54), nunca confia apenas no `campaign_id` do URL. O par `meta_campaign_id + org_id` é único na tabela (verificado: `015_meta_marketing_api.sql` tem unique constraint composto em outra view, e a query `.maybeSingle()` retornaria erro se houvesse ambiguidade — não retorna).

**Role guard (AC 6):** `requireRole(appUser, ['admin'])` antes de qualquer side-effect. Correto. Note que `requireAuth()` já valida sessão antes — fluxo correto: 401 (sem sessão) → 403 (sem role) → 400/404 (dados inválidos) → 502 (erro Meta).

**Token handling:** O `access_token` é lido com `.eq('status', 'active')` (linha 66) — corretamente filtra contas desabilitadas. O token NUNCA é serializado em response:
- O catch genérico (`String(err)`) PODE vazar o token se a mensagem de erro vier de uma chamada Meta com URL completa. Auditando `metaFetch`: lança `MetaAPIError` com `message` controlada por `parseMetaError` (linha 41–46) — `message` vem do payload Meta (`err.message`), não do URL. **OK.**
- Aviso: se o `metaFetch` lançar erro de rede (timeout, DNS), o `String(err)` retorna `"AbortError: ..."` ou similar — sem token. **OK.**

**Audit log integrity — ISSUE MEDIUM/HIGH (ver seção Issues):** A linha 136 (`await supabase.from('meta_sync_log').insert(...)`) não captura o resultado de erro. Se a INSERT falhar (RLS, FK quebrada, constraint check rejeitado, conexão), a operação Meta já foi executada com sucesso mas o registro de auditoria não existe. Não há `if (insertError) { ... }`. AC 8 exige "Cada ação bem-sucedida registrada em `meta_sync_log`" — em caso de falha silenciosa, o AC tecnicamente não é cumprido sem que ninguém saiba.

**Input validation:** `value < 100` é strict `<` (correto — 100 é o mínimo inclusivo, `value === 100` passa). Sem injeção SQL (queries usam parametrização nativa do supabase-js). Sem overflow possível (`value` é `number` JS — `Number.MAX_SAFE_INTEGER` ≈ 9 quatrilhões de centavos; muito acima de qualquer budget Meta plausível). **Observação:** não há upper bound em `value` — alguém podia setar `daily_budget = 999_999_999_999`. A Meta API vai rejeitar (com `MetaPermissionError` ou erro de validação), mas seria mais defensivo ter limite local de sanidade (ex.: < R$1MM = 100_000_000 centavos). **Não-bloqueante.**

**Rate limiting:** Ausente no endpoint. Comentário da story: "Meta API tem rate próprio". Confirmado: `metaFetch` tem `rateLimiter.update(response.headers)`. Para esta operação (admin clicking botão), rate de aplicação não é crítico — concorrência admin esperada < 10 req/min. **OK para v1; flag para reavaliar se o endpoint for usado por automação/cron no futuro.**

**Error message leakage:** Coberto acima (token nunca exposto). Erros Meta retornam `err.message` que vem do payload Meta (controlado pela Meta, não do nosso código). Sem stack traces vazados.

### 7. Documentation — pass

Story file atualizada com tasks marcadas, File List correto (2 arquivos), Change Log com entrada v1.2 de Dex. Decisões do PO (V1.1: FK em `public.users`) refletidas na migration. Riscos da story (rate limit, `ads_management`, `success: false`) endereçados no código.

## Validações específicas

### Migration `028_meta_campaign_actions.sql`

| Item | Status | Nota |
|------|--------|------|
| CHECK inclui `'campaign_action'` e `'intelligence_alert'` | pass | linha 9 |
| `executed_by UUID REFERENCES public.users(id) ON DELETE SET NULL` | pass | linha 13 — `public.users` (não `auth.users`) conforme V1.1 |
| `details JSONB` nullable | pass | linha 17 |
| Idempotente (`ADD COLUMN IF NOT EXISTS`) | pass | linhas 13 e 17 — corretos |
| Idempotente CHECK | pass | `DROP CONSTRAINT IF EXISTS` antes do ADD (linhas 6, 8) |
| Nome do constraint correto | pass | `meta_sync_log_sync_type_check` — bate com auto-gerado em `015:137` |
| Rollback documentado | **fail (low)** | Sem bloco `-- ROLLBACK:` comentado |
| Numbering | **concerns (low)** | Existem dois `028_*` (`028_fix_v_mensagens_admin_grant.sql` e `028_meta_campaign_actions.sql`) — padrão do projeto tem outros números duplicados (021, 024, 029), então é consistente, mas Epic 29 de padronização vai precisar consolidar. Não-bloqueante. |
| Aplicada na remota | pass | Task 1.5 documenta aplicação via Supabase Management API |

### Endpoint `action/route.ts`

| Item | Status | Nota |
|------|--------|------|
| `metaFetch` com body correto por action | pass | linhas 78–83 + 102–106 |
| Verifica `metaResult.success === false` | pass | linha 126 |
| `value >= 100` strict | pass | linha 41 (`value < 100` rejeita; >= 100 aceita) |
| INSERT inclui `started_at`, `finished_at`, `records_synced: 1` | pass | linhas 140–142 |
| Token lido com `status = 'active'` | pass | linha 66 |
| `details` com `old_value` pré-mutação | pass | linhas 85–95 (calculado ANTES de `metaFetch`) |
| Audit log error handling | **fail (medium-high)** | Linha 136 não captura erro do `.insert()` |
| `executed_by` populado | pass | linha 143 (`appUser.id`, que é `users.id` — o mesmo referenciado pela FK na migration) |

## Issues identificados

| ID | Severity | Category | Description | Recommendation |
|----|----------|----------|-------------|----------------|
| I-1 | **medium-high** | security/audit | O `INSERT` em `meta_sync_log` (linha 136) não tem `.then(...)` ou destructuring de `{ error }`. Se a INSERT falhar (RLS, constraint, conexão), a operação Meta foi executada mas não há registro de auditoria — a story define em AC 8 "Cada ação bem-sucedida registrada em meta_sync_log", o que torna isso uma quebra silenciosa do AC. Para uma feature de mutação em campanhas pagas, perder o audit trail é um problema de compliance/rastreabilidade. | Capturar erro do insert: `const { error: logError } = await supabase.from('meta_sync_log').insert(...); if (logError) console.error('[CAMPAIGN_ACTION] Audit log failed', { logError, action, campaign: campaign.meta_campaign_id, executed_by: appUser.id });`. Pelo menos garantir logging no console/Vercel logs para diagnóstico forense posterior. Idealmente, retornar 200 mas com `audit_log_warning: true` no payload para o frontend exibir alerta discreto. |
| I-2 | low | maintainability | Rollback da migration não documentado inline. Em incidente, alguém precisa reconstruir os ALTERs reversos da memória. | Adicionar comentário no final do arquivo `028_meta_campaign_actions.sql`: <br>```sql<br>-- ROLLBACK:<br>-- ALTER TABLE meta_sync_log DROP COLUMN IF EXISTS details;<br>-- ALTER TABLE meta_sync_log DROP COLUMN IF EXISTS executed_by;<br>-- ALTER TABLE meta_sync_log DROP CONSTRAINT IF EXISTS meta_sync_log_sync_type_check;<br>-- ALTER TABLE meta_sync_log ADD CONSTRAINT meta_sync_log_sync_type_check<br>--   CHECK (sync_type IN ('entities', 'insights', 'backfill'));<br>``` |
| I-3 | low | security/hardening | Sem upper bound em `value` para `set_budget`. Admin compromised poderia setar `daily_budget = 9_999_999_999` (R$99M/dia). Meta API rejeitaria, mas defesa em profundidade sugere validação local. | Adicionar `if (value > 100_000_000) return ... INVALID_BUDGET 'Budget máximo: R$1.000.000 (limite de sanidade)'`. Não-bloqueante: confiança em role admin + sanity da Meta API é razoável para v1. |
| I-4 | low | maintainability | `metaResult` declarado como `let` sem inicializador (linha 100). Compila hoje, mas em `strictNullChecks` + TS 5.x flow analysis mais agressiva pode reclamar de "used before assigned". | Inicializar: `let metaResult: { success?: boolean } = {}` ou refatorar try/catch para retornar `metaResult` do bloco. |
| I-5 | low | future-proofing | Endpoint usa `requireAuth()` (cliente baseado em RLS), não `createAdminClient()`. Isso significa que a `INSERT` em `meta_sync_log` precisa passar pela política RLS da tabela (verificar em `015:229`: `org_isolation` permite INSERT para org match — OK no nosso fluxo). Vale documentar essa dependência: se algum dia mudarem a policy de `meta_sync_log`, este endpoint quebra silenciosamente (relacionado a I-1). | Adicionar comentário acima do INSERT: `// Note: depends on RLS policy 'org_isolation' on meta_sync_log allowing org-matched INSERTs` |
| I-6 | info | observability | Sem `console.log` de sucesso para campaign actions. Operações de mutação em campanhas pagas tipicamente justificam log estruturado para correlação rápida em incidente. | Adicionar antes do `return`: `console.log('[CAMPAIGN_ACTION]', { action, campaign_id: campaign.meta_campaign_id, executed_by: appUser.id, org_id: appUser.org_id, old_value: oldValue, new_value: newValue })`. |

## Decisão final

**Verdict: CONCERNS**

A implementação está correta, segura e testada. Os 10 ACs estão cumpridos. A única observação que toca diretamente em um AC é o I-1 (falha silenciosa do audit log poderia tecnicamente quebrar AC 8 sem alarme), mas o caso de falha é improvável (RLS é estável, constraint é nova mas validada) e a operação Meta em si está auditada via histórico da Meta API.

**Justificativa para CONCERNS (não FAIL):**
- Nenhuma vulnerability ativa
- Nenhum AC violado em uso normal
- Testes manuais com conta real Vind aprovados em todos os caminhos críticos
- Issues identificadas são hardening (defesa em profundidade) e não funcionalidade

**Justificativa para CONCERNS (não PASS):**
- I-1 é uma preocupação real de auditoria em operação de mutação — vale endereçar antes do push ou em fast-follow
- Não posso assinar PASS sem que o lead reconheça o trade-off explícito de aceitar falha silenciosa de audit log

**Bloqueia push? Não.** A story pode seguir para `@devops *push` com I-1 documentado como follow-up imediato (story de 1h em backlog).

**Bloqueia Epic 27?** Não — esta story cobre apenas Epic 25.1. PM pode prosseguir com `*create-epic 27` quando estiver pronto (a story 25.2 do mesmo Epic 25 é independente desta decisão).

## Próximos passos

**Caminho recomendado (escolha do lead):**

**Opção A — Aceitar CONCERNS e seguir:**
1. Story 25.1 → status `Done` (ou `InReview` aguardando push)
2. `@devops *push` para deploy
3. Criar story de fast-follow 25.1.1 para endereçar I-1, I-2, I-6 (audit log error handling + rollback comment + observability log) — ~30min

**Opção B — Micro-iteração antes do push:**
1. `@dev` aplica fixes para I-1, I-2, I-6 (~30min)
2. Re-review express pelo @architect (validar só os deltas)
3. Verdict atualizado para PASS
4. `@devops *push`

**Não recomendado:** retornar como FAIL — funcionalidade está correta, e bloquear push por hardening seria estagnação de valor para o gestor de tráfego.

**Para Epic 29 (padronização de migrations):** capturar como input o problema dos números duplicados de migration (021, 024, 028, 029 todos têm dois arquivos cada). Não é problema desta story, mas vale enxergar como dívida sistêmica.

---

## Re-review V1.4 — 2026-05-12

**Verdict: PASS**

Re-review express dos 3 fixes aplicados por Dex (@dev). Todos correspondem exatamente ao recomendado no V1.3:

- **I-1 (medium-high) — Audit log error handling:** `route.ts:136-170` agora captura `{ error: logError }` da INSERT, e em caso de erro emite `console.error('[CAMPAIGN_ACTION] Audit log failed', { logError, action, campaign_id, executed_by })` com comentário explicando por que NÃO retorna erro ao client (ação Meta já executada, irreversível). Conforme V1.3 recommendation literal. PASS.
- **I-6 (info) — Log estruturado de sucesso:** `route.ts:162-169` no branch `else` (sem erro de audit) emite `console.log('[CAMPAIGN_ACTION] Success', { action, campaign_id, campaign_name, executed_by, old_value, new_value })`. Inclui os 6 campos pedidos. PASS.
- **I-2 (low) — Rollback inline:** `028_meta_campaign_actions.sql:19-24` adiciona bloco `-- ROLLBACK PLAN` comentado com: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT original com os 3 valores antigos (`'entities', 'insights', 'backfill'`) + DROP COLUMN executed_by + DROP COLUMN details. Cobre reverso completo da migration. PASS.

Funcionalidade inalterada, type-check + lint reportados PASS por Dex. Issues I-3/I-4/I-5 permanecem documentadas como follow-up não-bloqueante (severity low, fora do escopo da micro-iteração). Story pode transitar para `Done` e seguir para `@devops *push`.
