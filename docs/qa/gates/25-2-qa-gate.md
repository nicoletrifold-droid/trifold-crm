# QA Gate — Story 25.2

**Story:** 25.2 — UI Controles de Ação no Painel de Campanhas
**Reviewer:** Quinn (@qa)
**Data:** 2026-05-12
**Verdict:** CONCERNS

## Sumário

A implementação da UI de ações administrativas no painel de detalhe de campanhas Meta cumpre todos os 9 ACs funcionais. O código segue o padrão estabelecido pelo `campaigns-meta-client.tsx` (state-based feedback, sem lib de toast), aplica role-guard server-side via `page.tsx` (sem fetch de user no client), e adiciona o endpoint `GET /actions` com guard anti-IDOR correto. Type-check passa limpo; lint do arquivo modificado tem apenas 2 warnings pré-existentes (dead code de Story 16.9/19.2 — `funnel` e `ConversionFunnelView` não usados).

Verdict **CONCERNS** (não PASS) por dois motivos: (1) **Task 5 (teste manual) não foi executada** — todos os 8 subitens marcados `[ ]`; e (2) **questões menores de acessibilidade e validação numérica** (uso do `<dialog open>` sem `showModal()` perde features nativas de modal — focus trap, ESC, backdrop) que merecem registro mesmo sem bloquear merge. O conflito de escopo B1 (PO review) com Epic 26 / Story 32.4 também é documentado abaixo.

## 7 Quality Checks

### 1. Code review — PASS (com observações)
- Padrão `useState<{ type, text }>` para `actionMessage` replicado fielmente de `campaigns-meta-client.tsx`.
- `useCallback` para `fetchData` e `fetchActionLog` com deps corretas (`campaignId`, `days`; `campaignId` respectivamente).
- `optimisticStatus` inicializado de forma idempotente: `setOptimisticStatus((prev) => prev ?? json.campaign.status)` em `fetchData` (linha 106) — **CORRETO**, não reseta após o usuário ter feito uma ação otimista enquanto o backend ainda não refletiu.
- `handleAction` separa erro de modal (`budgetModalError`) de erro de seção (`actionMessage`) — bem feito.
- `isActioning` reutilizado para todas as 3 ações (compartilhamento de estado entre Pausar/Retomar/set_budget é aceitável: usuário não dispara duas simultâneas).
- **Observação:** Após `set_budget` bem-sucedido, `actionMessage` é setado, modal fecha, mas `data.campaign.daily_budget` no estado local **NÃO é atualizado** — próxima abertura do modal mostra valor antigo até o próximo `fetchData`. Não viola AC (AC 4 não exige refresh do "Budget atual" pós-confirmação), mas é UX-debt.

### 2. Tests — N/A (manual pendente)
- Projeto não tem suite UI automatizada (padrão Trifold web: type-check + lint + manual).
- **Task 5 NÃO executada** — 8/8 subitens (5.1 a 5.8) marcados `[ ]` no story file. Decisão de QA: tratar como pré-condição de @devops *push (smoke test no PR review), não bloquear gate por isso. Ver "Observação sobre Task 5" abaixo.

### 3. Acceptance criteria — PASS (9/9)
- **AC 1** ✅ Linha 304: `{isAdmin && displayStatus !== "ARCHIVED" && (...)}` — hidden, não disabled. `isAdmin` vem como prop do server (page.tsx linha 10 calcula `user.role === "admin"`).
- **AC 2** ✅ Linhas 311–342: Pausar visível só se `displayStatus === "ACTIVE"`; Retomar só se `=== "PAUSED"`; Ajustar budget sempre visível (dentro do gate `!== "ARCHIVED"` da seção pai).
- **AC 3** ✅ Linhas 314, 324: `disabled={isActioning}` + texto "Pausando..."/"Retomando..."; linhas 146–151: optimisticStatus + actionMessage verde; linhas 137–143: erro vermelho (extrai `message ?? error`).
- **AC 4** ✅ Modal nas linhas 405–465: input em reais (linha 425–433), `min="1"` + `step="0.01"`; mostra budget atual (414–424); `disabled` no Confirm se input vazio OU < 1 OU isActioning (447–451); conversão `Math.round(Number(input) * 100)` (455); sucesso fecha modal + limpa input (157–158); erro inline no modal (434–436); Cancelar fecha sem ação (440).
- **AC 5** ✅ Badge `statusBadge` em linha 220 deriva de `displayStatus = optimisticStatus ?? campaign.status` (219). Sem `revalidatePath` nem reload.
- **AC 6** ✅ Histórico nas linhas 356–400: endpoint `GET /actions` busca até 5 entradas de `meta_sync_log` com filtro `details->>campaign_id`; colunas Data/Ação/Executor (371–379); estado vazio "Nenhuma ação registrada ainda." (363); `fetchActionLog` re-disparado após cada ação bem-sucedida (linha 160).
- **AC 7** ✅ `disabled={isActioning}` em todos os 3 botões; classe `disabled:opacity-50 disabled:cursor-not-allowed`.
- **AC 8** ✅ `pnpm run type-check` passou (verificado via `pnpm --filter @trifold/web run type-check` — sem erros). `pnpm run lint` passou para este arquivo (0 errors, 2 warnings pré-existentes de Story 16.9/19.2). Os 9 lint errors do monorepo são em `dashboard/sistema/emails/*` (Story 18.9 e similares — não relacionados).
- **AC 9** ✅ Modificações isoladas: nova seção `<section aria-label="Ações da campanha">` inserida entre Header e Time series chart. Todas as seções existentes (funil, série temporal, adsets, ROAS, leads) preservadas sem alterações estruturais. `displayStatus` substituiu `campaign.status` apenas no badge (linha 220); o resto do código continua usando `campaign.status` diretamente.

### 4. No regressions — PASS
- Diff confirmado: `+259 / -2` linhas. As 2 remoções: substituição de `campaign.status` por `displayStatus` no badge + remoção de comentário redundante.
- Nenhuma mudança em `TimeSeriesChart`, `AdsetsTable`, `RoasCard`, `LeadsTable`, `CampaignFunnel`, `ConversionFunnelView`.
- `fetchData` original preservado (apenas ganha 1 linha: `setOptimisticStatus(prev => prev ?? json.campaign.status)`).
- `useEffect`s adicionados são guarded por dependências separadas (`fetchData` vs `fetchActionLog`), não afetam o ciclo de fetch da página principal.
- **Atenção B1 (PO review):** Este arquivo (1080 LOC, agora +259) é alvo de **Story 32.4 (UI Islands Split)** e **Epic 26 (Criativos Meta Ads)**. Ver seção "Observação sobre B1" abaixo. Story 25.2 não impacta a refatoração futura — apenas amplifica a justificativa dela.

### 5. Performance — PASS
- `fetchActionLog` dispara só quando `isAdmin === true` (linha 120: `if (isAdmin) void fetchActionLog()`). Não-admins não pagam o custo do endpoint.
- Optimistic update evita revalidate desnecessário do `fetchData` principal — apenas o `fetchActionLog` é re-disparado pós-ação (linha 160), que é leve (LIMIT 5 + 1 join de até 5 user IDs).
- Modal de budget: renderização condicional via `{isBudgetModalOpen && (...)}` — sem keep-alive, mas o modal é simples (~60 LOC JSX) e não tem efeitos custosos. Aceitável.
- Cleanup: efeitos não têm `return () => ...` — não há subscrições/timers para limpar, então não é problema. Fetch abortion via AbortController NÃO está implementado — em navegação rápida pode haver setState em componente desmontado. Risco baixo (já existia antes para `fetchData`), mas vale registrar.
- **+259 LOC**: O arquivo passou de 821 → 1080 LOC. Reforça a recomendação de PO B1 / Story 32.4 (split em islands). Não é bloqueante para 25.2, mas dificulta navegação/refatoração.

### 6. Security — PASS (com nota)
- **Role guard no client é SUFICIENTE para UX, NÃO para segurança.** O endpoint `POST /action` (Story 25.1, linha 20: `requireRole(appUser, ['admin'])`) faz o guard real. O endpoint `GET /actions` (Story 25.2) **NÃO faz `requireRole`** — apenas `requireAuth` + filtro por `org_id`. Decisão de design aceitável (qualquer membro da org pode ver o histórico de ações da própria org), mas vale notar: na UI, o histórico só é renderizado para admin (linha 304), então não-admin nunca o veria de qualquer forma. **OK**.
- **Anti-IDOR (GET /actions):** linha 33–38: verifica `meta_campaign_id` pertence ao `org_id` do usuário via `.eq('org_id', appUser.org_id)` antes de retornar histórico. Retorna 404 se a campanha não for da org. **CORRETO**.
- **Anti-IDOR (filtro do log):** linha 47–49: log filtrado por `org_id = appUser.org_id` E `details->>campaign_id = metaCampaignId`. Duplo filtro impede vazamento cross-org mesmo se houver linha órfã. **CORRETO**.
- **XSS:** Nenhum `dangerouslySetInnerHTML`. Todos os valores renderizados (action label, datas, executor name, budget) são strings/numbers escapadas por React. `formatDateTime` retorna string formatada. `entry.action` vem do `ACTION_LABELS` lookup com fallback ao `details?.action` cru — esse fallback **PODE** conter input arbitrário se algum atacante conseguir gravar `meta_sync_log` direto (improvável: tabela é gravada apenas pela API), mas React escapa por padrão.
- **CSRF:** Next.js App Router POST com same-origin é protegido por Same-Origin Policy do navegador (CORS default = same-origin para `fetch` sem `mode: 'no-cors'`). Cookie de sessão Supabase é HttpOnly + SameSite=Lax por default. **OK**.
- **Input numérico:** `type="number"` + `step="0.01"` + `Number()` parsing. Não há injection (não é string concatenada em SQL). Valor enviado como `number` JSON. **OK**.

### 7. Documentation — PASS
- File List (linhas 244–245) lista corretamente os 2 arquivos: `campaign-detail-client.tsx` (modificado) e `actions/route.ts` (novo).
- Dev Notes (linhas 132–232) cobrem implementação esperada vs realizada (idempotência do optimistic update, JOIN com `public.users`, modal nativo `<dialog open>`).
- Change Log atualizado: 3 entradas (criação, validação PO, implementação dev). Falta entrada deste QA gate — será adicionada.

## Validações específicas

### UI (campaign-detail-client.tsx)
- ✅ `isAdmin` prop recebida do server (`page.tsx` linha 12) — sem fetch de user no client.
- ✅ `optimisticStatus` inicializado via `setOptimisticStatus(prev => prev ?? json.campaign.status)` (idempotente).
- ✅ Botão "Pausar" só visível se `displayStatus === 'ACTIVE'` (não disabled).
- ✅ Estado vazio histórico: "Nenhuma ação registrada ainda." (linha 363).
- ⚠ Modal usa `<dialog open>` nativo (linha 406) **mas não chama `dialog.showModal()`** — perde focus trap, ESC para fechar, e backdrop nativo. O `<dialog open>` (atributo) sem `showModal()` renderiza como caixa flutuante mas SEM as features de modal. O backdrop `bg-black/50` é apenas CSS, não captura cliques fora para fechar.
- ✅ Conversão reais → centavos: `Math.round(Number(input) * 100)` (linha 455). Testado mentalmente: "1.005" → 100.499... → round → 100 (R$1,00). OK.
- ✅ Validação frontend: `Number(budgetInput) < 1` cobre R$0,99 (=0.99 < 1 → disabled). Cobre negativos (-5 < 1 → disabled). Cobre vazio (`Number("") = 0 < 1 → disabled`, mas também tem `!budgetInput` que pega vazio primeiro).
- ⚠ Acessibilidade: `aria-label="Ações da campanha"` está presente na `<section>` (linha 306). **Faltam:** focus inicial no input ao abrir modal; trap de foco; ESC para fechar; `role="dialog"` + `aria-modal="true"` + `aria-labelledby` apontando para o `<h3>`. O `<dialog open>` (sem `showModal()`) não fornece esses comportamentos automaticamente.

### Endpoint /actions GET
- ✅ `requireAuth()` + filtro por `org_id` (linha 26–28, 47).
- ✅ Query `meta_sync_log` com `sync_type='campaign_action'` AND `details->>campaign_id = meta_campaign_id` (linha 48–49).
- ✅ `LIMIT 5` + `ORDER BY started_at DESC` (linha 50–51).
- ✅ Resolução de nomes via `public.users` (não auth.users) — `supabase.from('users').select('id, name').in('id', executedByIds)` (linha 62–65). Conforme Dev Notes.
- ✅ Retorno tipado: `{ executed_at, action, campaign_name, executed_by_name }[]` (linha 74–79).
- ⚠ Sem `requireRole(['admin'])` — qualquer membro da org pode chamar o endpoint. UI só renderiza para admin, mas endpoint é tecnicamente "leakável" via DevTools/curl. Risco BAIXO (escopo restrito ao próprio org, dados não sensíveis), mas merece registro. Adicionar `requireRole(['admin'])` seria 1-line e simétrico ao POST /action.
- ⚠ `ACTION_LABELS` lookup com fallback `?? row.details?.action ?? '—'`: se um valor inesperado vier em `details.action` (e.g., string de outra story que reuse `sync_type='campaign_action'`), o usuário verá o valor cru. Baixo impacto (tabela é write-controlled pela API), mas vale considerar whitelist estrita.

## Issues identificados

### High / Critical
Nenhum.

### Medium
- **M1** Modal `<dialog open>` sem `showModal()` não fornece focus trap, ESC-to-close, nem backdrop click-out. Acessibilidade prejudicada (WCAG 2.1.1 keyboard, 2.4.3 focus order).
  - **Recommended fix:** Usar `useRef<HTMLDialogElement>` + `useEffect` para chamar `ref.current?.showModal()` quando `isBudgetModalOpen` vira `true`, e `ref.current?.close()` quando vira `false`. Adicionar `onClose={() => setIsBudgetModalOpen(false)}` no `<dialog>`. Adicionar `<form method="dialog">` ou listener manual para ESC.
- **M2** Endpoint `GET /actions` não chama `requireRole(['admin'])` — qualquer membro da org pode chamar. UX consequence: leak via DevTools de usuário não-admin curioso (low value: nomes + datas + ações da própria org).
  - **Recommended fix:** Adicionar `const forbidden = requireRole(appUser, ['admin']); if (forbidden) return forbidden;` após linha 28. Simétrico ao POST.

### Low
- **L1** Após `set_budget` bem-sucedido, `data.campaign.daily_budget` não é atualizado no estado local; próxima abertura do modal mostra valor antigo até refetch. Pode confundir admin que acabou de mudar o valor e reabre o modal sem reload da página.
  - **Recommended fix:** Após sucesso de `set_budget`, chamar `void fetchData()` para refrescar; OU atualizar localmente: `setData(prev => prev ? { ...prev, campaign: { ...prev.campaign, daily_budget: value } } : prev)`.
- **L2** Sem cleanup/abortController em `fetchData`/`fetchActionLog` — pode haver setState em componente desmontado se usuário navegar rápido. Pré-existente, não introduzido por 25.2.
- **L3** `ACTION_LABELS` lookup com fallback ao valor cru pode renderizar string arbitrária se a tabela `meta_sync_log` for poluída fora da API canônica. Risco baixo (write-controlled pela API), mas whitelist estrita seria mais defensiva.

## Observação sobre Task 5 (teste manual pendente)

Task 5 não foi executada — todos os 8 subitens marcados `[ ]`. Os ACs foram validados estaticamente pelo código, mas há comportamentos que apenas teste manual confirma:
- 5.1/5.2: Visibilidade da seção em produção real para admin vs corretor (depende de `users.role` no Supabase).
- 5.3/5.4: Resposta da Meta API em < 5s sem erros transientes.
- 5.5/5.6: Validação visual do modal e comportamentos de borda.
- 5.7: Refetch do histórico após ação.
- 5.8: Confirmar visualmente que funil, série temporal, adsets, leads continuam renderizando.

**Recomendação:** Aceitar como **pré-condição obrigatória de `@devops *push`**. O devops deve rodar Task 5 manualmente (ou exigir do dev) antes do merge. Se o ambiente local não permitir validar com role real, validar pelo menos 5.1–5.6 (UI/UX) e deixar 5.7–5.8 para staging.

## Observação sobre B1 do PO review

O PO levantou na revisão B1 que `campaign-detail-client.tsx` (1080 LOC após esta story) é alvo de:
- **Epic 26 — Gestão de Criativos Meta Ads**: provavelmente adicionará uma seção "Criativos" ao mesmo arquivo, aumentando ainda mais o tamanho.
- **Story 32.4 (proposta) — UI Islands Split**: split do arquivo em islands (page header, performance, ações, criativos, leads) para melhor manutenibilidade e performance de re-render.

Story 25.2 amplifica o problema (+259 LOC) mas não o cria. **Recomendação ao @pm:** priorizar Story 32.4 ANTES de Epic 26 para evitar merge-conflict-hell quando criativos for adicionado. Documentar essa dependência no Epic 26 antes de criar suas stories.

## Decisão final

**Verdict: CONCERNS**

Aprovado para merge **condicionado a:**
1. **OBRIGATÓRIO:** @dev (ou @devops no PR review) executa Task 5 — pelo menos subitens 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8. Subitem 5.7 (histórico) pode ser smoke-test no ambiente real.
2. **OBRIGATÓRIO (low effort, simétrico):** Adicionar `requireRole(['admin'])` ao endpoint `GET /actions` (M2 — 1 linha de código). Não bloqueia para a UI atual (admin-only) mas fecha um leak surface.
3. **RECOMENDADO (mas pode ir para tech-debt):** Corrigir M1 (modal accessibility) — usar `showModal()`. Se for tratado em backlog, registrar como issue separada referenciando esta gate.
4. **OPCIONAL:** L1 (refresh de daily_budget pós-set_budget) — UX nice-to-have, pode ir para uma story de polimento.

Os 9 ACs estão funcionalmente cumpridos. Não há bugs de regressão, não há vulnerabilidades de alta severidade, type-check e lint estão limpos para o arquivo modificado. O risco residual é baixo e controlado.

## Próximos passos

1. **@dev** — executar Task 5 (manual) e marcar checkboxes; aplicar fix M2 (`requireRole` no GET /actions) — ETA: 30min.
2. **@dev** — registrar M1 como issue/story de tech-debt referenciando esta gate (não bloquear merge).
3. **@devops** — após Task 5 + fix M2 confirmados, abrir PR. No PR review, smoke-test rápido na UI (admin vs corretor) antes de aprovar.
4. **@pm** — registrar dependência Story 32.4 → Epic 26 no roadmap (B1 do PO ressurge em 25.2).

---

## Re-review V1.4 — 2026-05-12

**Reviewer:** Quinn (@qa)
**Scope:** Express re-review — APENAS validação de código dos 3 fixes (M2 BLOQUEANTE, M1, L1). Task 5 humana validada em paralelo pelo Gabriel.
**Verdict: CONDITIONAL_PASS** (PASS final pendente apenas Task 5 humana)

### Validação dos fixes

**M2 (BLOQUEANTE) — requireRole no GET /actions — ✅ CORRETO**
- `requireRole` importado de `@web/lib/api-auth` (linha 2).
- Após `requireAuth()` (linhas 26–28), há `const forbidden = requireRole(appUser, ['admin']); if (forbidden) return forbidden` (linhas 30–31).
- Posição correta: ANTES de qualquer query DB (campaign lookup começa só na linha 36). Simétrico ao `POST /action` da Story 25.1. Leak surface fechado.

**M1 (Medium, a11y) — Modal nativo via showModal() — ✅ CORRETO**
- `useRef<HTMLDialogElement>(null)` (linha 66) + `useRef<HTMLInputElement>(null)` para autofocus do input (linha 67).
- `useEffect` (linhas 131–145) reage a `isBudgetModalOpen`: chama `dialog.showModal()` quando true e `dialog.close()` quando false. Guarded por `!dialog.open` / `dialog.open` para evitar double-call.
- `<dialog ref={dialogRef}>` SEM `open` prop (linha 432–438) — controle 100% imperativo via ref.
- `onClose={() => setIsBudgetModalOpen(false)}` (linha 437) sincroniza React state com fechamento nativo (inclui ESC).
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="budget-modal-title"` presentes (linhas 434–436); `<h3 id="budget-modal-title">` na linha 441.
- Input recebe foco quando modal abre via `budgetInputRef.current?.focus()` (linha 139). Focus trap + ESC + backdrop nativos do `<dialog>` agora ativos. WCAG 2.1.1 / 2.4.3 atendidos.

**L1 (Low, UX) — optimisticBudget — ✅ CORRETO**
- `const [optimisticBudget, setOptimisticBudget] = useState<number | null>(null)` (linha 60).
- Inicializado em `fetchData` via padrão idempotente: `setOptimisticBudget(prev => prev ?? (json.campaign.daily_budget !== null ? Number(json.campaign.daily_budget) : null))` (linhas 110–112). Conversão segura para number + tratamento de null.
- Atualizado em `handleAction` quando `action === 'set_budget'` e sucesso: `setOptimisticBudget(value)` (linha 178).
- Usado para exibir "Budget atual" no modal (linhas 444–453) E no badge "Orçamento:" do header via `formatBudget(optimisticBudget ?? campaign.daily_budget, campaign.lifetime_budget)` (linhas 291–294). Próxima abertura do modal pós-ação mostra valor atualizado sem refetch.

### Quality checks adicionais

- **Code review:** Padrões consistentes com restante do arquivo; guards corretos contra null/double-call; symmetry com POST.
- **No regressions:** Apenas alterações cirúrgicas no useState/useEffect/useRef e no `<dialog>`; restante do arquivo (TimeSeriesChart, AdsetsTable, RoasCard, LeadsTable, ConversionFunnelView) intocado.
- **Security:** M2 fechou o único surface de leak; defense-in-depth completo (server-side role-guard + UI-level conditional render).
- **Performance:** Sem impacto — useEffect adicional roda apenas em mudança de `isBudgetModalOpen` (mudanças raras, ação humana).
- **A11y:** Modal nativo `<dialog>` com `showModal()` provê focus trap, ESC handling, e backdrop dismissal automaticamente. Autofocus no input via ref. Verdict de a11y agora ✅.

### Condição residual

**Task 5 (teste manual humano)** — ainda pendente. Verdict final PASS depende apenas da execução pelo Gabriel dos subitens 5.1–5.6 + 5.8 (smoke-test no browser). Como código está validado, basta `@devops *push` após confirmação humana — sem necessidade de nova passagem por @qa.

**Decisão de Status:** Story permanece `Ready for Review` até Gabriel marcar checklist Task 5. Quando humano confirmar 5.1–5.6 + 5.8 OK, `@devops` pode transicionar direto para `Done` no push.
