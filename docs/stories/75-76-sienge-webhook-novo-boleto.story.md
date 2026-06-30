# Story 75-76 — Notificação de "novo boleto" via webhook do Sienge

## Metadata
- **Status:** Done (dormente — hook pendente) · **Epic:** 75 · **Branch:** feat/75-76-sienge-webhook-novo-boleto · **Complexidade:** M (3-5 pontos)
- **executor:** @dev (+ @architect p/ validar contrato do webhook) · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste do endpoint com payload simulado, dedup]
- **Depende de:** template `novo_boleto_cliente` (✅ aprovado/dinâmico na Meta) + rota de deep-link `cliente/boleto/[obra_id]` (✅ existe). Fecha a última parte da issue #27. Ver [[project-notificacoes-portal]], [[project-sienge-webhook-boleto]].

## Story
**As a** cliente do portal, **I want** receber um aviso (WhatsApp/e-mail/push) quando um novo boleto da minha obra
for registrado no banco, **so that** eu saiba que há um boleto disponível para pagar — hoje nenhum aviso é disparado.

## Contexto
O template `novo_boleto_cliente` está aprovado e dinâmico, e a rota de deep-link existe, mas **nada dispara** a
notificação (confirmado: nenhuma referência de envio no código). Investigação 2026-06-30 (ver
[[project-sienge-webhook-boleto]]) decidiu por **webhook do Sienge** (não cron de varredura). Verificado em prod:
`GET /hooks` retornou 200 com `results: []` → webhooks **habilitados**, credenciais atuais (`SIENGE_*`) com acesso,
0 hooks cadastrados.

## Escopo
**IN:**
1. **Endpoint** `POST /api/webhooks/sienge/route.ts` (espelha o padrão de `api/webhooks/meta-ads`):
   - Valida a origem via o `token` configurado no hook (Basic) — env nova `SIENGE_WEBHOOK_TOKEN`.
   - **Responde 200 imediatamente (< 2,5s)**; todo o processamento pesado é assíncrono/após o ack.
2. **Filtro de evento:** age apenas em `x-sienge-event = PAYMENT_SLIP_REGISTERED` com `status = CONFIRMED`
   (ignora `REJECTED` e demais eventos com 200 silencioso).
3. **Idempotência (CRÍTICO):** dedup por `x-sienge-id` (ou `receivableBillId+installmentId`) — o Sienge re-tenta
   até 5× em ~10h. Persistir o que já foi processado (tabela/coluna nova ou reuso do `obra_notif_dedup` da 75-66).
4. **Enriquecimento + mapeamento:** o payload traz só `{ receivableBillId, installmentId, accountNumber, status }`.
   - Resolver `receivableBillId` → `customerId` (via API accounts-receivable do Sienge) → nosso `cliente`/`obra`
     pela ponte `sienge_customer_id`.
   - Buscar **vencimento** (e valor, opcional) via `getFinancialStatement(customerId)` (installments têm `dueDate`,
     `originalValue`, `currentBalance`).
5. **Disparo:** novo evento `novo_boleto` no dispatcher `notifyClientes` (ou função dedicada), enviando o template
   **`novo_boleto_cliente`** (vars 1=nome cliente, 2=nome obra, 3=vencimento; opcional 4=valor; botão deep-link
   `/cliente/boleto/{obra_id}`) + e-mail + push. Reusa o coalescing/pausa da 75-66.

**OUT:**
- Registro do hook (`POST /hooks`) — passo manual final de @devops, COM autorização do usuário, só após o endpoint no ar.
- Outros eventos do Sienge (contratos, unidades etc.) — fora de escopo.
- Backfill de boletos antigos.

## Acceptance Criteria
1. **Given** um `POST` em `/api/webhooks/sienge` com `x-sienge-event=PAYMENT_SLIP_REGISTERED` e `status=CONFIRMED`
   de um boleto de cliente mapeável, **then** o endpoint responde `200` em < 2,5s E dispara 1 notificação
   (`novo_boleto_cliente`) ao cliente da obra, com vencimento correto.
2. **Given** o mesmo evento entregue novamente (retry do Sienge, mesmo `x-sienge-id`), **then** NÃO é enviada
   notificação duplicada (idempotência).
3. **Given** `status=REJECTED` ou outro evento, **then** responde `200` e NÃO dispara nada.
4. **Given** token inválido/ausente no request, **then** responde `401`.
5. **Given** um `receivableBillId` que não mapeia para cliente/obra do nosso portal, **then** loga e ignora sem erro
   (não derruba o endpoint).
6. typecheck/lint limpos; teste do handler com payload simulado (CONFIRMED, REJECTED, retry duplicado).

## Dev Notes
- Base Sienge: `https://api.sienge.com.br/${SIENGE_SUBDOMAIN}/public/api/v1`; auth Basic via `SIENGE_USERNAME/PASSWORD`
  (já em prod). Client existente: `lib/integrations/sienge/client.ts` (`getFinancialStatement`, `getPaymentSlip`,
  `getCustomerById`). **`getPaymentSlip` devolve `urlReport`/`digitableNumber`, NÃO vencimento** → vencimento vem do
  financial statement.
- ⚠️ **Mapeamento `receivableBillId → customerId` é o ponto a resolver:** confirmar o endpoint accounts-receivable
  (provável `GET /accounts-receivable/{id}` ou via `bills`) que devolve o `customerId` do título. @architect/@dev valida.
- Dispatcher: `notifyClientes(obraId, evento, obraName)` hoje só trata `nova_foto/novo_documento/nova_mensagem/progresso`
  com o template `atualizacao_obra_cliente`. Boleto tem variáveis diferentes → adicionar `novo_boleto` ao enum
  `EventoNotificacao` e ramificar nome do template + vars no envio de WhatsApp (e textos de e-mail/push).
- Headers do Sienge: `x-sienge-tenant`, `x-sienge-event`, `x-sienge-hook-id`, `x-sienge-id`, `user-agent: sienge-hooks`.
- Gerenciamento de hook (setup final): `POST /hooks` `{ url: "https://crm.trifold.eng.br/api/webhooks/sienge",
  events: ["PAYMENT_SLIP_REGISTERED"], token: <SIENGE_WEBHOOK_TOKEN> }`. `GET /hooks` / `DELETE /hooks/{id}` p/ gerir.
- Env nova: `SIENGE_WEBHOOK_TOKEN` (REST API da Vercel, NUNCA `vercel env add` — ver guard no CLAUDE.md).

## File List
- `supabase/migrations/126_sienge_webhook_dedup.sql` — tabela `sienge_webhook_dedup` + `claim_sienge_webhook()` (idempotência atômica).
- `packages/web/src/app/api/webhooks/sienge/route.ts` — NOVO endpoint (valida `?token`, 200 imediato, processa em `after()`).
- `packages/web/src/app/api/webhooks/sienge/route.test.ts` — 6 testes (401, ignorar REJECTED/evento, disparo, dedup, sem-vínculo).
- `packages/web/src/lib/notificacoes.ts` — `notifyNovoBoleto()` dedicado (1 cliente) + `sendBoletoWhatsApp` + email de boleto.
- `packages/web/src/lib/integrations/sienge/client.ts` — `getReceivableBill()` (mapeia bill→customer/obra).
- `packages/web/src/lib/integrations/sienge/types.ts` — `SiengeReceivableBill`.
- Env nova (deploy): `SIENGE_WEBHOOK_TOKEN`.

## Decisões de implementação (verificadas ao vivo na API do Sienge)
- **Mapeamento bill→customer/obra:** `GET /accounts-receivable/receivable-bills/{id}` devolve `customerId` +
  `enterpriseCode`/`enterpriseName`/`unityName`. Mapeia `enterpriseCode → obras.sienge_enterprise_id` e
  `customerId → users.sienge_customer_id`; só dispara p/ user com vínculo em `cliente_obras`.
- **Vencimento:** o evento só traz IDs → `getFinancialStatement(customerId)` p/ achar a parcela e formatar `dueDate`.
- **Template `novo_boleto_cliente`:** confirmado APPROVED via Graph API — 3 vars no corpo (nome/obra/vencimento) +
  botão dinâmico `…/cliente/boleto/{{1}}` (param=obra_id). Função dedicada (NÃO o fan-out de `notifyClientes`).
- **Validação de origem:** segredo `?token=` na URL registrada no hook (controlamos a URL no `POST /hooks`).

## QA Results
- **Verdict: PASS.** Validação do caminho REAL (não só mock — fechando o furo da 75-72):
  - **Mapeamento real (bill 11045):** `/accounts-receivable/receivable-bills/11045` → customerId 1510, enterpriseCode 8.
    No nosso banco: obra "Vind Residence" (`sienge_enterprise_id=8`), cliente Claudenice (`sienge_customer_id=1510`,
    com telefone), vínculo `cliente_obras` presente. Cadeia completa resolve.
  - **Idempotência:** `claim_sienge_webhook` testado via DDL da migration 126 em transação com rollback →
    `primeira=true, repetida=null (coalescido), outra_parcela=true`. Dedup atômico OK contra os retries do Sienge.
  - **Template:** `novo_boleto_cliente` APPROVED (Graph API) — 3 vars corpo + botão dinâmico `/cliente/boleto/{{1}}`.
  - **Testes:** 6/6 (401, ignora REJECTED/evento, disparo, dedup, sem-vínculo). type-check 0, lint 0.
  - **Regressão:** `notifyClientes` (fan-out) intocado — boleto usa função dedicada `notifyNovoBoleto`. Migration aditiva.
- AC1-6 atendidos. ⚠️ Mudança concorrente em `notificacoes.ts` (coalescing 12h) é de OUTRO esforço, não-commitada,
  não faz parte desta story — convive sem conflito com `notifyNovoBoleto`.

## Change Log
- 2026-06-30 — @sm — Story criada. Webhook `PAYMENT_SLIP_REGISTERED` (status=CONFIRMED) → notificação `novo_boleto_cliente`.
  Webhooks confirmados habilitados em prod (GET /hooks 200, 0 hooks). Ver [[project-sienge-webhook-boleto]].
- 2026-06-30 — @po — Validada 10/10. GO. Status Draft → Ready. Ressalva não-bloqueante: confirmar endpoint de
  mapeamento `receivableBillId → customerId` no início do @dev.
- 2026-06-30 — @dev — Implementado. Mapeamento resolvido ao vivo (`/accounts-receivable/receivable-bills/{id}` →
  customerId+enterpriseCode). Migration 126 (dedup), endpoint, `notifyNovoBoleto`, `getReceivableBill`, 6 testes.
  type-check 0 / lint 0 / testes 6/6. Status → InReview.
- 2026-06-30 — @devops — Decisão do usuário: subir código+migration+env DORMENTE; registro do hook (go-live) fica
  para um OK separado (notificações do portal estão ligadas → 1º boleto real dispararia na hora). Passos 1–3 abaixo.
