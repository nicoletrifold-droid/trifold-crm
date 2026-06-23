# Story 75-23 — Notificação de obra do cliente via template HSM (WhatsApp proativo)

## Metadata
- **Status:** Done
- **Epic:** 75 (ajustes operacionais)
- **Branch:** main (mudança incremental, padrão do repo)
- **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, smoke-send]

## Story

**As a** cliente da obra,
**I want** receber a notificação de atualização da obra por WhatsApp mesmo fora da
   janela de 24h,
**so that** as notificações proativas realmente cheguem (a Meta exige template HSM
   para mensagens iniciadas pela empresa).

## Contexto

Continuação da 75-20/21/22. O `sendWhatsApp` em `lib/notificacoes.ts` enviava
`type:"text"` → a Meta só entrega texto livre na janela de 24h; notificação de
obra é proativa → não entregava. Templates HSM **aprovados na Meta** (confirmado
via Graph API `message_templates`, 2026-06-23). Template alvo:

`atualizacao_obra_cliente` [pt_BR], UTILITY, APPROVED:
- BODY: `Olá {{1}}! Há uma novidade na sua obra {{2}}: {{3}}` (1=nome, 2=obra, 3=descrição)
- BOTÃO URL dinâmico: `https://crm.trifold.eng.br/cliente/{{1}}` (1=obra_id)

## Escopo

**IN:**
- `lib/notificacoes.ts`: `sendWhatsApp` passa a enviar `type:"template"` com
  `atualizacao_obra_cliente` (pt_BR), parâmetros de body (nome/obra/descrição) e
  botão URL (obra_id). Recebe `obraId` em vez de `link`.
- Smoke test: envio real do template para um número de teste (Marcos).

**OUT:**
- notify-broker.ts (corretor/gestor) e novo_boleto_cliente — templates aprovados,
  mas ficam para stories próprias (escopo aqui é notificação de obra do cliente).
- Lógica window-aware (texto na janela): optou-se por sempre-template (entrega
  garantida dentro e fora da janela; mais simples).

## Acceptance Criteria
1. `sendWhatsApp` envia `type:"template"` com name `atualizacao_obra_cliente`, language `pt_BR`.
2. Body recebe 3 parâmetros na ordem: nome do cliente, nome da obra, descrição do evento.
3. Botão URL recebe o `obra_id` como parâmetro (sub_type url, index 0).
4. Smoke test real entrega a mensagem a um número de teste.
5. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.23-...yml`, quality_score 88)
- **typecheck/lint:** limpos.
- **Smoke test:** envio real `accepted` pela Meta (número de teste Marcos).
- **AC3 revisado:** o botão do template é ESTÁTICO (URL com `{{1}}` literal, sem variável). O envio não inclui componente de botão. ⚠️ Caveat: o botão aponta hoje para `…/cliente/{{1}}` (link quebrado) — corrigir o template na Meta (botão dinâmico base+obra_id, ou estático `…/cliente`). Ao virar dinâmico, reintroduzir o componente button com obra_id.

## File List
- `packages/web/src/lib/notificacoes.ts`
