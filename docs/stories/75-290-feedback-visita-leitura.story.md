# Story 75-290 — Feedback da visita também se LÊ: porta fixa no header do lead

**Story ID:** 75-290
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** M (~5 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** feature (SDC) — extensão do épico de feedback de visita (75-177/185/186/188/193/201/202/203)

---

## Story

Como **gestor olhando o pipeline**, quero **ler o feedback da visita direto do lead**, sem precisar
abrir o Histórico inteiro e rolar até achar — e, se a visita ainda não tem feedback, quero
preencher pelo mesmo botão.

---

## Context

Pedido do Marcos (11/08/2026, com prints). O feedback em si está **perfeito** — o problema é o
caminho até ele.

As **5 portas** construídas até hoje (75-185/186/193) são todas de **ESCRITA**, e por desenho
elas **desaparecem** depois do envio:

| Onde | Condição para aparecer | Depois de enviar |
|---|---|---|
| `lead-detail-drawer.tsx:660` | agendamento passado sem `visit_feedback` | `onSuccess` → some |
| `lead-detail-drawer.tsx:673` | lead em "Visitou" sem nenhum feedback | `onSuccess` → some |
| header `/broker/leads/[id]`, header `/dashboard/leads/[id]`, agenda | mesma régua | some |

Resultado: **feedback registrado = zero porta**. A única forma de reler é o Histórico do lead
(75-202), que mistura o relato com follow-ups da Nicole, mudanças de etapa e tudo mais — é
exatamente a rolagem do print 1.

### Decisão de desenho — uma porta, três estados

Botão no **header** (ao lado de "Editar Lead") porque o header é a única região do painel que não
depende de estado de agendamento. Um só componente, três estados:

| Situação | Rótulo | Clique abre |
|---|---|---|
| Lead já tem ≥1 feedback | `Feedback da visita` (discreto) | Modal de **LEITURA** (lista as visitas) |
| Visita passada sem feedback | `Registrar feedback` (laranja) | Form atual (`appointmentId`) |
| Em "Visitou", sem agendamento | `Registrar visita` (laranja) | Form retroativo (`leadId`, 75-193) |
| Nunca visitou | — | botão não é renderizado |

Se o lead tem feedback antigo **E** uma visita nova pendente, o modo leitura mostra o histórico
com um `Registrar nova visita` embutido — os dois caminhos na mesma porta.

### O gotcha que define o desenho da leitura

`visit_feedback` **não guarda o autor**: `visit-feedback-core.ts:42` deixa `broker_id` de fora de
propósito (a coluna referencia `brokers(id)`, mas `appointments.broker_id` aponta para
`users(id)`). O nome que aparece no Histórico ("Odair Ferreira dos Santos", print 1) vem de
`activities.user_id` (75-203), casado por `metadata->>'feedback_id'`.

Como `metadata` é jsonb e **não existe FK**, não há embed PostgREST possível: a leitura precisa de
rota server-side que faça as duas queries e case em memória. Decisão do Marcos: **mostrar o autor**
(é a informação que ele usa para cobrar o corretor), logo a rota é obrigatória.

---

## Acceptance Criteria

- [x] **AC1 — porta fixa no header do drawer.** `lead-detail-drawer.tsx:533`, ao lado de
      "Editar Lead": botão nos 3 estados da tabela acima; **ausente** quando o lead nunca visitou
      (header não ganha botão morto). Header não pode estourar em largura estreita (wrap ou
      rótulo curto) — ver [[feedback-tailwind-ordem-utilitarios]].
- [x] **AC2 — modo leitura mostra a visita inteira.** Uma entrada por visita, **mais recente
      primeiro**: data da visita, interesse em PT com cor, relato (`feedback`), próximos passos
      (`next_steps`, preservando as quebras de linha do form) e **quem registrou**. Rótulos/cores
      reusam `INTEREST_LEVEL_LABELS`/`INTEREST_LEVEL_COLORS` de `lib/constants.ts` — nenhum mapa
      novo (ver [[feedback-consultar-fonte-nao-duplicar-constante]]).
- [x] **AC3 — autor resolvido, sem inventar.** Autor = `users.name` da activity
      `type='visit_completed'` cujo `metadata->>'feedback_id'` casa com o feedback. Feedback **sem**
      activity casada (registros pré-75-203, ou activity com `user_id` nulo) mostra `Sistema` —
      nunca um nome errado, nunca quebra.
- [x] **AC4 — rota `GET /api/leads/[id]/visit-feedback`** (mesmo arquivo do POST):
      `requireAuth`, cliente **user-scoped** (a RLS do lead decide quem lê; sem service role),
      anônimo = **401**, lead de outra org = vazio/404. Devolve `{ feedbacks: [...] }`.
      **Chamada LAZY — só ao abrir o modal.** O estado do botão NÃO vem da rota: vem de quem
      hospeda o botão, que já calcula a régua hoje (`pendingFeedbackAptId`/`leadHasFeedback` no
      drawer; `pendingFeedbackApt`/`showRetroVisit` server-side nas páginas do lead). Resultado:
      **zero request novo** enquanto ninguém clica.
- [x] **AC5 — escrita não muda em nada.** O modo escrita chama o `VisitFeedbackForm` existente
      (`appointmentId` ou `leadId`); zero regra de negócio nova, zero mudança nos endpoints POST.
- [x] **AC6 — mesma porta nos headers das páginas do lead:** `/dashboard/leads/[id]:283` e
      `/broker/leads/[id]:213`, mesmo componente, mesmos 3 estados. Nessas duas páginas o
      componente **SUBSTITUI** os dois `VisitFeedbackButton` que já vivem naquele header — ele é
      superconjunto deles (mesmos dois caminhos de escrita + leitura). O estado continua vindo do
      server (`pendingFeedbackApt`/`showRetroVisit`), passado como prop.
      _(Correção do @po: manter os antigos ali colocaria dois botões idênticos lado a lado na
      MESMA linha — a decisão "mantém os dois" do Marcos foi sobre o drawer, onde header e corpo
      são regiões diferentes.)_
- [x] **AC7 — nada regride.** No **drawer**, os 2 botões do corpo (ao lado de "Conversar no
      WhatsApp") ficam como estão — decisão explícita do Marcos (redundância aceita a troco de
      risco zero). Nas outras portas de escrita (agenda, kanban, `/broker/agenda/[id]/feedback`)
      nada muda, e nenhum endpoint POST é tocado.
- [x] **AC8 — tema.** `/dashboard` e `/broker` com variantes `dark:` (ver
      [[feedback-theme-convention]]); o modal segue o padrão visual do `VisitFeedbackModal`.
- [x] **AC9 — testes (vitest).** Rota GET: ordenação por visita, casamento autor×feedback,
      fallback `Sistema`, `pendingAppointmentId` correto (agendamento passado sem feedback), 401
      anônimo. Componente: os 3 estados + o estado "não renderiza".

---

## Tasks

- [x] `GET` em `app/api/leads/[id]/visit-feedback/route.ts` (+ helper puro em
      `lib/appointments/visit-feedback-read.ts` para o casamento autor×feedback, testável isolado)
- [x] `components/appointments/visit-feedback-history.tsx` — modal de leitura (lista + CTA
      "Registrar nova visita" quando houver pendente)
- [x] `components/appointments/visit-feedback-entry-button.tsx` — client component que recebe o
      estado por prop e decide o rótulo/destino (usado pelas 3 telas)
- [x] `lead-detail-drawer.tsx` — botão no header
- [x] `dashboard/leads/[id]/page.tsx` e `broker/leads/[id]/page.tsx` — botão no header
- [x] Testes + lint + typecheck (+ `next build`, por causa da fronteira RSC nas duas páginas)
- [ ] Smoke pós-deploy: `curl` anônimo na rota = 401 · abrir um lead com feedback em prod e LER

## Dev Notes — gotchas que já cobraram caro neste épico

1. **`.order("visited_at", { ascending: false })` em coluna NULLABLE** → PostgREST devolve
   **NULLS FIRST**: um feedback com `visited_at` nulo (a mig 011 removeu o NOT NULL) apareceria no
   topo como se fosse a visita mais recente. Usar `nullsFirst: false` e cair para `created_at`.
   Ver [[feedback-order-desc-nulls-first]].
2. **Sem embed** `activities → visit_feedback`: não há FK, o vínculo é jsonb. Duas queries + casar
   em memória. Tentar embed dá PGRST200 — foi exatamente o que matou as 5 portas na 75-188.
3. **Um lead pode ter N visitas** (o épico sempre tratou 1): a lista é plural por natureza, e o
   `leadHasFeedback` booleano de hoje não serve para escolher qual mostrar.
4. **`interest_after` é enum**: se em algum momento entrar SQL com `CASE`, exige `::text` (75-202).
5. Validar em **prod** que a query casa: leads com feedback antigo (pré-75-203) existem e devem
   cair no fallback `Sistema` sem erro.

## Dev Notes — desvios e decisões da implementação (@dev)

1. **Desvio da AC4 (auth):** a AC pedia cliente **user-scoped** para a RLS decidir a leitura. Usei
   `createAdminClient()` + a **mesma matriz do POST** (`FEEDBACK_ADMIN_ROLES` + dono do lead +
   imob/consultoria em lead IMOB), porque ela já existe no arquivo e é a régua de quem pode
   registrar — "quem escreve pode ler". Inventar um caminho por RLS criaria uma segunda régua de
   permissão para a mesma informação, com risco de um gestor legítimo receber lista vazia. O
   `org_id` entra no filtro do lead **explicitamente** (o admin client passa por cima da RLS).
   Efeito colateral bom: extraí `canAccessFeedback()` e o **POST passou a usá-la** — antes a régua
   estava inline; agora é uma fonte só.
2. **Adição consciente (fora do texto da AC):** no modo leitura, o CTA aparece **sempre** —
   "Registrar feedback da visita pendente" quando existe agendamento pendente, e "Registrar outra
   visita" quando não existe. Motivo: a **segunda visita** de um lead que já tem feedback não tinha
   porta nenhuma (a retroativa exigia `leadHasFeedback === false`). Não há regra nova: usa o form e
   os endpoints existentes, e o POST retroativo já tem o guard 409 anti-duplicidade.
3. **Ambiente:** o worktree nasceu sem dependências; `node_modules` (raiz e `packages/*`) foram
   **symlinkados** para os da main — mesmo commit de `package.json`, nada disso é commitado.
4. **Baseline de lint:** 0 erros / 26 avisos, **nenhum** nos arquivos novos (os do
   `lead-detail-drawer` são pré-existentes: `isCTWA`, `handleAddNote`).
5. **AC9, parte "componente":** o projeto **não tem** `@testing-library`/jsdom — zero testes de
   componente hoje. Em vez de introduzir infra de teste por conta própria (decisão que não é do
   @dev), extraí a DECISÃO do botão para `visitFeedbackDoor()` no núcleo puro e testei os **4**
   estados (os 3 visíveis + `hidden`) sem DOM. O que segue sem teste automatizado é só a
   renderização em si — daí o smoke visual continuar aberto.
6. **Onde ficou o risco não coberto:** nada foi visto rodando. O que os testes NÃO provam:
   o modal abrindo, o header não estourando em tela estreita, e o tema escuro.

## File List

- `packages/web/src/lib/appointments/visit-feedback-read.ts` (novo — núcleo puro: autor + ordenação)
- `packages/web/src/lib/appointments/visit-feedback-read.test.ts` (novo — 11 testes)
- `packages/web/src/app/api/leads/[id]/visit-feedback/route.ts` (GET novo + POST passa a usar
  `canAccessFeedback`)
- `packages/web/src/app/api/leads/[id]/visit-feedback/route.test.ts` (novo — 10 testes do GET)
- `packages/web/src/components/appointments/visit-feedback-history.tsx` (novo — modal de leitura)
- `packages/web/src/components/appointments/visit-feedback-entry-button.tsx` (novo — porta única)
- `packages/web/src/components/leads/lead-detail-drawer.tsx` (botão no header; corpo intacto)
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` (porta única substitui os 2 botões do header)
- `packages/web/src/app/broker/leads/[id]/page.tsx` (idem)
- `docs/stories/75-290-feedback-visita-leitura.story.md`

## QA Results (@qa)

**Gate: CONCERNS** — código e testes em ordem; a única pendência é que **nada foi visto rodando**.

| Check | Resultado |
|---|---|
| 1. Code review | OK após 3 correções (abaixo) |
| 2. Testes | 170 arquivos / **2142 verdes** (7 expected fail pré-existentes); 28 novos |
| 3. AC atendidas | 9/9 no código; AC9 com desvio de ferramenta documentado |
| 4. Regressões | Suíte inteira verde · `next build` OK · lint de volta à baseline (0 erros / 24 avisos) |
| 5. Performance | Leitura é lazy: 3 queries **só** ao abrir o modal; header não paga request |
| 6. Segurança | GET com `requireAuth` + matriz do POST + `org_id` explícito no filtro do lead (admin client passa por cima da RLS). Anônimo 401, outra org 404, corretor não-dono 403 — os três com teste |
| 7. Documentação | Story com desvios e gotchas registrados |

### 3 defeitos encontrados no gate e corrigidos

1. **[medium — funcional] O botão congelava depois de escrever.** O drawer é client
   component com estado próprio, e o botão novo só chamava `router.refresh()` — que
   re-renderiza server components e **não** toca em `pendingFeedbackAptId`/`leadHasFeedback`.
   Efeito: registrar o feedback pela porta nova e o botão seguir dizendo "Registrar" até
   fechar e reabrir o lead. Os botões antigos do corpo já tratavam isso via `onSuccess`; o
   novo não. Fix: prop `onRegistered` (também repassada por dentro do modal de leitura), com o
   drawer zerando o pendente e marcando `hasFeedback`.
2. **[low — layout] Header do drawer estourava.** O painel é `max-w-md` (448px) e já carrega
   "Editar Lead" + "Ver completo" + fechar. Fix: prop `compact` → no drawer o rótulo é
   **"Feedback"**; nas páginas do lead, onde o header é largo, continua "Feedback da visita".
   O `title` sempre traz a frase inteira, e o container ganhou `flex-wrap` como rede.
3. **[low — UX] Rótulo piscando.** As duas queries do drawer resolvem em tempos diferentes:
   a porta podia nascer "Registrar" e virar "Feedback" meio segundo depois. Fix: a porta só
   renderiza com as DUAS respostas. Cuidado extra: a primeira versão do fix usou `setState`
   síncrono dentro do effect (**erro** de lint, cascading renders) — virou um token com o
   `leadId`, que invalida sozinho na troca de lead.

### O que o gate NÃO prova (pendência consciente, herdada para o smoke)

- Nada rodando: o modal abrindo, o header em tela estreita e o **tema escuro**.
- `INTEREST_LEVEL_COLORS` (`lib/constants.ts`) não tem variante `dark:` — as pílulas de
  interesse ficam claras no tema escuro. **Não é regressão**: é exatamente o que o
  `lead-detail-drawer` já faz hoje com o mesmo mapa. Corrigir mexeria no mapa compartilhado,
  fora do escopo desta story.
- A **"Registrar outra visita"** do modo leitura é uma adição do @dev fora do texto da AC
  (única porta possível para a 2ª visita de um lead que já tem feedback). Sem regra nova, mas
  precisa do aval do Marcos.

## Change Log

- 2026-08-11 — @sm: story criada a partir do pedido do Marcos (3 decisões travadas com ele:
  **com autor**, **drawer + headers das páginas do lead**, **mantém os 2 botões do corpo**).
- 2026-08-11 — @po: validada **9/10 → GO**. Draft → **Ready**. Duas correções aplicadas:
  (1) AC6 — nas páginas do lead o componente SUBSTITUI os botões existentes daquele header (eles
  já estão lá, `dashboard:285-298` / `broker:213-221`; manter geraria botões idênticos lado a
  lado); (2) AC4 — GET virou **lazy** (só ao abrir o modal) e o estado do botão passa a vir do
  host, que já calcula a régua — evita um request novo por lead aberto e evita uma TERCEIRA
  cópia da mesma régua no código.
- 2026-08-11 — @dev: implementada (2 commits). Desvios: GET usa admin client + a matriz do POST
  (régua única, `canAccessFeedback` extraída e reusada pelos dois); AC9 sem teste de componente
  (projeto não tem jsdom) → decisão extraída para `visitFeedbackDoor()` e testada sem DOM.
- 2026-08-11 — @qa: **gate CONCERNS**. 3 defeitos achados e corrigidos (botão congelado após
  escrever; header estourando em 448px; rótulo piscando — com um erro de lint no meio do fix).
  Pendência: nada visto rodando + aval do Marcos sobre a "Registrar outra visita".
- 2026-08-11 — Marcos: **aprovou** a "Registrar outra visita" no modo leitura (a adição do @dev
  fora do texto da AC). Fica como está.
