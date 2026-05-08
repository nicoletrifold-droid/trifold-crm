status: Done

# Story 1.4 — Environment Variables

## Contexto
Todas as APIs externas (Supabase, Anthropic, Meta Cloud API) precisam de credenciais configuradas. O `.env.example` serve como documentacao viva das variaveis necessarias. As variaveis precisam estar tanto no `.env.local` (dev) quanto na Vercel (producao). Sem isso, nenhuma integracao funciona.

## Acceptance Criteria
- [x] AC1: `.env.example` criado na raiz com TODAS as variaveis necessarias (sem valores reais)
- [x] AC2: `.env` criado localmente com valores reais de staging
- [x] AC3: Variaveis Supabase configuradas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [x] AC4: Variavel Anthropic configurada: `ANTHROPIC_API_KEY` (no .env.example, valor pendente)
- [x] AC5: Variaveis Meta/WhatsApp Cloud API configuradas (mesmo que vazias por enquanto): `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`
- [x] AC6: Variavel Telegram fallback: `TELEGRAM_BOT_TOKEN` (para caso de fallback)
- [x] AC7: Variaveis utilitarias: `NODE_ENV`
- [x] AC8: `packages/db/src/client.ts` le variaveis Supabase e exporta client configurado
- [x] AC9: `packages/ai/src/client.ts` le variavel Anthropic e exporta client configurado
- [ ] AC10: Variaveis de producao configuradas no dashboard Vercel (pendente deploy)
- [x] AC11: `.gitignore` confirma que `.env.local` e `.env` NAO sao commitados

## Detalhes Tecnicos

### Arquivo `.env.example`:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic (Claude)
ANTHROPIC_API_KEY=

# Meta WhatsApp Cloud API
META_WHATSAPP_PHONE_NUMBER_ID=
META_WHATSAPP_ACCESS_TOKEN=
META_WHATSAPP_VERIFY_TOKEN=
META_WABA_ID=
META_APP_SECRET=

# Telegram (fallback)
TELEGRAM_BOT_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### Arquivos a criar/modificar:
- `.env.example` (raiz)
- `packages/db/src/client.ts` — Supabase client com env vars
- `packages/ai/src/client.ts` — Anthropic client com env vars

### Referencia agente-linda:
- Adaptar de `~/agente-linda/.env.example`
- Adaptar clients de `~/agente-linda/packages/db/src/client.ts` e `~/agente-linda/packages/ai/src/client.ts`

## Dependencias
- Depende de: 1.1 (repo), 1.2 (Supabase criado com URL e keys)
- Bloqueia: 1.6 (auth precisa do Supabase client), todo Bloco 3 (AI client)

## Estimativa
P (Pequena) — 1 hora

## File List

### Created/Modified
- `.env.example` — Template com todas as variaveis necessarias
- `packages/db/src/client.ts` — Supabase client com env vars
- `packages/ai/src/client.ts` — Anthropic client com env vars

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
