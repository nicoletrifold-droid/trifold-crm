# Story 76-3 — Nicole pergunta/identifica cliente existente pelo diálogo

## Metadata
- **Status:** Done · **Epic:** 76 · **Branch:** main · **Complexidade:** M (3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, test]

## Story
**As a** sistema, **I want** que, quando o telefone não casa na base mas o DIÁLOGO indica que
o contato já é cliente, a Nicole pergunte/confirme e a conversa seja roteada para
relacionamento (não para corretor), **so that** clientes sem telefone casado também não caiam
na roleta.

## Contexto
Complementa a 76-2 (que cobre o caso de alta confiança por telefone). Match por NOME não é
decisivo (falso-positivo mandaria comprador real p/ relacionamento — viola o princípio "não
desviar comprador"). Por isso: (a) a Nicole PERGUNTA na dúvida (guardrail RN11) e (b) a
decisão é por **diálogo explícito** no gate do idle (`roleta-retry`), não por adivinhação de
nome. O pipeline da Nicole é por extração (sem tool-calls), então o ponto de decisão seguro é
a classificação já existente no `roleta-retry`.

## Escopo
**IN:**
- `classify-contact.ts`: nova categoria `cliente_existente` (detecção conservadora por sinais
  explícitos: "já sou cliente", "minha obra", andamento da obra dele, boleto/financiamento já contratado).
- `roleta-retry`: se `category === "cliente_existente"` → `routeLeadIdToRelationship` (handoff +
  notifica Samara + arquiva lead) em vez de distribuir.
- `route-inbound.ts`: extraído `applyRelationshipRouting` (compartilhado webhook/roleta) +
  `routeLeadIdToRelationship` (orquestra a partir do lead no idle; best-effort casa cadastro p/ obra).
- Guardrail **RN11** (código `guardrails.ts` + override no banco `agent_prompts`): Nicole, na
  dúvida, pergunta "você já é nosso cliente?"; se for cliente, encaminha ao relacionamento e
  não qualifica como comprador. Conservador (não força; comprador segue como lead).
**OUT:** UI de escolha de obra pela Nicole (Samara escolhe no Chat); tool-calls no pipeline.

## Acceptance Criteria
1. Diálogo com sinal explícito de cliente existente → `cliente_existente` → roteado p/
   relacionamento no idle (não distribui p/ corretor); Samara notificada.
2. Comprador interessado (sem sinal de já-cliente) segue como LEAD normal (sem falso-positivo).
3. Nicole, na dúvida, pergunta se já é cliente (RN11 no prompt — código + banco).
4. `applyRelationshipRouting` reutilizado pelo webhook (76-2) e pelo roleta (76-3).
5. typecheck (web+ai)/lint/test limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/76.3-nicole-pergunta-cliente-existente.yml`)
- **typecheck/lint/test:** limpos (32 testes: classify-contact + identify + route-inbound).
- **ATENÇÃO (revisar antes do deploy):** RN11 muda o comportamento conversacional da Nicole
  em produção (prompt no banco já atualizado). Validar tom/conservadorismo num teste real.

## File List
- `packages/ai/src/flows/classify-contact.ts` (+ `.test.ts`) — categoria cliente_existente
- `packages/ai/src/prompts/guardrails.ts` — RN11 (código)
- DB `agent_prompts` slug `guardrails` — RN11 (override ativo; aplicado em prod)
- `packages/web/src/lib/relacionamento/route-inbound.ts` — applyRelationshipRouting + routeLeadIdToRelationship
- `packages/web/src/app/api/cron/roleta-retry/route.ts` — branch cliente_existente
