# Story 75-155 — Conversa do lead no /dashboard permite ENVIAR (paridade com o corretor)

**Status:** Done
**Epic:** Corretor atende WhatsApp pelo sistema ([[project-corretor-whatsapp-atendimento]])
**Relacionado:** 75-139/140 (ícone + botão → conversa), 75-142 (Iniciar atendimento / template `abertura_atendimento_corretor`), 63-5 (extração do `ConversationThread`), 76-4 (rotas privilegiam supervisor/gerente-relacionamento)
**Complexidade:** S (mudança de FRONTEND por PARIDADE — provável 1 arquivo alterado: `app/dashboard/leads/[id]/page.tsx`; sem migration, sem backend novo)

## Contexto
Supervisores (e admin/gerente-comercial) veem **todos** os leads. Ao abrir a conversa de um lead
pelo botão verde **"Conversar no WhatsApp"** (drawer do Pipeline/Leads) ou pelo **ícone verde da
lista**, caem numa aba **"Conversa" SOMENTE-LEITURA** — veem o histórico mas **não têm campo para
responder**. Necessidade real (diretor): habilitar o supervisor **Jonathan** (e demais supervisores)
a **atender/responder** leads por WhatsApp pelo número da empresa, dentro do fluxo que já usam.

### Causa-raiz — assimetria por ROTA (confirmada no código)
O botão "Conversar no WhatsApp" navega para `${leadBasePath}/[id]?tab=conversa`, e `leadBasePath`
depende do perfil (`components/leads/lead-detail-drawer.tsx:192-201`):

| Perfil | leadBasePath | Aba "Conversa" | Campo de envio? |
|---|---|---|---|
| **Corretor** | `/broker/leads/[id]` | renderiza `ConversationThread` com `canSend={CAN_SEND_ROLES.includes(role)}` (`app/broker/leads/[id]/page.tsx:169-189`) | **SIM** (`BrokerMessageInput`) |
| **Supervisor / Admin / Gerente-comercial** | `/dashboard/leads/[id]` | bolhas próprias **SOMENTE-LEITURA** (`app/dashboard/leads/[id]/page.tsx:311-402`), **sem** `BrokerMessageInput` | **NÃO** |

- `CAN_SEND_ROLES = ["broker", "admin", "supervisor", "gerente-comercial"]` (`app/broker/leads/[id]/page.tsx:10`).
  Ou seja, **o mesmo supervisor JÁ pode enviar quando cai em `/broker`** — só não pode em `/dashboard`.
- O **ícone verde da lista** (`components/leads/leads-bulk-table.tsx:147`) também aponta para
  `/dashboard/leads/[id]?tab=conversa` → mesma aba read-only.

### Por que o risco é BAIXO — o backend JÁ autoriza (não cria permissão nova)
- `app/api/leads/[id]/send-message/route.ts:46` e `app/api/leads/[id]/start-whatsapp/route.ts:21`
  tratam `["admin","supervisor","gerente-comercial","gerente-relacionamento"]` como **privilegiados**
  (pulam a checagem de "dono do lead", usam admin client). O supervisor **já é aceito** no servidor.
- A própria página do corretor já lista `supervisor` em `CAN_SEND_ROLES`.
- **Logo, esta story é apenas paridade de FRONTEND**: expor no `/dashboard` o campo de envio que o
  `/broker` já expõe — sem tocar backend, sem exceção por-usuário, sem módulo novo.

### Sinal positivo para o reuso (theme)
A memória [[feedback-theme-convention]] diz que `/broker` é **dark hardcoded** e `/dashboard` é
**light/dark**. Porém, ao inspecionar os componentes do chat do corretor:
- `bubble-styles.ts` (bolhas) usa classes **light + `dark:`** (`bg-orange-100 … dark:bg-orange-900/30`, etc.).
- `broker-message-input.tsx` (composer) também usa **light + `dark:`** (`bg-amber-50 … dark:bg-amber-500/10`,
  `border-gray-200 … dark:border-stone-700`, etc.).

Ou seja, os componentes **já carregam variantes de tema** — o `/broker` renderiza dark porque o
**layout** força dark, não porque os componentes sejam hardcoded. Isso **reduz** (mas não elimina) o
risco de tema ao reusar no `/dashboard`. **Ainda assim é obrigatório conferir o resultado no modo
light** (wrappers/containers de `ConversationThread` — `ChatScrollArea`, `WindowStatusBadge`,
`AiStatusBanner` — podem ter algum fundo pensado só para dark).

## Story
**As a** supervisor (e admin/gerente-comercial) que acompanha todos os leads,
**I want** poder **responder o lead por WhatsApp** direto da aba "Conversa" ao abrir o lead pelo
`/dashboard` (via botão verde do drawer ou ícone verde da lista),
**so that** eu atenda pelo número da empresa dentro do fluxo que já uso — com a **mesma** experiência
que o corretor tem no `/broker`, sem precisar de um login/rota diferente.

## Acceptance Criteria
1. **AC1** — Ao abrir um lead no `/dashboard/leads/[id]` na aba **"Conversa"** (via botão verde
   "Conversar no WhatsApp" do drawer **ou** ícone verde da lista `?tab=conversa`), um usuário
   **supervisor / admin / gerente-comercial** vê o **campo de envio** e consegue **responder** por
   WhatsApp — mesmo comportamento do corretor no `/broker`.
2. **AC2** — O gate de UI usa **a mesma regra de role** do `/broker`
   (`CAN_SEND_ROLES = ["broker","admin","supervisor","gerente-comercial"]`). Perfis **fora** dessa
   lista (ex.: `gerente-relacionamento`, `obras`) **não** veem o campo de envio na aba Conversa do
   `/dashboard` — continuam só com a leitura.
3. **AC3** — O envio usa as **rotas existentes** (`POST /api/leads/[id]/send-message` e, quando a
   janela de 24h está fechada, `POST /api/leads/[id]/start-whatsapp`). **Nenhuma** rota/permissão de
   servidor é criada ou alterada.
4. **AC4** — Se a abordagem de **reuso** do `ConversationThread` for adotada, os recursos que ele já
   traz funcionam no `/dashboard`: status da **janela de 24h**, botão **"Iniciar atendimento"** quando
   a janela está fechada, atualização após envio, mídia e realtime — como no corretor.
5. **AC5** — **Sem regressão na leitura**: o histórico da conversa continua visível na aba
   (mesmas mensagens de hoje: Lead / IA / Equipe), inclusive quando o usuário **não** pode enviar.
6. **AC6** — **Nada muda no `/broker`** (nem em seus componentes/rotas) e **nada muda no backend**.
   As demais abas do `/dashboard/leads/[id]` (Info, Histórico, Resumo IA) ficam inalteradas.
7. **AC7** — **Tema:** a aba Conversa do `/dashboard` respeita **light e dark** (`dark:`), sem
   contraste quebrado no modo light (conferir composer, badges de janela e área de rolagem). Ver
   [[feedback-theme-convention]].
8. **AC8** — **Sem migration** e **sem exceção por-usuário** (`user_permission_exceptions`): a
   liberação é **por paridade de perfil**, reutilizando a regra de role já existente.

## Tasks / Subtasks
- [x] **Task 1 — Escolher a abordagem (reuso × mínima) e mapear props** (AC: 1, 4, 6)
  - [x] **Preferida (REUSO):** substituir o bloco read-only da aba conversa
        (`app/dashboard/leads/[id]/page.tsx:311-402`) por `<ConversationThread .../>`, importando
        `import { ConversationThread } from "@web/app/broker/leads/[id]/_components/conversation-thread"`
        (**sem mover** o componente para outro lugar — mover tocaria o `/broker`, fora de escopo).
  - [x] Confirmar o contrato real de props do `ConversationThread`
        (`app/broker/leads/[id]/_components/conversation-thread.tsx:27-51,67-76`):
        `messages: ThreadMessage[]`, `lead: {id, phone, name}`, `lastMessageAt: Date|null`,
        `isAiActive: boolean`, `isWhatsApp: boolean`, `canSend: boolean`, `notifyOnReply?: boolean`,
        `conversationIds?: string[]`.
  - [x] Avaliar acoplamento: o componente vive sob rota dinâmica `broker/leads/[id]/_components/`.
        Import cross-route via alias `@web` funcionou sem atrito (type-check + build OK) → **REUSO adotado**.
- [x] **Task 2 — (REUSO) Adaptar o carregamento de dados do `/dashboard` às props** (AC: 1, 4, 5)
  - [x] **conversationIds** — `(conversations ?? []).map(c => c.id)` (a página já busca `conversations`, L93-105).
  - [x] **messages (flat, ASC)** — achatar `conversations[].messages` num único array, ordenar por
        `created_at` **ascendente** e cortar em 50 (`.slice(-50)`, cap alinhado ao broker), no
        formato `ThreadMessage` (`id, role, content, created_at, metadata`).
  - [x] **lastMessageAt** — `conversations[0]?.last_message_at` (a página já ordena por
        `last_message_at desc`, L102) → `new Date(...)` ou `null`.
  - [x] **isWhatsApp** — `!String(lead.phone).startsWith("tg:")` (mesmo cálculo do broker, page.tsx:83).
  - [x] **isAiActive** — **adicionado `is_ai_active` ao SELECT de `conversations`** e passado
        `Boolean(conversations[0]?.is_ai_active)`.
  - [x] **notifyOnReply** — `Boolean((lead.metadata as {notify_broker_on_reply?: boolean})?.notify_broker_on_reply)`.
  - [x] **canSend** — `["broker","admin","supervisor","gerente-comercial"].includes(user.role)`
        (reusada a MESMA lista `CAN_SEND_ROLES`; `user.role` via `getServerUser()`).
  - [x] Lista vazia: `ConversationThread` renderiza "Nenhuma mensagem ainda." quando `messages=[]`
        (verificado no componente, L280-284) — não quebra.
- [x] **Task 3 — (ALTERNATIVA MÍNIMA, só se o reuso for arriscado)** — NÃO necessária; reuso viável.
- [x] **Task 4 — Tema light/dark** (AC: 7)
  - [x] Auditados os wrappers do `ConversationThread` (`ChatScrollArea`, `WindowStatusBadge`,
        `AiStatusBanner`, `bubble-styles`, `broker-message-input`): TODOS usam classes light + `dark:`
        (ex.: badge `bg-green-100 text-green-700 dark:...`; banner `bg-green-50/purple-50 dark:...`;
        composer `bg-orange-500`/`border-gray-200 dark:border-stone-700`). Container raiz do thread é
        `bg-white ... dark:bg-stone-900`. Nenhum wrapper com fundo só-dark → sem ajuste necessário.
        Conferência visual final em light fica para o @qa (E2E).
- [x] **Task 5 — Verificação (sem regressão)** (AC: 1-8)
  - [x] Raciocínio de gate (supervisor vê envio / perfil fora da lista só lê) validado por código.
        Verificação E2E real (drawer + lista, janela aberta/fechada) fica para o @qa.
  - [x] `/broker` inalterado (0 arquivos do `/broker` tocados) e backend inalterado (AC6).
  - [x] `npm run type-check` (OK) + `npm run lint` no arquivo (0 erros) + `npm test` (975 passed) + `npm run build` (Compiled successfully) sem regressão.

## Dev Notes
- **Reuso > adaptação > criação** (memória IDS): a 1ª opção é **reusar** `ConversationThread`; só criar
  markup novo se o reuso for inviável. **Não mover** o componente para pasta compartilhada nesta story
  (isso tocaria o `/broker` e sai do escopo / risca regressão — [[feedback-nao-quebrar-o-que-funciona]]).
- **Arquivo provável (único):** `packages/web/src/app/dashboard/leads/[id]/page.tsx` (server component;
  a aba é escolhida por `searchParams.tab`, L31-36; o bloco da conversa está em L311-402). Server
  component pode renderizar client component (`ConversationThread` é `"use client"`) sem problema.
- **Contrato do `ConversationThread`** (broker/…/conversation-thread.tsx:27-51,67-76): o envio é
  **INTERNO** ao `BrokerMessageInput` (POST + `router.refresh()`), sem callback externo — basta passar
  `canSend` e os dados. Ele computa `windowClosed` internamente a partir de `lastMessageAt`/`isWhatsApp`.
- **Diferença de SELECT a corrigir:** o dashboard **não** busca `is_ai_active` em `conversations`
  (L97); o broker busca (L53). Para o banner de IA funcionar, **adicionar `is_ai_active` ao select**.
- **Rotas de envio (inalteradas):** `send-message` (privilegiados em route.ts:46) e `start-whatsapp`
  (route.ts:21) já aceitam `admin/supervisor/gerente-comercial/gerente-relacionamento` como
  privilegiados (admin client, sem checagem de dono). **Não** alterar essas rotas.
- **Ícone/botão de entrada (inalterados):** drawer `components/leads/lead-detail-drawer.tsx:192-201`
  (define `leadBasePath` por role) e lista `components/leads/leads-bulk-table.tsx:147`
  (`/dashboard/leads/[id]?tab=conversa`). **Não** precisa mexer neles — a mudança é dentro da aba.
- **Gate por ROLE, não por módulo:** reusar a lista `CAN_SEND_ROLES` do `/broker`
  (`["broker","admin","supervisor","gerente-comercial"]`). **Não** criar `canAccess(...)`, **não**
  criar exceção por-usuário. `broker` na lista é inócuo no `/dashboard` (corretor não abre `/dashboard/leads`).
- **Tema:** bolhas e composer já têm `dark:` — mas o `/broker` roda dentro de layout dark; validar o
  render no **light** do `/dashboard` (AC7). Se algum wrapper do `ConversationThread` tiver fundo só-dark,
  ajustar via classe no `/dashboard` (sem editar o componente do broker).
- **IMOB:** irrelevante — `/dashboard/leads` é mundo principal; nada a fazer para IMOB.

### Testing
- **Sem testes de página no repo** para essas telas (server components + client chat); verificação é
  **manual/E2E** no fluxo real (mesmo padrão das stories 75-151/75-153, que não adicionaram teste
  unitário). Suíte vitest existente deve permanecer **verde**; `type-check` e `lint` sem novos erros.
- **Cenários-chave:** (1) supervisor envia com janela **aberta**; (2) supervisor com janela **fechada**
  vê "Iniciar atendimento" (se reuso); (3) perfil sem envio só lê; (4) corretor no `/broker` inalterado;
  (5) light e dark sem contraste quebrado.

## Out of Scope
- **Backend / rotas / RLS** — já autorizam supervisor; **não** tocar (`send-message`, `start-whatsapp`).
- **`/broker`** e seus componentes — **não** alterar; **não mover** `ConversationThread`/`BrokerMessageInput`
  para pasta compartilhada nesta story.
- **Regra de "dono do lead"** — inalterada (o servidor já trata privilegiados).
- **Exceção por-usuário** (`user_permission_exceptions`) — decisão é **paridade de perfil**, não exceção.
- **Sub-módulos / `canAccess`** — o gate é por role (paridade), não por módulo ([[project-submodulos-perfil-acesso]]).
- **Ícone da lista / botão do drawer** — já apontam para `?tab=conversa`; não mudam.

## Riscos
- **Acoplamento cross-route** ao importar `ConversationThread` de `broker/leads/[id]/_components/`
  para fora do `/broker`. Mitigação: importar **em placem** (sem mover); se frágil, cair na alternativa
  mínima (Task 3). AC6 garante que o `/broker` não muda.
- **Tema (light)** — algum wrapper do chat pode ter fundo pensado só para dark. Mitigação: Task 4 +
  AC7 (validar light e dark); bolhas/composer já são theme-aware (baixo risco, mas não zero).
- **`is_ai_active` ausente no select do dashboard** → banner de IA quebra/vazio. Mitigação: Task 2
  adiciona `is_ai_active` ao SELECT.
- **Formato/ordenação das mensagens** — dashboard busca aninhado por conversa; `ConversationThread`
  espera lista flat ASC. Mitigação: achatar + ordenar ASC (Task 2). Risco de duplicar/ocultar mensagens
  se a ordenação divergir — validar no cenário real.
- **Perfil errado ganhando envio** — usar **estritamente** `CAN_SEND_ROLES` (AC2); não incluir
  `gerente-relacionamento`/`obras` no gate de UI (embora o backend os aceite, a decisão do diretor é
  liberar supervisores/admin/gerente-comercial por paridade com o `/broker`).

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-14 | 0.1 | Story criada (paridade de FRONTEND: aba "Conversa" do /dashboard passa a permitir ENVIAR para admin/supervisor/gerente-comercial, reusando `ConversationThread`/regra `CAN_SEND_ROLES` do /broker; backend/RLS já autorizam; sem migration, sem exceção por-usuário; alternativa mínima com `BrokerMessageInput`; risco de tema light e de acoplamento cross-route destacados). | @sm (River) |
| 2026-07-14 | 1.2 | Push por @devops (Gage). PR #195 squash-merged em `main` (`abe68278`). Pre-push gate OK (type-check 0 erros, vitest 975 pass, build success). Deploy Vercel de produção disparado pelo merge. Status Review→Done. | @devops (Gage) |
| 2026-07-14 | 1.1 | Implementada por @dev (Dex). Abordagem REUSO: `ConversationThread` importado em place no `/dashboard/leads/[id]` aba Conversa, gate por `CAN_SEND_ROLES`, `is_ai_active` adicionado ao SELECT, mensagens achatadas ASC (cap 50), bloco `brokerNames` read-only removido. 1 arquivo alterado (`app/dashboard/leads/[id]/page.tsx`), sem tocar `/broker`/backend/migration. type-check OK, lint 0, 975 testes verdes, build OK. Status Ready→Review. | @dev (Dex) |
| 2026-07-14 | 1.0 | Validada por @po (10/10, GO). Todas as referências arquivo:linha conferidas contra o código real (drawer L192-201; broker page L10/53/83/169-189; conversation-thread props L27-51/67-76; dashboard read-only L311-402 + select conversations L93-105 SEM `is_ai_active`; bulk-table L147; send-message route L46 + start-whatsapp route L21 já tratam supervisor como privilegiado). Backend inalterado confirmado. Article IV OK (nada inventado). Status Draft→Ready. | @po (Pax) |

## Dev Agent Record
### Agent Model Used
claude-opus-4-8[1m] (Dex / @dev)

### Debug Log References
- `npm run type-check` → OK (tsc --noEmit, 0 erros).
- `npx eslint src/app/dashboard/leads/[id]/page.tsx` → EXIT 0 (0 erros/0 warnings no arquivo tocado).
- `npm test` (vitest, raiz do monorepo) → **89 test files / 975 tests passed** (sem regressão).
- `npm run build` (next build) → **Compiled successfully in 16.9s**, rota `/dashboard/leads/[id]` gerada
  sem erro de fronteira server/client (server component importando client `ConversationThread` — OK).

### Completion Notes
**Decisão: REUSO (abordagem preferida da story).** O `ConversationThread` do `/broker` foi importado
EM PLACE via alias `@web/app/broker/leads/[id]/_components/conversation-thread` (sem mover o componente —
mover tocaria o `/broker`, fora de escopo). O import cross-route por alias compilou sem atrito
(type-check + build verdes), então a Alternativa Mínima (Task 3, só `BrokerMessageInput`) foi
descartada — o reuso ainda entrega a paridade completa da AC4 (badge de janela 24h, botão
"Iniciar atendimento" quando a janela fecha, realtime, mídia).

**Mudanças no `page.tsx` do dashboard (único arquivo alterado):**
1. Imports de `ConversationThread` e do type `ThreadMessage`; constante `CAN_SEND_ROLES`
   (mesma lista do `/broker`).
2. `is_ai_active` adicionado ao SELECT de `conversations` (antes ausente → banner de IA funcionaria vazio).
3. Bloco de resolução `brokerNames` (usado só na renderização read-only antiga) **removido** — ficaria
   como variável não usada (lint) após a troca; o `ConversationThread` rotula `broker` como "Você"
   via `getBubbleStyle`, não precisa dos nomes.
4. Derivação das props: `threadMessages` (flat das mensagens aninhadas + sort ASC + `.slice(-50)`),
   `conversationIds`, `conversaLastMessageAt`, `conversaIsWhatsApp`, `conversaIsAiActive`,
   `conversaNotifyOnReply`, `canSendConversa`.
5. Aba "Conversa" agora renderiza `<ConversationThread .../>` (sem o card wrapper extra, pois o próprio
   componente já traz `bg-white dark:bg-stone-900` + padding — igual ao `/broker`).

**Gate de perfis sem envio (AC2/AC5):** `canSend={canSendConversa}` onde
`canSendConversa = CAN_SEND_ROLES.includes(user.role)`. No `ConversationThread`, o `BrokerMessageInput`
só é renderizado dentro de `{canSend && (...)}` (L286). Logo, perfis fora de
`["broker","admin","supervisor","gerente-comercial"]` (ex.: `gerente-relacionamento`, `obras`) recebem
`canSend=false` → **nenhum** composer é montado, permanecendo só-leitura. O histórico (bolhas) é sempre
renderizado, independente de `canSend` (AC5).

**Tema (AC7):** todos os wrappers do thread são theme-aware (light + `dark:`) — auditados um a um; nenhum
com fundo pensado só para dark. Nenhum ajuste de classe foi necessário. Conferência visual final em
light delegada ao @qa (E2E).

**Não tocados (AC6):** nada em `/broker`, nenhuma rota de API, nenhuma migration, nenhuma regra de
dono do lead. Backend `send-message`/`start-whatsapp` já tratam supervisor/admin/gerente-comercial como
privilegiados — a mudança é 100% de frontend por paridade.

### File List
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` (modificado)

## QA Results

### Review Date: 2026-07-14
### Reviewed By: Quinn (Test Architect)
### Branch/Commit: `fix/75-155-conversa-dashboard-enviar` @ `2c77382f`

**Escopo real conferido:** diff `main...fix/75-155-conversa-dashboard-enviar` toca **apenas 2 arquivos**
— a própria story (novo) e `packages/web/src/app/dashboard/leads/[id]/page.tsx`. **Zero** arquivos em
`/broker`, **zero** rotas de API, **zero** migration → AC6/AC8 confirmados pelo próprio diff-stat.

**Traceability AC→código (7 checks):**

| # | Check | Veredito | Evidência |
|---|-------|----------|-----------|
| 1 | Code review | **PASS** | REUSO limpo do `ConversationThread` em place; props derivadas espelham 1:1 o `/broker` (messages flat+ASC cap 50, lastMessageAt, isAiActive, isWhatsApp, conversationIds, notifyOnReply, canSend). Bloco `brokerNames` removido sem sobras (grep=0). |
| 2 | Unit tests | **PASS** | Sem teste novo (server component + client chat, mesmo padrão 75-151/153). Suíte existente **89 files / 975 tests PASS**, sem regressão. |
| 3 | Acceptance criteria | **PASS** | AC1-AC8 rastreados (ver gate). Gate de UI `canSend = CAN_SEND_ROLES.includes(user.role)`; composer só monta dentro de `{canSend && ...}` (`conversation-thread.tsx:286`); bolhas renderizam sempre (AC5). `is_ai_active` de fato adicionado ao SELECT de `conversations`. |
| 4 | No regressions | **PASS** | `/broker` 0 arquivos; SELECT de `conversations` só **adiciona** `is_ai_active` (aditivo, não quebra info/timeline/resumo); sub-select de `messages` inalterado; cap 20/conversa era pré-existente. |
| 5 | Performance | **PASS** | Removida a busca de `brokerNames` em `users` → **1 round-trip a menos**. Cap de 50 msgs client-side. |
| 6 | Security | **PASS** | Nenhuma permissão nova; gate por role no frontend; backend (`send-message`/`start-whatsapp`) já tratava supervisor/admin/gerente-comercial como privilegiado. Sem exceção por-usuário. |
| 7 | Documentation | **PASS** | Story com Dev Agent Record completo + gate file. |

**Fronteira server/client:** OK. Props passadas do server para o client `ConversationThread` são todas
serializáveis — `messages` (objetos planos), `lead` (objeto plano), `lastMessageAt` (`Date`, já usado pelo
`/broker`, RSC-serializável), booleans e `string[]`. **Nenhuma função** passada como prop. type-check confirma
o import cross-route por alias `@web`.

**Tema (AC7) — auditoria estática:** `bubble-styles`, `window-status-badge`, `ai-status-banner`,
`chat-scroll-area`, `broker-message-input` e o container raiz do thread (`bg-white ... dark:bg-stone-900`)
**todos** têm variante light + `dark:`. Nenhuma classe com fundo/texto só-dark. Sem ajuste necessário.

**Build/qualidade:** `npm run type-check` → **0 erros**. `npm test` (raiz) → **975 passed / 89 files**.

**Observação cosmética (não bloqueante):** `ThreadMessage` foi importado de `conversation-thread-merge`
(fonte real do type, re-exportado pelo `conversation-thread`) — diverge apenas do texto da Task 1 da story;
type-check valida o path correto.

**A conferir manualmente em prod (E2E, sem browser no ambiente de QA — NÃO bloqueia):**
1. AC7 visual em **LIGHT**: contraste do composer/badge/banner/bolhas na aba Conversa do `/dashboard`.
2. AC1/AC4: supervisor envia com janela **aberta** (grava + aparece) e, com janela **fechada**, vê
   "Iniciar atendimento"/"me avisar quando responder".
3. AC2 negativo: perfil `gerente-relacionamento`/`obras` **não** vê o campo de envio (só leitura).
4. Layout: altura `h-[calc(100dvh-8rem)]/lg:h-[34rem]` herdada do `/broker` no `/dashboard` (header/sidebar
   diferentes) — cosmético, baixo risco.
5. Realtime p/ supervisor depende da RLS de select do perfil; se não chegar em tempo real, o
   `router.refresh()` pós-envio cobre. Baixo risco.

### Gate Status

Gate: PASS → docs/qa/gates/75-155-conversa-lead-dashboard-permite-enviar.yml

— Quinn, guardião da qualidade 🛡️
