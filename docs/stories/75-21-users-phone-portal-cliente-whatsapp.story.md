# Story 75-21 — Preencher users.phone do portal do cliente (fechar disparo de WhatsApp)

## Metadata
- **Status:** Done
- **Epic:** 75 (ajustes operacionais)
- **Branch:** main (mudança incremental, padrão do repo)
- **Complexidade:** S-M (2 pontos)

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, lint]

## Story

**As a** time que envia notificações de obra via WhatsApp aos clientes,
**I want** que a conta de portal do cliente (`users`, role=cliente) tenha o
   telefone preenchido,
**so that** o dispatcher `notifyClientes` (que lê `users.phone`) realmente envie
   o WhatsApp — hoje ele pula porque o campo está vazio.

## Contexto

Continuação da 75-20. Ao conferir os disparos, descobriu-se que
`lib/notificacoes.ts` (`notifyClientes`) envia WhatsApp lendo **`users.phone`**
(conta de portal), não `clientes.whatsapp` (ficha CRM, preenchida na 75-20).

Estado em prod (2026-06-23): 75 `users` role=cliente, **0 com phone**; 72
vinculados a obras (`cliente_obras`), **todos sem phone** → todo WhatsApp de
cliente é pulado (e-mail funciona normalmente).

A sync (`maybeInviteCliente`) cria/atualiza o `users` do cliente mas nunca grava
`phone`. As tabelas se ligam por `sienge_customer_id` (e por email).

## Escopo

**IN:**
- `sync.ts`: passar o telefone (já extraído via `extractCustomerPhone`) para
  `maybeInviteCliente`; gravar `phone` no insert do `users` (role=cliente) e
  preencher no branch de user existente quando vazio (sem sobrescrever).
- Backfill em prod: preencher `users.phone` (role=cliente, phone vazio) a partir
  de `clientes.whatsapp` (fallback `clientes.telefone`), casando por
  `sienge_customer_id` e, na falta, por email.

**OUT:**
- Mudar o dispatcher para ler de `clientes` (mantém arquitetura: `users.phone` é a fonte do portal).
- Telefone de brokers/leads (fora do escopo).
- Preferências de notificação (whatsapp_enabled etc. — já existem).

## Acceptance Criteria
1. `maybeInviteCliente` recebe o telefone e grava `users.phone` no insert de novo portal user.
2. Para portal user já existente sem phone, a sync passa a preencher `users.phone`.
3. Campos `users.phone` já preenchidos NÃO são sobrescritos.
4. Backfill: `users` role=cliente vinculados a obra com número na ficha passam a ter `phone`.
5. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.21-...yml`, quality_score 92)
- **typecheck/lint:** limpos.
- **Backfill em prod:** 68 `users.phone` preenchidos; cobertura 0→68 de 72 obra-linked.
- **Observação reportada:** envio de WhatsApp ainda gated por `whatsapp_enabled` (DEFAULT_PREFS=false, 0 linhas de prefs) → decisão de produto pendente. whatsapp_config presente (1 org).

## File List
- `packages/web/src/lib/integrations/sienge/sync.ts`
