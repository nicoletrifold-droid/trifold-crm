status: Done

# Story 0.4 — Environment Variables por Ambiente (Staging vs Producao)

## Contexto
Cada ambiente (staging e producao) precisa de variaveis de ambiente completamente isoladas. Staging aponta para Supabase staging + Telegram bot. Producao aponta para Supabase prod + WhatsApp Cloud API. As variaveis nunca podem se cruzar — um erro de configuracao pode fazer o bot de teste enviar mensagens para leads reais, ou pior, contaminar a base de producao com dados de teste.

## Acceptance Criteria
- [ ] AC1: Arquivo `.env.example` atualizado com TODAS as variaveis do sistema, organizadas por secao:
  - Supabase (URL, anon key, service role key)
  - Anthropic (API key)
  - WhatsApp Cloud API (access token, phone number ID, WABA ID, verify token, app secret)
  - Telegram (bot token, webhook secret)
  - App (NEXT_PUBLIC_APP_URL, NODE_ENV)
- [ ] AC2: Arquivo `.env.example` contem comentarios indicando quais vars sao staging-only e quais sao prod-only:
  ```
  # WhatsApp Cloud API (PRODUCAO ONLY)
  META_WHATSAPP_ACCESS_TOKEN=
  # Telegram (STAGING ONLY)
  TELEGRAM_BOT_TOKEN=
  ```
- [ ] AC3: Codigo da aplicacao usa `process.env` sem prefixo de ambiente — o ambiente e determinado pelo Vercel (Production vs Preview)
- [ ] AC4: Funcao utilitaria `getEnvironment()` que retorna `'staging' | 'production'` baseado em `VERCEL_ENV` ou `NODE_ENV`
- [ ] AC5: Log de inicializacao mostra qual ambiente esta rodando: `[ENV] Running in STAGING mode` ou `[ENV] Running in PRODUCTION mode`
- [ ] AC6: Adapter factory seleciona canal correto baseado nas env vars disponiveis (Telegram se `TELEGRAM_BOT_TOKEN` existe, WhatsApp se `META_WHATSAPP_ACCESS_TOKEN` existe)
- [ ] AC7: `.env.staging` e `.env.production` listados no `.gitignore` (nunca commitados)
- [ ] AC8: Vercel Environment Variables configuradas corretamente (Production scope vs Preview scope) — validar que nao ha leak entre ambientes
- [ ] AC9: Health check endpoint `GET /api/health` retorna: ambiente, canal ativo (telegram/whatsapp), status Supabase, versao

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `.env.example` — Template completo com comentarios
- `packages/shared/src/config/environment.ts` — Funcao `getEnvironment()` e validacao de env vars
- `packages/web/src/app/api/health/route.ts` — Health check endpoint
- `.gitignore` — Adicionar `.env.staging`, `.env.production`, `.env.local`

### Funcao de ambiente:
```typescript
// packages/shared/src/config/environment.ts
export function getEnvironment(): 'staging' | 'production' | 'development' {
  if (process.env.VERCEL_ENV === 'production') return 'production';
  if (process.env.VERCEL_ENV === 'preview') return 'staging';
  return 'development';
}

export function getActiveChannel(): 'whatsapp' | 'telegram' | 'none' {
  if (process.env.META_WHATSAPP_ACCESS_TOKEN) return 'whatsapp';
  if (process.env.TELEGRAM_BOT_TOKEN) return 'telegram';
  return 'none';
}

export function validateRequiredEnvVars(): void {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}
```

### Health check:
```typescript
// GET /api/health
export async function GET() {
  return Response.json({
    status: 'ok',
    environment: getEnvironment(),
    channel: getActiveChannel(),
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
    timestamp: new Date().toISOString(),
  });
}
```

## Dependencias
- Depende de: 0.1 (Supabase URLs), 0.2 (Vercel configurado)
- Bloqueia: 0.3 (Telegram precisa das vars), 1.4 (story original de env vars se integra aqui)

## Estimativa
P (Pequena) — 1-2 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
