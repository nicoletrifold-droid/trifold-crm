# Story 15.2 — Google OAuth2: Setup + Tela de Conexao nas Configuracoes

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "test-validation"]

## Story
**As a** admin da Trifold,
**I want** conectar a conta Google do CRM numa unica vez nas configuracoes,
**so that** o sistema possa acessar a Google Forms API automaticamente para todas as campanhas futuras.

## Contexto

**Epic 15 — Campaign Engine + Google Forms Integration (Fase 1 MVP)**

Esta story implementa a conexao OAuth2 com o Google. Apos conectar, o sistema usa os tokens para acessar a Google Forms API (polling de respostas no cron da story 15.5).

**Decisao D2 da arquitetura:** Google Forms API polling em vez de Apps Script. O admin so cola o link do Forms e pronto — zero config manual por campanha.

**Dependencias:** Story 15.1 (migration — coluna `google_oauth_tokens` na organizations)

## Acceptance Criteria

1. [ ] AC1: Pacote `googleapis` instalado como dependencia do `packages/web`
2. [ ] AC2: Servico `packages/web/src/lib/google.ts` criado com: `getOAuth2Client()`, `getAuthUrl()`, `exchangeCodeForTokens()`, `getFormsClient(tokens)`, `refreshTokenIfNeeded(tokens)`
3. [ ] AC3: Rota `/api/auth/google` (GET) redireciona para Google OAuth2 consent screen com scope `forms.responses.readonly`
4. [ ] AC4: Rota `/api/auth/google/callback` (GET) recebe o code, troca por tokens, salva em `organizations.google_oauth_tokens`, redireciona para `/dashboard/configuracoes` com success message
5. [ ] AC5: Na tela `/dashboard/configuracoes`, secao "Integracoes" exibe: estado da conexao Google (conectado/desconectado), botao "Conectar Google" (se desconectado), badge verde "Google conectado" (se conectado), botao "Desconectar" (se conectado — limpa tokens)
6. [ ] AC6: Funcao `refreshTokenIfNeeded(tokens)` retorna tokens atualizados se o access_token expirou (usa refresh_token), e atualiza no banco
7. [ ] AC7: Se o `refresh_token` for revogado/invalido, o status muda para desconectado e exibe alerta no painel
8. [ ] AC8: Env vars `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` documentadas no `.env.example` ou equivalente
9. [ ] AC9: `pnpm run type-check` passa sem erros
10. [ ] AC10: Nenhum secret/token hardcoded no codigo

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [ ] Task 1: Instalar dependencia (AC1)
  - [ ] 1.1: `pnpm add googleapis` no `packages/web`

- [ ] Task 2: Criar servico Google OAuth2 (AC2, AC6)
  - [ ] 2.1: Criar `packages/web/src/lib/google.ts`
  - [ ] 2.2: Implementar `getOAuth2Client()` com client_id, client_secret, redirect_uri do env
  - [ ] 2.3: Implementar `getAuthUrl()` com scope `https://www.googleapis.com/auth/forms.responses.readonly`
  - [ ] 2.4: Implementar `exchangeCodeForTokens(code)` — troca authorization code por tokens
  - [ ] 2.5: Implementar `getFormsClient(tokens)` — retorna google.forms({ version: 'v1', auth })
  - [ ] 2.6: Implementar `refreshTokenIfNeeded(tokens)` — checa expiry, faz refresh se necessario

- [ ] Task 3: Criar rotas de autenticacao (AC3, AC4)
  - [ ] 3.1: Criar `packages/web/src/app/api/auth/google/route.ts` (GET → redirect para consent screen)
  - [ ] 3.2: Criar `packages/web/src/app/api/auth/google/callback/route.ts` (GET → exchange code, salvar tokens, redirect)
  - [ ] 3.3: Usar `requireAuth()` + `requireRole(appUser, ["admin"])` para proteger as rotas

- [ ] Task 4: UI nas configuracoes (AC5, AC7)
  - [ ] 4.1: Identificar a pagina de configuracoes existente (`/dashboard/configuracoes`)
  - [ ] 4.2: Adicionar secao "Integracoes" com estado Google conectado/desconectado
  - [ ] 4.3: Botao "Conectar Google" que redireciona para `/api/auth/google`
  - [ ] 4.4: Badge "Google conectado" + botao "Desconectar" (limpa `google_oauth_tokens`)

- [ ] Task 5: Validacao (AC8, AC9, AC10)
  - [ ] 5.1: Adicionar vars no .env.example
  - [ ] 5.2: type-check

## Dev Notes

### Source Tree Relevante

- `packages/web/src/lib/supabase/admin.ts` — padrao de admin client (usar para salvar tokens)
- `packages/web/src/lib/api-auth.ts` — `requireAuth()` e `requireRole()` para protecao de rotas
- `packages/web/src/app/dashboard/configuracoes/page.tsx` — pagina de configuracoes existente
- `packages/web/src/app/api/auth/` — verificar se ja existe pasta de auth routes

### Google OAuth2 Flow

```
1. Admin clica "Conectar Google"
2. GET /api/auth/google → redirect para accounts.google.com/o/oauth2/v2/auth
3. Usuario autoriza → Google redireciona para /api/auth/google/callback?code=XXX
4. Callback troca code por { access_token, refresh_token, expiry_date }
5. Salva em organizations.google_oauth_tokens (JSONB)
6. Redirect para /dashboard/configuracoes?google=connected
```

### Tokens JSONB

```json
{
  "access_token": "ya29.xxx",
  "refresh_token": "1//0xxx",
  "expiry_date": 1713312000000,
  "token_type": "Bearer",
  "scope": "https://www.googleapis.com/auth/forms.responses.readonly"
}
```

### Pre-requisito Externo

Criar projeto no Google Cloud Console, habilitar Google Forms API, configurar OAuth consent screen, gerar credentials.

### Testing

- `pnpm run type-check` deve passar
- Testar fluxo manualmente: conectar → desconectar → reconectar

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
