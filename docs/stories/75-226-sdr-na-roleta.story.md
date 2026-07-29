# Story 75-226 — SDR na fila da roleta: recebe leads e atende qualquer empreendimento

**Status:** Done
**Tipo:** Feature
**Epic:** Roleta de Leads
**Complexidade:** M

## Contexto
Pedido do Marcos (29/07): a Thielly (perfil `sdr`, criado na 75-204) precisa poder
entrar na **Fila de Corretores da roleta** e, quando ativa, **receber leads** como
qualquer corretor. O controle liga/desliga fica 100% no CRM (toggle da fila). Por ser
SDR, ela **atende qualquer empreendimento** — sem cadastro de `broker_assignments`;
empreendimento novo já nasce coberto por ela.

Decisões de produto (Marcos, 29/07):
- **Teto:** 500 leads ativos (editável depois em Config › Corretores › Limite de Leads).
- **SLA:** leads dela ficam **fora do SLA** — nem alerta de 10min ao dono, nem
  escalonamento de 60min ao gestor.
- **Config › Corretores:** ela aparece na mesma lista, com Tipo "SDR".

Descoberta técnica (mapeamento 29/07): a roleta **não filtra por role** em lugar
nenhum — o gate real é a linha em `public.brokers` (+ `is_available` + `roleta_fila`).
Hoje só usuário criado com role `broker` ganha essa linha. Bug pré-existente
descoberto no caminho: `POST /api/users` insere `brokers.user_id = auth_id` (FK é
para `users.id`) — o insert falha silenciosamente desde sempre.

## Acceptance Criteria
1. **AC1 — Entrar na fila:** usuário role `sdr` com linha em `brokers` aparece no
   seletor da Fila de Corretores em /dashboard/roleta e pode ser adicionado/removido;
   o toggle ativo/inativo (olhinho, `roleta_fila.is_active`) funciona igual ao do
   corretor. Badge/indicação visual "SDR" na fila.
2. **AC2 — Atende tudo:** a RPC `roleta_pick_and_advance` entrega lead ao SDR mesmo
   com `p_property_id` definido e **sem** linha em `broker_assignments` (role `sdr`
   = bypass do filtro de empreendimento). Corretores continuam filtrados por
   assignments — **zero regressão** no caminho atual.
3. **AC3 — Teto:** régua única preservada — `broker_active_leads_count` ×
   `brokers.max_leads`. Backfill cria a linha da Thielly com `max_leads = 500`,
   `is_available = true`, `type = 'internal'`, **sem** inseri-la na `roleta_fila`
   (entrada na fila = ação manual do gestor no CRM).
4. **AC4 — Fora do SLA:** lead cujo `assigned_broker_id` é um usuário `sdr` não gera
   alerta de 10min nem escalonamento de 60min (cron sla-alerts pula o lead inteiro).
5. **AC5 — Notificação com link certo:** push/WhatsApp de novo lead da roleta chega
   ao SDR com deep link que funciona para o perfil dela (dashboard; hoje aponta para
   `/broker/leads/{id}`, que redireciona sdr para /dashboard e perde o lead).
6. **AC6 — Config › Corretores:** Thielly listada com Tipo **"SDR"** (derivado de
   `users.role`, sem mexer no enum `broker_type`); coluna Empreendimentos mostra
   **"Todos"**; toggle Disponível para sdr **não desativa a conta**
   (`users.is_active` intocado — exceção à 75-54, ela precisa continuar logando).
7. **AC7 — Criação de usuário corrigida:** `POST /api/users` com role `broker` OU
   `sdr` cria a linha em `brokers` com o **`users.id` correto** (bug fix do
   `auth_id`); falha do insert deixa de ser silenciosa (logar erro).
8. **AC8 — Transferência manual:** transferir lead para usuário `sdr` é aceito e
   roteia como corretor (`is_relationship = false`), com deep link correto no push.
9. **AC9 — Agenda:** filtro de corretores da agenda inclui role `sdr`.

## Solução proposta (não prescritiva)
- **Migração 195:** recriar `roleta_pick_and_advance` com o filtro de empreendimento
  virando `(p_property_id IS NULL OR EXISTS (broker_assignments…) OR EXISTS
  (SELECT 1 FROM users u WHERE u.id = b.user_id AND u.role = 'sdr'))` + backfill
  **por role** (todo `users.role='sdr'` sem linha em `brokers` ganha uma, guard
  NOT EXISTS — idempotente, vale p/ staging e prod).
- SLA: `sla-alerts/route.ts` busca `role` do dono e pula lead de sdr antes dos dois
  disparos.
- Deep link: helper que resolve URL do lead por role (`/broker/leads/{id}` ×
  rota do dashboard) usado em notify-broker e transferir.
- Config: coluna Tipo lê `users.role === 'sdr'` antes do `typeLabels`; célula de
  empreendimentos e `_actions.ts` ganham o caso sdr.

## Limitação conhecida (aceita no QA)
- O WhatsApp de novo lead usa o template HSM `novo_lead_corretor`, cujo **botão tem
  base fixa `/broker/leads` aprovada na Meta** — para o SDR o botão cai no /dashboard
  raiz (o layout /broker redireciona). Push e e-mail levam à URL correta; o corpo do
  WhatsApp traz nome/telefone do lead. Se incomodar na prática, criar template
  dedicado p/ SDR em story futura.

## Fora do escopo
- Bolsão: sdr continua **sem** puxar do bolsão (decisão da 75-204 mantida;
  `canPullBolsaoDashboard` intocado). Leads dela **continuam caindo no bolsão**
  após 15min sem atendimento — como ela fica fora do SLA, o bolsão é a única rede
  de segurança; comportamento desejado.
- Acesso do sdr ao app /broker (ela segue no /dashboard, visão de equipe da 75-204).
- Analytics/relatórios: com `is_available=true` ela passa a contar nos cards de
  "corretores ativos" — aceito por ora.
- Lista de "gestores notificáveis" da roleta (inclui sdr hoje) — mantida.
- `sync-history` (legado Supremo) — integração cancelada, não vale o toque.

## Riscos
- Migração mexe na RPC **quente** de distribuição (185 → 195): testar os dois
  caminhos (corretor com assignment × sdr sem) e a 2ª passada sem `p_property_id`
  do distributor. Gotcha conhecido: enum em CASE SQL exige `::text`.
- Toggle Disponível: a exceção sdr não pode quebrar o sync da 75-54 para corretores.
- Backfill por role: garantir idempotência (rodar 2× não duplica).

## Dev Agent Record
### Notas
- **Bug de brinde corrigido (regressão 156/185):** as redefinições da RPC perderam o
  carimbo atômico `distribuido_em = now()` da mig 142 (Story 75-106) — restaurado na
  195. Sem ele, lead com falha no insert de `lead_distribution_log` ficava órfão do
  relógio de SLA/bolsão.
- **Bug de brinde nº 2:** `POST /api/users` gravava `auth_id` em `brokers.user_id`
  (FK p/ `users.id`) e falhava calado — corrigido + erro logado + role `sdr` incluso.
- QA (1ª rodada) apontou 3 deep links `/broker/leads/{id}` fora da story
  (notify-on-reply, reativar, seletor de transferência sem sdr) → helper
  `lib/leads/lead-url.ts` (`leadDeepLink`) centraliza a resolução por role.

### File List
- `supabase/migrations/195_sdr_na_roleta.sql` (novo)
- `packages/web/src/lib/leads/lead-url.ts` (novo) + `lead-url.test.ts` (novo)
- `packages/web/src/app/dashboard/roleta/page.tsx`
- `packages/web/src/app/dashboard/roleta/_components/roleta-fila-panel.tsx`
- `packages/web/src/app/api/cron/sla-alerts/route.ts`
- `packages/web/src/lib/roleta/notify-broker.ts`
- `packages/web/src/lib/broker/notify-on-reply.ts`
- `packages/web/src/app/api/users/route.ts`
- `packages/web/src/app/dashboard/configuracoes/corretores/page.tsx`
- `packages/web/src/app/dashboard/configuracoes/corretores/_actions.ts`
- `packages/web/src/app/api/leads/[id]/transferir/route.ts`
- `packages/web/src/app/api/leads/[id]/reativar/route.ts`
- `packages/web/src/app/dashboard/conversas/[id]/page.tsx`
- `packages/web/src/app/dashboard/conversas/[id]/_components/transfer-conversa.tsx`
- `packages/web/src/app/dashboard/agenda/page.tsx`
- `docs/stories/75-226-sdr-na-roleta.story.md` (novo)

## QA Results
### Review Date: 2026-07-29 — Reviewed By: Quinn (2 rodadas)
1ª rodada: **FAIL** — 4 apontamentos: (1) seletor de transferência não listava sdr
(AC8 inoperante na UI), (2) deep link /broker fixo no push de "lead respondeu"
(notify-on-reply — a notificação de maior volume do SDR), (3) botão do template HSM
novo_lead_corretor com base fixa /broker (limitação Meta), (4) idem no reativar.
2ª rodada (pós-fix): **PASS** — 1/2/4 resolvidos com o helper `leadDeepLink`
(+3 testes); 3 aceito como limitação documentada. Suíte 1260/1260; tsc/eslint/build ok.

### Deploy (@devops, 29/07)
- Migração 195 aplicada em PROD via SQL Editor (MCP Supabase quebrado — ver memória
  project-migrations): "Success. No rows returned".
- Verificação pós-migração em prod: Thielly sdr/internal/500/disponível, fora da
  fila (na_fila=0); RPC com bypass sdr ✅ e carimbo distribuido_em ✅.
- PR #297 squash-merged; deploy Vercel success; /broker (sessão corretor real)
  renderizando sem regressão.
- Pendente operacional: Marcos adicionar a Thielly à fila em /dashboard/roleta
  quando quiser ativar. Replicar a 195 no projeto dev (xnxvygyfyyyzwhiuoehz).
