# Story 20.11: Cron automático de sync Sienge + propagação de distrato para leads

## Status
Ready for Review

## Dependencies
- **Story 20.10** (`docs/stories/active/20-10-distrato-ponte-leads-sienge-helper.md`) — PREREQUISITE: coluna `leads.distrato` (migration 129) e função `propagateDistratosToLeads(orgId)` em `is-contato-distratado.ts` devem existir.
- **BRANCH:** implementar a partir de um branch novo criado de `origin/main` atualizado — NÃO do branch `feat/epic-76`, que está desatualizado e não contém as migrations 116–128 (incluindo as dependências 116+118 da Story 20-10). Usar `feat/epic-76` reintroduziria o bug da 20-9.
- **Story 20.9** (`docs/stories/active/20-9-fix-distrato-contrato-cancelado-sienge.md`) — DONE: `reconcileDistratosForObra(obraId)` em `sync.ts` exportado; `clientes_obras_vinculos.distrato` populado via sync manual.
- **Nenhuma migration nova** — esta story é puramente TypeScript + config Vercel.

## Scope
**IN:**
- Nova rota cron `GET /api/cron/sienge-distrato-sync` — varrre TODAS as obras com `sienge_enterprise_id NOT NULL` em todas as orgs, chama `reconcileDistratosForObra(obraId)` para cada uma, depois chama `propagateDistratosToLeads(orgId)` para cada org afetada.
- Adicionar o cron no `packages/web/vercel.json` com schedule diário `0 3 * * *` (03:00 UTC = 00:00 SP, período de baixo tráfego).
- **Remediação imediata (one-shot):** endpoint também aceita `POST` para execução manual admin — útil para corrigir o estado atual dos 39 distratados e leads já existentes.
- Logging estruturado: resultado por obra (`{ obraId, reconciled, distratados, errors }`) + resultado consolidado por org (`{ orgId, leadsUpdated, leadsCleared }`).
- `maxDuration = 300` na rota (mesmo padrão do `reconcile-distratos/route.ts`).

**OUT:**
- Sincronizar dados de contratos Sienge além de `distrato` — esta story apenas propaga o estado de distrato, sem substituir o sync completo de obras (`syncObraClientes`).
- Modificar canais de comunicação — escopo da Story 20-12.
- Criar UI admin para acionar o cron manualmente — o endpoint POST é suficiente para remediação (pode ser acionado via curl/Postman por admin/devops).
- Resolução do finding DATA-001 da Story 20-9 (`users.sienge_customer_id` faltante): esta story propaga distrato via telefone/email (path da Story 20-10), não via `sienge_customer_id`. DATA-001 não bloqueia esta story.

## Complexity
**Estimativa:** M — 1 nova rota cron (~100-150 LOC), 1 mudança no `vercel.json`, reutiliza exports existentes (`reconcileDistratosForObra`, `propagateDistratosToLeads`). Risco principal: timeout em orgs com muitas obras (mitigado por `maxDuration = 300` + logging de progresso por obra).

## Risks
| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Timeout 300s em orgs com muitas obras (cada obra chama API Sienge com sleep entre páginas) | Médio | Médio | `reconcileDistratosForObra` já tem rate limit interno; logging por obra permite restart parcial; cron diário em 03h minimiza pressão |
| `propagateDistratosToLeads` lento em orgs com muitos leads | Baixo | Baixo | UPDATE em lote no PostgreSQL; índice `idx_leads_distrato` cobre o path; sem loop N+1 |
| Erro em uma obra não para o cron inteiro | Baixo | Médio | Try/catch por obra com logging de erros; o loop continua para as demais obras |
| Cron Vercel com `maxDuration = 300` cobra função de longa execução | Baixo | Info | Padrão já em uso em `reconcile-distratos/route.ts` (story 20-9); dentro do tier atual |

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["typecheck", "lint", "build", "manual-run"]
nota: "Remediação one-shot DEVE ser executada via POST pelo @devops imediatamente após deploy, antes da Story 20-12 ir ao ar"

---

## Story

**As a** sistema CRM Trifold,
**I want** um cron diário que percorre todas as obras Sienge, reconcilia o status de distrato em `clientes_obras_vinculos` e propaga a flag `leads.distrato` para os leads correspondentes,
**so that** os filtros de distrato da Story 20-12 operem sobre dados atualizados sem depender de sync manual, e o estado atual dos 39 distratados conhecidos seja remediado imediatamente no deploy.

---

## Acceptance Criteria

### Frente 1 — Rota cron GET

**AC 1 — Cron percorre todas as obras com `sienge_enterprise_id`**
Dado que existem N obras na base com `sienge_enterprise_id IS NOT NULL` (de uma ou mais orgs),
quando `GET /api/cron/sienge-distrato-sync` é chamado com o header `Authorization: Bearer {CRON_SECRET}`,
então a rota:
1. Busca todas as obras com `sienge_enterprise_id IS NOT NULL` (todas as orgs).
2. Para cada obra, chama `reconcileDistratosForObra(obraId)` (importado de `sync.ts`).
3. Após processar todas as obras de uma org, chama `propagateDistratosToLeads(orgId)` (importado de `is-contato-distratado.ts`) uma vez por org.
4. Retorna HTTP 200 com relatório consolidado `{ obras: N, reconciled: X, distratados: Y, errors: [...], leadsUpdated: Z, leadsCleared: W }`.

**AC 2 — Erro em uma obra não interrompe o loop**
Dado que uma obra gera erro em `reconcileDistratosForObra` (ex: `sienge_enterprise_id` configurado mas inválido na API Sienge),
quando o cron processa essa obra,
então:
- O erro é capturado e adicionado ao array `errors` da resposta.
- O cron continua para as próximas obras.
- O cron retorna HTTP 200 com `errors` populado (não HTTP 500).

**AC 3 — Autenticação via `CRON_SECRET`**
Dado que a rota recebe uma requisição GET sem o header `Authorization: Bearer {CRON_SECRET}` correto,
quando a rota é chamada,
então a rota retorna HTTP 401 sem processar nenhuma obra.

**AC 4 — `maxDuration = 300` configurado**
Dado que o arquivo da rota existe,
quando o código é inspecionado,
então `export const maxDuration = 300` está presente no nível do módulo (padrão Next.js para Edge/Node functions com timeout longo).

### Frente 2 — Cron Vercel

**AC 5 — Schedule diário às 03:00 UTC**
Dado que a story é deployada,
quando `packages/web/vercel.json` é inspecionado,
então existe uma entrada em `crons`:
```json
{ "path": "/api/cron/sienge-distrato-sync", "schedule": "0 3 * * *" }
```
O schedule é `0 3 * * *` (03:00 UTC = 00:00 SP).

### Frente 3 — Endpoint POST de remediação manual (one-shot)

**AC 6 — POST executa o mesmo fluxo do GET, com autenticação de admin**
Dado que um admin chama `POST /api/cron/sienge-distrato-sync` com um `appUser.role === 'admin'`,
quando a rota processa a requisição,
então executa o mesmo loop de `reconcileDistratosForObra` + `propagateDistratosToLeads` e retorna o mesmo relatório.
A rota POST usa `requireAuth()` + `requireRole(appUser, ['admin', 'supervisor'])` (padrão das rotas admin existentes).

**AC 7 — Remediação imediata: os 39 distratados conhecidos ficam com `leads.distrato = true`**
Dado que o endpoint POST é executado em prod após deploy (remediação one-shot),
quando `POST /api/cron/sienge-distrato-sync` retorna,
então `leads.distrato = true` para todos os leads cujos phones ou emails coincidem com `clientes` que têm `clientes_obras_vinculos.distrato = true`.
O resultado inclui `leadsUpdated >= 0` (pode ser 0 se nenhum lead estiver na tabela com phone do distratado, mas não deve ser erro).

### Frente 4 — Logging

**AC 8 — Log por obra e por org**
Dado que o cron é executado,
quando é inspecionado via Vercel Logs,
então há logs estruturados por obra:
- `[DISTRATO-SYNC] obra {obraId}: reconciled={N} distratados={M} errors={E}`
E por org ao final:
- `[DISTRATO-SYNC] org {orgId}: leadsUpdated={Z} leadsCleared={W}`

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Validação de qualidade via processo manual: typecheck + lint + build + manual run em dev.

**Story Type Analysis:**
- **Primary Type:** Integration (Sienge API + cron) + Architecture (orquestração de reconciliação)
- **Secondary Type(s):** Deployment (vercel.json)
- **Complexity:** M — nova rota, reutiliza funções existentes, 1 change de config

**Specialized Agent Assignment:**
- Primary Agents:
  - @dev (implementação da rota cron e orquestração)
- Supporting Agents:
  - @qa (smoke test da rota POST manualmente em dev)
  - @devops (verificar maxDuration/cron Vercel + executar remediação one-shot pós-deploy)

**Quality Gate Tasks:**
- [x] Pre-Commit (@dev): `npx tsc --noEmit` (0 erros nos arquivos da story; único erro remanescente é o pré-existente `react-email-editor` em `visual-editor.tsx`, fora de escopo) + `npx eslint` no arquivo novo (exit 0)
- [ ] Manual run (@qa/@devops): chamar `POST /api/cron/sienge-distrato-sync` em prod após deploy e verificar `leadsUpdated >= 0` sem erros críticos

---

## Tasks / Subtasks

### Task 1 — @dev: Criar rota `sienge-distrato-sync` (AC: 1-4, 6-8)
- [x] Criar `packages/web/src/app/api/cron/sienge-distrato-sync/route.ts`
- [x] Adicionar `export const maxDuration = 300`
- [x] Importar `reconcileDistratosForObra` de `@web/lib/integrations/sienge/sync` (já exportado)
- [x] Importar `propagateDistratosToLeads` de `@web/lib/distrato/is-contato-distratado` (exportado pela Story 20-10)
- [x] Importar `createAdminClient` de `@web/lib/supabase/admin`
- [x] Implementar handler `GET` (AC 1-4):
  - Verificar `CRON_SECRET` e header `Authorization` → 401 se inválido
  - Buscar obras: `SELECT id, org_id FROM obras WHERE sienge_enterprise_id IS NOT NULL`
  - Agrupar por `org_id` (Map<orgId, obraId[]>)
  - Loop por obra: try/catch `reconcileDistratosForObra(obraId)` → acumular resultado + erros
  - Por org: `propagateDistratosToLeads(orgId)` → acumular `leadsUpdated`/`leadsCleared`
  - Console.log estruturado por obra e por org (AC 8)
  - Retornar HTTP 200 com relatório consolidado
- [x] Implementar handler `POST` (AC 6):
  - Usar `requireAuth()` + `requireRole(appUser, ['admin', 'supervisor'])` (padrão das rotas admin)
  - Executar o mesmo loop que o GET (extrair para função interna `runSync()`)
  - Retornar HTTP 200 com relatório

### Task 2 — @dev: Atualizar `vercel.json` (AC: 5)
- [x] Abrir `packages/web/vercel.json`
- [x] Adicionar entry no array `crons`:
  ```json
  {
    "path": "/api/cron/sienge-distrato-sync",
    "schedule": "0 3 * * *"
  }
  ```
- [x] Manter todas as entradas existentes inalteradas (preservar a ordem; não remover nenhum cron existente)

### Task 3 — @devops: Remediação one-shot pós-deploy (AC: 7)
- [ ] Após deploy em prod: `POST /api/cron/sienge-distrato-sync` com auth admin
- [ ] Verificar retorno: `leadsUpdated >= 0`, `errors: []` ou erros apenas em obras sem enterprise configurado corretamente
- [ ] Confirmar `leads.distrato = true` para os leads distratados conhecidos (smoke cross-check com a lista de 39 contratos da Story 20-9)

---

## Dev Notes

### Arquivos-chave (não reinvestigar)

| Arquivo | Responsabilidade | Como usar |
|---------|-----------------|-----------|
| `packages/web/src/lib/integrations/sienge/sync.ts` | `reconcileDistratosForObra(obraId)` exportado em L628 | Importar diretamente; função já tem rate limit interno |
| `packages/web/src/lib/distrato/is-contato-distratado.ts` | `propagateDistratosToLeads(orgId)` | Criado pela Story 20-10 |
| `packages/web/src/app/api/admin/obras/[obra_id]/sienge/reconcile-distratos/route.ts` | Referência de pattern para `maxDuration`, `requireRole`, obra lookup | Ver padrão: fetch obra, check `sienge_enterprise_id`, chamar `reconcileDistratosForObra` |
| `packages/web/vercel.json` | Config de crons Vercel | Adicionar entry em `crons[]` |

### Pattern da rota de remediação existente (referência para GET handler)

```typescript
// packages/web/src/app/api/admin/obras/[obra_id]/sienge/reconcile-distratos/route.ts
// (criado pela Story 20-9)
export const maxDuration = 300

export async function POST(request, { params }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth
  const forbidden = requireRole(appUser, ['admin', 'supervisor'])
  if (forbidden) return forbidden
  // ...
  const result = await reconcileDistratosForObra(obraId)
  return NextResponse.json(result)
}
```

A nova rota `sienge-distrato-sync` é a versão "all obras" desse handler.

### Como buscar todas as obras com Sienge configurado

```typescript
const admin = createAdminClient()

// Buscar todas as obras com sienge_enterprise_id configurado
const { data: obras, error } = await admin
  .from('obras')
  .select('id, org_id, sienge_enterprise_id')
  .not('sienge_enterprise_id', 'is', null)

// Agrupar por org para chamar propagateDistratosToLeads uma vez por org
const obrasByOrg = new Map<string, string[]>()
for (const obra of obras ?? []) {
  const list = obrasByOrg.get(obra.org_id) ?? []
  list.push(obra.id)
  obrasByOrg.set(obra.org_id, list)
}
```

### CRON_SECRET — padrão de verificação

```typescript
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ...
}
```

Padrão replicado de `packages/web/src/app/api/cron/followup/route.ts` L1-L15 e todos os outros crons.

### vercel.json — instrução para @dev

**IMPORTANTE:** A lista de crons abaixo pode estar desatualizada. O @dev DEVE ler o `packages/web/vercel.json` real do branch (`origin/main` ou do branch de implementação) antes de editar, e adicionar o novo cron SEM remover nenhuma entrada existente.

Lista atual verificada em `origin/main` em 2026-06-30 (referência, não substituir cegamente):
- `/api/cron/enrich-leads` (`*/30 * * * *`)
- `/api/cron/followup` (`0 */2 * * *`)
- `/api/cron/campaign-poll` (`*/3 * * * *`)
- `/api/cron/keep-alive` (`0 8 * * *`)
- `/api/cron/meta-sync-entities` (`0 */4 * * *`)
- `/api/cron/meta-sync-insights` (`0 9 * * *`)
- `/api/cron/webhook-health` (`*/30 * * * *`)
- `/api/cron/meta-sync-health` (`0 */4 * * *`)
- `/api/cron/email-automations` (`0 11 * * *`)
- `/api/cron/email-queue` (`0 * * * *`)
- `/api/cron/meta-ads-intelligence` (`0 11 * * *`)
- `/api/cron/calendly-sync` (`*/30 * * * *`)
- `/api/cron/appointment-email-reminders` (`0 12 * * *`)
- `/api/cron/appointment-whatsapp-reminders` (`*/30 * * * *`)
- `/api/cron/analytics-report` (`0 2 * * 1`)
- `/api/cron/meta-sync-placement` (`0 6 * * 1`)
- `/api/cron/roleta-retry` (`*/3 * * * *`)
- `/api/cron/obras-approval-reminder` (`0 */6 * * *`)
- `/api/cron/purge-rejected-uploads` (`0 4 * * *`)
- `/api/cron/daily-report` (`59 10 * * *`)
- `/api/cron/sla-alerts` (`*/10 * * * *`)
- `/api/cron/bolsao-rebalance` (`*/5 * * * *`)

Adicionar `sienge-distrato-sync` com `0 3 * * *` preservando TODAS as entradas existentes do arquivo real.

### Estratégia de erro por obra

```typescript
const errors: string[] = []
let reconciled = 0
let distratados = 0

for (const obra of obras ?? []) {
  try {
    const result = await reconcileDistratosForObra(obra.id)
    reconciled += result.reconciled
    distratados += result.distratados
    if (result.errors.length > 0) {
      errors.push(...result.errors.map(e => `obra:${obra.id}: ${e}`))
    }
    console.log(`[DISTRATO-SYNC] obra ${obra.id}: reconciled=${result.reconciled} distratados=${result.distratados}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro'
    console.error(`[DISTRATO-SYNC] obra ${obra.id} FALHOU:`, msg)
    errors.push(`obra:${obra.id}: ${msg}`)
    // continua para próxima obra
  }
}
```

### Testing

**Abordagem:** typecheck + build + manual run via POST com autenticação admin.

Sem testes unitários (integração com API Sienge externa e Supabase admin).

**Checklist de smoke pós-deploy:**
1. Chamar `POST /api/cron/sienge-distrato-sync` via curl/Postman com token admin.
2. Verificar resposta `{ obras: N, distratados: M, leadsUpdated: Z }` sem erros críticos.
3. Verificar no Supabase que `leads.distrato = true` para pelo menos 1 lead cujo phone seja de distratado.
4. Verificar que o cron aparece no dashboard Vercel como agendado.

---

## PO Validation (Pax) — 2026-06-30

**Veredito: GO** (gated por dependência) · **Readiness Score: 8/10** · **Confiança: Alta**

Story sólida e implementável. ACs testáveis, reuso correto de funções existentes, riscos de timeout bem mitigados.

### Verificações de Anti-Hallucination (todas OK)
- `reconcileDistratosForObra(obraId)` existe em `sync.ts` origin/main (export em L628) e retorna **exatamente** `{ reconciled, distratados, errors }` — bate com o uso em AC 1 (`result.reconciled`/`result.distratados`/`result.errors`). ✓
- Rota de referência `reconcile-distratos/route.ts` existe em origin/main (padrão `maxDuration = 300` + `requireAuth`/`requireRole`). ✓
- Padrão `CRON_SECRET` válido (replicado dos crons existentes). ✓
- Slot de cron `0 3 * * *` (03:00 UTC = 00:00 SP) livre em `vercel.json` de main. ✓

### Should-Fix Issues (Important)
1. **Lista de crons no Dev Notes está desatualizada vs `origin/main`.** A tabela "crons existentes" lista 15 entradas (inclui `sla-alerts`) que NÃO correspondem ao `vercel.json` real de main (que tem `webhook-health`, `meta-sync-health`, `email-queue`, `meta-ads-intelligence`, `calendly-sync`, etc.). A instrução acionável ("adicionar sem remover nenhum existente") permanece **correta e segura**, então não bloqueia — mas o @dev deve **ler o `vercel.json` real** em vez de confiar na lista. Impacto baixo.

### Dependency Gate (Sequência)
- **BLOQUEADA POR Story 20-10:** depende de `leads.distrato` (migration) + `propagateDistratosToLeads`. Como 20-10 está **NO-GO** (colisão de migration), esta story **não pode iniciar** até 20-10 ser corrigida e atingir `Ready`. A sequência 20-10 → 20-11 → 20-12 é executável uma vez destravada.

**Verificações OK:** CodeRabbit Disabled correto · Executor `@dev` ≠ quality_gate `@qa` · sem migration nova (correto) · DATA-001 corretamente declarado fora de escopo.

**Transição de status:** mantida em `Draft`. GO confirmado nos méritos próprios; flip para `Ready` liberado assim que 20-10 atingir `Ready` (sequência respeitada).

---

## PO Re-Validation (Pax) — 2026-06-30 (pós required-fixes)

**Veredito: GO** · **Readiness Score: 9/10** · **Confiança: Alta** · **Status: Draft → Ready**

### FIX 4 — Lista de crons alinhada ao `vercel.json` real (RESOLVIDO ✓)
Verificado via `git show origin/main:packages/web/vercel.json`: a lista no Dev Notes agora reflete **exatamente** as 22 entradas de crons reais de `origin/main` (enrich-leads, followup, campaign-poll, keep-alive, meta-sync-entities, meta-sync-insights, webhook-health, meta-sync-health, email-automations, email-queue, meta-ads-intelligence, calendly-sync, appointment-email-reminders, appointment-whatsapp-reminders, analytics-report, meta-sync-placement, roleta-retry, obras-approval-reminder, purge-rejected-uploads, daily-report, sla-alerts, bolsao-rebalance). O slot `0 3 * * *` (03:00 UTC) está **livre** — sem colisão. A instrução para o @dev ler o arquivo real antes de editar (preservando todas as entradas) permanece. ✓

### Dependency Gate (DESTRAVADO ✓)
A Story **20-10 atingiu `Ready`** nesta mesma rodada de re-validação. A sequência 20-10 → 20-11 está destravada. `reconcileDistratosForObra(obraId)` confirmado em `sync.ts` origin/main (export L628) retornando `{ reconciled, distratados, errors }` — bate com o uso em AC 1. `propagateDistratosToLeads(orgId)` será entregue pela 20-10 (pré-requisito de implementação).

**Branch note (FIX 2 ✓):** nota CRÍTICA de branch origin/main presente em Dependencies.

**Verificações OK:** CodeRabbit Disabled correto · Executor `@dev` ≠ quality_gate `@qa` · sem migration nova · padrão `CRON_SECRET`/`maxDuration=300` válido · DATA-001 corretamente fora de escopo.

**Transição:** `Draft → Ready`. Implementação deve seguir **após** a 20-10 estar implementada (depende de `leads.distrato` + `propagateDistratosToLeads`).

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-30 | 1.0 | Story criada — cron automático de sync + propagação de distrato para leads | River (@sm) |
| 2026-06-30 | 1.1 | Validação PO: GO (8/10) — referências verificadas em origin/main; status retido em Draft, gated por 20-10 | Pax (@po) |
| 2026-06-30 | 1.2 | @sm required-fixes: nota CRITICO branch origin/main em Dependencies (FIX 2); lista crons vercel.json atualizada para estado real de origin/main (22 entradas vs 15 listadas) + instrução para @dev ler o arquivo real (FIX 4); migration 121→129 na referência de dependency | River (@sm) |
| 2026-06-30 | 1.3 | Re-validação PO pós-fixes: **GO (9/10)** — FIX 4 (lista de 22 crons confere com vercel.json de origin/main; slot 0 3 * * * livre) verificado; dependency gate destravado (20-10 → Ready). **Status Draft → Ready** | Pax (@po) |
| 2026-07-01 | 1.4 | Implementação @dev: rota `sienge-distrato-sync` (GET cron + POST admin, `runSync()` compartilhado, `maxDuration=300`, isolamento de erro por obra/org, logging AC 8) reusando `reconcileDistratosForObra`/`propagateDistratosToLeads` sem duplicar semântica; +1 cron em `vercel.json` (`0 3 * * *`, 22 existentes preservados). Typecheck limpo (só erro pré-existente `react-email-editor` fora de escopo) + eslint exit 0. **Status Ready → Ready for Review** | Dex (@dev) |

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (1M context) — @dev (Dex)

### Debug Log References
- `npx tsc --noEmit`: sem erros nos arquivos da story. Único erro remanescente é o pré-existente em `src/app/dashboard/sistema/email-templates/_components/visual-editor.tsx` (módulo `react-email-editor` sem tipos), fora de escopo.
- `npx eslint src/app/api/cron/sienge-distrato-sync/route.ts`: exit 0.
- `node -e` validação do `vercel.json`: 23 crons (22 preservados + `sienge-distrato-sync` `0 3 * * *`), JSON válido.

### Completion Notes
- **Reuso estrito (IDS):** a rota NÃO reimplementa lógica de distrato. Importa `reconcileDistratosForObra(obraId)` (Story 20-9, `sync.ts` L628) e `propagateDistratosToLeads(orgId)` (Story 20-10, `is-contato-distratado.ts` L173). A semântica "todos-os-vínculos" (active-contract-wins) permanece encapsulada em `propagateDistratosToLeads`; não foi duplicada.
- **Núcleo compartilhado `runSync()`:** GET e POST chamam a mesma função interna. GET autentica via `CRON_SECRET` (fail-closed, padrão de `followup/route.ts`); POST via `requireAuth()` + `requireRole(appUser, ['admin','supervisor'])` (padrão de `reconcile-distratos/route.ts`).
- **Isolamento de erro por obra (AC 2):** cada `reconcileDistratosForObra` roda em try/catch; falha de uma obra é anexada a `errors[]` (`obra:{id}: {msg}`) e o loop continua. A propagação por org também é isolada em try/catch (`org:{id}: propagate: {msg}`). A rota retorna HTTP 200 com `errors` populado — nunca 500 por causa de uma obra.
- **Agrupamento por org:** obras são agrupadas em `Map<orgId, obraId[]>`; `propagateDistratosToLeads(orgId)` roda 1x por org, após todas as obras da org serem reconciliadas.
- **Relatório consolidado (AC 1.4):** `{ obras, reconciled, distratados, leadsUpdated, leadsCleared, errors[] }`.
- **Logging estruturado (AC 8):** `[DISTRATO-SYNC] obra {id}: reconciled=.. distratados=.. errors=..` por obra e `[DISTRATO-SYNC] org {id}: leadsUpdated=.. leadsCleared=..` por org, + linha final consolidada.
- **Next 16.2.2:** assinatura de route handler (`GET(request: NextRequest)`, `POST()`) e `export const maxDuration = 300` no nível do módulo confirmadas contra os crons/rotas existentes do próprio projeto.
- **Nota de escopo (`users.sienge_customer_id`):** o Scope OUT #4 da story declara explicitamente que popular `users.sienge_customer_id` faltante (finding DATA-001) está FORA de escopo — a propagação usa telefone/email (path da 20-10), não `sienge_customer_id`. Segui a AC validada da story; a rota NÃO popula `users.sienge_customer_id`. Concern registrado para o @devops/@po caso a remediação one-shot precise desse passo (seria uma story separada).

### File List
- `packages/web/src/app/api/cron/sienge-distrato-sync/route.ts` (criado — @dev, Task 1: rota cron GET + POST admin, `maxDuration=300`, `runSync()` compartilhado)
- `packages/web/vercel.json` (modificado — @dev, Task 2: +1 entrada cron `sienge-distrato-sync` `0 3 * * *`; 22 entradas existentes preservadas)

---

## QA Results

_A preencher pelo @qa após implementação_
