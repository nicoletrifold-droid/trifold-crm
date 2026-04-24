---
epic: 16
story: 16.3
title: OAuth/Token — Conectar Ad Account (UI + Backend)
status: Ready
priority: P1-ALTO
created_at: 2026-04-24
created_by: River (@sm)
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [security_review, token_storage_validation, token_masking, api_design]
complexity: G
estimated_hours: 5
depends_on: [16.1, 16.2]
---

# Story 16.3 — OAuth/Token: Conectar Ad Account (UI + Backend)

## Contexto

Stories 16.1 (Migration) e 16.2 (Client) estão em produção. As tabelas
`meta_ad_accounts` existem no banco e o `metaFetch()` está disponível em
`@trifold/shared`. Para que os crons de sync (16.4, 16.5) possam funcionar,
um admin precisa poder configurar as credenciais Meta (System User Token,
Ad Account ID, Page Access Token) via UI.

Esta story cria a página `/dashboard/configuracoes/integracoes/meta-ads`
com formulário de configuração, teste de conexão e status badge — seguindo
o padrão do `GoogleIntegrationCard` existente.

## Story Statement

**Como** administrador do Trifold CRM,
**Quero** configurar as credenciais da Meta Marketing API via interface,
**Para que** os crons de sync e o webhook possam fazer chamadas autenticadas
à Meta Graph API sem configuração manual de variáveis de ambiente por conta.

## Acceptance Criteria

- [ ] **AC1:** Página `/dashboard/configuracoes/integracoes/meta-ads` criada como Server Component que carrega o estado atual de `meta_ad_accounts` para a org do usuário logado

- [ ] **AC2:** `MetaAdsIntegrationCard` (Client Component) exibe:
  - Input "System User Token" — tipo `password`, masked após salvo (exibe `••••••••{últimos 4 chars}`)
  - Input "Ad Account ID" — placeholder `act_123456789`
  - Input "Page Access Token" — tipo `password`, masked após salvo
  - Todos os inputs em um `<form>` com submit único "Salvar configuração"

- [ ] **AC3:** Endpoint `POST /api/meta-ads/account` criado:
  - Recebe `{ system_user_token, ad_account_id, page_access_token }` no body
  - Valida que `ad_account_id` começa com `act_`
  - Faz upsert em `meta_ad_accounts` (indexed by `org_id`)
  - Retorna `{ success: true, account_id: string }`
  - Protegido por autenticação — retorna 401 se não autenticado

- [ ] **AC4:** Endpoint `GET /api/meta-ads/account/test` criado:
  - Usa `metaFetch()` de `@trifold/shared` para chamar `GET /act_{id}?fields=name,currency,account_status`
  - Em caso de sucesso: retorna `{ ok: true, name, currency, account_status }`
  - Em caso de `MetaOAuthException`: retorna `{ ok: false, error: "token_invalid" }`
  - Em caso de `MetaPermissionError`: retorna `{ ok: false, error: "permission_denied" }`
  - Lê o token salvo de `meta_ad_accounts` — não aceita token no body

- [ ] **AC5:** Botão "Testar conexão" no card:
  - Chama `GET /api/meta-ads/account/test` via fetch client-side
  - Estado de loading com spinner enquanto aguarda
  - Em sucesso: exibe badge verde "Conectado — {account_name} ({currency})"
  - Em erro token: exibe badge vermelho "Token inválido ou expirado"
  - Em erro permissão: exibe badge amarelo "Permissão insuficiente"

- [ ] **AC6:** Status badge persistido:
  - Campo `status` em `meta_ad_accounts` atualizado pelo endpoint `/test` (`connected` | `error` | `disconnected`)
  - Página carrega com status atual do banco — badge visível sem precisar testar novamente
  - Última sincronização (`last_synced_at`) exibida no card quando disponível

- [ ] **AC7:** Token masking na exibição:
  - Após salvo, inputs mostram `••••••••{últimos 4 chars}` (ex: `••••••••a1b2`)
  - Ao clicar no input para editar, limpa o placeholder para nova entrada
  - Token NUNCA retorna no GET de estado — endpoint apenas retorna `{ has_token: boolean, last_4: string }`

- [ ] **AC8:** Zero erros de TypeScript (`npm run type-check` passa). Sem `any` explícito nas funções públicas de API e componentes

## Scope

### IN (o que esta story implementa)
- Página `/dashboard/configuracoes/integracoes/meta-ads`
- Component `MetaAdsIntegrationCard` (Client Component)
- API `POST /api/meta-ads/account` — salvar credenciais
- API `GET /api/meta-ads/account` — carregar estado (maskeado)
- API `GET /api/meta-ads/account/test` — testar conexão via `metaFetch()`
- Status badge persistido em `meta_ad_accounts.status`
- Token masking no frontend

### OUT (fora desta story)
- Encryption em repouso do token no banco (→ débito técnico TD-002 da Story 16.1, endereçável em story de segurança)
- OAuth flow interativo com Meta (→ não aplicável, usamos System User Token)
- Sync automático de campanhas (→ Stories 16.4, 16.5)
- Renovação automática de token (→ Story 16.13)
- Suporte a múltiplas ad accounts por org (→ escopo futuro)

## Dev Notes

### Estrutura de arquivos a criar

```
packages/web/src/app/
├── dashboard/configuracoes/integracoes/meta-ads/
│   └── page.tsx                          # Server Component — carrega estado
│   └── meta-ads-integration-card.tsx     # Client Component — form + botões
└── api/meta-ads/
    └── account/
        ├── route.ts                      # GET + POST /api/meta-ads/account
        └── test/
            └── route.ts                  # GET /api/meta-ads/account/test
```

### Padrão de referência existente

```
packages/web/src/app/dashboard/configuracoes/integracoes/
├── page.tsx                    # Server Component (replicar padrão)
└── google-integration-card.tsx # Client Component (replicar estrutura)
```

Replicar exatamente o padrão `GoogleIntegrationCard`:
- Server Component faz a query no banco e passa props para Client Component
- Client Component gerencia estado local (loading, error, success)
- `StatusBadge` e `ConfigField` de `integracoes/page.tsx` podem ser reusados/replicados

### Padrão de integracoes/page.tsx

```typescript
// Server Component carrega estado
const { data: account } = await supabase
  .from('meta_ad_accounts')
  .select('id, meta_account_id, status, last_synced_at, access_token')
  .eq('org_id', org.id)
  .maybeSingle()

// Passar para Client Component sem expor o token completo
<MetaAdsIntegrationCard
  initialStatus={account?.status ?? null}
  initialAccountId={account?.meta_account_id ?? null}
  tokenLast4={account?.access_token?.slice(-4) ?? null}
  hasToken={!!account?.access_token}
  lastSyncedAt={account?.last_synced_at ?? null}
/>
```

### Endpoint POST /api/meta-ads/account

```typescript
// POST body
interface SaveAccountBody {
  system_user_token: string
  ad_account_id: string       // deve começar com "act_"
  page_access_token?: string
}

// Upsert — uma conta por org
const { error } = await supabase
  .from('meta_ad_accounts')
  .upsert({
    org_id: user.org_id,
    meta_account_id: body.ad_account_id,
    access_token: body.system_user_token,
    status: 'disconnected',  // requer /test para virar 'connected'
    updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id,meta_account_id' })
```

### Endpoint GET /api/meta-ads/account/test

```typescript
import { metaFetch, MetaOAuthException, MetaPermissionError } from '@trifold/shared'

// Busca token do banco (nunca do body)
const account = await supabase
  .from('meta_ad_accounts')
  .select('meta_account_id, access_token')
  .eq('org_id', user.org_id)
  .single()

try {
  const result = await metaFetch<{ name: string; currency: string; account_status: number }>(
    account.meta_account_id,
    account.access_token,
    { params: { fields: 'name,currency,account_status' } }
  )
  // Atualizar status para 'connected'
  await supabase.from('meta_ad_accounts').update({ status: 'connected', last_synced_at: now })...
  return { ok: true, name: result.name, currency: result.currency }
} catch (error) {
  if (error instanceof MetaOAuthException) {
    await supabase.from('meta_ad_accounts').update({ status: 'error' })...
    return { ok: false, error: 'token_invalid' }
  }
  if (error instanceof MetaPermissionError) {
    return { ok: false, error: 'permission_denied' }
  }
  return { ok: false, error: 'unknown' }
}
```

### Token masking no frontend

```typescript
// No Client Component, ao renderizar inputs:
const displayToken = hasToken ? `••••••••${tokenLast4}` : ''

// Ao focar no input, limpar placeholder para nova entrada:
onFocus={() => { if (!isEditing) { setToken(''); setIsEditing(true) } }}
```

### Env vars necessárias

Nenhuma env var nova nesta story — as credenciais são salvas no banco via UI.
Os crons (16.4, 16.5) lerão as credenciais do banco, não de env vars.

### Autenticação / RLS

- Todos os endpoints verificam `getServerUser()` / `createClient()` com a sessão atual
- RLS em `meta_ad_accounts` garante que a org só vê sua própria conta
- Endpoints retornam 401 se sessão inválida

## Tasks / Subtasks

- [ ] **Task 1** — Criar API routes
  - Criar `packages/web/src/app/api/meta-ads/account/route.ts` (GET + POST)
  - Criar `packages/web/src/app/api/meta-ads/account/test/route.ts` (GET)
  - Validação de `act_` prefix no POST
  - Integração com `metaFetch` e error handling tipado (AC3, AC4)

- [ ] **Task 2** — Criar Client Component
  - Criar `meta-ads-integration-card.tsx` com form, inputs masked, botão testar (AC2, AC5, AC7)
  - Estado: loading, error, success para o botão de teste
  - Token masking: exibição `••••••••{last4}`, limpar ao focar para editar

- [ ] **Task 3** — Criar página Server Component
  - Criar `packages/web/src/app/dashboard/configuracoes/integracoes/meta-ads/page.tsx` (AC1)
  - Carregar estado de `meta_ad_accounts` e passar props maskeados ao Client Component
  - Status badge persistido (AC6)

- [ ] **Task 4** — Validar e integrar
  - Adicionar link para `/configuracoes/integracoes/meta-ads` na página de integrações existente
  - Verificar `npm run type-check` sem erros (AC8)
  - Confirmar que token nunca retorna completo em nenhum endpoint (AC7)

## File List

### Arquivos a criar
- `packages/web/src/app/api/meta-ads/account/route.ts`
- `packages/web/src/app/api/meta-ads/account/test/route.ts`
- `packages/web/src/app/dashboard/configuracoes/integracoes/meta-ads/page.tsx`
- `packages/web/src/app/dashboard/configuracoes/integracoes/meta-ads/meta-ads-integration-card.tsx`

### Arquivos modificados
- `packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx` — adicionar card/link Meta Ads

## Testes

- [ ] `npm run type-check` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] POST `/api/meta-ads/account` retorna 401 sem sessão
- [ ] POST `/api/meta-ads/account` retorna 400 se `ad_account_id` não começa com `act_`
- [ ] GET `/api/meta-ads/account/test` retorna `{ ok: false, error: 'token_invalid' }` quando `MetaOAuthException`
- [ ] GET `/api/meta-ads/account` retorna `has_token: true, last_4: "a1b2"` — nunca o token completo
- [ ] UI exibe `••••••••a1b2` quando token salvo
- [ ] Ao focar no input, placeholder limpa para nova entrada

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Feature (UI + API)
- Complexity: Grande (4 arquivos, auth, token masking, external API call)

**Specialized Agent Assignment:**
- Primary: `@dev` (implementação)
- Quality Gate: `@architect` (revisar segurança do token, design da API, masking)

**Quality Gate Tasks:**
- [ ] Pre-Commit (`@dev`): `npm run type-check` sem erros
- [ ] Pre-PR (`@architect`): Revisar token security, masking, API design, RLS coverage

**CodeRabbit Focus Areas:**
- Token security: token NUNCA retorna completo em respostas de API
- Auth: todos os endpoints protegidos com `getServerUser()`
- RLS: `meta_ad_accounts` filtrado por `org_id`
- Masking: implementação correta do `last_4` sem expor token
- Error handling: `MetaOAuthException` vs `MetaPermissionError` distintos

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-04-24 | @sm (River) | Story criada — Draft |
| 2026-04-24 | @po (Pax) | Validação 10-point: 9.5/10 — GO. Status: Draft → Ready |

## Definition of Done

- [ ] 4 arquivos criados (2 API routes + page + card component)
- [ ] `integracoes/page.tsx` atualizado com link/card Meta Ads
- [ ] Token masking funcionando (last_4 no GET, nunca token completo)
- [ ] Teste de conexão funcional via `metaFetch()`
- [ ] `npm run type-check` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] @architect PASS
- [ ] @devops push realizado
