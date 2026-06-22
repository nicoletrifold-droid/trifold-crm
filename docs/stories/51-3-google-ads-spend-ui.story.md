# Story 51-3 — Google Ads: UI de Spend + Substituição do Placeholder

## Metadata
- **Epic:** 51 — Google Ads Marketing API Integration
- **Story:** 51-3
- **Status:** Ready
- **Priority:** P2 — depende de 51-2
- **Complexity:** M (~5h)
- **Created:** 2026-06-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[ui_accessibility, data_rendering, filter_functionality, api_correctness]`

---

## User Story

**Como** administrador do Trifold CRM,
**Quero** ver o status da integração Google Ads na página de configurações e visualizar o spend diário de campanhas,
**Para que** eu possa acompanhar quanto está sendo gasto no Google Ads diretamente no CRM — sem precisar abrir o painel do Google Ads.

---

## Context

Esta story fecha o MVP do Epic 51 com duas entregas:

1. **Substituição do placeholder** "Em breve" na página de integrações por um card funcional de status da conta Google Ads
2. **API de leitura** de insights + **página de spend** `/dashboard/campaigns/google`

**Pré-requisito obrigatório:** Story 51-2 completa (dados em `google_ads_insights_daily`).

### Placeholder atual a substituir

Arquivo: `packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx`, linhas 200-216:

```tsx
{/* Google Ads */}
<div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
  <div className="mb-4 flex items-center justify-between">
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Google Ads</h2>
      <p className="text-sm text-gray-500 dark:text-stone-400">
        Receba leads de campanhas do Google Ads
      </p>
    </div>
    <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
      Em breve
    </span>
  </div>
  <p className="text-sm text-gray-400 dark:text-stone-500">
    A integração com Google Ads estará disponível em breve.
  </p>
</div>
```

### Referência de padrão (Meta Ads)

Para o card de status e a página de spend, espelhar:
- Card de configuração Meta: `packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx` — ver componentes Meta existentes na mesma página
- API de leitura Meta: `packages/web/src/app/api/meta-ads/campaigns/route.ts`
- Estrutura de query Meta: `SUM(spend)`, `SUM(impressions)` etc. agrupado por campanha no período

---

## Acceptance Criteria

- [ ] **AC1:** O bloco "Em breve" (linhas 200-216 de `integracoes/page.tsx`) é **substituído** por um componente `GoogleAdsConnectionCard` que exibe:
  - Status da conta: `Conectado` (verde) / `Não configurado` (cinza) / `Erro` (vermelho)
  - Customer ID mascarado (últimos 4 dígitos visíveis) se conectado
  - Link "Ver campanhas" que navega para `/dashboard/campaigns/google` se conectado
  - No estado "Não configurado": texto explicativo + **botão "Conectar conta Google Ads"** que navega para `/dashboard/configuracoes/integracoes/google-ads` (página criada em Story 51-4)
- [ ] **AC2:** Status é determinado pela fonte canônica `organizations.google_ads_config->>'status' = 'connected'` — lido via `GET /api/google-ads/status`; a tabela `google_ads_accounts` é um espelho e NÃO é a fonte de verdade para este status (alinhar com critério do cron em Story 51-2 AC3)
- [ ] **AC3:** Endpoint `GET /api/google-ads/campaigns` criado em `packages/web/src/app/api/google-ads/campaigns/route.ts` com:
  - Parâmetro `period=7d|30d|90d` (default `30d`)
  - Retorna array de campanhas com métricas agregadas do período: `{ id, name, status, spend, impressions, clicks, ctr, cpc, conversions }`
  - Query em `google_ads_insights_daily` com SUM/AVG por `entity_id` no período
  - Join com `google_ads_campaigns` para obter `name` e `status`
- [ ] **AC4:** Página `/dashboard/campaigns/google` criada em `packages/web/src/app/dashboard/campaigns/google/page.tsx` exibindo:
  - Tabela de campanhas com colunas: Nome, Status, Spend (R$), Impressões, Cliques, CTR, CPC, Conversões
  - Filtro de período: 7d / 30d / 90d (tabs ou select)
  - Estado de loading (skeleton) enquanto dados carregam
  - Estado vazio com mensagem "Nenhuma campanha com dados no período selecionado." se sem dados
- [ ] **AC5:** O endpoint `GET /api/google-ads/campaigns` requer autenticação via `requireAuth()` (padrão do projeto) — retorna 401 se não autenticado
- [ ] **AC6:** Na tabela de campanhas, `spend` é formatado como moeda BRL (`R$ 1.234,56`)
- [ ] **AC7:** TypeScript compila sem erros; ESLint passa
- [ ] **AC8:** A página `/dashboard/campaigns/google` é acessível via **link no menu lateral**, na seção "Campanhas" (espelhando o padrão de `/dashboard/campaigns/meta`) — link adicionado ao sidebar component; a página não fica órfã

---

## Tasks / Subtasks

- [ ] **T1** — Criar endpoint de status da conta (AC2)
  - [ ] T1.1 — Criar `packages/web/src/app/api/google-ads/status/route.ts`
  - [ ] T1.2 — `GET`: lê `organizations.google_ads_config` via `requireAuth()` — retorna `{ connected: bool, customer_id?: string, last_synced_at?: string }`. `connected = true` quando `google_ads_config->>'status' = 'connected'` (fonte canônica, alinhado com AC2 e cron de 51-2)

- [ ] **T2** — Criar componente `GoogleAdsConnectionCard` (AC1)
  - [ ] T2.1 — Criar `packages/web/src/app/dashboard/configuracoes/integracoes/_components/google-ads-connection-card.tsx`
  - [ ] T2.2 — Server Component: faz fetch de `/api/google-ads/status` internamente (ou recebe `connected` como prop)
  - [ ] T2.3 — Exibir badge de status (verde/cinza/vermelho) — espelhar padrão dos outros cards na página
  - [ ] T2.4 — Substituir bloco "Em breve" (linhas 200-216) pelo `<GoogleAdsConnectionCard />`

- [ ] **T3** — Criar endpoint de campanhas com métricas (AC3, AC5)
  - [ ] T3.1 — Criar `packages/web/src/app/api/google-ads/campaigns/route.ts`
  - [ ] T3.2 — `GET`: parâmetro `period` → calcular `from` e `to` datas (espelhar lógica de `meta-ads/campaigns/route.ts`)
  - [ ] T3.3 — Query: `SELECT entity_id, SUM(spend), SUM(impressions), SUM(clicks), AVG(ctr), AVG(cpc), SUM(conversions) FROM google_ads_insights_daily WHERE org_id = ? AND level = 'campaign' AND date BETWEEN from AND to GROUP BY entity_id`
  - [ ] T3.4 — Join com `google_ads_campaigns` para obter `name` e `status` por `google_campaign_id = entity_id`
  - [ ] T3.5 — Retornar response tipada (interface `GoogleAdsCampaignWithMetrics`)

- [ ] **T4** — Criar página de spend `/dashboard/campaigns/google` (AC4, AC6, AC8)
  - [ ] T4.1 — Criar `packages/web/src/app/dashboard/campaigns/google/page.tsx`
  - [ ] T4.2 — Client Component com state de `period` (7d/30d/90d)
  - [ ] T4.3 — Tabela com colunas: Nome, Status badge, Spend (R$), Impressões, Cliques, CTR (%), CPC (R$), Conversões
  - [ ] T4.4 — Formatação de moeda BRL: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
  - [ ] T4.5 — Estado vazio e loading skeleton
  - [ ] T4.6 — Adicionar link para `/dashboard/campaigns/google` em algum ponto de acesso (menu lateral ou card de integrações)

- [ ] **T5** — QA pre-commit (AC7)
  - [ ] T5.1 — `pnpm type-check` em `packages/web`
  - [ ] T5.2 — `pnpm lint src/app/api/google-ads/ src/app/dashboard/campaigns/google/ src/app/dashboard/configuracoes/integracoes/`

---

## Dev Notes

### Arquivos a criar
```
packages/web/src/app/api/google-ads/status/route.ts
packages/web/src/app/api/google-ads/campaigns/route.ts
packages/web/src/app/dashboard/configuracoes/integracoes/_components/google-ads-connection-card.tsx
packages/web/src/app/dashboard/campaigns/google/page.tsx
```

### Arquivo a modificar
```
packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx   ← substituir linhas 200-216
```

### Arquivos de referência obrigatórios
```
packages/web/src/app/api/meta-ads/campaigns/route.ts   ← padrão da query de insights + period dates
packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx (linhas 1-199)   ← padrão dos outros cards
```

### Padrão de autenticação
Todos os endpoints usam `requireAuth()`:
```typescript
import { requireAuth } from "@web/lib/api-auth"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth
  // ...
}
```

### Query de aggregação de insights (espelhar Meta)
```typescript
// Espelhar lógica de meta-ads/campaigns/route.ts
function getPeriodDates(period: string): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split("T")[0]!,
    to: to.toISOString().split("T")[0]!,
  }
}
```

### Formatação de moeda BRL
```typescript
// Usar Intl.NumberFormat nativo — sem dependência externa
const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
// Ex: formatBRL(1234.56) → "R$ 1.234,56"
```

### Badge de status das campanhas Google
Mapeamento Google → cor:
- `ENABLED` → verde (como `ACTIVE` do Meta)
- `PAUSED` → amarelo
- `REMOVED` → cinza

### Padrão de componentes da página de integrações
A página `configuracoes/integracoes/page.tsx` usa `<GoogleIntegrationCard>` como componente separado — seguir o mesmo padrão para `<GoogleAdsConnectionCard>`.

### Acesso à página `/dashboard/campaigns/google`
Verificar se existe `_components/sidebar.tsx` ou similar com lista de rotas do dashboard para adicionar o link. Se não for viável no escopo desta story, o acesso pode ser via card de integrações apenas (link "Ver campanhas").

---

## Testing

### Abordagem
- Testes manuais de UI (sem dados reais até cron rodar em produção)
- Pode testar com dados seed inseridos manualmente em `google_ads_insights_daily`

### Cenários de teste
1. **Sem conta conectada:** `GoogleAdsConnectionCard` exibe "Não configurado" (cinza)
2. **Com conta conectada:** badge "Conectado" (verde) + link "Ver campanhas" visível
3. **Tabela de campanhas:** com dados seed — exibir corretamente com formatação BRL
4. **Período 7d:** exibir apenas dados dos últimos 7 dias
5. **Sem dados no período:** mensagem de estado vazio
6. **401 no endpoint:** sem autenticação → retorna 401

### Seed SQL para testar UI sem cron
```sql
-- Inserir dados de teste (usar org_id e entity_id reais do banco)
INSERT INTO google_ads_insights_daily (org_id, level, entity_id, date, spend, impressions, clicks, ctr, cpc, conversions)
VALUES ('{org_id}', 'campaign', 'fake-campaign-001', CURRENT_DATE - 1, 150.00, 5000, 75, 0.015, 2.00, 3);
```

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Sem dados reais para testar se Developer Token ainda não aprovado | Usar dados seed (SQL acima) para testar UI |
| R2 | Menu lateral com rota hardcoded pode exigir modificação em múltiplos arquivos | Verificar estrutura do menu lateral antes de iniciar — pode simplificar para link apenas no card |
| R3 | `google_ads_campaigns` vazia (join falha) | Query deve funcionar mesmo sem rows em `google_ads_campaigns` — LEFT JOIN e usar `entity_id` como fallback para `name` |

---

## Dependencies

- **Depende de:** Story 51-2 (dados em `google_ads_insights_daily`) e Story 51-1 (schema); Story 51-4 (página de OAuth linkada em AC1) — para desenvolvimento da UI é suficiente que 51-4 exista como rota; para teste end-to-end precisa de 51-4 completa
- **Bloqueia:** nada (última story do Epic 51 MVP)

---

## Definition of Done

- [ ] Todos os ACs marcados como completos
- [ ] Placeholder "Em breve" substituído por `GoogleAdsConnectionCard`
- [ ] Página `/dashboard/campaigns/google` acessível e exibindo dados (reais ou seed)
- [ ] `pnpm type-check` e `pnpm lint` passando
- [ ] @qa executou quality gate com verdict >= PASS ou CONCERNS documentados
- [ ] @devops fez push do commit final

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-08 | 0.1 | Story drafted a partir do Epic 51 | @sm (River) |
| 2026-06-08 | 0.2 | PM review (AI-6/AI-7): AC1 adicionado botão "Conectar conta Google Ads" no estado não-configurado; AC2 padronizado para google_ads_config.status='connected' (fonte canônica); AC8 cravado como "link no menu lateral seção Campanhas"; T1.2 alinhado; dependência de 51-4 adicionada | @sm (River) |
| 2026-06-08 | 0.3 | Validated (10-point checklist, score 9/10), Draft → Ready (AI-14 non-blocking gap noted: AC4 não inclui estado "conectado mas sem sync ainda" — pode ser ajustado em implementação ou follow-up) | @po (Pax) |

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
- `packages/web/src/app/api/google-ads/status/route.ts`
- `packages/web/src/app/api/google-ads/campaigns/route.ts`
- `packages/web/src/app/dashboard/configuracoes/integracoes/_components/google-ads-connection-card.tsx`
- `packages/web/src/app/dashboard/campaigns/google/page.tsx`

#### Modified
- `packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx` — substituição do bloco "Em breve"

---

## QA Results
_(a ser preenchido pelo @qa)_
