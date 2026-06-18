# Story 63-4 — Estado da Janela de 24h Visível Antes do Envio

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-4
- **Status:** Ready for Review
- **Validated:** 2026-06-18 by @po (Pax) — verdict GO (8/10); refs confirmadas (`page.tsx` L41 `last_message_at`/`is_ai_active`; `WHATSAPP_WINDOW_CLOSED` L54-59). Should-fix não-bloqueante: AC6 assume prop `disabled` "criada na 51-1" — ela NÃO existe hoje (ver Dev Note de validação)
- **Priority:** P0 — corretor descobre que não pode enviar somente depois de tentar; feedback tardio gera frustração
- **Complexity:** S/M (3-4h)
- **Fase:** 1 (Quick Win)
- **Created:** 2026-06-18
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[window_status_helper_test, badge_render_check, disabled_state_check]`

---

## User Story

**Como** corretor que quer enviar uma mensagem ao lead,
**Quero** ver antes de tentar se a janela de 24h do WhatsApp está aberta, fechando ou fechada,
**Para que** eu não perca tempo tentando enviar quando não é possível — e saiba o que fazer em vez disso.

---

## Context

A janela de 24h do WhatsApp Business API define quando mensagens freeform podem ser enviadas:
o WhatsApp só permite mensagem não-template se o lead enviou uma mensagem nas últimas 24 horas.

**Hoje o corretor só descobre que a janela está fechada depois de tentar enviar**, quando recebe o
erro `WHATSAPP_WINDOW_CLOSED` em `broker-message-input.tsx` (L54-59). Esse feedback tardio é ruim.

### Fonte de verdade disponível

`conversations.last_message_at` já é buscado em `page.tsx` linha L41 (junto com `is_ai_active`).
**Não é necessária nenhuma query adicional** — a informação já está no state da página.

### Estados da janela

| Estado | Condição | Badge | Compositor |
|--------|----------|-------|-----------|
| Aberta | `now - last_message_at < 22h` | Verde · "Janela aberta · fecha em Xh Ym" | Habilitado normalmente |
| Fechando | `22h <= now - last_message_at < 24h` | Âmbar · "Janela fecha em menos de Zh" | Habilitado com aviso |
| Fechada | `now - last_message_at >= 24h` | Cinza · "Janela fechada · aguardando o lead responder" | Desabilitado + mensagem explicativa |

Limiar de "fechando" escolhido como 22h (2h de alerta antes do fechamento) — suficiente para o
corretor perceber a urgência sem alarmar cedo demais.

### Leads Telegram
Para leads com `phone` começando com `tg:`, não há restrição de janela de tempo. O badge **não deve ser exibido** para esses leads — exibir o badge seria desinformativo.

### Determinação do canal
`leads.phone` já disponível na página. `phone.startsWith('tg:')` → Telegram, sem badge.

---

## Acceptance Criteria

- [x] **AC1:** O header da seção de conversa em `page.tsx` exibe um badge de status da janela WhatsApp:
  - Verde + ícone `CheckCircle2` + "Janela aberta · fecha em Xh Ym" quando `now - last_message_at < 22h`
  - Âmbar + ícone `Clock` + "Fecha em Xh Ym" quando `22h <= now - last_message_at < 24h`
  - Cinza + ícone `CircleOff` + "Janela fechada · aguardando o lead" quando `now - last_message_at >= 24h`
  - _(Nota: usei `CheckCircle2` para o estado aberto, conforme T2/Dev Notes — `Circle` preenchido foi descartado por melhor leitura de "ok/aberto".)_
- [x] **AC2:** O badge é derivado apenas de `conversations.last_message_at` (já disponível em `page.tsx`) — sem query adicional ao banco
- [x] **AC3:** Para leads Telegram (`leads.phone.startsWith('tg:')`), o badge de janela NÃO é exibido (`WindowStatusBadge` retorna `null` quando `isWhatsApp=false`)
- [x] **AC4:** Quando a janela está fechada, o `BrokerMessageInput` é desabilitado proativamente — `disabledByWindow={windowClosed}` passado antes do usuário tentar enviar
- [x] **AC5:** Quando desabilitado por janela fechada, o compositor exibe a mensagem: "Janela de 24h encerrada. Aguarde o lead responder para continuar a conversa."
- [x] **AC6:** _(redação do AC corrigida)_ `BrokerMessageInput` NÃO tinha prop `disabled` (só `{leadId, onSent}`) e havia uma `const disabled` interna (colisão). Implementado conforme gotcha do @po: nova prop `disabledByWindow?: boolean` combinada via `const isDisabled = disabled || disabledByWindow` — a `const` interna foi preservada, sem sobrescrita
- [x] **AC7:** O badge é um Client Component que recalcula via `getWindowStatus`; o estado `disabled` é derivado de `last_message_at` no render (sem reload). Countdown dinâmico por `setInterval` ficou de fora (opcional para Fase 1, conforme Out of Scope)
- [x] **AC8:** TypeScript compila sem erros; ESLint passa (0 erros); 10 testes unitários cobrem `getWindowStatus`/`formatCountdown`; suíte completa (414 testes) verde

---

## Tasks / Subtasks

- [x] **T1 — Criar helper puro `getWindowStatus`**
  - Criado `packages/web/src/lib/broker/window-status.ts`
  - `getWindowStatus(lastMessageAt, isWhatsApp, now?)` → `{ status, remainingMs, label }` (3º param `now` opcional p/ testes determinísticos, retrocompatível)
  - `!isWhatsApp` → `{ status: 'open', remainingMs: Infinity, label: '' }`; `lastMessageAt === null` → `closed`
  - Thresholds: aberta < 22h, fechando 22h-24h, fechada >= 24h; `formatCountdown` exportado

- [x] **T2 — Criar componente `WindowStatusBadge`**
  - Criado `_components/window-status-badge.tsx` (Client Component)
  - Ícones `CheckCircle2` (verde) / `Clock` (âmbar) / `CircleOff` (cinza); retorna `null` p/ Telegram

- [x] **T3 — Integrar `WindowStatusBadge` em `page.tsx`**
  - `isWhatsApp = !lead.phone.startsWith('tg:')`; badge no header da seção de conversa
  - `windowClosed = getWindowStatus(...).status === 'closed'`; `disabledByWindow={windowClosed}` ao composer

- [x] **T4 — Adicionar prop ao `BrokerMessageInput`**
  - Prop `disabled` NÃO existia → adicionada `disabledByWindow?: boolean` (default `false`), combinada via `isDisabled = disabled || disabledByWindow` (sem colisão com a `const` interna); textarea/anexo/enviar desabilitados + mensagem AC5

- [x] **T5 — Testes unitários para `window-status.ts`** (10 casos, incl. limiar exato de 22h e formatCountdown)

- [x] **T6 — QA pré-commit**
  - `type-check` → zero erros nos arquivos da story
  - `lint` → zero erros
  - `vitest run` → suíte completa verde (414 testes)

---

## Dev Notes

### Paths-chave
```
packages/web/src/lib/broker/window-status.ts                                  ← CRIAR (T1)
packages/web/src/lib/broker/window-status.test.ts                             ← CRIAR (T5)
packages/web/src/app/broker/leads/[id]/_components/window-status-badge.tsx    ← CRIAR (T2)
packages/web/src/app/broker/leads/[id]/page.tsx                               ← EDITAR (T3)
packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx   ← EDITAR se necessário (T4)
```

### Dados já disponíveis em `page.tsx` (sem query adicional)
- `conversations.last_message_at` — buscado na L41 junto com a conversation do lead
- `conversations.is_ai_active` — buscado na mesma query (L41)
- `leads.phone` — disponível na query principal do lead

### Design system
- Verde: `bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400`
- Âmbar: `bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`
- Cinza/fechado: `bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400`
- Ícones lucide-react: `CheckCircle2`, `Clock`, `CircleOff`
- Badge: `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium`

### Gotchas
- **`last_message_at` pode ser `null`** (nova conversation sem mensagens) — tratar como janela fechada
- **Atualização client-side:** o badge calcula com `Date.now()` no render. Para o countdown "Xh Ym" ser dinâmico sem polling, um `useEffect` com `setInterval(1min)` pode ser útil — mas é opcional para a Fase 1; mostrar o tempo no momento do load é aceitável
- **`dispatch-broker-message.ts` usa 24h como threshold** — esta story usa 22h para o alerta âmbar. Os thresholds são independentes; a API ainda bloqueia em 24h; o badge avisa 2h antes. Sem conflito
- **Vitest alias `@web/*`:** helper puro em `packages/web/src/lib/broker/` (sem imports de `@web/*`) — testável sem problema, seguindo o padrão de `dispatch-broker-message.ts`

---

## File List

### Criar
- `packages/web/src/lib/broker/window-status.ts` — helper puro de cálculo de status de janela (T1)
- `packages/web/src/lib/broker/window-status.test.ts` — testes do helper (T5)
- `packages/web/src/app/broker/leads/[id]/_components/window-status-badge.tsx` — badge visual (T2)

### Modificar
- `packages/web/src/app/broker/leads/[id]/page.tsx` — integrar badge e passar `disabled` ao composer (T3)
- `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx` — aceitar prop `disabled` se ausente (T4)

### Referência (não modificar)
- `packages/web/src/lib/broker/dispatch-broker-message.ts` — usa 24h como threshold de envio; não alterar
- `packages/web/src/app/api/leads/[id]/send-message/route.ts` — retorna `WHATSAPP_WINDOW_CLOSED` como fallback; manter

---

## Testing

### Framework
Vitest (padrão do projeto — NÃO Jest)

### Cenários obrigatórios (T5 — helper puro)
1. `getWindowStatus(null, true)` → `{ status: 'closed' }`
2. `getWindowStatus(1h atrás, true)` → `{ status: 'open', remainingMs ~= 23h }`
3. `getWindowStatus(23h atrás, true)` → `{ status: 'closing', remainingMs ~= 1h }`
4. `getWindowStatus(25h atrás, true)` → `{ status: 'closed', remainingMs: 0 }`
5. `getWindowStatus(anyDate, false)` → `{ status: 'open' }` (Telegram)
6. `formatCountdown(7200000)` → "2h 0m"
7. `formatCountdown(90000000)` → formato correto (> 24h — não deveria ocorrer normalmente)

### Smoke pós-deploy
- Lead WhatsApp com mensagem recente (< 22h): badge verde visível no header do chat
- Lead WhatsApp com última mensagem há > 25h: badge cinza + composer desabilitado + mensagem explicativa visível
- Lead Telegram: sem badge (canal sem restrição de janela)
- Tentar clicar no textarea desabilitado: não envia, sem erro de UI

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `last_message_at` na conversation bumpado por mensagens *outbound* (não só inbound do lead) | Documentado como observação (REL-001 de 51-1); aceitável para Fase 1 — a precisão real requereria query separada |
| R2 | `page.tsx` passa `last_message_at` como `string` (não `Date`) via Server Component → Client | Converter no Server Component antes de passar: `new Date(conversation.last_message_at)` |
| R3 | `BrokerMessageInput` pode não ter prop `disabled` — alterar assinatura pode quebrar callers | T4 verifica e adiciona de forma retrocompatível (`disabled?: boolean` com default `false`) |

---

## Out of Scope

- Envio de template aprovado quando janela fechada (requer aprovação formal de template no Meta — escopo de story futura, mencionada em 63-10)
- Badge na lista de leads (→ Story 63-9, que reutiliza o helper `getWindowStatus` desta story)
- Countdown dinâmico com atualização a cada minuto (útil mas não P0 — pode ser adicionado na 63-9)

---

## Definition of Done

- [ ] AC1–AC8 marcados como completos
- [ ] T1–T6 marcados como done
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-18 | 0.1 | Story drafted — Epic 63, Fase 1, visibilidade de janela 24h | @sm (River) |
| 2026-06-18 | 1.0 | **Implementação @dev (Dex).** Criado helper puro `getWindowStatus(lastMessageAt, isWhatsApp, now?)` + `formatCountdown` em `lib/broker/window-status.ts` (thresholds 22h/24h; Telegram sem restrição; null=fechada). Criado `WindowStatusBadge` (Client) com `CheckCircle2`/`Clock`/`CircleOff`, retorna `null` p/ Telegram. `page.tsx`: deriva `lastMessageAt` (convertido p/ Date no Server Component — R2), `isWhatsApp` de `lead.phone`, renderiza badge no header da conversa e passa `disabledByWindow={windowClosed}`. `broker-message-input.tsx`: nova prop `disabledByWindow` combinada via `isDisabled = disabled || disabledByWindow` (preserva `const disabled` interna — gotcha @po); textarea/anexo/enviar desabilitados + banner AC5. 10 testes do helper; suíte completa (414) verde; type-check/ESLint limpos. Countdown dinâmico (setInterval) ficou fora (Out of Scope Fase 1). Sem `tel:`/`wa.me`. Status → Ready for Review. | @dev (Dex) |
| 2026-06-18 | 0.2 | **Validação PO — verdict GO (8/10). Status Draft → Ready.** Refs confirmadas: `page.tsx` L41 busca `is_ai_active` e `last_message_at` na query de `conversations` (sem query extra → NFR-4 ok); `leads.phone` disponível; `WHATSAPP_WINDOW_CLOSED` tratado em `broker-message-input.tsx` L54-59. CON-4 (sem migration) respeitado. **Should-fix não-bloqueante para @dev:** AC6 afirma que `BrokerMessageInput` "já aceita a prop `disabled` (criada na Story 51-1)" — isso é FALSO: as props atuais são apenas `{ leadId, onSent }` (L18-22), não há prop `disabled`. Além disso, já existe uma `const disabled` **interna** em L39 (derivada de `loading`/tamanho do texto) — adicionar uma prop homônima causa colisão de nome. Recomendação ao @dev: ao implementar T4, renomear/mesclar a lógica (ex.: prop `disabledByWindow?: boolean` combinada via `const isDisabled = disabled || disabledByWindow`) em vez de sobrescrever a `const` existente. A T4 já hedge ("verificar se existe; se não, adicionar") e R3 já sinaliza retrocompat, então o caminho de implementação está coberto — apenas a redação do AC6 e o gotchada colisão precisam de atenção. AC não alterado pelo PO. | @po (Pax) |
