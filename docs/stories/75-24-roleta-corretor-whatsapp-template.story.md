# Story 75-24 — Roleta → corretor: notificação de novo lead via template HSM (WhatsApp)

## Metadata
- **Status:** Done
- **Epic:** 75 (ajustes operacionais) — relacionada ao backlog #27
- **Branch:** main (mudança incremental, padrão do repo)
- **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, smoke-send]

## Story

**As a** corretor,
**I want** receber por WhatsApp o aviso de novo lead quando a roleta me distribuir
   um lead,
**so that** eu atenda rápido mesmo fora da janela de 24h (proativo → exige template HSM).

## Contexto

Backlog #27 (parte corretor). `lib/roleta/notify-broker.ts` → `sendBrokerWhatsApp`
envia `type:"text"` → a Meta só entrega na janela 24h; distribuição da roleta é
proativa → WhatsApp não chega (hoje só push/e-mail). Template aprovado:

`novo_lead_corretor` [pt_BR], UTILITY, APPROVED:
- BODY: `Olá {{1}}! Você recebeu um novo lead na Trifold: Nome: {{2}} Telefone: {{3}}`
  (1=nome corretor, 2=nome lead, 3=telefone lead)
- Botão URL estático (link quebrado — issue #26; envio sem componente de botão).

`sendBrokerWhatsApp` é COMPARTILHADA por 3 fluxos: roleta→corretor (sem context),
gestor `notifyImobiliaria` (com context) e agendamento Nicole 51-3 (com context).
Só o caminho roleta→corretor (sem context) tem template dedicado.

## Escopo

**IN:**
- `notify-broker.ts`: nova função `sendBrokerLeadTemplate` que envia
  `novo_lead_corretor` (body=nome/lead/telefone, sem botão). Em `notifyBroker`, o
  envio de WhatsApp usa o template **quando não há `context`** (= distribuição da
  roleta); quando há `context` (agendamento/gestor) mantém o texto atual (sem regressão).

**OUT:**
- Gestor (`notifyImobiliaria` / `aviso_roleta_gestor`) e demais templates — ficam no #27.
- Botão do template (link quebrado) — issue #26.
- Preencher telefone dos corretores (0/10 têm `users.phone`) — pré-condição operacional.

## Acceptance Criteria
1. Distribuição da roleta (notifyBroker sem context) envia `type:"template"` `novo_lead_corretor` (pt_BR) com body nome/lead/telefone.
2. Fluxos com `context` (agendamento 51-3, gestor) permanecem inalterados (texto), sem regressão.
3. Push e e-mail do corretor inalterados.
4. Smoke test real entrega o template a um número de teste.
5. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.24-...yml`, quality_score 92)
- **typecheck/lint:** limpos.
- **Smoke test:** template `novo_lead_corretor` entregue (`accepted`, confirmado pelo usuário) — mesmo payload do código.
- **Pré-condição:** corretores precisam de `users.phone` (0/10) p/ disparo real — operacional.

## File List
- `packages/web/src/lib/roleta/notify-broker.ts`
