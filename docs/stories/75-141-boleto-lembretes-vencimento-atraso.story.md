# Story 75-141 — Lembretes de boleto no Portal (vence hoje + atraso +5d/+15d)

## Metadata
- **Status:** Ready for Review · **Epic:** Portal / Notificações · **Branch:** feat/75-141-boleto-lembretes · **Complexidade:** M (5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **Prioridade:** 🟠 pedido do diretor — reduzir inadimplência avisando o cliente no vencimento e no atraso.

## Contexto / Problema
A Story 75-101 (cron `boleto-scan`) já avisa o cliente quando um **novo boleto** fica disponível no Sienge (uma vez, via dedup compartilhado). Falta o ciclo de **cobrança amigável**, pedido pelo diretor:
1. **Vence hoje** — no DIA do vencimento do boleto (a data varia por cliente e por parcela).
2. **Atraso +5 dias** — 5 dias após o vencimento, se ainda em aberto.
3. **Atraso +15 dias** — 15 dias após o vencimento, se ainda em aberto. **Para por aqui** (sem cobrança indefinida).

Como o boleto pago vira `status=PAGO`/`hasBoleto=false` na mesma fonte que o portal usa (`getFinancialStatement`), **filtrar por `hasBoleto` faz o lembrete PARAR automaticamente quando o cliente paga** — sem depender de webhook de pagamento (que a conta não recebe de forma confiável, ver 75-101).

## Story
**As a** cliente do portal, **I want** ser lembrado (WhatsApp/e-mail/push) quando meu boleto **vence hoje** e quando fica **5 e 15 dias em atraso**, **so that** eu não esqueça de pagar — e a cobrança **para** assim que eu pago ou após 15 dias.

## Solução
Estender o cron existente `boleto-scan` com um **passo de lembretes** (mesma varredura, mesma fonte `getFinancialStatement`, sem varredura extra) e criar um novo dispatcher `notifyBoletoLembrete` em `lib/notificacoes.ts`, espelhando `notifyNovoBoleto`. Dedup por **TIPO+parcela** reutilizando `claim_sienge_webhook`/`sienge_webhook_dedup` com **chaves prefixadas distintas** por marco. **Sem migration.**

## Escopo
**IN:**
1. **Passo de lembretes no cron `boleto-scan`** (mesmo route `packages/web/src/app/api/cron/boleto-scan/route.ts`), **executado só na rodada das 09:00 BRT** (= 12 UTC). O cron já roda `0 12,15,18,21 * * *`; as demais rodadas continuam fazendo **apenas** a detecção de "novo boleto" (75-101, inalterada). Guardar por hora em `America/Sao_Paulo` (`hour === 9`), nunca por UTC cru.
2. **Cálculo de marcos em BRT (nunca UTC).** Para cada parcela com `hasBoleto` (boleto gerado + saldo > 0), calcular a diferença inteira de dias entre `dueDate` (parte `YYYY-MM-DD`) e o "hoje" em `America/Sao_Paulo`:
   - `diff === 0` → **venc_hoje**
   - `diff === 5` → **atraso5**
   - `diff === 15` → **atraso15**
   - qualquer outro valor → **nenhum lembrete** (inclui `> 15` → cobrança para).
   Comparar como datas de calendário via `Date.UTC(y,m-1,d)` para os DOIS lados (evita bug de ±1 dia do fuso).
3. **Dedup por TIPO+parcela** com `claim_sienge_webhook`, usando **chaves prefixadas distintas** (o `event_key` é PK da tabela — o `event_type` NÃO entra no conflito):
   - `venc_hoje:<billReceivableId>:<installmentId>`
   - `atraso5:<billReceivableId>:<installmentId>`
   - `atraso15:<billReceivableId>:<installmentId>`
   `event_type` (informativo): `BOLETO_LEMBRETE_VENC` / `BOLETO_LEMBRETE_ATRASO5` / `BOLETO_LEMBRETE_ATRASO15`. **NÃO** reutilizar a chave de "novo boleto" (`<billReceivableId>:<installmentId>`) — ela já está claimada e bloquearia o lembrete. Garante **1 envio por parcela por marco**, mesmo com o cron rodando 4×/dia.
4. **Novo dispatcher `notifyBoletoLembrete`** em `lib/notificacoes.ts`, espelhando `notifyNovoBoleto`:
   - Assinatura = `NovoBoletoParams` + `marco: "venc_hoje" | "atraso5" | "atraso15"`.
   - Respeita `obra_notificacao_prefs` por **canal** (`email_enabled`/`whatsapp_enabled`/`push_enabled`); **sem pref de evento dedicada** (financeiro é sempre relevante, igual a novo boleto). Linha ausente → `DEFAULT_PREFS`.
   - Respeita `portalNotificacoesPausadas()`.
   - Cada canal em `.catch` independente (nunca lança) — igual a `notifyNovoBoleto`.
5. **Canais:**
   - **E-mail + push funcionam já** (sem dependência externa). Copy por marco: venc_hoje = "Seu boleto vence hoje"; atraso = "Boleto em atraso". Reaproveitar/gerar HTML no padrão de `buildBoletoEmailHtml`; link `.../cliente/boleto/${obraId}`.
   - **WhatsApp** via `type:"template"` (espelhar `sendBoletoWhatsApp`), com 2 HSM (submetidos à Meta, hoje **PENDING**):
     - `boleto_vence_hoje` — usado no marco **venc_hoje**.
     - `boleto_em_atraso` — usado nos DOIS marcos **atraso5 e atraso15**.
     - Ambos: body `{{1}}`=nome, `{{2}}`=obra, `{{3}}`=vencimento; botão URL dinâmica base `https://crm.trifold.eng.br/cliente/boleto/{{1}}` (param = `obraId`), idioma `pt_BR`.
   - **Fallback gracioso:** se o template ainda não estiver aprovado, a chamada à Graph API falha (ex.: erro `132001`). O envio de WhatsApp já roda em `.catch` (log via `logWhatsappSend` status `failed`), então **não derruba a rodada** e **não impede e-mail/push**. **Não** liberar o claim do marco nesse caso (e-mail/push já foram; liberar re-enviaria tudo e duplicaria).
6. **Reaproveitar o mapeamento de obra** já usado pela detecção de novo boleto: `getReceivableBill(billReceivableId).enterpriseCode` → `obras.sienge_enterprise_id` + vínculo `cliente_obras (obra, user)`. **Memoizar `getReceivableBill` por `billReceivableId` dentro da iteração do cliente** (Map local) para não repetir chamadas ao Sienge entre a detecção de novo boleto e o passo de lembretes.
7. **Resiliência (igual 75-101):** falha transitória do Sienge (ex.: `getReceivableBill` lança) durante um marco → **libera o claim daquele marco** (`delete` em `sienge_webhook_dedup` por `event_key`) e pula o cliente; miss permanente de mapeamento (obra/vínculo inexistente) → **mantém claimado** (não re-tenta em loop). `try/catch` por cliente; delay entre clientes preservado.

**OUT / não-regressão:**
- **Detecção de "novo boleto" (75-101) permanece idêntica** — mesmas chaves, mesmo anti-flood "1 msg/cliente/run", roda nas 4 rodadas. O passo de lembretes é **aditivo** e roda em passo separado (não altera as decisões de claim do novo boleto).
- Webhook 75-76 permanece no ar (dedup compartilhado).
- **Sem migration** (reusa `sienge_webhook_dedup` + `claim_sienge_webhook`).
- **Sem cap "1 msg/cliente/run" nos lembretes:** cada marco por parcela é um evento financeiro distinto e acionável (num dia, no máximo ~1 parcela por marco por título). O dedup garante 1 envio por parcela/marco para sempre. `[AUTO-DECISION]`
- Sem checagem de distrato adicional (espelha `notifyNovoBoleto`, que também não checa) — eventual bloqueio de distratados fica como follow-up.

## Acceptance Criteria
1. **venc_hoje** — **Given** cliente com parcela `hasBoleto=true` e `dueDate` == hoje (BRT), **and** a chave `venc_hoje:<bill>:<inst>` inédita, **when** o cron roda às 09 BRT, **then** o cliente recebe **1** lembrete "vence hoje" (canais conforme prefs) e a chave fica registrada no dedup.
2. **atraso5** — **Given** parcela `hasBoleto=true` com `dueDate` == hoje−5 (BRT) e chave `atraso5:...` inédita, **then** recebe **1** lembrete "em atraso"; **atraso15** análogo para hoje−15.
3. **Para após 15** — **Given** parcela `hasBoleto=true` com `dueDate` == hoje−16 (ou qualquer diff ∉ {0,5,15}), **then** **nenhum** lembrete é enviado.
4. **Pago para o ciclo** — **Given** parcela com `hasBoleto=false` (paga), **then** nenhum lembrete de nenhum marco é enviado (mesmo caindo em 0/5/15).
5. **Dedup por tipo** — **Given** a chave do marco já em `sienge_webhook_dedup` (claim negado), **then** o cron **não** re-notifica aquele marco; marcos distintos da mesma parcela (venc_hoje vs atraso5 vs novo-boleto) são **independentes** (chaves diferentes).
6. **Só na rodada das 09 BRT** — **Given** a rodada das 12/15/18 BRT (15/18/21 UTC), **then** o passo de lembretes **não** dispara (só a detecção de novo boleto roda); na rodada das 09 BRT (12 UTC), os lembretes são avaliados.
7. **Opt-out por canal / pausa** — **Given** `whatsapp_enabled=false` (ou email/push), **then** aquele canal é omitido; **Given** `PORTAL_NOTIF_PAUSED`, **then** nada é enviado.
8. **WhatsApp template PENDING** — **Given** `boleto_vence_hoje`/`boleto_em_atraso` ainda não aprovado (Graph API erro), **then** o WhatsApp falha em silêncio (log), e-mail/push são enviados normalmente, a rodada **não** quebra e o claim do marco **não** é liberado.
9. **Datas em BRT** — os marcos são calculados em `America/Sao_Paulo` (sem bug de ±1 dia); auth `Bearer CRON_SECRET` (401 sem). tsc/lint/testes limpos.

## Dev Agent Record (@dev)
> Tasks / Subtasks — marcar ao concluir.

- [x] **`notifyBoletoLembrete` em `lib/notificacoes.ts`** (AC 1,2,7,8) — espelhar `notifyNovoBoleto`; param `marco`; respeita pausa + prefs por canal; canais em `.catch`. E-mail/push com copy por marco; helper `sendBoletoLembreteWhatsApp` escolhendo template (`boleto_vence_hoje` p/ venc_hoje, `boleto_em_atraso` p/ atraso5+atraso15), mesmos params e botão URL dinâmica; log via `logWhatsappSend`.
- [x] **Helper de datas BRT** (AC 9) — "hoje" em `America/Sao_Paulo` (Intl `formatToParts`) + diff inteiro de dias vs `dueDate` via `Date.UTC`. Mapear diff → marco (0/5/15) ou nenhum.
- [x] **Guard de hora 09 BRT** (AC 6) — no route, computar hora em `America/Sao_Paulo`; só avaliar lembretes quando `hour === 9`. Detecção de novo boleto (75-101) inalterada nas 4 rodadas.
- [x] **Passo de lembretes no route** (AC 1-5) — passo aditivo (separado da lógica de novo boleto) sobre as mesmas parcelas `hasBoleto`. Por parcela: determina marco → se marco, `claim_sienge_webhook('<marco>:<bill>:<inst>', '<EVENT_TYPE>')` → se claim, resolve obra (memoizada) + vínculo → `notifyBoletoLembrete`. Contadores no summary (`lembretesVenc`, `lembretesAtraso5`, `lembretesAtraso15`).
- [x] **Memoização `getReceivableBill`** (não-regressão/eficiência) — Map por `billReceivableId` na iteração do cliente, compartilhado com a detecção de novo boleto; só resultados OK são cacheados (falha transitória re-tenta). Também memoizei obra por `enterpriseCode` e vínculo por `obraId` na iteração.
- [x] **Resiliência** (AC 8, 75-101) — release do claim do marco só em falha transitória do Sienge (getReceivableBill); miss de mapeamento mantém claimado; try/catch por cliente.
- [x] **Testes `route.test.ts`** (AC 1-6) — `vi.useFakeTimers({toFake:["Date"]})` + `setSystemTime` (setTimeout real p/ o `sleep()` do route): venc_hoje dispara; atraso5/atraso15 nas datas certas; diff=16 → nada; `hasBoleto=false` → nada; claim negado por marco → não notifica (novo-boleto independente segue); chave prefixada + event_type corretos; rodada 18 UTC → sem lembretes mas novo-boleto roda; rodada 12 UTC → lembretes avaliados e novo-boleto 1×/parcela (não regrediu).
- [x] **Testes `notificacoes.test.ts`** (AC 7,8) — `notifyBoletoLembrete`: pausa → nada; toggles por canal (email/whatsapp/push); venc_hoje usa `boleto_vence_hoje`, atraso5/15 usam `boleto_em_atraso`; falha do template WhatsApp não lança e não impede email/push.
- [x] **Checks:** `tsc` 0 · `eslint` 0 (nos arquivos da story) · `vitest` verde (816/816). Sem migration.
- **Files (previstos):** `packages/web/src/lib/notificacoes.ts` (add `notifyBoletoLembrete` + helper WhatsApp/email), `packages/web/src/app/api/cron/boleto-scan/route.ts` (passo de lembretes + guard 09 BRT + memo), `packages/web/src/app/api/cron/boleto-scan/route.test.ts` (casos), `packages/web/src/lib/notificacoes.test.ts` (casos). `vercel.json` **sem alteração** (cron já existe).

### Agent Model Used
claude-opus-4-8[1m] (@dev / Dex)

### File List
- `packages/web/src/lib/notificacoes.ts` — MODIFIED: `notifyBoletoLembrete` dispatcher + `sendBoletoLembreteWhatsApp` + `buildBoletoLembreteEmailHtml` + tipos `BoletoLembreteMarco`/`BoletoLembreteParams` + mapas `LEMBRETE_TEMPLATE`/`LEMBRETE_COPY`.
- `packages/web/src/app/api/cron/boleto-scan/route.ts` — MODIFIED: passo de lembretes aditivo (só 09 BRT), guard de hora + helpers de data BRT (`hojeSaoPaulo`/`horaSaoPaulo`/`diffDiasVencimento`/`marcoParaDiff`), memoização de `getReceivableBill`/obra/vínculo, contadores no summary.
- `packages/web/src/app/api/cron/boleto-scan/route.test.ts` — MODIFIED: mock de `notifyBoletoLembrete`, fake timers (Date), `claimByKey` p/ negar claim por marco, 7 novos casos de lembrete.
- `packages/web/src/lib/notificacoes.test.ts` — MODIFIED: `from` sobrescrevível, 5 novos casos de `notifyBoletoLembrete`.

### Completion Notes
- Implementado 100% dentro do escopo IN da story. Sem migration (reusa `sienge_webhook_dedup` + `claim_sienge_webhook`), sem alteração em `vercel.json`.
- Detecção de "novo boleto" (75-101) preservada byte-a-byte na lógica de claim/anti-flood; a única mudança no passo 1 foi trocar a chamada direta `getReceivableBill` pela versão memoizada (`getBillMemo`) e o lookup de obra/vínculo pelos helpers memoizados — mesmo comportamento observável.
- Passo de lembretes roda em `for` separado, apenas quando `horaSaoPaulo(now) === 9`, sem o cap "1 msg/cliente/run".
- Fallback gracioso do WhatsApp: `sendBoletoLembreteWhatsApp` roda em `.catch` no dispatcher → template PENDING (erro Graph API) não derruba a rodada, não impede email/push, e o claim do marco NÃO é liberado (só falha do Sienge/`getReceivableBill` libera).
- Datas 100% em `America/Sao_Paulo` via `Intl.DateTimeFormat.formatToParts` + `Date.UTC` nos dois lados (sem bug de ±1 dia).
- Verificação: `pnpm --filter @trifold/web type-check` → 0 erros; `eslint` nos 4 arquivos → 0 problemas; `vitest run` (full) → 72 arquivos / 816 testes verdes (inclui os 24 dos 2 arquivos da story). Os 12 erros de `eslint` do `turbo lint` são pré-existentes em arquivos fora do escopo (weather-widget.tsx, informe-pdf.tsx, distributor.test.ts) — não introduzidos por esta story.

## QA Results (@qa)
_Pendente — aguardando implementação._

## 🤖 CodeRabbit Integration
> **Story Type Analysis:** Primary = Integration (Sienge + WhatsApp Graph API + notificações); Secondary = Backend/API (cron route). **Complexity:** Medium (route + dispatcher + testes; sem schema/migration).
>
> **Specialized Agent Assignment:** Primary @dev, @architect (padrões de dedup/idempotência e datas em fuso). Supporting @github-devops (deploy; WhatsApp depende de aprovação Meta).
>
> **Quality Gate Tasks:**
> - [ ] Pre-Commit (@dev): `coderabbit --prompt-only -t uncommitted`
> - [ ] Pre-PR (@github-devops): `coderabbit --prompt-only --base main`
>
> **Focus Areas:** (1) idempotência — chaves de dedup prefixadas distintas, sem colisão com "novo boleto"; (2) datas em `America/Sao_Paulo` (sem ±1 dia); (3) não-regressão do fluxo 75-101 (novo boleto); (4) fallback gracioso do WhatsApp (template PENDING) sem quebrar a rodada nem liberar claim; (5) resiliência a falha do Sienge (release seletivo do claim).

## Change Log
- 2026-07-06 — @sm (River) — Story criada (draft) a partir do pedido do diretor (lembretes de vencimento/atraso), estendendo o cron `boleto-scan` (75-101) e reusando `sienge_webhook_dedup`. Sem migration.
- 2026-07-06 — @po (Pax) — `*validate-story-draft`: GO (10/10). Claims técnicos verificados contra o código (route `boleto-scan`, `notificacoes.ts`, RPC `claim_sienge_webhook` — PK só em `event_key`, cron `0 12,15,18,21` = 09/12/15/18 BRT). Status Draft → Ready. Recomendações não-bloqueantes registradas para @dev/@qa.
- 2026-07-06 — @dev (Dex) — `*develop`: implementado `notifyBoletoLembrete` + passo de lembretes aditivo no cron (guard 09 BRT, datas BRT, dedup por marco prefixado, memoização de `getReceivableBill`/obra/vínculo, fallback gracioso do WhatsApp). +12 testes (7 route, 5 notificacoes). tsc 0, eslint 0 (arquivos da story), vitest 816/816. Sem migration, sem alteração em `vercel.json`. Status Ready → Ready for Review.
