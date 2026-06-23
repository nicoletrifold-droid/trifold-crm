# Story 76-1 — Identificação de cliente da base (Nicole/Relacionamento)

## Metadata
- **Status:** Done · **Epic:** 76 (Nicole identifica cliente → Chat Relacionamento) · **Branch:** main · **Complexidade:** M (3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, test]

## Épico 76 — contexto
Mudança grande no comportamento da Nicole (doc do usuário, 2026-06-23): quando um CLIENTE da
base de obras responde no WhatsApp (ex.: reagindo a uma notificação de obra), o sistema hoje
trata como lead → roleta → corretor sem contexto. O épico muda isso: identificar o cliente,
NÃO tratar como lead, e encaminhar a conversa para um módulo **Chat (Relacionamento)** da
gerente de relacionamento (Samara), respondendo por WhatsApp. Decisões do usuário: (A) Samara
responde por WhatsApp; (B) Nicole PARA e passa (handoff); (C) se houver mais de uma obra,
Nicole pergunta qual; (D) Chat é módulo NOVO (sobre `conversations`/`messages`) visível só p/
gerente-relacionamento/supervisor/admin, e o perfil Obras sai do módulo Mensagens.

Stories planejadas: **76-1 identificação (esta)** → 76-2 wiring no webhook + handoff/Nicole →
76-3 módulo Chat Relacionamento (UI + envio WhatsApp) → 76-4 visibilidade/remover Obras do Mensagens.

## Story
**As a** sistema (Nicole), **I want** identificar se um contato do WhatsApp já é cliente da
base de obras (por telefone, com fallback por nome), **so that** as próximas etapas possam
tratá-lo como cliente (não-lead) e encaminhar à gerente de relacionamento.

## Escopo
**IN:**
- `lib/relacionamento/identify-client.ts`: `identifyClientByContact(orgId, phone, name?)`
  → consulta a tabela `clientes` (org) e retorna status `phone_match` | `name_match` |
  `ambiguous` | `none` + candidatos com suas obras (via `clientes_obras_vinculos`).
- Match por telefone via `normalizePhoneBR` (tolera 9º dígito) em `telefone` e `whatsapp`;
  fallback por nome normalizado (sem acento/caixa). Helpers puros + testes vitest.
**OUT:** wiring no webhook, handoff, módulo Chat, visibilidade (próximas stories). Sem mudança
de comportamento em produção nesta story (helper isolado).

## Acceptance Criteria
1. Telefone que bate (mesmo sem o 9º dígito) com `clientes.telefone`/`whatsapp` → `phone_match`
   com 1 candidato e suas obras.
2. Mais de um cliente com o mesmo telefone/nome → `ambiguous`.
3. Sem telefone batendo mas nome confere → `name_match`; nenhum → `none`.
4. Nome com <3 chars não dispara match por nome.
5. Helpers puros cobertos por testes vitest; typecheck/lint/test limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/76.1-nicole-identifica-cliente.yml`)
- **typecheck/lint/test:** limpos.

## File List
- `packages/web/src/lib/relacionamento/identify-client.ts` (novo)
- `packages/web/src/lib/relacionamento/identify-client.test.ts` (novo)
