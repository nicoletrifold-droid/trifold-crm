# Story 63-13 — Handoff Explícito ao Responder + Reativação Automática da Nicole em 24h

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-13
- **Status:** Ready for Review
- **Priority:** P0 — hoje a Nicole continua respondendo mesmo quando o corretor assumiu o atendimento (is_ai_active=true é permanente)
- **Complexity:** M (4-6h)
- **Fase:** 5 (Controle de Handoff IA↔Corretor)
- **Created:** 2026-06-21
- **Author:** @sm (River)
- **Validated:** 2026-06-21 by @po (Pax) — verdict GO (9/10). Decisão X=24h confirmada. Fix aplicado: smoke da GR-8 promovido a gate pré-push (não pós-deploy) + recomendação de admin client no UPDATE de handoff (evitar falha silenciosa por RLS).

> **DECISÃO DE PRODUTO RESOLVIDA (@po, 2026-06-21):** ✅ **X=24h** confirmado como janela de reativação automática — alinhado a `BROKER_WINDOW_MS` (`broker-takeover-status.ts` L29), `getWindowStatus` (63-4) e ao gate `brokerSentRecently` (63-8/63-12). ✅ **handoff_reason='broker_reply'** aceito (auditoria; `handoff_reason text` sem CHECK constraint — confirmado em `001_base_schema.sql` L160). Story liberada para @dev.

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[webhook_regression_check, handoff_integration_check, reativacao_24h_smoke]`
- **Depende de:** Epic 51 Done (`send-message/route.ts`, `webhook/whatsapp/route.ts` existentes); Story 63-8 Done (`broker-takeover-status.ts`, `ai-status-banner.tsx` existentes)
- **Bloqueia:** Story 63-14 (botão "Devolver para Nicole" depende de `is_ai_active` ser explicitamente false)
- **Pode ir em paralelo com:** nada na Fase 5 — 63-14 é sequencial após 63-13

---

## User Story

**Como** sistema de atendimento da Trifold,
**Quero** que `conversations.is_ai_active` reflita com fidelidade se o corretor está ou não no atendimento — false quando o corretor responde, true quando o corretor some por 24h,
**Para que** a Nicole pare de responder imediatamente quando o corretor assume, e reassuma automaticamente quando ele deixa o lead sem resposta por 24h.

---

## Context

### O Problema Atual

O campo `conversations.is_ai_active` tem valor `true` permanentemente para a esmagadora maioria dos leads, mesmo quando o corretor enviou mensagens. O único mecanismo que pausava a Nicole era o cron de follow-up detectando `brokerSentRecently` — mas o CRON de follow-up controla envio de mensagens automáticas, não a Nicole respondendo ao lead.

O resultado real em produção: quando o lead responde após o corretor ter mandado uma mensagem, o webhook checa `if (conversation!.is_ai_active)` em `route.ts` L612 — e como `is_ai_active=true`, a **Nicole responde junto com o corretor**, gerando dupla-resposta e confusão para o lead.

### A Regra que MUDA (inverter CON-3)

O comentário em `send-message/route.ts` (L21-27) é explícito sobre o COMPORTAMENTO ANTERIOR:

```
* REGRA DE NEGÓCIO: NÃO desliga `is_ai_active`. O takeover é controlado pela
* janela de 24h do cron, não por flag de agendamento.
```

Esta story **inverte** essa regra: a 1ª mensagem `role='broker'` (ou qualquer envio enquanto `is_ai_active=true`) agora explicitamente seta `is_ai_active=false`. A Nicole para imediatamente.

### Fluxo Completo Pós-63-13

```
Corretor envia mensagem
  → send-message/route.ts: INSERT role='broker'
  → Se conversations.is_ai_active=true → UPDATE is_ai_active=false, handoff_at=now(), handoff_reason='broker_reply'
  → Próximas mensagens do lead: webhook checa is_ai_active=false → Nicole NÃO responde

Lead responde (após X horas/dias)
  → webhook: conversação com is_ai_active=false
  → Checar: última msg role='broker' na conversa ≥ 24h atrás OU ausente?
    → SIM (corretor inativo >24h): UPDATE is_ai_active=true → Nicole responde
    → NÃO (corretor ativo <24h): is_ai_active fica false → Nicole NÃO responde
```

### Compatibilidade com Código Existente

| Componente | Compatível? | Justificativa |
|-----------|-------------|---------------|
| `deriveBrokerActive = brokerSentRecently \|\| !isAiActive` (banner 63-8) | SIM | Com 63-13: broker envia → `is_ai_active=false` → `!isAiActive=true` → Estado B ✓. Após reativação: `is_ai_active=true` + sem broker msg <24h → `brokerSentRecently=false` → Estado A ✓. Nenhuma mudança na função. |
| `getWindowStatus` (badge 63-4) | SIM | Baseado em `last_message_at`, não em `is_ai_active`. Inalterado. |
| `notifyBrokerOnReply` (63-12, gate Q1 = `brokerSentRecently`) | SIM | Gate usa presença de `role='broker'` <24h, não `is_ai_active`. Inalterado. |
| Realtime (63-11, subscribe a `messages`) | SIM | Subscribe a INSERTs; nenhuma dependência de `is_ai_active`. |
| Cron de follow-up (usa `brokerSentRecently`) | SIM | O cron continua usando `brokerSentRecently` para pausar FOLLOW-UPs automáticos — este mecanismo é COMPLEMENTAR, não substituído. |

### Janela X=24h — Decisão de Produto

A janela de 24h para reativação automática está alinhada com:
- `BROKER_WINDOW_MS = 24 * 60 * 60 * 1000` em `lib/broker/broker-takeover-status.ts` (63-8)
- Janela WhatsApp Business de 24h (`getWindowStatus` em 63-4)
- Gate `brokerSentRecently` (63-8/63-12) — mesma lógica

[AUTO-DECISION] X=24h (default) — consistência com todas as janelas de 24h já implementadas no sistema. Confirmar com @po antes de marcar Ready.

---

## Acceptance Criteria

- [x] **AC1 (Handoff ao enviar):** Quando `POST /api/leads/[id]/send-message` insere com sucesso uma mensagem `role='broker'` em uma conversa com `is_ai_active=true`, setar na mesma requisição: `conversations SET is_ai_active=false, handoff_at=now(), handoff_reason='broker_reply'`. Se `is_ai_active` já era `false`, skip (idempotente — sem UPDATE desnecessário). **[@po] O UPDATE DEVE usar `createAdminClient()` (já importado no route, L3, e usado para `whatsapp_config` na L128), NÃO o client de `requireAuth()`.** Justificativa: o corretor não-admin pode não ter policy de UPDATE em `conversations` sob RLS; com o client de sessão o handoff falharia silenciosamente (best-effort) → Nicole continuaria respondendo, que é exatamente o bug-alvo. O admin client garante a escrita por-conversa (`.eq("id", conversation.id)`). @qa deve confirmar que o UPDATE de fato persiste para um corretor comum (não só admin).
- [x] **AC2 (Nicole para imediatamente):** Após 63-13, quando o lead envia mensagem e `conversations.is_ai_active=false`, o webhook NÃO dispara o pipeline da Nicole. O gate existente `if (conversation!.is_ai_active)` em `route.ts` (~L612) já implementa isso — este AC confirma que o gate NÃO é removido e que o `is_ai_active=false` o respeita.
- [x] **AC3 (Reativação automática 24h):** No `after()` assíncrono do webhook, antes do gate da Nicole (~L612): se `conversation.is_ai_active === false`, consultar a última msg `role='broker'` na conversa. Se não existe nenhuma msg `role='broker'` OU a mais recente tem `created_at` há mais de 24h (`BROKER_WINDOW_MS`): UPDATE `conversations SET is_ai_active=true WHERE id=conversation.id`, atualizar variável local `isAiActive=true`. Depois o gate existente deixa a Nicole responder.
- [x] **AC4 (Broker ativo < 24h — Nicole silente):** Se existe msg `role='broker'` com `created_at` < 24h atrás na conversa, NÃO reativar — manter `is_ai_active=false` e Nicole NÃO responde. O corretor ainda está no controle.
- [x] **AC5 (Idempotência na reativação):** Se `conversations.is_ai_active` já é `true` quando o lead envia mensagem, nenhuma query adicional de reativação é feita (o bloco de reativação verifica `if (!isAiActive)` antes de consultar mensagens).
- [x] **AC6 (Reutilização de BROKER_WINDOW_MS):** A janela de 24h na reativação usa a constante `BROKER_WINDOW_MS` importada de `@web/lib/broker/broker-takeover-status` — mesma fonte de verdade do banner (63-8) e do push (63-12). Não duplicar literais de tempo.
- [x] **AC7 (Atualização do Estado A subtexto):** O subtexto do Estado A em `ai-status-banner.tsx` é atualizado de "Ao enviar sua primeira mensagem, você assume o atendimento pelas próximas 24h — Nicole pausará automaticamente." para: "Ao enviar sua primeira mensagem, você assume e a Nicole pausa imediatamente. Se ficar 24h sem responder ao lead, a Nicole reassume automaticamente."
- [x] **AC8 (Comentários atualizados):** O comentário em `send-message/route.ts` (~L21-27) que diz "NÃO desliga `is_ai_active`" é atualizado para refletir o novo comportamento. O comentário em `broker-takeover-status.ts` (~L9-13) que diz "`is_ai_active` entra apenas como sinal secundário" é atualizado para: "`is_ai_active` é agora o sinal PRIMÁRIO de handoff (via 63-13); `brokerSentRecently` permanece como sinal complementar (e.g., race condition, primeira carga pós-reativação)."
- [x] **AC9 (Sem regressão no webhook):** HTTP 200 retornado imediatamente; o `after()` da Nicole continua independente; o `after()` do push (63-12) não é afetado. Vitest: suíte completa verde (sem regressão nos 463 testes existentes).
- [x] **AC10 (TypeScript + ESLint):** `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story. ESLint → zero erros.

---

## Tasks / Subtasks

- [x] **T1 — Modificar `send-message/route.ts` — Handoff ao enviar**
  - Adicionar `is_ai_active` ao select da conversa existente (~L97-103): `.select("id, last_message_at, is_ai_active")`
  - Adicionar `is_ai_active` ao select da inserção de nova conversa (~L113): `.select("id, last_message_at, is_ai_active")`
  - Após insert bem-sucedido da mensagem (~L260, depois do `if (insertErr || !inserted)`): adicionar bloco:
    ```typescript
    if (conversation.is_ai_active) {
      await supabase
        .from("conversations")
        .update({ is_ai_active: false, handoff_at: new Date().toISOString(), handoff_reason: "broker_reply" })
        .eq("id", conversation.id)
    }
    ```
  - Atualizar comentário ~L21-27 (AC8): substituir "NÃO desliga `is_ai_active`" pela nova regra

- [x] **T2 — Modificar `webhook/whatsapp/route.ts` — Reativação automática em 24h**
  - Importar `BROKER_WINDOW_MS` de `@web/lib/broker/broker-takeover-status` (no topo do arquivo)
  - Dentro do `after()` assíncrono (~L454), ANTES do gate da Nicole (~L612):
    ```typescript
    let isAiActive = conversation!.is_ai_active
    if (!isAiActive) {
      const since = new Date(Date.now() - BROKER_WINDOW_MS).toISOString()
      const { data: recentBrokerMsg } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation!.id)
        .eq("role", "broker")
        .gte("created_at", since)
        .limit(1)
        .maybeSingle()
      if (!recentBrokerMsg) {
        await supabase
          .from("conversations")
          .update({ is_ai_active: true })
          .eq("id", conversation!.id)
        isAiActive = true
      }
    }
    ```
  - Alterar o gate Nicole de `if (conversation!.is_ai_active)` para `if (isAiActive)` (~L612)

- [x] **T3 — Atualizar `ai-status-banner.tsx` — subtexto Estado A (AC7)**
  - Substituir o texto "Ao enviar sua primeira mensagem, você assume o atendimento pelas próximas 24h — Nicole pausará automaticamente." pelo novo texto do AC7

- [x] **T4 — Atualizar comentários em `broker-takeover-status.ts` (AC8)**
  - Atualizar o bloco de comentário ~L9-13 para refletir que `is_ai_active` é agora o sinal PRIMÁRIO, com `brokerSentRecently` complementar

- [x] **T5 — Testes Vitest**
  - Verificar se os testes existentes em `broker-takeover-status.test.ts` continuam passando (a lógica da função não muda, só os comentários)
  - Extraído helper puro `shouldReactivateAi(lastBrokerAt, now)` em `broker-takeover-status.ts` + 6 novos testes (null, 25h, 2h, limiar 24h, 1ms antes, NaN). Total do arquivo: 19 testes verdes.

- [x] **T6 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story (único erro pré-existente: `visual-editor.tsx`, módulo `react-email-editor` ausente — fora do escopo)
  - ESLint → zero erros nos arquivos desta story
  - `npx vitest run` → suíte completa verde (469 testes, zero regressão)

---

## Dev Notes

### Paths-chave

```
packages/web/src/app/api/leads/[id]/send-message/route.ts        ← EDITAR (T1) — handoff ao enviar
packages/web/src/app/api/webhook/whatsapp/route.ts               ← EDITAR (T2) — reativação 24h
packages/web/src/app/broker/leads/[id]/_components/
  ai-status-banner.tsx                                            ← EDITAR (T3) — subtexto Estado A
packages/web/src/lib/broker/broker-takeover-status.ts            ← EDITAR (T4) — comentários
```

### `send-message/route.ts` — Referências de linha (âncoras semânticas)

```typescript
// Conversation select existente (~L97-103) — ADICIONAR is_ai_active:
let { data: conversation } = await supabase
  .from("conversations")
  .select("id, last_message_at")           // ← mudar para "id, last_message_at, is_ai_active"
  .eq("lead_id", id)
  .eq("status", "active")
  .order("created_at", { ascending: false })
  .maybeSingle()

// Conversation creation select (~L113) — ADICIONAR is_ai_active:
.select("id, last_message_at")             // ← mudar para "id, last_message_at, is_ai_active"

// Após insert bem-sucedido (~L260, depois do `if (insertErr || !inserted)` resolve):
// ADICIONAR bloco de handoff ANTES do return NextResponse.json(...) final:
if (conversation.is_ai_active) {
  await supabase
    .from("conversations")
    .update({
      is_ai_active: false,
      handoff_at: new Date().toISOString(),
      handoff_reason: "broker_reply",
    })
    .eq("id", conversation.id)
  // Falha silenciosa: se o update falhar, a mensagem já foi enviada — não rolar back.
  // O próximo envio tentará novamente (is_ai_active ainda true → novo update).
}
```

**NOTA DE TIPO:** `conversation.is_ai_active` será `boolean | null | undefined` após adicionar ao select — usar `Boolean(conversation.is_ai_active)` ou checar antes se necessário. O schema garante NOT NULL DEFAULT true, então o valor é sempre boolean se o row existe.

**IDEMPOTÊNCIA:** O guard `if (conversation.is_ai_active)` garante que o UPDATE só acontece quando necessário — se o corretor envia múltiplas mensagens enquanto `is_ai_active` já é `false`, nenhum UPDATE adicional ocorre.

**Por que não logar em `activities`:** O INSERT em `messages` com `role='broker'` já é o registro primário da assunção do corretor. `conversations.handoff_at` + `conversations.handoff_reason='broker_reply'` fornecem o audit trail do handoff sem poluir `activities` com eventos de baixo nível. Diferente de `handoff/route.ts` (ação administrativa explícita) que faz sentido logar.

### `webhook/whatsapp/route.ts` — Referências de linha

```typescript
// supabase no webhook é admin client (getSupabaseAdmin(), L155) — sem problemas de RLS no UPDATE.

// findOrCreateConversation (~L411) retorna { id: string; is_ai_active: boolean }
const conversation = await findOrCreateConversation(supabase, { orgId, leadId: lead.id })

// O after() da Nicole começa em ~L454:
after(async () => {
  // ... setup de mídia e asyncText ...
  
  // INSERIR AQUI (~antes de L612, após o bloco de voice/campaign/automations):
  // 63-13: Reativação automática da Nicole após 24h de inatividade do corretor.
  // Só executa se is_ai_active=false E o corretor não enviou nas últimas 24h.
  let isAiActive = conversation!.is_ai_active
  if (!isAiActive) {
    const since = new Date(Date.now() - BROKER_WINDOW_MS).toISOString()
    const { data: recentBrokerMsg } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversation!.id)
      .eq("role", "broker")
      .gte("created_at", since)
      .limit(1)
      .maybeSingle()
    if (!recentBrokerMsg) {
      // Corretor inativo >24h → Nicole reassume
      await supabase
        .from("conversations")
        .update({ is_ai_active: true })
        .eq("id", conversation!.id)
      isAiActive = true
    }
    // Se recentBrokerMsg existe, corretor ativo <24h → isAiActive fica false → Nicole não responde
  }
  
  // ... campaign tracking, voice handling, lead automations ...
  
  // Gate existente da Nicole — ALTERAR de conversation!.is_ai_active para isAiActive:
  if (isAiActive) {   // ← era: if (conversation!.is_ai_active)
    const { processMessage, createAnthropicClient } = await import("@trifold/ai")
    // ... pipeline da Nicole (inalterado) ...
  }
})
```

**IMPORT:** Adicionar no topo do webhook: `import { BROKER_WINDOW_MS } from "@web/lib/broker/broker-takeover-status"`

**ONDE INSERIR:** O bloco de reativação deve ser inserido APÓS o bloco de voice/campaign/automations (L563-609) e ANTES do gate Nicole (L612). Isso evita que a reativação aconteça quando a mensagem é de voz (short-circuit em L543-563) ou quando há outros early returns.

**RACE CONDITION (risco R1):** Se corretor envia mensagem E lead responde ao mesmo tempo:
- `send-message` seta `is_ai_active=false` (DB)
- Webhook lê `conversation.is_ai_active` capturado em `findOrCreateConversation` (~L411, antes do `after()`) → pode ter lido `true` (antes do send-message completar) ou `false` (depois)
- Se leu `true`: `isAiActive=true` → Nicole responde (falso-positivo leve — aceitável, corrida rara)
- Se leu `false`: entra no bloco de reativação; busca broker msgs (<24h → corretor ativo → Nicole não responde) — correto

O `supabase` no webhook é admin client e as queries são atômicas. A race é de timing entre requisições independentes. Aceitável em produção — frequência extremamente baixa.

### `broker-takeover-status.ts` — Comentário a atualizar

O bloco JSDoc (~L8-20) atualmente diz:
```
* Fonte de verdade do takeover (NÃO é `is_ai_active`): ...
* Conforme `send-message/route.ts` (L15-28), o envio do corretor NÃO desliga
* `is_ai_active`; o takeover é implícito via janela de 24h.
* Por isso `is_ai_active` entra apenas como sinal secundário (handoff de admin).
```

Atualizar para:
```
* Fonte de verdade do takeover: `conversations.is_ai_active` (explícito, via
* Story 63-13) — false quando corretor enviou; true quando Nicole ativa.
* `brokerSentRecently` permanece como sinal COMPLEMENTAR: race conditions,
* primeira carga antes de hydratação de state, e edge cases de transição.
* `deriveBrokerActive = brokerSentRecently || !isAiActive` captura ambos.
```

### Campos confirmados em `conversations` (migration 001_base_schema.sql L152-164)

```sql
is_ai_active   boolean NOT NULL DEFAULT true
handoff_at     timestamptz                      -- nullable; OK para usar
handoff_reason text                             -- nullable; 'broker_reply' ou 'manual'
last_message_at timestamptz                     -- nullable
```

SEM migration necessária — todos os campos já existem.

### `activities.type` — sem constraint de enum

`activities.type varchar(100) NOT NULL` (migration 001 L266) — sem CHECK constraint. `'broker_reply'` seria válido se quisermos logar (mas optamos por não logar — ver Dev Notes acima).

---

## File List

### Modificar
- `packages/web/src/app/api/leads/[id]/send-message/route.ts` — adicionar `is_ai_active` ao select; bloco de handoff pós-insert; atualizar comentário ~L21-27 (T1, AC1, AC8)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — import `BROKER_WINDOW_MS`; bloco de reativação antes do gate Nicole; alterar gate de `conversation!.is_ai_active` para `isAiActive` (T2, AC3-AC4)
- `packages/web/src/app/broker/leads/[id]/_components/ai-status-banner.tsx` — subtexto Estado A (T3, AC7)
- `packages/web/src/lib/broker/broker-takeover-status.ts` — atualizar comentário JSDoc ~L8-20 (T4, AC8)

### Referência (não modificar)
- `packages/web/src/lib/broker/broker-takeover-status.ts` L29: `BROKER_WINDOW_MS = 24 * 60 * 60 * 1000` — importar, não duplicar
- `packages/web/src/lib/broker/window-status.ts` — `getWindowStatus` inalterado; `WINDOW_MS=24h` (mesma janela)
- `packages/web/src/app/api/leads/[id]/handoff/route.ts` — referência de padrão (is_ai_active=false + handoff_at + handoff_reason); NÃO reusar endpoint (é admin/supervisor only)
- `supabase/migrations/001_base_schema.sql` L152-164 — schema de `conversations` confirmado

---

## Testing

### ⚠️ GR-8 — Smoke manual OBRIGATÓRIO ANTES do push (gate pré-deploy)

**[@po] Esta é uma mudança SENSÍVEL em produção** (`is_ai_active` controla se a Nicole responde leads vivos). Como o ambiente é **Supabase de produção único** (sem staging isolado), o smoke abaixo é um **gate bloqueante PRÉ-PUSH**, executado em uma **conversa de teste controlada** (lead de teste do próprio corretor/admin), NÃO um teste pós-deploy a posteriori:

1. **Antes do push:** validar os 3 cenários (handoff, broker ativo <24h silente, reativação >24h) na conversa de teste. Confirmar no Supabase que `is_ai_active` muda por-conversa e NÃO afeta outras conversas/leads.
2. **Rollback documentado e à mão:** `UPDATE conversations SET is_ai_active=true WHERE id='<conversation_id>'` (admin SQL) reverte uma conversa específica; `UPDATE conversations SET is_ai_active=true` reverte tudo (kill-switch). Manter aberto durante o deploy.
3. **Monitorar logs do webhook nas 2h seguintes** ao push (GR-8). Escopo é por-conversa: a mudança SÓ desliga `is_ai_active` quando há `role='broker'` na conversa — leads sem broker e conversas de outros corretores ficam intocados.

### Smoke manual (cenários críticos — rodar pré-push na conversa de teste)

| Cenário | Setup | Ação | Resultado esperado |
|---------|-------|------|--------------------|
| Handoff ao enviar | Lead com `is_ai_active=true`, conversa ativa | Corretor envia msg via CRM | `conversations.is_ai_active=false`; `handoff_at` preenchido; `handoff_reason='broker_reply'` |
| Nicole para | Lead com `is_ai_active=false` (pós-handoff), janela aberta | Lead envia mensagem | Nicole NÃO responde; HTTP 200; push de 63-12 funciona normalmente |
| Reativação 24h | Lead com `is_ai_active=false`, última msg broker há 25h | Lead envia mensagem | Nicole RESPONDE (reativação); `is_ai_active=true` no DB |
| Corretor ativo — sem reativação | `is_ai_active=false`, msg broker há 2h | Lead envia mensagem | Nicole NÃO responde; `is_ai_active` permanece false |
| Idempotência handoff | `is_ai_active=false` já | Corretor envia nova msg | Nenhum UPDATE desnecessário; resposta 200 normal |
| Banner reflete novo estado | Pós-handoff | Recarregar tela do corretor | Banner mostra Estado B ("Você está no atendimento") |
| Reativação reflete no banner | Pós-reativação (24h) | Recarregar tela do corretor | Banner volta para Estado A ("Nicole está atendendo") |

### Regressão obrigatória

- Nicole continua respondendo normalmente quando `is_ai_active=true` e lead é novo
- `after()` push de 63-12 não é afetado (bloco separado, independente)
- `handoff/route.ts` (handoff manual admin/supervisor) continua funcionando
- `send-message` continua retornando 200 com `messageId` mesmo se update de `is_ai_active` falhar (tratar como best-effort ou logar e prosseguir)

---

## Riscos

| ID | Risco | Prob | Impacto | Mitigação |
|----|-------|------|---------|-----------|
| R1 | Race condition: broker envia + lead responde simultaneamente → webhook leu `is_ai_active=true` antes do send-message atualizar | Baixa | Médio | Nicole responde uma vez a mais (aceitável) — a próxima mensagem do lead já encontrará `is_ai_active=false` |
| R2 | Webhook grande (>600 linhas) — localizar ponto certo de inserção | Média | Médio | Dev Notes com âncora semântica exata ("Gate existente da Nicole") e L612 como referência; confirmar via grep antes de inserir |
| R3 | RISCO ALTO — `is_ai_active=false` em produção faz Nicole parar de responder lead vivos | Alta | Alto | Smoke pré-deploy em conversa de teste; rollback = UPDATE conversations SET is_ai_active=true (admin SQL) |
| R4 | `send-message` retornando erro se update de `is_ai_active` falhar | Baixa | Médio | Tratar update como best-effort: capturar erro, logar, mas não rolar back o insert da mensagem (mensagem já foi enviada) |
| R5 | `BROKER_WINDOW_MS` não exportado de `broker-takeover-status.ts` | Baixa | Baixo | Confirmado: arquivo L29 `export const BROKER_WINDOW_MS = 24 * 60 * 60 * 1000` — já exportado |

---

## Out of Scope

- Botão "Devolver para a Nicole" no CRM (Story 63-14)
- Notificação ao corretor de que a Nicole reassumiu (potencial evolução futura)
- Histórico de handoffs na UI (conversations.handoff_at já captura o último)
- Handoff quando conversa não existe (send-message cria a conversa com `is_ai_active=true` default — a lógica pós-insert cobre esse caso)
- Reativação quando corretor clica "Devolver para Nicole" (Story 63-14 — fora daqui)
- Alteração do `handoff/route.ts` (handoff admin/supervisor — permanece como está)
- Activity log para o handoff implícito (opt-out deliberado — `conversations.handoff_at` + `messages` são o audit trail)

---

## Definition of Done

- [x] AC1-AC10 marcados como completos
- [ ] **GR-8 (BLOQUEANTE PRÉ-PUSH):** Smoke manual em conversa de teste executado ANTES do push — 3 cenários validados; rollback SQL (`UPDATE conversations SET is_ai_active=true`) confirmado à mão
- [ ] Smoke manual: corretor envia → is_ai_active=false confirmado no Supabase (escopo por-conversa; conversa de outro corretor intocada)
- [ ] Smoke manual: lead responde após 24h (simular com UPDATE manual em DB) → Nicole responde
- [ ] Smoke manual: Nicole NÃO responde quando is_ai_active=false E broker ativo <24h
- [ ] UPDATE de handoff (AC1) usa admin client e persiste para um corretor comum (não só admin) — confirmado @qa
- [x] Regressão: suíte Vitest completa verde (469 testes); banner 63-8 funciona corretamente
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Dev Agent Record

*(Preenchido pelo @dev durante implementação)*

### Agent Model Used
claude-opus-4-8 (1M) — @dev (Dex), modo YOLO autônomo.

### Completion Notes

**T1 — Handoff ao enviar (`send-message/route.ts`):**
- `is_ai_active` adicionado aos dois selects da conversa (existente + criação).
- Bloco de handoff inserido após o insert bem-sucedido da msg `role='broker'`, antes do return final.
- **Admin client garantido (FIX @po):** o UPDATE usa `createAdminClient()` (já importado L3, mesmo padrão do `whatsapp_config`), NÃO o client de `requireAuth()`. Evita falha silenciosa por RLS de corretor não-admin — o bug-alvo.
- **Idempotência:** guard `if (conversation.is_ai_active)` → UPDATE só quando a Nicole ainda está ativa. Envios subsequentes com `is_ai_active=false` não disparam UPDATE.
- **Best-effort/race:** erro no UPDATE é logado (`console.error`) mas não reverte a mensagem já enviada/gravada (R4). Escopo por-conversa via `.eq("id", conversation.id)`.
- Comentário JSDoc ~L21-27 reescrito (AC8): a regra antiga "NÃO desliga is_ai_active" foi invertida.

**T2 — Reativação 24h (`webhook/whatsapp/route.ts`):**
- Bloco inserido APÓS voice/campaign/automations e ANTES do gate da Nicole. Gate alterado de `if (conversation!.is_ai_active)` para `if (isAiActive)` (variável local).
- **Desvio justificado vs. Dev Notes T2:** em vez do query inline `gte("created_at", since)` + `!recentBrokerMsg`, extraí a decisão como helper PURO `shouldReactivateAi(lastBrokerAt, now)` (busco a última msg `role='broker'` via `order desc + limit 1` e passo o `created_at`). Funcionalmente equivalente (ambos = "existe broker msg < 24h?"), porém testável em unidade (atende ao pedido do prompt "extraia a decisão de reativação como helper puro testável + ADICIONE teste"). `BROKER_WINDOW_MS` continua a única fonte de janela (AC6) — não há literal de tempo duplicado.
- `supabase` no webhook é admin client (`getSupabaseAdmin`, L155) → UPDATE sem RLS.
- **Race (R1):** documentado em comentário — pior caso Nicole responde 1x a mais; aceitável.

**T3/T4:** subtexto do Estado A atualizado (AC7); JSDoc de `broker-takeover-status.ts` atualizado para refletir `is_ai_active` como sinal PRIMÁRIO + `brokerSentRecently` complementar (AC8).

**Limiar de 24h:** `shouldReactivateAi` usa `>=` (espelho do `<` estritamente menor de `brokerSentRecently`): em exatamente 24h o corretor deixa de ser "recente" e a Nicole reassume — comportamento simétrico e consistente.

**ACs não 100% atendidos:** GR-8 (smoke manual pré-push em conversa de teste de produção) + DoD de confirmação de persistência para corretor comum → escopo do @qa/@devops, não executável aqui (Supabase de produção único, sem credenciais de smoke neste contexto). Toda a lógica de código (AC1-AC8, AC9 regressão, AC10 type-check/lint) está completa e validada.

**Validações:** `npx vitest run` → 469 testes verdes (463 + 6 novos), zero regressão. Type-check `@trifold/web` → zero erros nos arquivos da story (único erro pré-existente: `visual-editor.tsx`/`react-email-editor`, fora do escopo). ESLint nos 5 arquivos → zero erros.

**Confirmações:** NENHUM push. NENHUM `tel:`/`wa.me`/click-to-call. Escopo POR-CONVERSA (todos os UPDATEs com `.eq("id", conversation.id)`). NENHUMA migration (campos já em `001_base_schema.sql`).

### File List (Modificados)
- `packages/web/src/app/api/leads/[id]/send-message/route.ts` — select `is_ai_active`; bloco de handoff (admin client) pós-insert; comentário JSDoc (T1, AC1, AC8)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — import `shouldReactivateAi`; bloco de reativação 24h antes do gate; gate `if (isAiActive)` (T2, AC3-AC5)
- `packages/web/src/app/broker/leads/[id]/_components/ai-status-banner.tsx` — subtexto Estado A (T3, AC7)
- `packages/web/src/lib/broker/broker-takeover-status.ts` — JSDoc atualizado; novo helper `shouldReactivateAi` (T4, T5, AC6, AC8)
- `packages/web/src/lib/broker/broker-takeover-status.test.ts` — 6 testes de `shouldReactivateAi` (T5)

---

## QA Results

*(Preenchido pelo @qa)*

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-21 | 0.1 | Story drafted — Epic 63, Fase 5. Handoff explícito ao responder (is_ai_active=false) + reativação automática 24h no webhook. Inverte CON-3 que proibia alterar is_ai_active. Decisão de produto X=24h pendente @po. | @sm (River) |
| 2026-06-21 | 0.2 | **Validada @po — verdict GO (9/10), Status Draft→Ready.** Decisões resolvidas: X=24h confirmado; handoff_reason='broker_reply' aceito (campo sem CHECK). Viabilidade dos 2 pontos de mudança confirmada por código (send-message L98/L113/L259-264; webhook gate L612, after() Nicole L454, admin client `getSupabaseAdmin` L155, findOrCreateConversation retorna is_ai_active). Escopo por-conversa confirmado (.eq("id", conversation.id)). Fixes aplicados: (1) AC1 exige `createAdminClient()` no UPDATE de handoff p/ evitar falha silenciosa por RLS de corretor não-admin; (2) GR-8 smoke promovido a gate BLOQUEANTE pré-push (conversa de teste) + rollback no DoD. | @po (Pax) |
| 2026-06-21 | 0.3 | **Implementada @dev — Status Ready→Ready for Review.** T1-T6 completos. Handoff explícito com admin client (FIX @po aplicado); reativação 24h via helper puro `shouldReactivateAi` extraído (desvio justificado vs query inline — testável em unidade); gate `if (isAiActive)`; subtexto Estado A + JSDoc atualizados. Validações: vitest 469 verdes (6 novos), type-check zero erros nos arquivos da story, ESLint limpo. Pendente @qa/@devops: smoke GR-8 pré-push em conversa de teste. | @dev (Dex) |
