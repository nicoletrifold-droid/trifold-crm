# Story 75-267 — Menu de abertura no /dashboard: a SDR inicia atendimento de onde ela trabalha

**Epic:** 75 (CRM Trifold) · **Status:** InReview
**Criada por:** @sm (River) em 2026-08-04
**Formato:** UI + extração de componente compartilhado; **zero backend novo, zero migration**
**Estimativa:** M (~5 pts) — 1 componente novo + 4-5 arquivos tocados, tudo frontend; risco concentrado na extração sem regressão (/broker) e no gate client-safe
**Substitui:** 75-265 (abertura automática) — **CANCELADA** pela decisão de 04/08

---

## Story

**Como** Thielly (role `sdr`), responsável por abrir a conversa de TODOS os leads que entram,
**Quero** o botão "Iniciar atendimento" com o menu de templates aprovados na Meta nas telas do
`/dashboard` em que eu vivo — não só na tela do corretor,
**Para que** a abertura aconteça SEMPRE dentro do CRM e o buraco dos "92% perdidos sem nunca ter
tido conversa" feche de verdade.

---

## Context — a decisão e o número

**Decisão do Marcos (04/08):** todos os leads caem para um SDR humano (Thielly), que faz a
abertura **sempre pelo CRM**, com os templates já aprovados na Meta. A 75-265 (abertura
automática) foi cancelada por causa desse desenho.

**O número de fundo (análise 04/08):** 92% dos leads de formulário perdidos por "não conseguimos
falar" **nunca tiveram conversa no CRM**. O modelo SDR só fecha esse buraco se abrir a conversa
for uma ação óbvia e barata na tela em que a SDR trabalha.

### O que a investigação encontrou (e que muda a story)

O backend já está pronto — e **parte da UI também**, o que ninguém tinha registrado:

1. **A permissão existe.** `OPENING_PRIVILEGED_ROLES` inclui `sdr`
   (`packages/web/src/lib/whatsapp/opening-context.ts:20`); privilegiado abre lead de qualquer
   corretor (o check de dono em `opening-context.ts:40-41` só vale para não-privilegiados).
2. **O botão JÁ CHEGA ao /dashboard por um caminho** — desde a 75-155, a aba Conversa de
   `/dashboard/leads/[id]` reusa o `ConversationThread` do /broker
   (`packages/web/src/app/dashboard/leads/[id]/page.tsx:14` e `:416-431`), com `sdr` no gate de
   envio (`CAN_SEND_ROLES`, `page.tsx:22`). Lead sem conversa → `lastMessageAt=null` →
   `getWindowStatus` devolve `closed` (`packages/web/src/lib/broker/window-status.ts:54-57`) →
   `disabledByWindow=true` (`conversation-thread.tsx:203-204` e `:295-303`) → o
   `BrokerMessageInput` mostra o bloco com o menu
   (`packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx:282-331`).
3. **Mas a UX desse caminho fala a língua errada.** O bloco abre dizendo *"Janela de 24h
   encerrada. Aguarde o lead responder para continuar a conversa."*
   (`broker-message-input.tsx:247-249`) e o badge diz *"Janela fechada · aguardando o lead"*
   (`window-status.ts:30`) — para um lead que **nunca teve conversa**, a tela manda a SDR
   **esperar**, que é o oposto do trabalho dela. E oferece "Me avisar quando o lead responder"
   antes do "Iniciar atendimento".
4. **A superfície onde a SDR navega leads não tem o menu.** O drawer
   (`packages/web/src/components/leads/lead-detail-drawer.tsx`) — usado no Kanban
   (`components/pipeline/kanban-board.tsx:595`), na lista do /broker e no imob — só tem o link
   "Conversar no WhatsApp" → `?tab=conversa` (`lead-detail-drawer.tsx:547-556`, 75-140). São
   dois saltos até o botão, atrás de uma aba.
5. **Lead sem conversa é invisível em /dashboard/conversas.** A tela consulta `conversations`
   (`packages/web/src/app/dashboard/conversas/page.tsx:58`); sem conversa criada, o lead não
   aparece lá — e `/dashboard/conversas/[id]` só existe com conversa. Não há NENHUM caminho de
   envio no /dashboard fora da aba Conversa do lead.

Ou seja: a story não é "criar o botão" — é **(a) extrair o menu para um componente
compartilhado, (b) plantá-lo no drawer, e (c) fazer o estado "sem conversa" convidar à abertura
em vez de mandar esperar**.

---

## Os três itens

### Item 1 — Extrair o menu de templates para componente compartilhado (REUSE > ADAPT > CREATE)

O menu hoje vive inteiro dentro do `BrokerMessageInput`: estado
(`broker-message-input.tsx:75-89`), fetch de `GET /api/leads/[id]/opening-templates`
(`:102`), envio via `POST /api/leads/[id]/start-whatsapp` (`:123-127`), `router.refresh()`
pós-sucesso (`:135`) e a UI (`:282-336`).

- Extrair para `packages/web/src/components/leads/opening-template-menu.tsx` (botão +
  lista de previews + estados de loading/erro/enviado + POST). **Nada de cópia** — lição da
  75-166 está registrada no próprio `start-whatsapp/route.ts:52`.
- `BrokerMessageInput` vira consumidor do componente — comportamento no /broker **idêntico**
  (mesmos textos, mesmas classes, mesmo fluxo).
- Callback `onSent` (ou equivalente) para cada superfície decidir o pós-envio (item 3).

### Item 2 — O menu no drawer do lead

O drawer já busca as conversas e mensagens do lead (`lead-detail-drawer.tsx:252-255` e `:304`) —
ele **sabe** quando não há conversa, sem fetch extra.

- Lead **sem conversa** (e com telefone utilizável — mesmo espírito do gate
  `whatsAppState(...) !== "none"` de `lead-detail-drawer.tsx:549`): o drawer mostra
  **"Iniciar atendimento"** com o menu compartilhado, no bloco de ações onde hoje fica o
  "Conversar no WhatsApp".
- Lead **com conversa**: nada muda — continua o link "Conversar no WhatsApp" → `?tab=conversa`.
- **Quem vê:** roles de `OPENING_PRIVILEGED_ROLES` + corretor dono do lead (o comportamento que
  o /broker já tem). Perfis fora disso (ex.: `imob`, que usa o mesmo drawer em
  `imob-leads-manager.tsx:196` e NÃO está na lista) não veem o botão — e a API já devolve 403
  de qualquer forma.
- **Pós-envio no drawer:** estado de sucesso ("Convite enviado…") + CTA **"Ver conversa"**
  apontando para `{leadBasePath}/{leadId}?tab=conversa` (o drawer já resolve `leadBasePath`
  por pathname, `lead-detail-drawer.tsx:201`) + refresh dos dados. A conversa criada pelo
  endpoint (`start-whatsapp/route.ts:92-99`) passa a existir → o lead também passa a aparecer
  em `/dashboard/conversas`.

### Item 3 — O estado "sem conversa" convida a abrir, não a esperar

Distinguir **"nunca teve conversa"** (thread vazia / `lastMessageAt=null`) de **"janela de 24h
fechada"** (teve conversa e expirou) no bloco do composer:

- Sem conversa: copy no espírito de *"Este lead ainda não tem conversa no WhatsApp. Envie uma
  mensagem de abertura aprovada para iniciar o atendimento."* — e **"Iniciar atendimento" é a
  ação primária** (antes do "Me avisar quando o lead responder", que nesse estado é secundário
  ou nem aparece — decisão de dev/UX, documentar a escolha).
- Janela fechada (teve conversa): tudo como hoje.
- O badge `WindowStatusBadge` ("Janela fechada · aguardando o lead") pode ganhar o mesmo
  discernimento — **desejável, não obrigatório** (se encarecer, registrar como follow-up).

---

## Acceptance Criteria

- [ ] **AC1** — logada como `sdr`, para um lead **sem conversa**: o drawer (Kanban) mostra
      "Iniciar atendimento" com o menu de templates (previews renderizados para o lead), e a
      aba Conversa de `/dashboard/leads/[id]` continua mostrando o mesmo menu. Envio funciona
      nas duas superfícies com a API existente.
      *(@dev: implementado nas duas superfícies; envio real com o login da Thielly em prod
      ainda não validado — ver Dev Notes/lição 75-188. Pendência de runtime, não de código.)*
- [x] **AC2** — o menu é UM componente compartilhado consumido pelo /broker e pelo /dashboard;
      nenhuma duplicação de fetch/estado/markup do menu entre superfícies.
- [x] **AC3** — estado "sem conversa" não diz "Janela de 24h encerrada / aguarde o lead
      responder"; a copy convida à abertura e "Iniciar atendimento" é a ação primária.
- [ ] **AC4** — pós-envio: na aba Conversa, o refresh mostra a mensagem enviada na thread; no
      drawer, estado de sucesso + CTA "Ver conversa" levando a `?tab=conversa`; o lead passa a
      aparecer em `/dashboard/conversas`.
      *(@dev: código pronto (refresh preservado na aba; sucesso+CTA+reload no drawer; a conversa
      é criada pelo endpoint intocado) — a aparição em /dashboard/conversas é consequência de
      runtime, valida junto com o AC1.)*
- [x] **AC5** — gate de visibilidade do botão = `OPENING_PRIVILEGED_ROLES` (importada da fonte,
      **nunca** array duplicado) + corretor dono; perfil `imob` e demais roles fora da lista não
      veem o botão no drawer. *(coberto por teste unitário: opening-roles.test.ts)*
- [x] **AC6** — **zero migration, zero endpoint novo**; backend intocado (exceção opcional e
      pontual do Dev Note sobre a constante duplicada — aplicada: `start-whatsapp/route.ts:83`).
- [x] **AC7 — sem regressão /broker** — comportamento do corretor idêntico: mesmo botão, mesmo
      menu, mesmos textos no caminho "janela fechada"; corretor **não-dono** continua sem ver o
      botão para lead alheio e a API continua respondendo 403 (`opening-context.ts:40-41`).
      *(extração 1:1 — mesmas classes/textos/fluxo; gate coberto por teste; API intocada)*
- [x] **AC8 — sem regressão handoff** — enviar a abertura continua desligando a Nicole
      (`is_ai_active=false`, `handoff_at`, `handoff_reason` — `start-whatsapp/route.ts:110-115`).
      Para a SDR isso é **correto e desejado**: humano assumiu o atendimento. Documentado, não
      alterado.
- [x] **AC9 — sem regressão /dashboard** — aba Conversa para admin/supervisor/gerente-comercial
      (75-155) segue funcionando igual, incluindo o caminho "janela fechada" de lead COM
      conversa. *(mesmo componente compartilhado; o caminho com conversa não muda por código)*

---

## Dev Notes

- 🔴 **COLISÃO — sessão paralela (75-266) em andamento:** ela usa a **migration 213** e mexe em
  `lib/constants.ts` (`LOST_REASON_ALL_GROUP_LABELS`), `lib/analytics/metrics.ts` e telas de
  analytics. Esta story **não cria migration nenhuma** e **não pode tocar** `lib/constants.ts`,
  `lib/analytics/*` nem qualquer arquivo de analytics. Se parecer precisar, parar e avisar.
- 🔑 **`OPENING_PRIVILEGED_ROLES` é server-only hoje:** `opening-context.ts` importa
  `createAdminClient` (`opening-context.ts:2`), então client component não pode importá-lo.
  Extrair a constante para um módulo client-safe (ex.:
  `lib/whatsapp/opening-roles.ts`) e re-exportar de `opening-context.ts` — **importar a fonte,
  nunca reproduzir o valor** (erro já cometido 2× em 03/08, está na memória). Alternativa
  válida: computar o gate no server e passar prop booleana ao drawer.
- **Oportunidade opcional (1 linha):** `start-whatsapp/route.ts:83` duplica o array de roles
  inline em vez de importar `OPENING_PRIVILEGED_ROLES` — se a constante ganhar módulo
  client-safe, trocar o inline pelo import. Fora isso, backend intocado.
- **Extração do menu:** o recorte é `broker-message-input.tsx:75-141` (estado + handlers) +
  `:282-336` (UI). O `scrollIntoView` do fim do menu (75-225, `:85-89`) faz sentido dentro do
  composer; avaliar se pertence ao componente ou ao consumidor.
- 🔥 **GOTCHA `useState(prop)` congela pós `router.refresh()`** (75-228): o estado
  enviado/sucesso do menu no drawer precisa sobreviver/ressincronizar com refresh de dados.
- **RLS do sdr:** a página `/dashboard/leads/[id]` carrega o lead com o client do usuário
  (`page.tsx:58-70`); o `sdr` enxerga pela matriz do gerente-comercial (75-204). A API usa
  admin client para privilegiados (`opening-context.ts:27-28`). Validar o fluxo com o login
  real da Thielly antes de dar por pronto (lição 75-188: dev DB ≠ prod).
- **Telefone:** a API já rejeita número inutilizável (`toWhatsAppNumber`,
  `start-whatsapp/route.ts:41-44`); o gate de exibição no drawer evita oferecer o botão para
  telefone fixo/Telegram (`whatsAppState`, padrão da 75-140).
- **Nicole:** nada desta story mexe na regra "Nicole nunca se cala sozinha" — aqui é o humano
  agindo, que é exatamente a entrega ao humano prevista. Nenhum guard novo.
- **Templates:** nenhum template novo na Meta; o menu lista os aprovados via
  `GET /api/leads/[id]/opening-templates` (75-217/75-225), que já autoriza `sdr`.

---

## Fora de escopo

- Abertura automática de conversa (75-265 — **cancelada**, não ressuscitar).
- Fila/visão de trabalho da SDR ("quais leads abrir primeiro", filtro "sem conversa" na lista)
  — story própria se o Marcos pedir.
- Mudanças na roleta/distribuição (o desenho "todos caem para a SDR" é operação, não código
  desta story).
- `/dashboard/conversas` listar leads sem conversa (a tela é de conversas; o lead entra lá
  naturalmente após a abertura).
- Reformular o `WindowStatusBadge` além do discernimento opcional do item 3.

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Data:** 2026-08-04 · **Modo:** YOLO

### Decisões de implementação

1. **Extração 1:1 (Item 1):** `OpeningTemplateMenu` carrega exatamente o recorte
   `broker-message-input.tsx:75-141` + `:282-336` — mesmas classes, textos e fluxo. Única
   mudança de contrato: `router.refresh()` pós-sucesso virou callback `onSent` (o /broker passa
   `() => router.refresh()`, comportamento idêntico; o drawer passa sucesso+reload próprio).
   O `scrollIntoView` da 75-225 ficou DENTRO do componente: no drawer (`overflow-y-auto`) o
   `block:"nearest"` é inócuo/benéfico, e manter no componente preserva o /broker sem fork.
2. **Props novas do componente:** `idleHint` (o texto "reabrir a conversa" do /broker é o
   default — AC7; o estado sem-conversa passa a variante "iniciar a conversa") e
   `successExtra` (CTA "Ver conversa" do drawer; o /broker não passa nada → sucesso idêntico).
3. **[AUTO-DECISION] "Me avisar" no estado sem-conversa → NÃO aparece.** A story deixou a
   escolha para dev/UX ("secundário ou nem aparece"). Antes da abertura não existe resposta a
   aguardar — oferecer "me avisar quando o lead responder" seria a mesma confusão que a story
   corrige. No caminho janela-fechada (teve conversa) a ordem/textos seguem idênticos (AC7).
4. **Sinal "nunca teve conversa" (ressalva 1 do @po):** helper puro
   `neverHadConversation(messageCount, lastMessageAt)` em `lib/broker/conversation-state.ts`,
   usado pelo `ConversationThread` (lista combinada server+realtime+otimista +
   `localLastMessageAt` — a 1ª mensagem tira o composer do estado sem reload) e pelo drawer
   (mesma query existente, só adicionando `last_message_at` ao select). Prop nova
   `neverHadConversation` no `BrokerMessageInput`.
5. **Gate client-safe (ressalva 2 do @po):** `OPENING_PRIVILEGED_ROLES` movida para
   `lib/whatsapp/opening-roles.ts` (client-safe); `opening-context.ts` re-exporta (consumidores
   server intactos); `start-whatsapp/route.ts:83` trocou o array inline pelo import (única
   mudança de backend). O drawer usa `canShowOpeningMenu(role, isOwner)` do mesmo módulo —
   **dono só vale para `role="broker"`**: perfil `imob` pode ser o responsável do lead no mundo
   imob e o AC5 exige que ele nunca veja o menu.
6. **Resolução de role no drawer:** padrão da TransferBrokerSection/75-205 (JWT pode não ter
   `app_metadata.role`; fonte = `public.users`), buscando `id` público junto (necessário para o
   check de dono contra `lead.broker.id`).
7. **Pós-envio no drawer (gotcha 75-228):** o sucesso vive no estado interno do
   `OpeningTemplateMenu` + flag `openingSent` no drawer que mantém o componente MONTADO após o
   reload (`reloadToken` re-executa o load; `loading` não volta a `true`, então não há unmount
   nem flash de skeleton) — o estado sobrevive ao refresh dos dados.
8. **Item 3 desejável (badge) — feito:** `getWindowStatus(null)` agora rotula
   "Sem conversa · inicie o atendimento" (status segue `closed`); o caso com histórico mantém
   "Janela fechada · aguardando o lead" (testes cobrem os dois). Únicos consumidores do label:
   `WindowStatusBadge` (thread) e nenhum outro (`leads-window.ts` usa só status/remainingMs).
9. **Restrições da sessão paralela (75-266) respeitadas:** zero toque em `lib/constants.ts`,
   `lib/analytics/*`, telas de analytics; zero migration; backend só a linha 83 do
   start-whatsapp (+ import).

### Validações

- `npx tsc --noEmit` (packages/web): **0 erros**.
- ESLint nos 12 arquivos tocados: **0 erros** (2 warnings pré-existentes no drawer —
  `isCTWA`/`handleAddNote` unused — fora do escopo).
- `npx vitest run` (suíte completa): **132 arquivos / 1547 testes passando**, incluindo os
  novos `opening-roles.test.ts` (gate AC5/AC7) e `conversation-state.test.ts` (derivação do
  estado sem-conversa) e o `window-status.test.ts` atualizado.

### Pendências para @qa / runtime

- AC1/AC4 (parte runtime): validar com o login real da Thielly (`sdr`) em prod — envio pelo
  drawer do Kanban e pela aba Conversa; lead aparecendo em `/dashboard/conversas` após a
  abertura (lição 75-188: dev DB ≠ prod).
- Follow-up registrado pelo @po (fora de escopo aqui): aviso ao corretor dono quando um
  privilegiado reabre lead COM conversa.

### File List

| Arquivo | Mudança |
|---|---|
| `packages/web/src/components/leads/opening-template-menu.tsx` | **novo** — menu compartilhado (extração 75-142/75-217/75-225) |
| `packages/web/src/lib/whatsapp/opening-roles.ts` | **novo** — `OPENING_PRIVILEGED_ROLES` client-safe + `canShowOpeningMenu` |
| `packages/web/src/lib/broker/conversation-state.ts` | **novo** — helper puro `neverHadConversation` |
| `packages/web/src/lib/whatsapp/opening-roles.test.ts` | **novo** — testes do gate (AC5/AC7) |
| `packages/web/src/lib/broker/conversation-state.test.ts` | **novo** — testes da derivação |
| `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx` | consome o menu extraído; prop `neverHadConversation` + copy de abertura |
| `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx` | deriva `neverHad` e repassa ao composer |
| `packages/web/src/components/leads/lead-detail-drawer.tsx` | menu de abertura inline (gate por role/dono) + sucesso/CTA "Ver conversa" + reload |
| `packages/web/src/lib/whatsapp/opening-context.ts` | constante movida → re-export do módulo client-safe |
| `packages/web/src/app/api/leads/[id]/start-whatsapp/route.ts` | linha 83: array inline → `OPENING_PRIVILEGED_ROLES` (import) |
| `packages/web/src/lib/broker/window-status.ts` | label do caso `null` → "Sem conversa · inicie o atendimento" (item 3 desejável) |
| `packages/web/src/lib/broker/window-status.test.ts` | asserts dos dois labels (sem conversa × janela fechada) |

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-04 | 0.1 | Story criada a partir da decisão do modelo SDR (04/08) que cancelou a 75-265. Investigação mudou o recorte: o botão JÁ chega ao /dashboard via aba Conversa (reuso 75-155) — o trabalho real é extrair o menu p/ componente compartilhado, plantá-lo no drawer e trocar a copy "aguarde o lead" do estado sem-conversa. Zero migration; restrição de colisão com a 75-266 declarada. | @sm (River) |
| 2026-08-04 | 0.2 | Validação @po: GO 9/10 — Status Draft → Ready. Todas as referências de código conferidas no worktree (cadeia 75-155, recorte da extração, server-only da constante, âncoras do drawer/kanban/imob). Estimativa adicionada (M, ~5 pts — era o único ponto ausente do checklist). Ressalvas ao @dev registradas no parecer: sinal "nunca teve conversa" via prop derivada no ConversationThread; gate do drawer NÃO copiar o array inline de TransferBrokerSection (:1009); descartar worktree da 75-265 antes de tocar start-whatsapp/route.ts; follow-up de aviso ao corretor dono quando privilegiado reabre lead com conversa. | @po (Pax) |
| 2026-08-04 | 0.3 | Implementação @dev: menu extraído p/ `OpeningTemplateMenu` (compartilhado /broker + drawer), constante em módulo client-safe (`opening-roles.ts`) c/ re-export e import na rota (:83), estado "sem conversa" c/ copy de abertura (helper puro + prop no composer; "Me avisar" oculto nesse estado — AUTO-DECISION documentada), menu no drawer gateado por `canShowOpeningMenu` (dono só p/ `broker`; imob nunca) c/ sucesso + CTA "Ver conversa", badge do caso null discernido (item desejável). tsc 0 erros, eslint 0 erros novos, vitest 132/1547 verde (+2 suítes novas). Status Ready → InReview; pendência runtime: validar c/ login da Thielly (AC1/AC4). | @dev (Dex) |
