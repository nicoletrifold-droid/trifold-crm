# Incidente Supabase + Plano de Performance — 2026-06-08

## Resumo do incidente

Banco Supabase (**NANO, 0.5GB RAM, CPU compartilhada**) entrou em **crash loop de OOM**: saturação de conexões → OOM-kill do Postgres → restart → re-satura. Logins caíram porque o `middleware.ts` não conseguia buscar a role do usuário (banco inacessível).

**Gatilho composto:**
1. Carga de baseline já alta para o tier (aviso "exhausting multiple resources" era **pré-existente**).
2. Revogação do JWT legado (incidente de segurança GitGuardian) → tempestade de re-login simultâneo.
3. Colisão de 5-9 crons disparando no mesmo minuto (`:00`/`:30`).

**Resolução imediata:** restart do projeto via Management API (`status: RESTARTING → ACTIVE_HEALTHY`). PostgREST voltou a responder em 0.6s. Logins restaurados.

## Diagnóstico (auditoria @data-engineer + @architect)

> Correção arquitetural importante: **todo acesso ao Postgres passa por PostgREST (REST/HTTPS)**, não por conexão Postgres direta. O vetor não é esgotamento de sockets serverless — é **volume de queries concorrentes + RAM por query** sobre 0.5GB.

| # | Achado | Severidade | Evidência |
|---|--------|-----------|-----------|
| 1 | **86 de 97 usuários (89%) sem role no JWT** → query `SELECT role FROM users WHERE auth_id=X` a cada request | CRÍTICO | `middleware.ts:24-29` + dados ao vivo |
| 2 | **Crons colidem no minuto `:00`/`:30`** (5-9 simultâneos) | ALTO | `vercel.json` |
| 3 | **supremo-sync carrega tabela `leads` INTEIRA** em RAM por run + UPDATEs 1-a-1 | CRÍTICO | `supremo-sync/route.ts:263` |
| 4 | **`getUser()` faz round-trip ao GoTrue** em toda navegação | MÉDIO-ALTO | `middleware.ts:71` |
| 5 | RLS: subquery em `brokers` nas policies de leads (085) | MÉDIO | `085_*.sql` |
| 6 | NANO subdimensionado para CRM em produção (16 crons + multiusuário) | ALTO (estrutural) | tier |

**Falsos alarmes (corrigidos na auditoria):**
- Índices propostos **já existem** (Epic 29, migrations 032/057). `brokers.user_id` já tem índice implícito (UNIQUE). Migration 087 vira no-op safety-net.
- A subquery da 085 vira **InitPlan** (1×/query, não por-row) — não é o gatilho principal.

## Plano de melhoria (faseado)

### Fase 0 — Crons (PRONTO, QA PASS) ✅
`vercel.json`: campaign-poll `*/3→*/10` (−70%), meta-sync `4h→6h` (−33%), 4 crons `*/30` escalonados em minutos distintos. **Resultado: máx 2 crons/minuto (era 9).** Zero mudança de lógica.

### Fase 1 — Backfill `app_metadata.role` (CRÍTICO, maior ganho)
Setar `role` no JWT dos 86 usuários legados → elimina a query do middleware em 89% das requests. Operação de dados, reversível. Via @data-engineer.

### Fase 2 — Migration 088 (RLS, transacional)
`SET search_path` nas 5 helpers + reescrita de `user_broker_id()` + simplificação das policies `leads_select`/`leads_update`. Autorada, aguardando aplicação.

### Fase 3 — Código (via @dev → @qa → @devops)
- **supremo-sync**: filtrar leads por batch (não full-load) + upsert em lote. Maior consumidor recorrente de RAM.
- **middleware**: `getUser()` → `getClaims()` (validação local de JWT, sem round-trip).

### Fase 4 — Infra (decisão de negócio, adiada)
Reavaliar NANO→Micro/Small após as otimizações reduzirem o baseline. Usuário optou por não mexer agora.

## Ordem de execução recomendada
Fase 1 (backfill) → Fase 0 (deploy crons) → Fase 2 (088) → Fase 3 (código). As Fases 1-2 tiram carga **imediata** sem deploy de aplicação.
