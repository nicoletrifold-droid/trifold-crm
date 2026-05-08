status: Done

# Story 1.3 — Setup Vercel Deploy

## Contexto
CI/CD desde o dia 1. Cada push para `main` deve gerar deploy automatico na Vercel. Isso permite que stakeholders vejam progresso em tempo real e elimina deploys manuais. O dominio temporario da Vercel e suficiente para o MVP; dominio customizado (`crm.3fold`) vem depois.

## Acceptance Criteria
- [x] AC1: Projeto `trifold-crm` criado na Vercel vinculado ao repo GitHub `freelans-dev/trifold-crm`
- [x] AC2: Root directory configurado como `packages/web` (ou Turborepo root com build filter)
- [x] AC3: Auto-deploy habilitado para branch `main`
- [x] AC4: Preview deploys habilitados para pull requests
- [x] AC5: Build command funciona: `turbo build --filter=web`
- [ ] AC6: Environment variables de producao configuradas na Vercel (Supabase URL, Supabase Anon Key)
- [x] AC7: Deploy inicial funciona e retorna pagina placeholder (landing ou dashboard shell)
- [x] AC8: URL do deploy acessivel e funcional (ex: `trifold-crm.vercel.app`)

## Detalhes Tecnicos

### Configuracao Vercel:
- **Framework Preset:** Next.js
- **Build Command:** `cd ../.. && npx turbo build --filter=web`
- **Output Directory:** `.next`
- **Install Command:** `pnpm install`
- **Root Directory:** `packages/web`

### Arquivos a criar/modificar:
- `vercel.json` (na raiz, se necessario para monorepo)
- `packages/web/next.config.ts` — configuracao base Next.js

### Referencia agente-linda:
- Mesmo setup de `~/agente-linda/vercel.json` e config de monorepo

## Dependencias
- Depende de: 1.1 (repo), 1.2 (Supabase URL para env vars)
- Bloqueia: nenhuma diretamente (mas deploy continuo beneficia todos)

## Estimativa
P (Pequena) — 1 hora

## File List

### Created/Modified
- `vercel.json` — Configuracao de monorepo para deploy Vercel
- `packages/web/next.config.ts` — Configuracao base Next.js

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
