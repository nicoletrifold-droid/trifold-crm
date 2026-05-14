# Story 29.7 — Migration 036: pg_cron cleanup jobs + refresh ROAS automático

## Status
Done

## Subtitle
Última story do Epic 29 — fecha o epic em 100%

## Executor Assignment
executor: "@data-engineer"
quality_gate: "@architect"
quality_gate_tools: ["pg_cron_validation", "retention_policy_review", "refresh_schedule_audit"]

## Story

**As a** @data-engineer,
**I want** pg_cron jobs agendados para cleanup automático + refresh ROAS,
**so that** tabelas insert-heavy parem de crescer indefinidamente e dashboard ROAS sempre tenha dados frescos.

## Contexto

- Tabelas insert-heavy (`system_events`, `webhook_logs`, `follow_up_log`, `email_logs`) crescem indefinidamente hoje — sem nenhum TTL/cleanup automático. `system_events` já tem 798 rows em 456 kB e é a mais ativa (toda chamada de webhook e cron escreve nela).
- Migration `009_system_events.sql` tem comentário sobre cleanup mas nunca foi implementado.
- `meta_campaign_roas` foi materializada pela Story 29.6 (relkind=`m`, UNIQUE INDEX `idx_meta_campaign_roas_pk` confirmado). Sem refresh automático, a matview fica stale indefinidamente após a primeira carga.
- pg_cron é suportado nativamente pelo Supabase — basta `CREATE EXTENSION IF NOT EXISTS pg_cron`. A extension **não está instalada no remote** (confirmado via spike: `SELECT * FROM pg_extension WHERE extname = 'pg_cron'` retornou vazio). O schema `cron` também não existe ainda.
- Trade-off ROAS refresh: dados até 30 min defasados, mas dashboard 50× mais rápido (custo 62.90 → 0.15 medido na Story 29.6).
- Vercel cron jobs HTTP (`/api/cron/followup`, etc.) são totalmente independentes — pg_cron é interno ao Postgres, não há conflito.

## Spike — Resultados (executado em 2026-05-14)

| Verificação | Resultado |
|-------------|-----------|
| `pg_cron` extension instalada? | NÃO — a criar nesta story |
| Schema `cron` existe? | NÃO — criado automaticamente pelo `CREATE EXTENSION` |
| Jobs agendados (`cron.job`)? | N/A — schema não existe ainda |
| Slot `036` no tracking? | LIVRE — nenhuma row com version LIKE '036%' |
| `system_events` existe? | SIM — 798 rows, 456 kB |
| `webhook_logs` existe? | SIM — 0 bytes (volume baixo, crescerá em produção) |
| `follow_up_log` existe? | SIM — 36 rows, 24 kB |
| `email_logs` existe? | SIM — 0 bytes (volume baixo) |
| `meta_campaign_roas` relkind? | `m` (materialized view — Story 29.6 OK) |
| UNIQUE INDEX para REFRESH CONCURRENTLY? | SIM — `idx_meta_campaign_roas_pk` (org_id, meta_campaign_id) |

**Conclusão do spike:** pg_cron não está habilitado. Extension precisa ser criada. Todas as 4 tabelas alvo existem. Matview OK para refresh. Slot 036 livre. Nenhum job pré-existente para conflitar.

## Acceptance Criteria

**AC 1:** Spike documentado no story file com: status da extension pg_cron, schema cron, jobs existentes, tamanho das tabelas alvo. [DONE — ver seção Spike acima]

**AC 2:** Arquivo `036_pg_cron_cleanup_jobs_remote_only.sql` criado em `supabase/migrations/` com:
- `CREATE EXTENSION IF NOT EXISTS pg_cron;`
- 5 chamadas `SELECT cron.schedule(...)` agendando os jobs
- Rollback comentado ao final: `SELECT cron.unschedule('jobname')` para cada job

**AC 3:** Schedules exatos implementados:
- `cleanup-system-events`: `'0 3 * * *'` (3am diário) — `DELETE FROM system_events WHERE created_at < now() - interval '30 days'`
- `cleanup-webhook-logs`: `'0 4 * * *'` (4am diário) — `DELETE FROM webhook_logs WHERE processed = true AND created_at < now() - interval '90 days'`
- `cleanup-follow-up-log`: `'0 4 * * 0'` (4am domingo semanal) — `DELETE FROM follow_up_log WHERE created_at < now() - interval '180 days'`
- `cleanup-email-logs`: `'0 5 * * 0'` (5am domingo) — `DELETE FROM email_logs WHERE created_at < now() - interval '365 days'`
- `refresh-meta-campaign-roas`: `'*/30 * * * *'` (a cada 30 min) — `REFRESH MATERIALIZED VIEW CONCURRENTLY meta_campaign_roas`

**AC 4:** Aplicação executada via Supabase Management API (single-statement por `cron.schedule` — fora de transação, compatível com pg_cron). O `CREATE EXTENSION` pode ser aplicado em um statement separado antes dos schedules.

**AC 5:** Tracking version `036` registrado em `supabase_migrations.schema_migrations`:
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('036', 'pg_cron_cleanup_jobs_remote_only', ARRAY[
  'CREATE EXTENSION IF NOT EXISTS pg_cron',
  'SELECT cron.schedule(...)',
  -- ... 4 outros statements
])
ON CONFLICT (version) DO NOTHING;
```

**AC 6:** Validação pós-aplicação: `SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname` retorna exatamente 5 rows, todas com `active = true`.

**AC 7:** Build PASS — `pnpm --filter @trifold/web build` exit code 0. (Esta story não toca código da aplicação — apenas SQL no remote. Build serve para confirmar nenhum artefato local foi quebrado.)

**AC 8:** Smoke runtime: aguardar primeira execução do job `refresh-meta-campaign-roas` (máximo 30 min após aplicação) e confirmar que `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5` mostra pelo menos 1 row com `status = 'succeeded'` para esse job. Pendente execução humana se janela de 30 min não for viável durante o gate.

**AC 9:** Epic 29 atualizado: marcar Story 29.7 como DONE no `epic-29-database-performance-blitz.md`, fechar o epic com status 100% (8/8 stories). Atualizar a Definition of Done do epic marcando os checkboxes de pg_cron e refresh ROAS como concluídos.

**AC 10:** Rollback documentado no arquivo de migration e no Change Log da story:
```sql
-- Para cada job:
SELECT cron.unschedule('cleanup-system-events');
SELECT cron.unschedule('cleanup-webhook-logs');
SELECT cron.unschedule('cleanup-follow-up-log');
SELECT cron.unschedule('cleanup-email-logs');
SELECT cron.unschedule('refresh-meta-campaign-roas');
-- Se necessário remover a extension:
-- DROP EXTENSION pg_cron; -- CUIDADO: remove todos os jobs
```

**AC 11:** Monitoramento documentado no Dev Notes — queries para verificar execuções, detectar falhas e desabilitar jobs sem deletar.

**AC 12:** Confirmação de não-conflito com Vercel cron jobs: pg_cron é interno ao Postgres (executa SQL direto no DB), Vercel cron dispara HTTP requests para rotas da aplicação. São mecanismos ortogonais — sem conflito. Documentado no Dev Notes.

## Esforço e Pontos

- **Complexidade:** M (2h)
- **Story Points:** 3
- **Prioridade:** P0 (fecha o Epic 29)
- **Dependências:** Story 29.1 (DONE), Story 29.6 (DONE — matview + UNIQUE INDEX existem)

## Out of Scope

- Adicionar novos cleanup jobs além dos 5 definidos (escopo de outra story/epic)
- Alterar frequência ou lógica dos Vercel cron jobs HTTP (`/api/cron/followup`)
- Particionamento de tabelas (Epic 34)
- Alertas quando jobs falham (Epic 27 — Observability)
- Monitoramento automático de `cron.job_run_details` (manual por ora)

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| pg_cron não disponível no plano Supabase | BAIXO | Spike confirmou que extension existe no catálogo Supabase; plano Pro suporta. Validar via `CREATE EXTENSION` — erro imediato se não suportado |
| DELETE com condição mal escrita apaga mais que esperado | MÉDIO | Validar via `SELECT count(*)` com a mesma condição ANTES do agendamento; jobs rodam de madrugada — não afeta usuários ativos |
| Refresh CONCURRENTLY falha (UNIQUE INDEX ausente) | BAIXO | Spike confirmou `idx_meta_campaign_roas_pk` existe (Story 29.6 OK) |
| Job `refresh-meta-campaign-roas` se sobrepõe a si mesmo (refresh demora >30min) | MUITO BAIXO | Story 29.6 mediu refresh em 4.42s total; com 0 rows em meta_campaigns atualmente, tempo < 1s |
| Permissões insuficientes para `cron.schedule` | BAIXO | Supabase project owner tem permissão para `pg_cron` via service_role por padrão |

## Tasks / Subtasks

- [x] **Task 1 — Spike** (10 min) (AC 1)
  - [x] Verificar pg_cron extension status no remote
  - [x] Verificar schema `cron` existe
  - [x] Verificar jobs agendados em `cron.job`
  - [x] Verificar slot 036 livre no tracking
  - [x] Verificar tabelas alvo existem
  - [x] Verificar tamanho das tabelas alvo
  - [x] Verificar `meta_campaign_roas` relkind=`m` e UNIQUE INDEX existem

- [x] **Task 2 — Criar arquivo migration 036** (30 min) (AC 2, AC 3, AC 10)
  - [x] Criar `supabase/migrations/036_pg_cron_cleanup_jobs_remote_only.sql`
  - [x] Header documental (mesmo padrão das stories 29.2-29.5: "Applied via Management API...")
  - [x] `CREATE EXTENSION IF NOT EXISTS pg_cron;`
  - [x] 5 `SELECT cron.schedule(...)` com schedules e comandos exatos do AC 3
  - [x] Rollback SQL comentado ao final (AC 10)

- [x] **Task 3 — Aplicar via Management API** (15 min) (AC 4)
  - [x] Aplicar `CREATE EXTENSION IF NOT EXISTS pg_cron` via POST Management API (1.6.4 instalada)
  - [x] Aplicar cada `SELECT cron.schedule(...)` individualmente via POST Management API (curl + HEREDOC; primeira tentativa via Python urllib falhou com 403 cf-ray 1010 por quoting de dollar-quotes; pattern definitivo: `curl --data-binary @file.json`)
  - [x] Confirmar responses sem erro (cada schedule retornou `[{"schedule":N}]`, jobids 1-5)

- [x] **Task 4 — Validar `cron.job`** (5 min) (AC 6)
  - [x] Executar `SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname`
  - [x] Confirmar 5 rows, todas `active = true`
  - [x] Confirmar schedules e comandos exatos do AC 3

- [x] **Task 5 — Registrar tracking** (5 min) (AC 5)
  - [x] INSERT na `supabase_migrations.schema_migrations` com version='036', name='pg_cron_cleanup_jobs_remote_only', statements=ARRAY com 6 itens (1 extension + 5 schedules) — `array_length(statements,1)=6` confirmado

- [x] **Task 6 — Validação contagem pre-DELETE** (10 min) (AC 3 — segurança)
  - [x] `system_events`: 274 rows >30 dias (eventos operacionais 2026-04-02 a 2026-04-14: RAG_SUCCESS, CLAUDE_RESPONSE, QUALIFICATION_UPDATE, STAGE_CHANGE, MESSAGE_PROCESSED — exatamente o tipo que a retention policy targeta; nenhum dado crítico)
  - [x] `webhook_logs` (processed=true + >90 dias): 0 rows
  - [x] `follow_up_log` (>180 dias): 0 rows
  - [x] `email_logs` (>365 dias): 0 rows

- [x] **Task 7 — Build PASS** (2 min) (AC 7)
  - [x] `pnpm --filter @trifold/web build` — exit code 0 (Compiled successfully in 4.8s)

- [ ] **Task 8 — Aguardar smoke runtime** (até 30 min) (AC 8) — **PENDENTE HUMANO**
  - [ ] Aguardar próxima execução do job `refresh-meta-campaign-roas` (máximo 30 min — próximo run sincronizado ao múltiplo de 30 min UTC mais próximo)
  - [ ] Executar `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5`
  - [ ] Confirmar `status = 'succeeded'` para pelo menos 1 execução do job de refresh

  > Permissões já validadas manualmente via test-job-29-7 (schedule + unschedule funcionou), o que cobre o risco principal. O smoke runtime é confirmação operacional final, não bloqueante para o gate de implementação.

- [x] **Task 9 — Atualizar epic e story** (5 min) (AC 9)
  - [x] Atualizar `epic-29-database-performance-blitz.md`: Story 29.7 marcada DONE, DoD do epic atualizada com checkboxes pg_cron + refresh ROAS marcados, frontmatter `updated_at: 2026-05-14`
  - [x] Marcar checkboxes da Definition of Done do epic para pg_cron e refresh ROAS

## Dev Notes

### Sintaxe pg_cron

```sql
-- Habilitar extension (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agendar job
SELECT cron.schedule(
  'cleanup-system-events',   -- nome único do job
  '0 3 * * *',               -- cron expression (UTC)
  $$ DELETE FROM system_events WHERE created_at < now() - interval '30 days' $$
);

-- Ver jobs agendados
SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;

-- Ver histórico de execuções
SELECT jobid, jobname, start_time, end_time, status, return_message
FROM cron.job_run_details
ORDER BY start_time DESC LIMIT 10;

-- Desabilitar job sem deletar
UPDATE cron.job SET active = false WHERE jobname = 'cleanup-system-events';

-- Deletar job (rollback)
SELECT cron.unschedule('cleanup-system-events');
```

### Aplicação via Management API

Cada statement deve ser enviado como POST separado (igual ao padrão das Stories 29.2-29.5):

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('~/.supabase/access-token'))['access_token'])")
curl -s -X POST "https://api.supabase.com/v1/projects/dsopqkqjkmhytudaaolv/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE EXTENSION IF NOT EXISTS pg_cron;"}'
```

Repetir para cada `SELECT cron.schedule(...)`. A separação por POST garante que cada statement roda fora de transação — necessário para pg_cron funcionar corretamente.

### Non-conflito com Vercel cron jobs

Vercel cron jobs (`vercel.json` → `crons`) disparam HTTP GET requests para rotas da aplicação em intervalos configurados. pg_cron é interno ao Postgres — executa SQL diretamente no banco de dados sem passar pela aplicação. Os dois mecanismos são completamente ortogonais:

- **Vercel cron:** Cloud scheduler → HTTP request → Next.js API route → Supabase query
- **pg_cron:** Postgres internal scheduler → SQL statement diretamente no DB

Nenhum conflito possível. Rotas como `/api/cron/followup` e `/api/cron/email-sends` continuam funcionando normalmente.

### Observações sobre volumes atuais (spike 2026-05-14)

| Tabela | Tamanho | Rows estimadas | Impacto cleanup hoje |
|--------|---------|----------------|---------------------|
| system_events | 456 kB | 798 | 0 rows deletadas (ambiente jovem, tudo <30 dias) |
| follow_up_log | 24 kB | 36 | 0 rows deletadas (tudo <180 dias) |
| webhook_logs | 0 bytes | ~0 | 0 rows deletadas |
| email_logs | 0 bytes | ~0 | 0 rows deletadas |

Cleanup entra em efeito real conforme a plataforma acumula dados ao longo dos meses. Agendamento hoje garante que nunca haverá acúmulo ilimitado.

### Cron expressions (UTC)

| Job | Expressão | Significado |
|----|-----------|-------------|
| cleanup-system-events | `0 3 * * *` | 3am UTC diário = meia-noite BRT |
| cleanup-webhook-logs | `0 4 * * *` | 4am UTC diário |
| cleanup-follow-up-log | `0 4 * * 0` | 4am UTC todo domingo |
| cleanup-email-logs | `0 5 * * 0` | 5am UTC todo domingo |
| refresh-meta-campaign-roas | `*/30 * * * *` | A cada 30 min |

### Padrão do arquivo migration (ghost _remote_only)

Seguir o padrão consolidado na Story 29.1 e no `supabase/migrations/README.md`:

```sql
-- 036_pg_cron_cleanup_jobs_remote_only.sql
-- Applied via Supabase Management API (pg_cron requires non-transactional context).
-- Tracking registrado manualmente em supabase_migrations.schema_migrations version='036'.
-- Story: 29.7 | Epic: 29 — Database Performance Blitz
--
-- ROLLBACK PLAN (executar manualmente se necessário):
-- SELECT cron.unschedule('cleanup-system-events');
-- SELECT cron.unschedule('cleanup-webhook-logs');
-- SELECT cron.unschedule('cleanup-follow-up-log');
-- SELECT cron.unschedule('cleanup-email-logs');
-- SELECT cron.unschedule('refresh-meta-campaign-roas');
-- -- Se necessário remover a extension (DESTRÓI TODOS OS JOBS):
-- -- DROP EXTENSION IF EXISTS pg_cron;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-system-events',
  '0 3 * * *',
  $$ DELETE FROM system_events WHERE created_at < now() - interval '30 days' $$
);

SELECT cron.schedule(
  'cleanup-webhook-logs',
  '0 4 * * *',
  $$ DELETE FROM webhook_logs WHERE processed = true AND created_at < now() - interval '90 days' $$
);

SELECT cron.schedule(
  'cleanup-follow-up-log',
  '0 4 * * 0',
  $$ DELETE FROM follow_up_log WHERE created_at < now() - interval '180 days' $$
);

SELECT cron.schedule(
  'cleanup-email-logs',
  '0 5 * * 0',
  $$ DELETE FROM email_logs WHERE created_at < now() - interval '365 days' $$
);

SELECT cron.schedule(
  'refresh-meta-campaign-roas',
  '*/30 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY meta_campaign_roas $$
);
```

### Referências de story anteriores

- Story 29.1: Reconciliação migrations — padrão `_remote_only.sql` + tracking manual. `supabase/migrations/README.md`.
- Story 29.6: Materialização `meta_campaign_roas` — relkind=`m`, UNIQUE INDEX `idx_meta_campaign_roas_pk (org_id, meta_campaign_id)` confirmado. REFRESH CONCURRENTLY testado e funcional (4.42s wall-clock com 0 rows). File: `docs/stories/active/29-6-materialize-meta-campaign-roas.md`.
- Pattern de aplicação via Management API: `supabase/migrations/031_fk_indexes_critical_remote_only.sql` (Story 29.2) — cada statement = 1 POST separado.

### Testing

- Framework: Vitest (unit) — não aplicável aqui (pure SQL, sem código TS)
- Validação via SQL direto no remote (Management API ou Supabase Studio)
- Smoke test: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5` após primeira execução do job de refresh
- Build check: `pnpm --filter @trifold/web build` — confirmar zero impacto na aplicação

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only (`@architect *qa-gate 29.7`).
> To enable, set `coderabbit_integration.enabled: true` in core-config.yaml

## File List

**Created:**
- `supabase/migrations/036_pg_cron_cleanup_jobs_remote_only.sql` — Ghost migration documentando 6 statements aplicados via Management API (CREATE EXTENSION pg_cron + 5 cron.schedule).

**Modified:**
- `docs/stories/active/29-7-pg-cron-cleanup-jobs.md` — Tasks marcadas, File List, Change Log V1.1.
- `docs/stories/epics/epic-29-database-performance-blitz.md` — Story 29.7 marcada DONE, DoD do epic atualizada (3 checkboxes adicionais marcados), `updated_at` para 2026-05-14, Próximos Passos atualizado.

**Remote DB (via Supabase Management API, project ref `dsopqkqjkmhytudaaolv`):**
- `pg_cron` extension instalada (versão 1.6.4)
- 5 jobs em `cron.job` (jobids 1-5, todos `active=true`)
- Row `version='036'` inserida em `supabase_migrations.schema_migrations` com `name='pg_cron_cleanup_jobs_remote_only'` e `array_length(statements, 1)=6`

## Dev Notes — Implementação (Dara, 2026-05-14)

### Resultado por AC

| AC | Status | Evidência |
|----|--------|-----------|
| AC 1 — Spike documentado | DONE | Story file seção "Spike" |
| AC 2 — Arquivo migration criado | DONE | `036_pg_cron_cleanup_jobs_remote_only.sql` com header, 6 statements, rollback comentado |
| AC 3 — Schedules exatos | DONE | `SELECT * FROM cron.job` confirma os 5 jobs com schedules e commands EXATOS |
| AC 4 — Aplicação via Management API | DONE | Cada statement = 1 POST separado (single-statement mode); responses `[{"schedule":N}]` |
| AC 5 — Tracking version 036 | DONE | Row inserida com 6 statements |
| AC 6 — Validação pós-aplicação | DONE | 5 rows, all `active=true`, schedules/commands batem com AC 3 |
| AC 7 — Build PASS | DONE | exit 0, 4.8s |
| AC 8 — Smoke runtime | PENDENTE HUMANO | Aguardar 30 min para primeira execução do refresh ROAS |
| AC 9 — Epic atualizado | DONE | DoD com 3 checkboxes adicionais marcados, Story 29.7 DONE |
| AC 10 — Rollback documentado | DONE | Block `-- ROLLBACK PLAN` no header da migration |
| AC 11 — Monitoramento documentado | DONE | Seção Dev Notes do story file original; aqui também (abaixo) |
| AC 12 — Não-conflito Vercel cron | DONE | Documentado no Dev Notes (pg_cron interno ao Postgres, Vercel HTTP) |

### Lições aprendidas

**Quoting de dollar-quotes via Management API:** A primeira tentativa de aplicar os 5 `cron.schedule(...)` via Python urllib retornou `HTTP 403 cf-ray 1010` em todos. Causa: Python f-string + interpolação de shell + `$$` interpretados como variáveis vazias no payload final, resultando em JSON corrompido que o Cloudflare WAF rejeitou. Solução definitiva: criar o JSON com `cat > file.json <<'EOF' ... EOF` (heredoc literal sem expansão) e enviar com `curl --data-binary @file.json`. Pattern salvo em memória como referência.

**Pre-flight count revelou 274 system_events >30 dias:** Spike inicial reportou 0 rows esperadas. Pre-flight (Task 6) revelou 274 — todos eventos operacionais entre 2026-04-02 e 2026-04-14. Eventos como `RAG_SUCCESS`, `CLAUDE_RESPONSE`, `QUALIFICATION_UPDATE`, `STAGE_CHANGE`, `MESSAGE_PROCESSED` — exatamente o tipo de log de alta frequência que a retention policy de 30 dias foi projetada para limpar. Decisão autônoma: prosseguir (são logs operacionais sem valor de longo prazo, e a limpeza só roda às 3am UTC — sem impacto a usuários ativos).

### Monitoramento (AC 11)

```sql
-- Ver últimas execuções de qualquer job
SELECT jobid, jobname, start_time, end_time, status, return_message
FROM cron.job_run_details
ORDER BY start_time DESC LIMIT 20;

-- Detectar falhas
SELECT jobname, count(*) AS failures, max(start_time) AS last_failure
FROM cron.job_run_details
WHERE status != 'succeeded'
GROUP BY jobname;

-- Desabilitar job sem deletar (graceful pause)
UPDATE cron.job SET active = false WHERE jobname = 'cleanup-system-events';
UPDATE cron.job SET active = true  WHERE jobname = 'cleanup-system-events';

-- Re-schedule (mudar horário)
SELECT cron.schedule('cleanup-system-events', '0 5 * * *', $$ DELETE FROM system_events WHERE created_at < now() - interval '30 days' $$);
```

## QA Results

**Verdict:** PASS (12/12 ACs)
**Gate file:** `docs/qa/gates/29-7-architect-gate.md`
**Reviewer:** Aria (@architect) — 2026-05-14
**Confidence:** ALTA

### Validações reproduzidas
- `extversion` pg_cron: **1.6.4**
- Active jobs: **5** (cleanup-email-logs, cleanup-follow-up-log, cleanup-system-events, cleanup-webhook-logs, refresh-meta-campaign-roas)
- Tracking version 036: **6 statements** registrados, name correto
- `cron.job_run_details`: **6 execuções `succeeded`** do refresh-meta-campaign-roas em 3 horas — AC 8 satisfeito sem espera humana
- Build `pnpm --filter @trifold/web build`: **exit 0**

### Achados não-bloqueantes
- **274 `system_events` >30 dias** serão limpos no primeiro run (3am UTC amanhã). Decisão arquitetural: aceitar perda (logs operacionais de alta frequência, sem valor forense, retention policy projetada exatamente para esse caso). Mitigation opcional documentada no gate file.

### Epic 29 — Fechamento técnico CONFIRMADO
8/8 stories DONE. DoD do epic cumprida nos itens sob controle do arquiteto. Smokes humanos restantes (Dashboard ROAS <500ms e RAG search <100ms no browser) não bloqueiam fechamento — EXPLAIN ANALYZE já provou os ganhos.

### Próximos passos
1. `@devops *push 29.7`
2. Decidir próximo movimento: smokes humanos rápidos OU Epic 30 (Over-fetch killers).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-14 | V1.0 | Story criada — spike executado, 12 ACs definidos, Epic 29 última story | River @sm |
| 2026-05-14 | V1.1 | Implementação DONE. pg_cron 1.6.4 instalada + 5 jobs agendados via Management API (jobids 1-5, all `active=true`). Tracking version 036 registrado (6 statements). Build PASS. Permissions test (test-job-29-7) PASS. Pre-flight: 274 system_events >30 dias serão limpos no primeiro run às 3am UTC (eventos operacionais, sem valor de longo prazo). Epic 29 DoD: 3 checkboxes adicionais marcados. AC 8 pendente humano (smoke runtime ~30 min) — não bloqueante. Próximo: `@architect *qa-gate 29.7` (último gate do epic). | Dara @data-engineer |
| 2026-05-14 | V1.2 | Quality gate PASS. AC 8 PASSOU sem necessidade de espera humana — `cron.job_run_details` confirma 6 execuções do jobid 5 entre 14:30-17:00 UTC, todas `status='succeeded'`, tempos 130-315ms. 12/12 ACs PASS. Code review da migration APPROVED. Status Ready → Done. **EPIC 29 FECHADO 8/8 stories**. Gate file: `docs/qa/gates/29-7-architect-gate.md`. Próximo: `@devops *push 29.7`. | Aria @architect |
