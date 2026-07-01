# Story 75-101 — Notificação de novo boleto via VARREDURA (cron), não só webhook

## Metadata
- **Status:** Done (QA PASS) — pronto p/ @devops · **Epic:** Portal / Notificações · **Branch:** feat/75-101-boleto-scan · **Complexidade:** S (3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **Prioridade:** 🟠 corrige gap real em prod (cliente não é avisado de boleto novo).

## Contexto / Problema
A Story 75-76 subiu o gatilho de "novo boleto" via **webhook do Sienge** (`PAYMENT_SLIP_REGISTERED`, status CONFIRMED). Em prod (2026-07-01) constatou-se que **o evento nunca chega** (tabela `sienge_webhook_dedup` = 0 eventos) — esses boletos aparecem no portal como **"Boleto gerado"** (`generatedBillet=true` no `/customer-financial-statements`), estado ANTERIOR à confirmação bancária que o webhook escuta. Ou os boletos são "sem registro", ou o Sienge não emite o evento para esta conta. **Depender do webhook não é confiável.**

Ex. real: cliente Albert Asturiano, obra Yarden, Parcela 11, venc. 10/07/2026, R$ 2.305,27 — "Boleto gerado" visível no portal, mas nenhuma notificação enviada.

## Story
**As a** cliente do portal, **I want** ser avisado (WhatsApp/e-mail/push) quando um novo boleto ficar disponível na minha obra, **so that** eu não perca o vencimento — **independente de o Sienge disparar o webhook**.

## Solução
Novo **cron `boleto-scan`** que detecta o boleto pelo **nosso lado** — a MESMA fonte que o portal já usa (`getFinancialStatement`), onde "Boleto gerado" aparece de forma confiável. Reaproveita `notifyNovoBoleto` (template `novo_boleto_cliente` aprovado) e o dedup existente (`claim_sienge_webhook`, tabela `sienge_webhook_dedup`, chave `receivableBillId:installmentId`).

## Escopo
**IN:**
1. `GET /api/cron/boleto-scan/route.ts` — auth `Bearer CRON_SECRET` (padrão dos crons). Respeita `PORTAL_NOTIF_PAUSED` (pula tudo se pausado).
2. Varre `users` com `role='cliente'` + `is_active` + `sienge_customer_id not null` (~69 hoje). Para cada: `getFinancialStatement` → parcelas com `generatedBillet=true && currentBalance>0` (`hasBoleto`), ordenadas por vencimento asc.
3. **Dedup + anti-flood:** para cada parcela, `claim_sienge_webhook('${billReceivableId}:${installmentId}', 'BOLETO_SCAN')`. Só as **inéditas** (claim=true) contam. **No máximo 1 notificação por cliente por execução:** envia a 1ª inédita (menor vencimento) e **marca (claima) as demais sem enviar** — o portal já mostra todas. Assim o lote inicial de boletos pré-existentes vira **1 msg/cliente**, e cada boleto notifica **uma única vez** para sempre.
4. Mapeia obra igual ao webhook: `getReceivableBill(billReceivableId).enterpriseCode` → `obras.sienge_enterprise_id`; exige vínculo `cliente_obras (obra, user)`. Falha transitória do Sienge → **libera o claim** (delete dedup) para re-tentar; miss de mapeamento → mantém claimado (não re-tenta em loop).
5. `vercel.json`: cron `0 12,15,18,21 * * *` (UTC = 9/12/15/18 BRT — só horário comercial, sem envio noturno).
6. Rate limit: delay entre clientes (~300ms), try/catch por cliente (um erro não derruba a varredura).

**OUT:** webhook 75-76 permanece no ar (caminho secundário; dedup compartilhado evita duplicidade). Sem nova tabela (reusa `sienge_webhook_dedup`). Sem alteração no template/`notifyNovoBoleto`. Sem migration.

## Acceptance Criteria
1. **Given** cliente com parcela `generatedBillet=true` + saldo, **and** a parcela não está em `sienge_webhook_dedup`, **when** o cron roda, **then** ele recebe **1** notificação (canais conforme prefs) e a(s) parcela(s) ficam registradas no dedup.
2. **Given** cliente com N>1 boletos inéditos numa mesma execução, **then** recebe **só 1** notificação (menor vencimento) e as outras são marcadas sem enviar.
3. **Given** parcela já em `sienge_webhook_dedup` (por run anterior OU pelo webhook), **then** o cron **não** re-notifica.
4. **Given** `PORTAL_NOTIF_PAUSED=1`, **then** o cron não envia nada.
5. **Given** Sienge indisponível para um cliente, **then** aquele cliente é pulado (log) sem quebrar os demais; claim de parcela liberado em falha transitória de mapeamento.
6. Auth: sem `Bearer CRON_SECRET` → 401. tsc/lint/testes limpos.

## Dev Agent Record (@dev — 2026-07-01)
- [x] `GET /api/cron/boleto-scan/route.ts` — auth `Bearer CRON_SECRET` (lido em request-time), pausa via `portalNotificacoesPausadas()`.
- [x] Varredura de clientes (`role=cliente`+`is_active`+`sienge_customer_id`), `getFinancialStatement` → `hasBoleto`, ordenado por vencimento asc.
- [x] Dedup `claim_sienge_webhook` (chave `billReceivableId:installmentId`, tipo `BOLETO_SCAN`) — compartilhado com o webhook. Regra **1 msg/cliente/run**: envia a 1ª inédita, claima as demais sem enviar (`suppressed`).
- [x] Mapeamento de obra reusando `getReceivableBill` → `obras.sienge_enterprise_id` + vínculo `cliente_obras`; release do claim (delete dedup) só em falha transitória do Sienge; delay 300ms/cliente + try/catch por cliente.
- [x] `vercel.json`: cron `0 12,15,18,21 * * *` (9/12/15/18 BRT).
- [x] Teste `route.test.ts` (6 casos): auth 401, pausa, disparo 1x, anti-flood N→1 (menor vencimento), dedup claim negado, `hasBoleto=false` ignorado.
- **Checks:** `tsc` 0 · `eslint` 0 · `vitest` 6/6. Sem migration (reusa tabela/RPC da 126). `CRON_SECRET` confirmado em prod.
- **Files:** `packages/web/src/app/api/cron/boleto-scan/route.ts` (novo), `.../route.test.ts` (novo), `packages/web/vercel.json` (cron add).

## QA Results (@qa — 2026-07-01)
- **PASS.** AC1-6 cobertos por teste + inspeção.
- **Dedup compartilhado verificado:** `sienge_webhook_dedup.event_key` é PK com `ON CONFLICT DO NOTHING`; webhook (`PAYMENT_SLIP_REGISTERED`) e scan (`BOLETO_SCAN`) usam a MESMA chave `receivableBillId:installmentId` → nunca notificam em dobro.
- **Anti-flood confirmado:** cap de 1 notificação por cliente por execução; parcelas extras são claimadas (marcadas) sem envio → lote inicial de ~60 boletos vira ~1 msg/cliente e cada boleto notifica 1x para sempre. Alinhado à diretriz do diretor ("enviar o de hoje 1x, não repetir").
- **Resiliência:** erro de Sienge por cliente é isolado (try/catch, não derruba a varredura); claim liberado em falha transitória de mapeamento; miss permanente de obra fica claimado (não re-tenta em loop).
- **Sem risco de dado:** só leitura do Sienge + insert idempotente no dedup + envio de notificação (canais respeitam prefs/pausa).
- **Nota pós-deploy:** 1º cron após deploy dispara o lote atual (inclui Parcela 11 do Albert). Se quiser, forçar 1 execução manual (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/boleto-scan`) para conferir na hora.

## Change Log
- 2026-07-01 — @dev/@qa — cron `boleto-scan` implementado, testado (6/6) e aprovado. Pronto p/ @devops.
- 2026-07-01 — @po — GO (10/10): reusa infra (dedup+notifyNovoBoleto+template aprovado), anti-flood, sem migration.
- 2026-07-01 — @sm — Story criada a partir do gap de prod (webhook não dispara; boleto fica "gerado" sem confirmação bancária).
