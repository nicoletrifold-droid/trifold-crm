# Story 51-4 — Google Ads: Fluxo OAuth UI (Conectar Conta)

## Metadata
- **Epic:** 51 — Google Ads Marketing API Integration
- **Story:** 51-4
- **Status:** Ready
- **Priority:** P1 — bloqueia validação end-to-end de 51-2 e 51-3
- **Complexity:** M (~6h)
- **Created:** 2026-06-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[oauth_flow, security_review, ui_states, api_correctness]`

---

## User Story

**Como** administrador de uma organização no Trifold CRM,
**Quero** conectar minha conta Google Ads via OAuth na página de configurações,
**Para que** o sistema possa sincronizar spend automaticamente e eu possa visualizar dados de campanhas sem sair do CRM.

---

## Context

Esta story espelha a Meta Ads Auth UI (Story 16.3), adaptada para o fluxo OAuth 2.0 do Google.

### Por que esta story é crítica

Sem esta story:
- A coluna `organizations.google_ads_config` (criada em 51-1) nunca é populada
- O cron da Story 51-2 sempre pula todas as orgs (critério: `google_ads_config IS NOT NULL AND status = 'connected'`)
- A UI da Story 51-3 sempre exibe "Não configurado"
- O Definition of Done do Epic 51 não pode ser cumprido

### Diferença Google vs Meta para autenticação

| Aspecto | Meta Ads | Google Ads |
|---------|----------|-----------|
| Tipo de token | System User Token (estático) | OAuth 2.0 com `refresh_token` (fluxo de 3 pernas) |
| Duração | Não expira (até revogar) | `access_token` expira em 1h; `refresh_token` não expira se não revogado |
| UI necessária | Copiar/colar token | Redirect para Google OAuth → callback → salvar refresh_token |
| Credenciais globais | `access_token` por conta | `client_id` + `client_secret` por app; `refresh_token` por usuário/org |

### Fluxo OAuth 2.0 (3 pernas)

```
1. Admin clica "Autorizar via Google"
   → Redirect para: https://accounts.google.com/o/oauth2/v2/auth
     ?client_id={GOOGLE_ADS_CLIENT_ID}
     &redirect_uri={callbackUrl}
     &response_type=code
     &scope=https://www.googleapis.com/auth/adwords
     &access_type=offline       ← essencial para obter refresh_token
     &prompt=consent            ← força reexibição para garantir refresh_token

2. Admin autoriza no Google → Google redireciona para callback com ?code=...

3. Callback (server-side):
   POST https://oauth2.googleapis.com/token
     grant_type=authorization_code
     code={code}
     client_id={GOOGLE_ADS_CLIENT_ID}
     client_secret={GOOGLE_ADS_CLIENT_SECRET}
     redirect_uri={callbackUrl}
   → Resposta: { access_token, refresh_token, expires_in, token_type }

4. Salvar { customer_id, refresh_token, client_id, client_secret, connected_at, status: 'connected' }
   em organizations.google_ads_config
```

**CRÍTICO:** `access_type=offline` e `prompt=consent` são obrigatórios para obter o `refresh_token`. Sem eles, Google retorna apenas `access_token` (1h).

### Arquivos de referência

- Padrão de página de integração Meta: `packages/web/src/app/dashboard/configuracoes/integracoes/` — ver estrutura de cards e autenticação
- Padrão de callback OAuth existente (se houver em outro contexto): verificar `packages/web/src/app/api/auth/`
- `organizations.google_ads_config` shape: definido na Story 51-1 Dev Notes

---

## Acceptance Criteria

- [ ] **AC1:** Página `/dashboard/configuracoes/integracoes/google-ads/page.tsx` criada e acessível para usuários com role `admin`
- [ ] **AC2:** Campo `customer_id` com validação:
  - Aceita formato com hífens no input (`123-456-7890`)
  - Remove hífens antes de salvar (`1234567890`)
  - Validação: deve ter exatamente 10 dígitos numéricos (após remoção de hífens)
  - Mensagem de erro clara se formato inválido
- [ ] **AC3:** Botão "Autorizar via Google" inicia o fluxo OAuth com:
  - Redirect para `https://accounts.google.com/o/oauth2/v2/auth` com params: `client_id`, `redirect_uri`, `response_type=code`, `scope=https://www.googleapis.com/auth/adwords`, `access_type=offline`, `prompt=consent`
  - `customer_id` é salvo em session/cookie antes do redirect (necessário para o callback)
  - Botão desabilitado se `customer_id` não for válido
- [ ] **AC4:** Rota `GET /api/auth/google-ads/callback` criada em `packages/web/src/app/api/auth/google-ads/callback/route.ts`:
  - Recebe `?code=` da Google
  - Executa troca server-side: `POST https://oauth2.googleapis.com/token` com `grant_type=authorization_code`
  - Salva credenciais em `organizations.google_ads_config`: `{ customer_id, refresh_token, client_id: GOOGLE_ADS_CLIENT_ID, client_secret: GOOGLE_ADS_CLIENT_SECRET, connected_at: new Date().toISOString(), status: 'connected' }`
  - Redireciona para `/dashboard/configuracoes/integracoes/google-ads?success=true` após sucesso
  - Redireciona para `/dashboard/configuracoes/integracoes/google-ads?error=...` em caso de falha
- [ ] **AC5:** Credenciais salvas em `organizations.google_ads_config` com shape completo (`customer_id`, `refresh_token`, `client_id`, `client_secret`, `connected_at`, `status: 'connected'`) — conforme definido em Story 51-1 AC8
- [ ] **AC6:** Botão "Testar conexão" (visível quando `status = 'connected'`):
  - Executa GAQL `SELECT customer.descriptive_name FROM customer LIMIT 1` via endpoint `POST /api/google-ads/test-connection`
  - Exibe nome descritivo da conta se sucesso (`"Conexão bem-sucedida: [Nome da Conta]"`)
  - Exibe mensagem de erro clara se falhar (token expirado, customer_id inválido, etc.)
- [ ] **AC7:** Botão "Desconectar" (visível quando `status = 'connected'`):
  - Executa `PATCH /api/google-ads/disconnect` que seta `organizations.google_ads_config = NULL`
  - Exibe confirmação ("Tem certeza? O sync automático será desativado.") antes de executar
  - Após desconexão: página volta ao estado "Não configurado"
- [ ] **AC8:** Estados de UI cobertos e visualmente distintos:
  - `Não configurado` — formulário de customer_id + botão "Autorizar via Google" (cinza)
  - `Conectando` — spinner/loading durante o fluxo OAuth (após clique em "Autorizar")
  - `Conectado` — badge verde, customer_id mascarado, botão "Testar conexão", botão "Desconectar"
  - `Erro` — badge vermelho, mensagem de erro, botão para tentar novamente
- [ ] **AC9:** TypeScript compila sem erros; ESLint passa

---

## Tasks / Subtasks

- [ ] **T1** — Criar página de configuração Google Ads (AC1, AC2, AC3, AC8)
  - [ ] T1.1 — Criar `packages/web/src/app/dashboard/configuracoes/integracoes/google-ads/page.tsx`
  - [ ] T1.2 — Verificar acesso: apenas role `admin` (padrão de outras páginas de configuração)
  - [ ] T1.3 — Criar Client Component `GoogleAdsSetupForm` com state para `customerId` e estados de UI (AC8)
  - [ ] T1.4 — Input de `customer_id` com máscara/validação (10 dígitos após remover hífens)
  - [ ] T1.5 — Botão "Autorizar via Google" — construir URL OAuth e redirecionar (AC3)
  - [ ] T1.6 — Salvar `customer_id` em cookie antes do redirect (para o callback recuperar)
  - [ ] T1.7 — Ler `?success=true` ou `?error=...` da URL após retorno do callback e exibir feedback
  - [ ] T1.8 — Exibir estado "Conectado" com dados da conta quando `google_ads_config.status = 'connected'`
  - [ ] T1.9 — Mascarar `customer_id` exibido: ex: `***-***-7890` (apenas últimos 4 visíveis)

- [ ] **T2** — Criar callback OAuth (AC4, AC5)
  - [ ] T2.1 — Criar `packages/web/src/app/api/auth/google-ads/callback/route.ts`
  - [ ] T2.2 — `GET`: recebe `?code=` da Google, lê `customer_id` do cookie
  - [ ] T2.3 — Troca `code` por `refresh_token` via `POST https://oauth2.googleapis.com/token` (server-side, usando `GOOGLE_ADS_CLIENT_ID` e `GOOGLE_ADS_CLIENT_SECRET` das env vars)
  - [ ] T2.4 — Salva objeto completo em `organizations.google_ads_config` via admin supabase client
  - [ ] T2.5 — Limpa cookie de `customer_id` após save
  - [ ] T2.6 — Redireciona para página com `?success=true` ou `?error={message}`

- [ ] **T3** — Criar endpoint de teste de conexão (AC6)
  - [ ] T3.1 — Criar `packages/web/src/app/api/google-ads/test-connection/route.ts`
  - [ ] T3.2 — `POST`: lê `google_ads_config` da org autenticada, obtém `access_token` via `getGoogleAdsAccessToken` (de Story 51-2 lib)
  - [ ] T3.3 — Executa GAQL `SELECT customer.descriptive_name FROM customer LIMIT 1`
  - [ ] T3.4 — Retorna `{ ok: true, accountName: string }` ou `{ ok: false, error: string }`
  - [ ] T3.5 — Reutilizar `packages/web/src/lib/google-ads/auth.ts` e `client.ts` criados em Story 51-2 (se 51-2 for implementada antes) — ou criar versão mínima se 51-4 for implementada antes de 51-2

- [ ] **T4** — Criar endpoint de desconexão (AC7)
  - [ ] T4.1 — Criar `packages/web/src/app/api/google-ads/disconnect/route.ts`
  - [ ] T4.2 — `POST`: verifica auth via `requireAuth()`, executa `UPDATE organizations SET google_ads_config = NULL WHERE id = {orgId}`
  - [ ] T4.3 — Retorna `{ ok: true }` ou erro

- [ ] **T5** — QA pre-commit (AC9)
  - [ ] T5.1 — `pnpm type-check` em `packages/web`
  - [ ] T5.2 — `pnpm lint src/app/dashboard/configuracoes/integracoes/google-ads/ src/app/api/auth/google-ads/ src/app/api/google-ads/`

---

## Dev Notes

### Arquivos a criar
```
packages/web/src/app/dashboard/configuracoes/integracoes/google-ads/page.tsx
packages/web/src/app/api/auth/google-ads/callback/route.ts
packages/web/src/app/api/google-ads/test-connection/route.ts
packages/web/src/app/api/google-ads/disconnect/route.ts
```

### Arquivos de referência obrigatórios
```
packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx   ← padrão de UI de integrações
packages/web/src/app/api/meta-ads/                                   ← padrão de API de ads
packages/web/src/lib/google-ads/auth.ts                             ← reutilizar se 51-2 for antes
```

### Variáveis de ambiente (já definidas em Story 51-0)
```bash
GOOGLE_ADS_CLIENT_ID=       # OAuth App no Google Cloud Console
GOOGLE_ADS_CLIENT_SECRET=   # OAuth App no Google Cloud Console
GOOGLE_ADS_DEVELOPER_TOKEN= # Para o test-connection (AC6)
```

### URL de callback — configurar antes de implementar

O `redirect_uri` usado no OAuth DEVE ser exatamente o mesmo configurado no Google Cloud Console (Story 51-0 T2.4):
- Dev: `http://localhost:3000/api/auth/google-ads/callback`
- Prod: `https://{domínio-vercel}/api/auth/google-ads/callback`

Passar o `redirect_uri` correto dependendo do ambiente:
```typescript
const redirectUri = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/auth/google-ads/callback`
  : 'http://localhost:3000/api/auth/google-ads/callback'
```

### Construção da URL OAuth
```typescript
const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
oauthUrl.searchParams.set('client_id', process.env.GOOGLE_ADS_CLIENT_ID!)
oauthUrl.searchParams.set('redirect_uri', redirectUri)
oauthUrl.searchParams.set('response_type', 'code')
oauthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/adwords')
oauthUrl.searchParams.set('access_type', 'offline')   // OBRIGATÓRIO para refresh_token
oauthUrl.searchParams.set('prompt', 'consent')         // OBRIGATÓRIO para sempre retornar refresh_token
```

### Troca code → refresh_token (server-side)
```typescript
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    redirect_uri: redirectUri,
  })
})
const { refresh_token, access_token } = await tokenResponse.json()
```

### Segurança — plaintext storage
`refresh_token` é armazenado em plaintext em `organizations.google_ads_config` (débito técnico documentado em Story 51-1 AC8). Para MVP, este é o comportamento aceito. NÃO logar o valor do `refresh_token` em produção.

### Padrão de autenticação de endpoints
```typescript
import { requireAuth } from "@web/lib/api-auth"
const auth = await requireAuth()
if (auth.error) return auth.error
const { supabase, appUser } = auth
```

---

## Testing

### Abordagem
- Testar fluxo completo com conta Google Ads real (requer Story 51-0 completa)
- Para testes locais sem conta real: mockar o callback recebendo `?code=test` e verificar que o POST ao token endpoint é feito corretamente (sem executar de fato)

### Cenários de teste
1. **Estado inicial:** página carrega com formulário de customer_id (estado "Não configurado")
2. **Validação customer_id:** input `123-456-789` (9 dígitos) → erro de validação
3. **Validação customer_id:** input `123-456-7890` (10 dígitos) → botão habilitado
4. **Fluxo OAuth completo:** clicar "Autorizar via Google" → redirect Google → retorno com `?success=true` → estado "Conectado" visível
5. **Teste de conexão:** botão "Testar conexão" → chamada GAQL → exibe nome da conta
6. **Desconexão:** botão "Desconectar" → confirmação → `google_ads_config = NULL` → estado volta para "Não configurado"
7. **Erro OAuth:** callback com `?error=access_denied` → exibe mensagem de erro
8. **Acesso sem auth:** `GET /api/google-ads/test-connection` sem autenticação → 401

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `access_type=offline` omitido → Google não retorna `refresh_token` | Cravar em T1.5 e Dev Notes — é gotcha comum do Google OAuth |
| R2 | `prompt=consent` omitido → refresh_token só retorna na primeira autorização | Cravar em T1.5 — manter `prompt=consent` para garantir refresh_token sempre que reconectar |
| R3 | `redirect_uri` mismatch (dev vs prod) | Configurar ambos os URIs no Google Cloud Console (Story 51-0 T2.4) |
| R4 | Cookie de `customer_id` perdido em redirect (Safari/iOS bloqueia cookies de terceiros em redirect) | Usar session storage ou passar `customer_id` como state param no OAuth URL (Google retorna state no callback) |
| R5 | Story 51-0 não completa antes desta (sem env vars) | Desenvolvimento pode rodar com `.env.local` manual; bloqueia apenas deploy em produção |

---

## Dependencies

- **Depende de:**
  - Story 51-1 (coluna `organizations.google_ads_config` deve existir no banco)
  - Story 51-0 (env vars `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` no Vercel — bloqueia produção mas não desenvolvimento local)
- **Bloqueia:**
  - Validação end-to-end de Story 51-2 (cron com dados reais)
  - Validação end-to-end de Story 51-3 (UI com conta real conectada)

---

## Definition of Done

- [ ] Todos os ACs marcados como completos
- [ ] Fluxo OAuth completo testado com conta Google Ads real (ou conta de teste Google)
- [ ] `organizations.google_ads_config` populado com shape correto após fluxo OAuth
- [ ] Botão "Testar conexão" confirma conta válida
- [ ] `pnpm type-check` e `pnpm lint` passando
- [ ] @qa executou quality gate com verdict >= PASS ou CONCERNS documentados
- [ ] @devops fez push do commit final

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-08 | 0.1 | Story criada a partir de PM review (AI-2) — gap crítico identificado: fluxo OAuth ausente; espelha Meta Story 16.3 | @sm (River) |
| 2026-06-08 | 0.3 | Validated (10-point checklist, score 10/10), Draft → Ready | @po (Pax) |

---

## Dev Agent Record

### Agent Model Used
_(a ser preenchido pelo @dev durante implementação)_

### Debug Log References
_(a ser preenchido durante implementação)_

### Completion Notes List
_(a ser preenchido durante implementação)_

### File List

#### Created
- `packages/web/src/app/dashboard/configuracoes/integracoes/google-ads/page.tsx`
- `packages/web/src/app/api/auth/google-ads/callback/route.ts`
- `packages/web/src/app/api/google-ads/test-connection/route.ts`
- `packages/web/src/app/api/google-ads/disconnect/route.ts`

#### Modified
- _(nenhum arquivo existente modificado — criação pura)_

---

## QA Results
_(a ser preenchido pelo @qa)_
