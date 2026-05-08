status: Done

# Story 0.2 — Configurar Vercel com 2 Environments (Staging + Producao)

## Contexto
O deploy precisa ser automatizado com 2 ambientes isolados no Vercel. Branch `staging` deploya para o ambiente staging (com Supabase staging + bot Telegram). Branch `main` deploya para producao (com Supabase prod + WhatsApp Cloud API). Isso garante que toda mudanca e testada em staging antes de ir pra producao.

## Acceptance Criteria
- [ ] AC1: Projeto Vercel `trifold-crm` criado e linkado ao repo `freelans-dev/trifold-crm`
- [ ] AC2: Branch `staging` criada no repo GitHub
- [ ] AC3: Vercel configurado com Production Branch = `main`
- [ ] AC4: Vercel configurado com Preview Branch = `staging`
- [ ] AC5: Environment variables de **producao** configuradas no Vercel (scope: Production):
  - `NEXT_PUBLIC_SUPABASE_URL` (Supabase prod)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase prod)
  - `SUPABASE_SERVICE_ROLE_KEY` (Supabase prod)
  - `ANTHROPIC_API_KEY`
  - `META_WHATSAPP_ACCESS_TOKEN`
  - `META_WHATSAPP_PHONE_NUMBER_ID`
  - `META_WHATSAPP_VERIFY_TOKEN`
  - `META_APP_SECRET`
- [ ] AC6: Environment variables de **staging** configuradas no Vercel (scope: Preview):
  - `NEXT_PUBLIC_SUPABASE_URL` (Supabase staging)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase staging)
  - `SUPABASE_SERVICE_ROLE_KEY` (Supabase staging)
  - `ANTHROPIC_API_KEY`
  - `TELEGRAM_BOT_TOKEN` (@NicoleTrifoldBot)
  - `TELEGRAM_WEBHOOK_SECRET`
- [ ] AC7: Push para `staging` gera deploy automatico em `trifold-crm-staging.vercel.app` (ou similar)
- [ ] AC8: Push para `main` gera deploy automatico no dominio de producao
- [ ] AC9: Dominio de staging acessivel e funcional apos deploy
- [ ] AC10: Dominio de producao acessivel e funcional apos deploy

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `vercel.json` — Configuracao de build (se necessario, normalmente Next.js detecta automatico)
- `.github/CODEOWNERS` — (opcional) Proteger branch `main`

### Configuracao Vercel:
```
Project Settings > Git:
  - Production Branch: main
  - Preview Branches: staging

Project Settings > Environment Variables:
  - Production: Supabase prod + Meta WhatsApp vars
  - Preview: Supabase staging + Telegram vars
```

### Deploy flow:
```
Developer trabalha em feature branch
  → push para staging → Vercel Preview deploy
  → testa no staging (Telegram + Supabase staging)
  → validou? → PR de staging para main
  → merge → Vercel Production deploy
  → producao rodando (WhatsApp + Supabase prod)
```

### Branch protection (GitHub):
```
main:
  - Require PR before merging
  - Require 1 approval (opcional, equipe pequena)
  - No force push

staging:
  - Push direto permitido (dev flow rapido)
```

## Dependencias
- Depende de: 0.1 (Supabase URLs existem), 1.1 (repo GitHub existe)
- Bloqueia: 0.3 (Telegram webhook precisa do URL de staging), 0.4 (env vars por ambiente)

## Estimativa
M (Media) — 1-2 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
