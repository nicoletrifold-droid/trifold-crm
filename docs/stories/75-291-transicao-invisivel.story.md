# Story 75-291 — A mensagem que a Nicole não entregou também precisa aparecer

**Story ID:** 75-291
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** P/M (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** bug fix — fecha a **dívida C-2** deixada explícita pela 75-289

---

## Story

Como **corretor/gestor lendo a conversa**, quero ver quando uma mensagem **automática** (transição
ou follow-up da Nicole) **não chegou ao lead** — hoje ela aparece na conversa como se tivesse sido
entregue, exatamente o problema que a 75-289 consertou só para a mensagem do corretor.

---

## Context

A 75-289 (#387/#388) fez a bolha do **corretor** parar de mentir "Enviado". A própria story
registrou a dívida **C-2**: a mensagem de **transição** (`role='assistant'`, Story 51-2) tem o
mesmo buraco e ficou de fora. O Marcos pediu em 11/08 para fechar.

Levantamento no código (11/08) mostrou que o buraco é **maior que a C-2 escrita** — e, ao mesmo
tempo, **mais barato de fechar**, porque o dado já está gravado:

| Mensagem | Sinal JÁ gravado hoje | Onde nasce | Aparece? |
|---|---|---|---|
| Corretor | `metadata.send_error` (string) | `send-message/route.ts:292` | ✅ 75-289 |
| **Transição** (51-2) | `metadata.send_error` (string) | `send-message/route.ts:225` | ❌ |
| **Follow-up da Nicole** | `metadata.sent: false` (boolean) | `cron/followup/route.ts:361` | ❌ |
| **Pós-visita da Nicole** | `metadata.sent: false` (boolean) | `cron/followup/route.ts:560` | ❌ |

🔑 **Isto NÃO é uma 75-188.** Lá a porta era linda e o banco estava vazio; aqui o banco tem o
sinal nas 3 linhas e quem está cego é o `resolveDeliveryStatus`, que corta tudo logo na entrada:
`if (msg.role !== "broker") return "none"`.

⚠️ **Dois formatos diferentes para a mesma verdade** (`send_error` string × `sent: false`
booleano) — a story precisa ler os dois **sem** inventar um terceiro nem migrar dado.

### Decisão de desenho — mostrar sempre, reenviar só o que faz sentido

| Mensagem | Mostra "Não entregue" | Oferece reenviar |
|---|---|---|
| Transição | ✅ | ✅ — nasce de uma ação do corretor, o texto é da hora |
| Follow-up / pós-visita | ✅ | ❌ — texto automático de dias atrás; reenviar hoje pode chegar fora de contexto |

## Escopo

**IN:** o helper `resolveDeliveryStatus` + a rota de reenvio + a thread do lead no `/broker`.
**OUT:** as outras 3 telas que renderizam conversa (`/broker/chat`, `/dashboard/conversas`,
`components/agent/agent-chat-panel`) **não mostram indicador nenhum** hoje, nem para o corretor —
é dívida da 75-289, não desta story. Registrar, medir, decidir depois
(ver [[feedback-anotacao-backlog-e-hipotese]]).

---

## Acceptance Criteria

- [x] **AC1 — transição não entregue aparece.** Mensagem `role='assistant'` com
      `metadata.is_transition` e `metadata.send_error` → estado `failed` (ou `window_closed`
      quando o erro for `WHATSAPP_WINDOW_CLOSED`), com o mesmo rótulo "Não entregue" da 75-289.
- [x] **AC2 — follow-up/pós-visita não entregue aparece.** Mensagem `role='assistant'` com
      `metadata.sent === false` → estado `failed`, **sem** botão de reenviar (`canResend: false`),
      com hint dizendo que a Nicole não conseguiu entregar.
- [x] **AC3 — mensagem boa continua muda.** `assistant` sem sinal de falha (`sent: true`, ou
      metadata sem as chaves — caso das mensagens antigas) → `none`, exatamente como hoje. Zero
      bolha nova em conversa que está certa.
- [x] **AC4 — reenvio aceita a transição.** `POST /api/leads/[id]/messages/[messageId]/resend`
      (guard atual: `msg.role !== "broker"` → 409) passa a aceitar `assistant` **com
      `is_transition`**; segue recusando follow-up/pós-visita com 409 `NOT_RESENDABLE`.
- [x] **AC5 — corretor não regride.** Todo o comportamento da 75-289 intacto (a suíte
      `delivery-status.test.ts` existente continua verde sem edição).
- [x] **AC6 — testes.** Casos novos no helper (transição failed · transição window_closed ·
      follow-up failed sem resend · `sent: true` = none · assistant antigo sem chave = none) e na
      rota (transição 200 · follow-up 409).

---

## Tasks

- [x] `delivery-status.ts`: reconhecer `assistant` (transição por `send_error`, Nicole por `sent === false`)
- [x] `resend/route.ts`: guard aceita transição; recusa o resto **+ reenvia SEM assinatura**
- [x] `conversation-thread.tsx`: **nenhuma mudança necessária** — a thread já chama o helper para
      TODA bolha (`conversation-thread.tsx:358`), então mudar o helper acendeu a bolha da Nicole sozinho
- [x] Testes + lint + typecheck
- [ ] Smoke pós-deploy: achar em prod uma mensagem com `sent: false` e conferir a bolha

## Dev Notes

1. **Não migrar dado.** Ler os dois formatos; criar um terceiro (ou backfill) é escopo que
   ninguém pediu e que quebra o histórico.
2. **`window_closed` já existe** no helper e vale para a transição — a janela de 24h fechada é
   o motivo mais provável de falha da transição, e nesse caso reenviar texto livre NÃO resolve
   (o caminho é template de abertura).
3. 🔴 **Observação fora do escopo, para o Marcos decidir depois:**
   `lib/appointments/visit-feedback-core.ts:173` insere a mensagem pós-visita da Nicole na
   conversa **sem nenhum dispatch** para o WhatsApp visível nesse caminho (o envio de verdade
   parece só existir no cron). Se for isso mesmo, existe mensagem nascendo "entregue" que nunca
   saiu — outra falha silenciosa, de natureza diferente desta story. **Medir antes de mexer.**

## File List

- `packages/web/src/app/broker/leads/[id]/_components/delivery-status.ts` (reconhece assistant)
- `packages/web/src/app/broker/leads/[id]/_components/delivery-status.test.ts` (+6 casos; os 6 antigos intactos)
- `packages/web/src/app/api/leads/[id]/messages/[messageId]/resend/route.ts` (guard + sem assinatura na transição)
- `packages/web/src/app/api/leads/[id]/messages/[messageId]/resend/route.test.ts` (novo — 4 casos)
- `docs/stories/75-291-transicao-invisivel.story.md`

## QA Results (@qa)

**Gate: CONCERNS** — implementação e testes em ordem; falta ver rodando (e o dado de prod é raro).

| Check | Resultado |
|---|---|
| Testes | 171 arquivos / **2152 verdes** (7 expected fail pré-existentes); 10 novos |
| Typecheck / build | limpos (`next build` compila) |
| Lint | baseline: 0 erros / 24 avisos, nenhum nos arquivos novos |
| AC | 6/6 no código |
| Regressão | as 6 asserções antigas do helper seguem verdes **sem edição** — inclusive a que exige `none` para `assistant` com `send_error` (ela não tem `is_transition`) |

### Achado do gate, corrigido antes de fechar

- **[medium — entregaria texto ERRADO ao lead]** o reenvio aplica `buildSignedMessage()`, mas a
  transição sai **sem assinatura** no envio original (`send-message`). Reenviar assinando faria o
  lead receber "…— Odair" numa mensagem que o CRM mostra sem assinatura. Corrigido: transição
  reenvia o `content` cru, e há teste fixando os dois comportamentos (transição crua × corretor
  assinado).
- **[low — layout]** ao dar piso ao nome (75-292), o ✕ passaria a ser o primeiro a quebrar para a
  2ª linha (é o último do grupo). Tirei o fechar do grupo que quebra.

### O que este gate NÃO prova

- Nada visto rodando. Pior: o caso feliz **é raro por natureza** — precisa de uma mensagem
  automática que falhou. Sugestão de smoke barato: procurar em prod
  `messages.metadata->>'sent' = 'false'` ou `is_transition` + `send_error` e abrir aquele lead.
### 📊 Medido em PROD (11/08, read-only via Management API)

| Caso | Linhas | Observação |
|---|---|---|
| Transição com `send_error` | **7** (de 121 transições, ~6%) | **7/7 = `WHATSAPP_WINDOW_CLOSED`**; última 17/07 |
| Follow-up/pós-visita com `sent:false` | **0** | nunca ocorreu |
| Corretor com `send_error` | 1 | resquício do incidente de 10/08 |

Três consequências honestas dessa medição:

1. ✅ **A premissa se confirma:** existem 7 transições que o CRM mostra como entregues e o lead
   nunca recebeu. O ganho é real — e é a **bolha + o hint** ("use uma mensagem de abertura
   aprovada"), que é o único caminho que funciona com janela fechada.
2. ⚠️ **O reenviar da transição (AC4) não exercita NENHUM caso de prod hoje:** `window_closed`
   devolve `canResend: false`. É código defensivo para uma falha de infra (401/500) que ainda não
   aconteceu nessa mensagem. Correto manter, mas não é o valor da story.
3. ⚠️ **O branch do follow-up (`sent:false`) está com 0 linhas em prod.** O cron **não persiste**
   a mensagem quando a janela fecha (`if (!skipped)`), então esse caminho só acende em falha de
   infra. Também defensivo — e por isso o smoke visual dele é **impossível** hoje sem forjar dado.

**Frequência:** 7 casos em ~5 meses, nenhum desde 17/07. É um buraco real, mas raro — bem menos
agudo do que o incidente do token de 10/08 sugeria.

## Change Log

- 2026-08-11 — @sm: criada a pedido do Marcos (fechar a dívida C-2 da 75-289). O levantamento
  mostrou 3 casos cegos, não 1 — e os 3 já têm sinal gravado no banco.
