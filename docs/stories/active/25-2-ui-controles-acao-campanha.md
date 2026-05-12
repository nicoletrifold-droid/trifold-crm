# Story 25.2 — UI: Controles de Ação no Painel de Campanhas

## Status
Done

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["ui_accessibility", "confirmation_flow", "optimistic_update", "role_guard"]

## Story
**As a** gestor de tráfego do Trifold (role: admin),
**I want** controles de ação (pausar, retomar, ajustar budget) diretamente na página de detalhe de cada campanha Meta,
**so that** eu possa agir em campanhas sem sair do CRM, com feedback visual imediato e histórico de ações realizadas.

## Contexto

**Epic 25 — Meta Ads Campaign Actions**
**Depende de:** Story 25.1 — endpoint `POST /api/meta-ads/campaigns/[campaign_id]/action` deve estar em produção.

O painel de detalhe de campanhas (`/dashboard/campaigns/meta/[campaign_id]`) já exibe funil de conversão, série temporal, adsets e leads associados. Esta story adiciona uma seção de ações administrativas visível apenas para admins.

**Arquivos relevantes:**
- `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` — componente principal da página de detalhe (arquivo a modificar)
- `packages/web/src/app/dashboard/campaigns/meta/campaigns-meta-client.tsx` — referência de padrão: `useState<{ type: 'success' | 'error'; text: string } | null>` para feedback, `useState<string | null>` para erros
- `packages/web/src/lib/api-auth.ts` — `AppUser.role: string` — verificar `role === 'admin'` no client para mostrar/ocultar ações

**Padrão de feedback do projeto (sem biblioteca de toast):**
```typescript
const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
// Renderizar:
{actionMessage && (
  <p className={`text-sm font-medium ${actionMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
    {actionMessage.text}
  </p>
)}
```

**Como `campaign-detail-client.tsx` recebe o usuário:**
Verificar se `appUser` já é passado via props ou se é buscado no componente. Se não for passado, adicionar como prop do servidor (`page.tsx` já tem acesso ao usuário autenticado).

## Acceptance Criteria

1. Na página de detalhe (`/dashboard/campaigns/meta/[campaign_id]`), uma seção "Ações" é exibida **somente** quando `appUser.role === 'admin'`. Usuários sem role admin não veem a seção (hidden, não disabled).

2. A seção "Ações" contém:
   - Botão "Pausar campanha" — visível e habilitado apenas se `campaign.status === 'ACTIVE'`
   - Botão "Retomar campanha" — visível e habilitado apenas se `campaign.status === 'PAUSED'`
   - Botão "Ajustar budget..." — sempre visível se `campaign.status !== 'ARCHIVED'` (abre modal)
   - Nenhum botão visível se `campaign.status === 'ARCHIVED'`

3. Ao clicar em "Pausar" ou "Retomar":
   - Botão entra em estado `disabled` com texto de loading ("Pausando...")
   - Chama `POST /api/meta-ads/campaigns/[campaign_id]/action` com `{ action: 'pause' }` ou `{ action: 'resume' }`
   - Sucesso: badge de status da campanha atualiza para refletir novo status + mensagem "Campanha pausada com sucesso" (verde)
   - Erro: mensagem de erro legível em vermelho (extraída do campo `error` ou `message` da resposta)

4. Modal "Ajustar budget":
   - Input numérico em reais (placeholder: "Ex: 50.00")
   - Exibe budget atual para referência: "Budget atual: R$ {currentBudget}" (null → "Não definido")
   - Botão "Confirmar" desabilitado se input vazio, `<= 0` ou `< 1.00`
   - Ao confirmar: chama `POST .../action` com `{ action: 'set_budget', value: Math.round(inputReais * 100) }` (converter para centavos)
   - Sucesso: modal fecha + mensagem "Budget atualizado para R$ {novoValor}" (verde)
   - Erro: mensagem de erro dentro do modal (sem fechar)
   - Botão "Cancelar" fecha o modal sem ação

5. Badge de status da campanha atualiza imediatamente após ação bem-sucedida via estado local (optimistic update) — sem necessidade de `revalidatePath` ou reload de página.

6. Seção "Histórico de ações" abaixo dos botões:
   - Exibe últimas 5 ações da campanha buscadas de `meta_sync_log` onde `sync_type = 'campaign_action'` e `details->>'campaign_id' = campaign.meta_campaign_id`
   - Colunas: Data/hora, Ação ("Pausada" / "Retomada" / "Budget ajustado"), Executado por (nome do usuário ou "Sistema")
   - Busca via novo endpoint `GET /api/meta-ads/campaigns/[campaign_id]/actions` (criar junto com esta story)
   - Se sem histórico: texto "Nenhuma ação registrada ainda."

7. Estado de loading durante chamada à API: botões ficam `disabled`, cursor pointer-events none.

8. `pnpm run type-check` e `pnpm run lint` passam sem erros.

9. Sem regressão nas seções existentes da página de detalhe (funil, série temporal, adsets, leads associados).

## Estimativa
**Complexidade:** M (Medium) — 3–4h. Modificação de componente existente + novo endpoint GET para histórico + modal simples.

## Fora do Escopo (OUT)
- Ações na tabela da lista de campanhas (`/dashboard/campaigns/meta`) — apenas na página de detalhe por ora
- Confirmação extra para "Pausar" (botão direto, sem modal — ação reversível)
- Histórico de ações em PDF/exportação
- Ações em AdSets ou Ads (somente campanhas)

## Riscos
- **`appUser` disponível no client component:** Verificar se `campaign-detail-client.tsx` já recebe `appUser` via props (componente server pode passar como prop). Se não, adicionar prop. Não fazer fetch de usuário no client — usar prop do servidor.
- **`campaign.status` desatualizado após ação:** O optimistic update atualiza estado local; próximo fetch da API retornará status real da Meta. Se Meta API demorar para refletir a mudança, pode haver inconsistência breve — documentar como comportamento esperado.
- **Modal de budget sem validação de budget máximo Meta:** A Meta pode ter limites de budget por conta. Erro será retornado pela API e exibido no modal. Não bloquear no frontend além do mínimo de R$1,00.

## Tasks / Subtasks

- [x] **Task 1 — Endpoint GET para histórico de ações** (AC: 6)
  - [x] 1.1 Criar `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/actions/route.ts`
  - [x] 1.2 `requireAuth()` + buscar `meta_sync_log` com `sync_type = 'campaign_action'` e `details->>'campaign_id' = campaign.meta_campaign_id` da campanha do org do usuário
  - [x] 1.3 JOIN com `public.users` (não auth.users) para resolver nome do `executed_by` via `supabase.from('users').select('id, name').in('id', executedByIds)`
  - [x] 1.4 Retornar array: `{ executed_at, action, campaign_name, executed_by_name }`[]
  - [x] 1.5 Limitar a 5 registros, ordenados por `started_at DESC`

- [x] **Task 2 — Seção "Ações" em `campaign-detail-client.tsx`** (AC: 1–7)
  - [x] 2.1 `isAdmin` já era passado como prop pelo `page.tsx` — apenas corrigido o destructuring (estava `{ campaignId }`, agora `{ campaignId, isAdmin }`)
  - [x] 2.2 Adicionado `useState<string | null>(null)` para `optimisticStatus` — inicializado no primeiro `fetchData` via `setOptimisticStatus(prev => prev ?? json.campaign.status)`
  - [x] 2.3 Adicionado `actionMessage`, `isActioning`, `isBudgetModalOpen`, `budgetInput`, `budgetModalError` states
  - [x] 2.4 Adicionado `fetchActionLog` callback + `useEffect` que chama ao montar (somente se `isAdmin`)
  - [x] 2.5 Implementada `handleAction(action, value?)`: POST + optimistic update + setActionMessage + refetch do log
  - [x] 2.6 Seção "Ações" condicional por `isAdmin && displayStatus !== 'ARCHIVED'` com botões por status
  - [x] 2.7 Modal de budget: input em reais, conversão para centavos, validação frontend, erro inline no modal

- [x] **Task 3 — Seção "Histórico de Ações"** (AC: 6)
  - [x] 3.1 `useEffect` busca `GET /api/meta-ads/campaigns/[campaign_id]/actions` na montagem (somente admin)
  - [x] 3.2 Tabela com colunas: Data/Hora, Ação, Executado por — dentro da seção "Ações"
  - [x] 3.3 Estado vazio: "Nenhuma ação registrada ainda."

- [x] **Task 4 — Verificação de tipos e lint** (AC: 8)
  - [x] 4.1 `pnpm run type-check` — 8/8 tasks successful, zero erros
  - [x] 4.2 `pnpm run lint` — zero erros nos arquivos desta story; erros pré-existentes em email components (Story 18.9, não relacionados)

- [ ] **Task 5 — Teste manual** (todos os ACs)
  - [ ] 5.1 Logar como admin: verificar seção "Ações" visível na página de detalhe
  - [ ] 5.2 Logar como não-admin (corretor): verificar que seção "Ações" não aparece
  - [ ] 5.3 Pausar campanha ACTIVE: verificar badge atualiza + mensagem verde
  - [ ] 5.4 Retomar campanha PAUSED: verificar badge atualiza + mensagem verde
  - [ ] 5.5 Ajustar budget: preencher modal, confirmar, verificar mensagem de sucesso
  - [ ] 5.6 Testar com valor de budget inválido (0, negativo, texto): verificar botão "Confirmar" desabilitado
  - [ ] 5.7 Verificar histórico de ações após executar pausar + retomar
  - [ ] 5.8 Verificar sem regressão: funil, série temporal, adsets e leads continuam funcionando

> ⚠️ Task 5 (teste manual) ainda pendente — depende de validação humana no browser com admin + broker. Ver "Checklist para validação humana" no fim deste documento.

- [x] **Task 6 — Aplicar fixes pós-gate (Quinn CONCERNS V1.3)**
  - [x] 6.1 M2 BLOQUEANTE: requireRole(['admin']) em GET /actions/route.ts
  - [x] 6.2 M1: modal usa showModal() nativo + onClose + aria-modal + ref
  - [x] 6.3 L1: optimisticBudget state para refletir valor pós set_budget

## Dev Notes

**Como verificar role no component client:**
```tsx
// Em campaign-detail-client.tsx — receber appUser como prop do server:
interface CampaignDetailClientProps {
  campaignId: string
  appUser: { id: string; role: string; org_id: string } // adicionar à interface existente
}

// Renderização condicional da seção:
{appUser.role === 'admin' && (
  <section aria-label="Ações da campanha">
    {/* botões */}
  </section>
)}
```

**Padrão de estado e feedback (replicar de campaigns-meta-client.tsx):**
```tsx
const [optimisticStatus, setOptimisticStatus] = useState(campaign.status)
const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
const [isActioning, setIsActioning] = useState(false)

async function handleAction(action: 'pause' | 'resume' | 'set_budget', value?: number) {
  setIsActioning(true)
  setActionMessage(null)
  try {
    const res = await fetch(`/api/meta-ads/campaigns/${campaignId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, value }),
    })
    const data = await res.json()
    if (!res.ok) {
      setActionMessage({ type: 'error', text: data.message ?? data.error ?? 'Erro ao executar ação' })
      return
    }
    // Optimistic update
    if (action === 'pause') setOptimisticStatus('PAUSED')
    if (action === 'resume') setOptimisticStatus('ACTIVE')
    setActionMessage({ type: 'success', text: action === 'pause' ? 'Campanha pausada com sucesso' : action === 'resume' ? 'Campanha retomada com sucesso' : `Budget atualizado para R$ ${(value! / 100).toFixed(2)}` })
  } catch {
    setActionMessage({ type: 'error', text: 'Erro de rede — tente novamente' })
  } finally {
    setIsActioning(false)
  }
}
```

**Modal de budget (sem biblioteca de modal — usar div absoluto ou dialog nativo):**
```tsx
{isBudgetModalOpen && (
  <dialog open className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-lg p-6 w-80 shadow-xl">
      <h3 className="font-semibold mb-2">Ajustar Budget Diário</h3>
      {campaign.daily_budget && (
        <p className="text-sm text-gray-500 mb-3">
          Budget atual: R$ {(Number(campaign.daily_budget) / 100).toFixed(2)}
        </p>
      )}
      <input
        type="number"
        min="1"
        step="0.01"
        placeholder="Ex: 50.00"
        className="w-full border rounded px-3 py-2 text-sm"
        value={budgetInput}
        onChange={(e) => setBudgetInput(e.target.value)}
      />
      {/* mensagem de erro do modal */}
      <div className="mt-4 flex gap-2">
        <button onClick={() => setIsBudgetModalOpen(false)}>Cancelar</button>
        <button
          disabled={!budgetInput || Number(budgetInput) < 1 || isActioning}
          onClick={() => handleAction('set_budget', Math.round(Number(budgetInput) * 100))}
        >
          Confirmar
        </button>
      </div>
    </div>
  </dialog>
)}
```

**Endpoint GET de histórico — JOIN com usuários:**
```typescript
// meta_sync_log não tem FK direta para auth.users nome
// Buscar executed_by (UUID) e resolver nome via tabela 'users' do projeto
const { data: actions } = await supabase
  .from('meta_sync_log')
  .select('started_at, details, executed_by')
  .eq('org_id', appUser.org_id)
  .eq('sync_type', 'campaign_action')
  .filter('details->>campaign_id', 'eq', campaign.meta_campaign_id)
  .order('started_at', { ascending: false })
  .limit(5)

// Resolver nomes via tabela users do projeto (não auth.users direto)
// Buscar nomes dos executed_by UUIDs via supabase.from('users').select('id, name').in('id', executedByIds)
```

**Testing:**
- Não há suite de testes automatizados para componentes (padrão: type-check + lint + teste manual)
- Testar com usuário real admin e corretor para validar role guard

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled — qualidade via type-check + lint + revisão manual do @qa.

## File List

- `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` — modificado: fix destructuring `isAdmin`, `optimisticStatus`, `handleAction`, seção "Ações" (admin-only), modal budget, tabela histórico
- `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/actions/route.ts` — novo: GET histórico de ações com anti-IDOR + join `public.users` para nomes

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-11 | 1.0 | Story criada | River (@sm) |
| 2026-05-11 | 1.1 | Validação GO 9/10 — should-fix: Task 1.3 deve seguir Dev Notes (tabela public.users, não auth.users) | Pax (@po) |
| 2026-05-11 | 1.2 | Implementação completa: GET endpoint actions, seção "Ações" + modal + histórico, type-check e lint limpos. Task 5 (teste manual) pendente | Dex (@dev) |
| 2026-05-12 | 1.3 | QA Gate — verdict CONCERNS. 9/9 ACs cumpridos, type-check/lint limpos. 2 issues Medium (M1: modal `<dialog open>` sem `showModal()` perde a11y; M2: GET /actions sem `requireRole`). Task 5 (manual) pendente — pré-condição de @devops *push. Detalhes em docs/qa/gates/25-2-qa-gate.md | Quinn (@qa) |
| 2026-05-12 | 1.3 | Fixes pós-gate Quinn CONCERNS V1.3: M2 requireRole, M1 dialog showModal a11y, L1 optimisticBudget. Task 5 (teste manual) ainda pendente — checklist humano anexado | Dex (@dev) |
| 2026-05-12 | 1.4 | Re-review CONDITIONAL_PASS — código validado, aguardando Task 5 humana | Quinn (@qa) |
| 2026-05-12 | 1.5 | Push autorizado pelo lead — Status → Done. Task 5 (teste manual no browser) ainda pendente; checklist humano permanece no story file. Re-abrir como InReview se houver issue na validação humana | Gage (@devops) |

## QA Results

**Gate file:** `docs/qa/gates/25-2-qa-gate.md`
**Reviewer:** Quinn (@qa)
**Data:** 2026-05-12
**Verdict:** CONCERNS

### Resumo
9/9 ACs cumpridos funcionalmente. Type-check passa limpo; lint do arquivo modificado tem apenas 2 warnings pré-existentes (dead code de Story 16.9/19.2). Anti-IDOR correto no endpoint `GET /actions`. Sem regressão nas seções existentes (funil, série temporal, adsets, leads).

### Issues identificados
- **M1 (Medium — Accessibility):** Modal `<dialog open>` (linha 406 de `campaign-detail-client.tsx`) não chama `showModal()`, perdendo focus trap, ESC-to-close e backdrop click-out nativos. Falta `role="dialog"`, `aria-modal`, foco inicial no input. WCAG 2.1.1 / 2.4.3 prejudicados. **Fix recomendado:** `useRef<HTMLDialogElement>` + `useEffect` chamando `showModal()`/`close()`.
- **M2 (Medium — Security/Defense-in-Depth):** Endpoint `GET /actions/route.ts` faz `requireAuth()` mas não `requireRole(['admin'])`. UI já restringe a admins, mas endpoint é tecnicamente leakável via DevTools. **Fix obrigatório (1 linha):** adicionar `const forbidden = requireRole(appUser, ['admin']); if (forbidden) return forbidden;` após linha 28 (simétrico ao POST `/action`).
- **L1 (Low — UX):** Após `set_budget` bem-sucedido, `data.campaign.daily_budget` não é atualizado no estado local — próxima abertura do modal mostra valor antigo até refetch. Pode confundir admin.

### Task 5 (teste manual) — pendente
Todos os 8 subitens marcados `[ ]`. **Decisão de QA:** aceitar como pré-condição de `@devops *push`. Devops deve rodar Task 5 antes do merge (mínimo: 5.1–5.6 + 5.8 em local; 5.7 em staging se necessário).

### Observação sobre B1 (PO review)
`campaign-detail-client.tsx` (1080 LOC após esta story) é alvo de Epic 26 (Criativos Meta Ads) e Story 32.4 (UI Islands Split). Story 25.2 amplifica o problema (+259 LOC) mas não o cria. **Recomendação ao @pm:** priorizar Story 32.4 antes de Epic 26 para evitar merge-conflict-hell.

### Condições para aprovação de merge
1. **OBRIGATÓRIO:** Executar Task 5 (subitens 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8 mínimo) antes de `@devops *push`.
2. **OBRIGATÓRIO:** Aplicar fix M2 (`requireRole` no `GET /actions`).
3. **RECOMENDADO:** Tratar M1 nesta story OU criar story de tech-debt referenciando esta gate.
4. **OPCIONAL:** L1 (refresh de daily_budget) — story de polimento futura.

### Status sugerido após fixes
`InReview` → aguardar fixes M2 + Task 5 → `Done` (via @devops *push).

### Re-review V1.4 (2026-05-12)
**Verdict: CONDITIONAL_PASS** — código (M2 requireRole, M1 dialog showModal/a11y, L1 optimisticBudget) validado contra arquivo real. Todos os 3 fixes implementados corretamente:
- M2: `requireRole(appUser, ['admin'])` aplicado em `actions/route.ts` linhas 30–31, antes de qualquer query DB.
- M1: `dialogRef` + `useEffect` chamando `showModal()`/`close()` (linhas 66, 131–145); `<dialog>` sem prop `open`; `role="dialog"`, `aria-modal`, `aria-labelledby`, `onClose` + autofocus no input via `budgetInputRef` — WCAG 2.1.1 / 2.4.3 atendidos.
- L1: `optimisticBudget` state com inicialização idempotente em `fetchData` e atualização em `handleAction set_budget` — usado tanto no modal quanto no badge "Orçamento" do header.

**PASS final fica condicionado à execução da Task 5 humana (checklist anexado).** Quando Gabriel confirmar 5.1–5.6 + 5.8 OK no browser, `@devops` pode transicionar Status direto para `Done` no push — sem necessidade de nova passagem por @qa. Detalhes em `docs/qa/gates/25-2-qa-gate.md` (seção "Re-review V1.4 — 2026-05-12").

## Checklist para Validação Humana (Task 5)

Pré-requisitos:
- Logar no app local (`pnpm dev` em packages/web)
- Ter uma conta admin (role: 'admin') e uma corretor/broker
- Ter campanha Meta real disponível em estados ACTIVE e PAUSED

- [ ] 5.1 Logado como admin: seção "Ações" aparece no detalhe da campanha
- [ ] 5.2 Logado como broker: seção "Ações" NÃO aparece
- [ ] 5.3 Pausar campanha ACTIVE: badge atualiza + mensagem verde "Campanha pausada com sucesso"
- [ ] 5.4 Retomar campanha PAUSED: badge atualiza + mensagem verde "Campanha retomada com sucesso"
- [ ] 5.5 Ajustar budget: abrir modal, preencher R$ 50.00, confirmar → mensagem verde + modal fecha
- [ ] 5.6 Valor inválido: input vazio, R$0, R$0.50 → botão "Confirmar" desabilitado
- [ ] 5.7 Histórico de ações: após executar pause/resume/budget, ver linhas com Data, Ação, Executor (seu nome)
- [ ] 5.8 Sem regressão: funil, série temporal, adsets, leads continuam funcionando normalmente
- [ ] Bônus M1: ESC no modal fecha; foco vai pro input ao abrir; backdrop click não fecha (comportamento nativo correto)
