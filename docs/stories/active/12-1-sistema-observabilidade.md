# Story 12.1 — Sistema de Observabilidade e Saude do Sistema

## Status: Done

## Contexto
O sistema nao tem observabilidade. Erros vao para console.error (stdout Vercel) e somem. Webhooks retornam 200 mesmo com erro, perdendo mensagens. O admin nao tem visibilidade sobre falhas do bot, da AI, do RAG, nem das integracoes. Precisamos de monitoramento proativo para saber com antecedencia quando algo esta dando errado.

Arquitetura aprovada pela @architect (Aria) — 5 camadas: tabela de eventos, logger centralizado, instrumentacao, health check, e dashboard admin.

## Acceptance Criteria

### Migration e Schema
- [x] AC1: Criar migration `system_events` com colunas: id, org_id, level (error/warn/info), category (bot/ai/webhook/auth/cron/system), event_type, message, metadata (jsonb), source, request_id, resolved_at, resolved_by, created_at
- [x] AC2: Indices em (level, created_at DESC), (category, created_at DESC), (created_at DESC) para queries do dashboard
- [x] AC3: RLS policy: admins da org podem ler eventos da sua org

### Logger Centralizado
- [x] AC4: Criar `packages/web/src/lib/logger.ts` com funcao `logEvent({ level, category, event_type, message, metadata?, source?, request_id? })` que grava na tabela `system_events` via Supabase admin client
- [x] AC5: Logger e fire-and-forget (nao bloqueia o request, usa `.then().catch()`)
- [x] AC6: Se o Supabase falhar, faz fallback para console.error (o logger nunca crasha o sistema)

### Instrumentacao dos Pontos Criticos
- [x] AC7: pipeline.ts — logar quando EMBEDDING_FALLBACK ativa (level: warn, category: ai)
- [x] AC8: pipeline.ts — logar quando RAG_FALLBACK ativa (level: warn, category: ai)
- [x] AC9: pipeline.ts — logar tempo de resposta do Claude e tokens usados (level: info, category: ai)
- [x] AC10: telegram/webhook — logar erro de processamento de AI (level: error, category: bot)
- [x] AC11: telegram/webhook — logar mensagem recebida com tipo e tempo de processamento (level: info, category: bot)
- [x] AC12: whatsapp/webhook — mesma instrumentacao do telegram (level: error/info, category: bot)
- [x] AC13: cron/followup — logar resultado da execucao: processados, falhas, motivos (level: info/error, category: cron)

### Health Check Endpoint
- [x] AC14: Criar `GET /api/health` que retorna `{ status: 'healthy'|'degraded'|'unhealthy', checks: { supabase, claude, openai }, timestamp }`
- [x] AC15: Check Supabase: tenta query simples (`SELECT 1`), reporta latencia
- [x] AC16: Check env vars: verifica se ANTHROPIC_API_KEY, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN estao presentes (nao expoe valores)
- [x] AC17: Retorna HTTP 200 se healthy, 503 se unhealthy

### Dashboard Admin
- [x] AC18: Criar pagina `/dashboard/sistema` acessivel apenas para role=admin
- [x] AC19: Secao "Saude do Sistema" — cards com status verde/amarelo/vermelho por categoria (bot, ai, webhook, cron). Logica: vermelho se >3 erros nos ultimos 30min, amarelo se >0 warns, verde se limpo
- [x] AC20: Secao "Eventos Recentes" — tabela com os ultimos 50 eventos, filtravel por level e category, com auto-refresh a cada 30s
- [x] AC21: Click em evento expande metadata (jsonb) formatado
- [x] AC22: Secao "Metricas" — cards: mensagens processadas (24h), tempo medio de resposta Claude, taxa de fallback RAG (%), total de erros (24h)
- [x] AC23: Adicionar link "Sistema" na sidebar do dashboard (apenas para admins)

## Detalhes Tecnicos

### Arquivos a criar:
- `supabase/migrations/009_system_events.sql` — migration
- `packages/web/src/lib/logger.ts` — logger centralizado
- `packages/web/src/app/api/health/route.ts` — health check endpoint
- `packages/web/src/app/dashboard/sistema/page.tsx` — dashboard de observabilidade
- `packages/web/src/app/api/system-events/route.ts` — API para buscar eventos (GET com filtros)

### Arquivos a modificar:
- `packages/ai/src/chat/pipeline.ts` — instrumentar com logEvent
- `packages/ai/src/rag/embeddings.ts` — instrumentar fallback
- `packages/web/src/app/api/telegram/webhook/route.ts` — instrumentar
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — instrumentar
- `packages/web/src/app/api/cron/followup/route.ts` — instrumentar
- `packages/web/src/components/layout/sidebar-nav.tsx` — adicionar link Sistema

### Stack:
- Supabase (PostgreSQL) para storage de eventos
- Next.js API routes para health check e API de eventos
- React + Tailwind para dashboard (seguir padrao existente do projeto)

## Dependencias
- Depende de: Nenhuma
- Bloqueia: Alertas automaticos (futuro), integracao com monitoring externo (futuro)

## Estimativa
XL — 6-8h

## QA Results
<!-- QA agent will append results here -->

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente | — |
