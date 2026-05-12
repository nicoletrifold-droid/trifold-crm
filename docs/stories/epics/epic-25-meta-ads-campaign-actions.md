---
epic: 25
title: Meta Ads Campaign Actions — Pausar, Retomar e Ajustar Budget pelo CRM
status: Draft
created_at: 2026-05-11
updated_at: 2026-05-11
created_by: Morgan (@pm)
priority: High
depends_on:
  - Epic 16 (Meta Ads Marketing API) — completo
  - Epic 19 (Meta Ads Intelligence) — completo
stories_planned: [25.1, 25.2]
---

# Epic 25 — Meta Ads Campaign Actions: Pausar, Retomar e Ajustar Budget pelo CRM

## Objetivo do Epic

Evoluir o painel Meta Ads de **"apenas leitura"** para **"ação direta"**: permitir que o gestor de tráfego pause, retome e ajuste o budget de campanhas diretamente pelo CRM — sem precisar abrir o Business Manager da Meta — com histórico auditável de todas as ações tomadas.

## Contexto do Sistema Existente

- **Stack:** Next.js 14 (App Router), Supabase, TypeScript, Vercel
- **Cliente Meta API:** `packages/shared/src/meta/client.ts` — já suporta `metaFetch` com `method: 'POST'`. Ações de escrita usam `POST /{campaign_id}` com `{ status: 'PAUSED' }` ou `{ daily_budget: X }` na Meta Graph API v21.0
- **Token:** `META_SYSTEM_USER_TOKEN` — já configurado no Vercel (System User Token tem permissão `ads_management` para escrita)
- **Endpoint existente:** `GET /api/meta-ads/campaigns/[campaign_id]/route.ts` — detalhes da campanha
- **UI existente:** `/dashboard/campaigns/meta/[campaign_id]` — página de detalhe da campanha
- **Log existente:** tabela `meta_sync_log` — usada para registrar execuções de crons. Será reusada com `type = 'campaign_action'` para auditoria de ações manuais
- **Alertas Telegram:** `sendTelegramAdminAlert` — padrão já em uso, será acionado ao executar ações críticas

## Enhancement Details

### O que está sendo adicionado
1. **Endpoint de ações** — `POST /api/meta-ads/campaigns/[campaign_id]/action` com body `{ action: 'pause' | 'resume' | 'set_budget', value?: number }`
2. **UI de ações** — dropdown de ações na página de detalhe da campanha + modal de confirmação para `set_budget`
3. **Auditoria** — cada ação registrada em `meta_sync_log` com `type = 'campaign_action'`, `details` (JSONB) contendo `action`, `old_value`, `new_value`, `executed_by`

### Como integra com o sistema existente
- `metaFetch(campaignId, token, { method: 'POST', body: { status: 'PAUSED' } })` — cliente existente, zero alteração
- `meta_sync_log` — nova coluna `executed_by UUID REFERENCES auth.users` (nullable, null = sistema/cron)
- Após ação bem-sucedida: trigger `revalidatePath('/dashboard/campaigns/meta')` para atualizar lista
- Alerta Telegram opcional: ação de pause/resume notifica admin (configurable)

### Pré-requisitos verificáveis
```sql
-- System User Token tem permissão ads_management?
-- Verificar: POST /act_{id}/campaigns com fields=id deve retornar 200
-- Também: o token salvo em meta_ad_accounts.system_user_token deve ser válido
SELECT COUNT(*) FROM meta_ad_accounts WHERE system_user_token IS NOT NULL;
```

### Sucesso mensurável
- Pausar uma campanha pelo CRM e verificar no Business Manager que está PAUSED
- Ajustar budget e confirmar novo valor na API (`GET /{id}?fields=daily_budget`)
- Ação registrada em `meta_sync_log` com todos os campos corretos
- UI atualiza status da campanha após ação sem necessidade de refresh manual

---

## Stories

### Story 25.1 — Backend: Endpoint de Ações em Campanhas Meta

**Executor:** `@dev` | **Quality Gate:** `@architect`
**Quality Gate Tools:** `[api_security_review, write_operation_validation, audit_log_check]`
**Complexidade:** M (3–4h)
**Prioridade:** P0 — pré-requisito para 25.2

**Descrição:**

Criar `POST /api/meta-ads/campaigns/[campaign_id]/action` para executar ações de escrita na Meta API.

**Contrato da API:**

```typescript
// Request body
interface CampaignActionRequest {
  action: 'pause' | 'resume' | 'set_budget'
  value?: number // obrigatório apenas para set_budget (em centavos, ex: 5000 = R$50,00)
}

// Response (sucesso)
interface CampaignActionResponse {
  success: true
  action: string
  campaign_id: string
  new_status?: string
  new_budget?: number
  executed_at: string
}

// Response (erro)
interface CampaignActionError {
  success: false
  error: string
  code: 'PERMISSION_DENIED' | 'API_ERROR' | 'CAMPAIGN_NOT_FOUND' | 'INVALID_ACTION'
}
```

**Implementação:**

```typescript
// Mapeamento action → Meta API payload
const actionPayload = {
  pause:      { status: 'PAUSED' },
  resume:     { status: 'ACTIVE' },
  set_budget: { daily_budget: value }, // value em centavos (Meta exige em centavos da moeda)
}

// Chamada via cliente existente
await metaFetch(campaignId, token, {
  method: 'POST',
  body: actionPayload[action],
})

// Registrar em meta_sync_log
await supabase.from('meta_sync_log').insert({
  org_id,
  type: 'campaign_action',
  status: 'success',
  started_at: now,
  finished_at: now,
  records_synced: 1,
  details: {
    action,
    campaign_id,
    campaign_name,
    old_value: currentStatus,
    new_value: actionPayload[action],
    executed_by: userId,
  },
})
```

**Validações obrigatórias:**
- `set_budget`: `value` deve ser > 0 e > R$1,00 (100 centavos mínimo Meta)
- Campanha deve pertencer ao `org_id` do usuário autenticado (anti-IDOR)
- Apenas usuários com role `admin` podem executar ações de escrita

**Acceptance Criteria:**
- [ ] `POST /api/meta-ads/campaigns/[id]/action` com `{ action: 'pause' }` pausa campanha na Meta API
- [ ] `{ action: 'resume' }` retoma campanha pausada
- [ ] `{ action: 'set_budget', value: 5000 }` atualiza `daily_budget` para R$50,00
- [ ] Ação registrada em `meta_sync_log` com `type = 'campaign_action'` e `details` completo
- [ ] Retorna 403 se usuário não for `admin`
- [ ] Retorna erro tipado se Meta API retornar OAuthException ou PermissionError
- [ ] Sem modificação no cliente `metaFetch` existente (apenas uso)

**Risco:** BAIXO — POST isolado, não afeta leitura. Risco real: token sem permissão `ads_management` → testável antes de implementar

---

### Story 25.2 — UI: Controles de Ação no Painel de Campanhas

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Quality Gate Tools:** `[ui_accessibility, confirmation_flow, optimistic_update, role_guard]`
**Complexidade:** M (3–4h)
**Prioridade:** P1 — depende de 25.1

**Descrição:**

Adicionar controles de ação na página de detalhe da campanha (`/dashboard/campaigns/meta/[campaign_id]`) e na tabela da lista de campanhas.

**Componente `<CampaignActions />`:**

```tsx
// Props
interface CampaignActionsProps {
  campaignId: string
  currentStatus: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
  currentBudget: number | null // em centavos
  onActionComplete: () => void
}

// UI: DropdownMenu com as ações disponíveis
// - "Pausar campanha" (visível se status === 'ACTIVE')
// - "Retomar campanha" (visível se status === 'PAUSED')
// - "Ajustar budget..." (abre modal, visível se status !== 'ARCHIVED')
```

**Modal de ajuste de budget:**
- Input numérico em reais (converter para centavos na submissão)
- Exibe budget atual para referência
- Botão "Confirmar" desabilitado se valor inválido
- Estado de loading durante chamada API

**Feedback visual:**
- Toast de sucesso: "Campanha pausada com sucesso"
- Toast de erro: mensagem tipada da API
- Badge de status atualiza imediatamente (optimistic update)
- `revalidatePath` após resposta 200 para sincronizar dados

**Histórico de ações (seção opcional na página de detalhe):**
- Tabela simples mostrando últimas 5 ações da campanha: data, ação, executado por
- Query: `SELECT * FROM meta_sync_log WHERE type = 'campaign_action' AND details->>'campaign_id' = $1 ORDER BY started_at DESC LIMIT 5`

**Acceptance Criteria:**
- [ ] Dropdown de ações visível apenas para usuários `admin` (hidden para outros roles)
- [ ] "Pausar" só aparece se campanha ACTIVE; "Retomar" só se PAUSED
- [ ] Modal de budget exibe valor atual e valida input > R$1,00
- [ ] Badge de status atualiza após ação sem refresh de página
- [ ] Toast de erro mostra mensagem legível se Meta API rejeitar
- [ ] Seção de histórico exibe últimas 5 ações da campanha
- [ ] Sem regressão no restante da página de detalhe

**Risco:** BAIXO — nova seção isolada na UI existente

---

## Estimativa e Sequência

| Story | Complexidade | Estimativa | Bloqueada por |
|-------|-------------|------------|---------------|
| 25.1 — Endpoint de Ações | M | 3–4h | Nada (fundação) |
| 25.2 — UI de Ações | M | 3–4h | 25.1 |

**Total estimado: ~7–8h** (~1 dia dev)

**Sequência obrigatória:** 25.1 → 25.2

## Compatibilidade

- [x] Sem modificações no cliente `metaFetch` existente
- [x] `meta_sync_log` recebe nova coluna nullable `executed_by` — migration necessária (Story 25.1)
- [x] Endpoints GET existentes sem modificação
- [x] UI de lista e detalhe recebem apenas adição — sem remoção de conteúdo
- [x] Rollback: remover endpoint e componente `<CampaignActions />` sem efeito colateral

## Gestão de Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| System User Token sem permissão `ads_management` | Alta | Verificar via `GET /act_{id}` antes de iniciar 25.1 |
| Usuário pausar campanha errada (erro operacional) | Média | Modal de confirmação com nome da campanha + role guard `admin` |
| Meta API rejeitar budget abaixo do mínimo | Baixa | Validação no frontend + erro tipado do backend |
| `revalidatePath` não atualizar dados em produção | Baixa | Fallback: `router.refresh()` no client |

## Definition of Done

- [ ] Story 25.1: endpoint funcional, ação pause/resume/budget executada e logada
- [ ] Story 25.2: UI com dropdown, modal de budget e histórico de ações
- [ ] QA gate PASS em ambas as stories
- [ ] @devops push após cada QA gate aprovado
- [ ] Teste manual: pausar campanha pelo CRM e confirmar status PAUSED no Business Manager

## Handoff para @sm

> "Criar stories detalhadas para o **Epic 25 — Meta Ads Campaign Actions**.
>
> **Contexto:** Painel Meta Ads já existe em `/dashboard/campaigns/meta`.
> Cliente Meta API em `packages/shared/src/meta/client.ts` suporta POST.
> Token `META_SYSTEM_USER_TOKEN` configurado com permissão `ads_management`.
> Tabela `meta_sync_log` existente — Story 25.1 adiciona coluna `executed_by UUID REFERENCES auth.users` (nullable).
>
> **Sequência obrigatória:** 25.1 (backend) → 25.2 (UI)
>
> **Padrão de endpoint:** ver `/api/meta-ads/campaigns/[campaign_id]/route.ts`
> **Padrão de auth/role:** ver `requireAuth()` + verificação de `appUser.role`
> **Padrão de toast:** ver outros componentes do dashboard (Sonner/toast)
> **Stack:** Next.js 14 App Router, Supabase, TypeScript, Vercel"

— Morgan, planejando o futuro 📊
