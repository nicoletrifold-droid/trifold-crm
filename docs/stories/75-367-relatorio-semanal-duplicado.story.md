# Story 75-367 — O relatório semanal chegou duas vezes porque a trava da 75-352 não cobre este cron

**Status:** Ready for Review — implementada pelo @dev 24/08 (ver Dev Agent Record)
**Tipo:** Corrida de concorrência + envio de e-mail duplicado (mesma família de bug da 75-352)
**Epic:** 75 — CRM Trifold
**Complexidade:** S (~2 pts — 1 rota editada, 1 constante nova, sem migration)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** nenhuma nova — reaproveita a **234** (`cron_locks` + `claim_cron_run` / `finish_cron_run`),
já aplicada em produção desde 20/08 10:49 UTC (Story 75-352).
**Depende de:** 75-352 (infraestrutura de claim já existe e está em produção; esta story só passa a
chamá-la de um segundo lugar).

## Como apareceu

Print do Marcos: dois e-mails **idênticos** — "Resumo semanal de leads · 16 de ago. – 23 de ago." — de
`Trifold CRM <contato@trifold.com.br>` para `alexandre@trifold.eng.br; marcos@trifold.eng.br`, às
**23:01** e **23:02** de 23/08/2026. Mesmo conteúdo, mesmo anexo (`relatorio-analytics-*.pdf`, 9 KB),
mesmos números (69 entradas / 51 ativos / 2 visitas / 9 perdidos).

Rota: `packages/web/src/app/api/cron/analytics-report/route.ts`.
Agendamento: `packages/web/vercel.json` → `"schedule": "0 2 * * 1"` (segunda 02:00 UTC = domingo 23:00 BRT).

## Investigação já feita (prova, não trabalho a repetir)

1. **Não é o loop por organização.** O handler faz `for (const org of orgs)` sobre `organizations` e
   envia para `REPORT_RECIPIENTS` fixo (env `ANALYTICS_REPORT_EMAILS` ou fallback hardcoded). Em
   produção (`dsopqkqjkmhytudaaolv`) existe **uma** organização —
   `00000000-0000-0000-0000-000000000001` / "Trifold Engenharia". O loop roda uma vez; não é ele
   duplicando o envio.

2. **Não é o manifesto de cron.** `packages/web/vercel.json` tem `/api/cron/analytics-report` uma única
   vez. Não há `.github/workflows/`, não há `cron.job` do Postgres apontando para essa rota.

3. **Foram dois envios reais, não duplicata de cliente de e-mail.** Em `system_events` de produção, os
   webhooks do Resend registraram DOIS `emailId` distintos na janela:
   - `eaabcb07-1d57-4121-bb81-94bb66415821` → `email.delivered` às `2026-08-24T02:01:52Z`
   - `8d79b606-0688-4ab8-86a1-589f7aa17967` → `email.delivered` às `2026-08-24T02:02:49Z` (e um segundo
     `delivered` do mesmo id às `02:03:02Z`)

   Dois message-ids = duas chamadas reais a `resend.emails.send`. ~57s de distância entre as entregas;
   o build de dados + `renderToBuffer` do PDF leva ~105s, então as duas invocações começaram com ~60s
   de diferença — a mesma assinatura de gatilho duplicado da 75-352, não de retry de e-mail.

4. **Mesma causa-raiz da 75-352, e ela já foi investigada a fundo lá.** Naquela story, a busca pelo
   segundo gatilho do `/api/cron/followup` (manifesto de cron, `cron.job`, contas Vercel) não achou
   nada no repo, e a conclusão foi: **o segundo gatilho é externo ao que o repo mostra**. A correção
   adotada foi não depender de achar a causa — trava atômica no banco. Essa infraestrutura já existe e
   está aplicada (`supabase/migrations/234_cron_lock_e_claim_atomico.sql`: tabela `cron_locks`, RPCs
   `claim_cron_run` / `finish_cron_run`, helper `packages/web/src/lib/cron/claim-run.ts`). **Só o
   `followup` a usa.** O `analytics-report` não tem trava nenhuma — é por isso que a duplicata passa
   aqui também, mesmo com a 234 já em produção há 4 dias.

## Por que não é só "copiar e colar" o que a 75-352 fez

O `followup` tem **duas** travas (RUN inteira + LEAD individual) porque processa centenas de leads por
run e cada um pode ser reivindicado por runs concorrentes de formas diferentes. O `analytics-report`
não tem essa segunda dimensão: uma run manda **um** e-mail para uma lista fixa de destinatários, para a
**única** organização existente. A trava de RUN sozinha (`claim_cron_run`) já fecha o buraco inteiro —
não há "item" para reivindicar individualmente. Se um dia existir mais de uma organização com relatório
próprio, este cron precisará da mesma dupla trava do followup; hoje seria complexidade sem uso.

## Acceptance Criteria

**AC1 — A run só roda uma vez por janela.** `claimCronRun(supabase, "analytics-report",
INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS)` é chamado no **topo** do handler, antes de qualquer query
(`organizations`), antes de `buildAnalyticsReportData` e antes de `renderToBuffer`. Quem perde a
corrida (`claimed === false`) não monta dado nenhum, não renderiza PDF, não chama o Resend, e responde
`200` com `{ sent: 0, errors: 0, skipped_reason: "already_running" }`. **Antes do response, a
perdedora registra o rastro** via `logEventOnce` (categoria `cron`, `event_type:
"ANALYTICS_REPORT_RUN_DUPLICADA"`, `metadata: { job: "analytics-report", intervalo_minimo_s:
INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS }`) — espelho do `FOLLOWUP_RUN_DUPLICADA` já em produção
(`packages/web/src/app/api/cron/followup/route.ts`, linhas 104-120). Sem esse registro, depois do
deploy as duas hipóteses "a trava barrou a duplicata" e "o gatilho duplicado parou de acontecer"
produzem exatamente a mesma evidência (um e-mail, uma linha em `cron_locks`) e o AC1 fica não
verificável em produção.

**AC2 — Intervalo mínimo de 144h (6 dias), com folga documentada.** Constante
`INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS = 144 * 3600` exportada de
`packages/web/src/lib/cron/claim-run.ts` (ao lado de `INTERVALO_MINIMO_FOLLOWUP_SEGUNDOS`, mesmo
padrão). Um cron semanal (168h) com 144h de intervalo mínimo deixa 24h inteiras de folga para atraso de
agendamento — a distância real observada entre as duas invocações duplicadas foi de ~60s, então
qualquer intervalo de poucos minutos já cobriria o caso concreto; 24h de margem é generoso mesmo se a
Vercel atrasar a invocação por horas, sem abrir espaço para confundir a run desta semana com a da
semana seguinte (evento mais próximo possível: 7 dias).

**AC3 — Falha do claim é tratada como FAIL-CLOSED neste cron (decisão explícita, diferente do
followup).** O helper `claimCronRun` é fail-open de propósito: quando o RPC falha ele devolve
`{ runId: null, claimed: true }` e documenta que a run deve seguir sem trava (ver docblock do helper —
comportamento usado pelo `followup`, que tem uma segunda trava por lead cobrindo esse caso). Aqui não
existe segunda trava, então esse retorno específico (`claimed === true && runId === null`) deve ser
tratado no `analytics-report` como "não envia": a rota loga via `logEventOnce` (categoria `cron`,
`event_type: "ANALYTICS_REPORT_CLAIM_INDISPONIVEL"`, é a última escrita antes do response — mesmo
motivo do `FOLLOWUP_RUN_DUPLICADA` na 75-352, o `logEvent` fire-and-forget pode morrer no congelamento
da lambda) e responde `200` com `{ sent: 0, errors: 0, skipped_reason: "claim_indisponivel" }`, sem
tocar em `buildAnalyticsReportData`, `renderToBuffer` ou `resend.emails.send`. **O helper compartilhado
`claim-run.ts` NÃO é alterado** — o fail-open dele continua valendo para o `followup`; o fail-closed é
responsabilidade exclusiva do chamador `analytics-report`.

**AC4 — `maxDuration` declarado.** `export const maxDuration = 300` no topo de
`packages/web/src/app/api/cron/analytics-report/route.ts`. Hoje a rota não declara nada (default
implícito da plataforma) apesar de o render do PDF levar ~105s; outros crons do projeto com trabalho
pesado já declaram o mesmo valor (`supremo-sync`, `sienge-customer-sync`, `nicole-agenda-reconcile`).

**AC5 — Recibo aguardado no caminho vencedor.** Ao final do processamento (sucesso, com `sent` e
`errors` já contabilizados pelo loop de organizações existente), `finishCronRun(supabase, runId, {
sent, errors })` é chamado e **aguardado** antes do `return`. Nos dois caminhos de skip (AC1 e AC3) não
há `runId` real (perdeu a corrida ou o RPC falhou), então `finishCronRun` não é chamado — o helper já é
no-op para `runId === null`, mas documentar a omissão explicitamente evita uma chamada supérflua.
O early return `{ sent: 0, message: "No organizations found" }` (route.ts:37-39) passa a ficar **depois**
do claim, então ele também chama `await finishCronRun(supabase, runId, { sent: 0, errors: 0 })` antes de
responder — senão a linha de `cron_locks` fica com `finished_at` nulo para sempre e o recibo passa a
mentir sobre uma run que terminou. (Em produção existe uma organização; é blindagem, não caso esperado.)

**AC6 — Sem migration nova, sem mudança de agendamento.** Reaproveita a 234 tal como está.
`packages/web/vercel.json` não é tocado — o schedule `"0 2 * * 1"` permanece.

## Fora de escopo

- **Não investiga nem resolve o segundo gatilho em si** — mesma decisão da 75-352: consertar o efeito
  sem depender de confirmar a causa externa ao repo.
- **Não altera o comportamento fail-open do helper `claim-run.ts`** — o `followup` depende dele.
- **Não adiciona uma segunda trava por item** (não há "item" aqui — um e-mail, uma lista fixa de
  destinatários). Se o relatório passar a ser por organização com múltiplas orgs, revisitar.
- **Não muda o conteúdo do e-mail, o PDF ou a lista de destinatários.**
- **Não mexe no `vercel.json`** — schedule inalterado.

## Tasks / Subtasks

- [x] **AC2** — Adicionar `INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS = 144 * 3600` em
      `packages/web/src/lib/cron/claim-run.ts`, com comentário justificando o número (mesmo formato do
      comentário já existente para `INTERVALO_MINIMO_FOLLOWUP_SEGUNDOS`).
- [x] **AC1** — Importar `claimCronRun`, `finishCronRun` e a nova constante em
      `packages/web/src/app/api/cron/analytics-report/route.ts`; mover a chamada para o topo do
      handler, logo após a validação de `CRON_SECRET`/`RESEND_API_KEY` e antes do `select` em
      `organizations`.
- [x] **AC1** — Implementar o `return` antecipado para `claimed === false` (`skipped_reason:
      "already_running"`), sem tocar em `buildAnalyticsReportData`/`renderToBuffer`/`resend.emails.send`,
      com `logEventOnce` (`ANALYTICS_REPORT_RUN_DUPLICADA`) aguardado antes do response.
- [x] **AC3** — Implementar o `return` antecipado para `claimed === true && runId === null` (RPC
      falhou), com `logEventOnce` (`ANALYTICS_REPORT_CLAIM_INDISPONIVEL`) aguardado antes do response.
- [x] **AC4** — Adicionar `export const maxDuration = 300` no topo da rota.
- [x] **AC5** — Envolver o `return NextResponse.json({ sent, errors })` final com
      `await finishCronRun(supabase, runId, { sent, errors })` antes do `return`.
- [x] **Testes** — Criar `packages/web/src/app/api/cron/analytics-report/route.test.ts` cobrindo os
      três caminhos (ganhou a corrida e envia; perdeu a corrida / `already_running`; RPC do claim falhou
      / `claim_indisponivel`) com mocks de `supabase.rpc`, `Resend` e `buildAnalyticsReportData`/
      `renderToBuffer` — sem rede real. Confirmar que o caminho vencedor preserva o comportamento atual
      (loop de organizações, contagem de `sent`/`errors`, corpo do e-mail).
- [x] Rodar `npx vitest run`, `type-check` e `eslint` — zero regressão na suíte existente.

## Dev Notes

- Handler atual completo (para referência exata de onde entram os `return`s antecipados):
  `packages/web/src/app/api/cron/analytics-report/route.ts` — validação de `CRON_SECRET` (linhas
  17-24), validação de `RESEND_API_KEY` (26-29), `createAdminClient()` (31), select de `organizations`
  (33-39), loop de envio (45-96), `return NextResponse.json({ sent, errors })` final (98).
- Padrão a seguir é o mesmo já em produção em `packages/web/src/app/api/cron/followup/route.ts`
  (chamada de `claimCronRun` logo após a checagem de horário comercial, `return` antecipado com
  `skipped_reason`, `finishCronRun` aguardado antes do `return` final). Este cron não tem checagem de
  horário comercial — o claim entra logo após a validação de env/secret.
- `claimCronRun`/`finishCronRun`: `packages/web/src/lib/cron/claim-run.ts` — **não alterar a lógica**,
  só adicionar a nova constante de intervalo.
- `logEventOnce`: `packages/web/src/lib/logger.ts` (linha 100) — versão **aguardada** de `logEvent`,
  usar para o `ANALYTICS_REPORT_CLAIM_INDISPONIVEL` por ser a última escrita antes do response (mesmo
  raciocínio do `FOLLOWUP_RUN_DUPLICADA` na 75-352).
- Categoria de evento válida: `"cron"` (tipo `EventCategory` em `logger.ts`).
- `cron_locks` já existe e está com RLS ligada, sem policy (só `service_role` escreve/lê) — nada a
  mexer nela.
- **Como liberar a trava à mão** — é a única consequência prática de 144h: se a run vencedora falhar no
  envio (ou se for preciso reenviar dentro da mesma semana), o próximo gatilho só passa 6 dias depois,
  e não existe run intermediária para se recuperar sozinha (diferente do followup, que tenta de novo em
  2h). Para liberar:
  ```sql
  update cron_locks set started_at = now() - interval '200 hours' where job_name = 'analytics-report';
  ```
  A próxima invocação reivindica normalmente. O PDF sob demanda continua disponível sem trava nenhuma em
  `packages/web/src/app/api/analytics/report/route.ts` (baixa o arquivo, não manda e-mail) — mas é
  preciso pedir **`/api/analytics/report?range=7d`**: essa rota lê o período da própria URL
  (`resolvePeriod(sp.get("range"), sp.get("from"), sp.get("to"))`) e, sem o param, cai no padrão de
  **30 dias**, enquanto o cron usa `resolvePeriod("7d")` fixo. Sem o `?range=7d` o PDF sai com um
  período diferente do e-mail semanal. (Correção do concern C4 do @qa.)

## File List

- `packages/web/src/lib/cron/claim-run.ts` — nova constante `INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS`
- `packages/web/src/app/api/cron/analytics-report/route.ts` — AC1, AC3, AC4, AC5
- `packages/web/src/app/api/cron/analytics-report/route.test.ts` *(novo)* — AC1, AC3, cobertura do
  caminho vencedor

## Dev Agent Record

**Agent Model Used:** claude-opus-5[1m] (Dex/@dev, modo YOLO)
**Branch:** `main` (mudança de 3 arquivos, sem worktree)

### Ordem de implementação

AC2 primeiro (constante), depois AC4 → AC1 → AC3 → AC5 na rota, depois os testes. A ordem
importou: a constante é a única mudança permitida em `claim-run.ts`, e fazê-la primeiro deixou
explícito que nada mais nesse arquivo foi tocado (`git diff` de `claim-run.ts` = 11 linhas
adicionadas, zero removidas).

### O que ficou onde

| arquivo | o quê |
|---|---|
| `packages/web/src/lib/cron/claim-run.ts` | AC2 — `INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS = 144 * 60 * 60`, vizinha da constante do followup. **Nada mais**: `claimCronRun`/`finishCronRun` intactos |
| `packages/web/src/app/api/cron/analytics-report/route.ts` | AC4 (`maxDuration = 300`, linha 19) · AC1 (claim + saída `already_running`, linhas 53-78) · AC3 (fail-closed `claim_indisponivel`, linhas 80-100) · AC5 (`finishCronRun` aguardado nos dois returns do caminho vencedor) |
| `packages/web/src/app/api/cron/analytics-report/route.test.ts` | novo — 7 casos, mocks de `supabase.rpc`, `Resend`, `buildAnalyticsReportData`, `renderToBuffer` |

### Decisões

1. **`createAdminClient()` continua antes do claim.** A story pede o claim "antes de qualquer
   query" e antes do select de `organizations`; `createAdminClient()` só constrói o cliente (não
   faz I/O) e o claim precisa dele como argumento. Mesma ordem já em produção no `followup`
   (client em :72, claim em :97). Nenhuma query acontece antes do `claim_cron_run`.

2. **Os dois skips discriminados por `claimed` e depois por `runId`,** em dois `if` separados em
   vez de um `if` composto. `if (!claimed)` cobre a duplicata; `if (runId === null)` logo abaixo
   só é alcançável quando `claimed === true`, que é exatamente o retorno de fail-open do helper.
   Efeito colateral útil: depois dos dois guards o TypeScript estreita `runId` para `string`, e o
   `finishCronRun` do caminho vencedor nunca recebe `null` — o no-op do helper deixa de ser
   alcançável por este chamador.

3. **Dois testes além dos três pedidos** (7 no total): "sem organização fecha o recibo" (AC5, a
   correção do @po — é o único caminho onde `finished_at` podia ficar nulo) e "sem authorization
   não reivindica a trava" (`rpcs` vazio), que trava a exigência de o claim não abrir superfície
   pré-auth. Mais o assert de `maxDuration === 300` (AC4), que sem teste seria uma linha que
   ninguém percebe se desaparecer num merge.

### Validações

| checagem | resultado |
|---|---|
| `npx vitest run` (suíte inteira) | **242 arquivos, 2911 passed** + 6 expected-fail · 19,8s |
| `npx vitest run` (só os tocados) | 14 passed (7 novos + 7 de `claim-run.test.ts`) |
| `npm run type-check` | 8/8 tasks OK (`tsc --noEmit` sem erro) |
| `npm run lint` | **0 errors**, 29 warnings — todas pré-existentes, nenhuma nos 3 arquivos tocados (`npx eslint` neles: saída vazia) |

`packages/web/src/lib/cron/claim-run.test.ts` roda verde **sem alteração** — inclusive o caso de
fail-open (linha 69: "RPC com erro: fail-OPEN — a run SEGUE sem trava"). É a prova de que a
assimetria pedida pelo AC3 foi implementada no chamador e não no helper compartilhado.

### Não feito (conforme "Fora de escopo")

Nenhuma migration, `vercel.json` intacto, conteúdo do e-mail/PDF/lista de destinatários intactos,
nenhuma segunda trava por item, nenhuma investigação do gatilho externo. Sem `git push`/PR —
handoff para @qa e depois @devops.

## Verificar depois do deploy

1. **A trava pegou** — depois da primeira run de domingo:
   ```sql
   select job_name, started_at, finished_at, last_result
     from cron_locks where job_name = 'analytics-report';
   ```
   `finished_at` preenchido e `last_result` com `{ "sent": 1, "errors": 0 }` (ou o `skipped_reason`, se
   a run que "ganhou" foi a que perdeu — não deveria acontecer, mas o dado fica registrado).

2. **A trava barrou alguém, e quem?**
   ```sql
   select event_type, count(*)
     from system_events
    where event_type in ('ANALYTICS_REPORT_RUN_DUPLICADA', 'ANALYTICS_REPORT_CLAIM_INDISPONIVEL')
      and created_at > now() - interval '8 days'
    group by event_type;
   ```
   - `ANALYTICS_REPORT_RUN_DUPLICADA` = 1 → o gatilho duplicado continua existindo **e a trava pegou**.
     É o resultado esperado, e é a prova de que o AC1 funcionou (sem esta linha, "um e-mail só" também
     seria compatível com "o gatilho duplicado sumiu por conta própria").
   - `ANALYTICS_REPORT_CLAIM_INDISPONIVEL` > 0 → o RPC do claim falhou e o relatório **não** foi enviado
     (fail-closed do AC3). Investigar o banco/migration antes da próxima segunda.
   - Nenhuma das duas → só uma invocação chegou nesta semana; nada a fazer.

3. **Só um e-mail chegou** — checagem manual da caixa de entrada de
   `alexandre@trifold.eng.br`/`marcos@trifold.eng.br` no domingo seguinte ao deploy. É a prova final,
   já que o Resend não tem um identificador de "run" para consultar por SQL.

## Change Log

- 24/08 @sm: draft a partir da investigação do Marcos (print dos dois e-mails + `system_events` de
  produção com os dois `emailId` do Resend).
- 24/08 @po: **validado — GO (9,5/10)**. Conferido contra o código: migration 234 tem
  `claim_cron_run(text,int)` e `finish_cron_run(uuid,jsonb)` com as assinaturas usadas; o fail-open do
  helper é exatamente `{ runId: null, claimed: true }` (claim-run.ts:55), então o par
  `claimed === true && runId === null` do AC3 é discriminante e não exige tocar no helper; `vercel.json`
  tem a rota uma única vez com `"0 2 * * 1"`; não há `.github/workflows/` nem `pg_cron` apontando para
  ela; `logEventOnce` está em `logger.ts:100`; `maxDuration = 300` já é o valor usado por `supremo-sync`,
  `sienge-customer-sync` e `nicole-agenda-reconcile`; todas as linhas citadas em Dev Notes conferem.
  Três correções pontuais aplicadas na validação: (a) AC1 passou a exigir
  `ANALYTICS_REPORT_RUN_DUPLICADA` — sem esse log o AC1 não era verificável em produção; (b) AC5 passou
  a cobrir o early return de "No organizations found", que deixava `finished_at` nulo; (c) Dev Notes
  ganhou o procedimento de liberar a trava à mão, que é o único custo real de 144h (uma run vencedora
  que falhe no envio bloqueia o reenvio por 6 dias).
- 24/08 @dev: **implementada — Ready for Review**. AC1-AC6 atendidos. `claim-run.ts` recebeu só a
  constante nova (fail-open do helper preservado, `claim-run.test.ts` verde sem alteração); o
  fail-closed do AC3 vive no chamador, discriminado por `claimed === true && runId === null`.
  `finishCronRun` aguardado nos dois returns do caminho vencedor, incluindo o de "No organizations
  found" (correção (b) do @po). 7 testes novos em `route.test.ts` — os três caminhos pedidos + recibo
  do early return + ausência de superfície pré-auth + `maxDuration`, com assert explícito do
  `logEventOnce` de `ANALYTICS_REPORT_RUN_DUPLICADA` no caminho da perdedora. Suíte inteira: 2911
  passed / 0 falhas; type-check OK; lint 0 errors.

## QA Results

**Gate:** ✅ **PASS** · **Revisor:** @qa (Quinn) · **Data:** 24/08/2026 · **Round:** 1
**Arquivo de gate:** `docs/qa/gates/75-367-relatorio-semanal-duplicado.yml`
**Ações obrigatórias antes do push:** nenhuma. Liberado para @devops.

### Os 7 checks

| # | Check | Resultado | Evidência |
|---|---|---|---|
| 1 | Code review | ✅ PASS | Espelha o padrão do `followup` (claim → guard com `skipped_reason` → `finishCronRun` aguardado) e, onde divergiu, divergiu de propósito com o porquê no comentário. Dois `if` separados em vez de um composto: `if (!claimed)` cobre a duplicata, `if (runId === null)` só é alcançável com `claimed === true` — exatamente o retorno de fail-open do helper. Depois dos guards o TS estreita `runId` para `string`, então o `finishCronRun` do caminho vencedor nunca recebe `null`. |
| 2 | Unit tests | ✅ PASS | Rodados por mim, não pelo relatório: **242 arquivos / 2911 passed + 6 expected-fail** (20,41s); só os tocados: **14 passed**. Os 7 casos novos seguram a assimetria de fail-safe, que é o item fácil de inverter num futuro "vamos padronizar os crons". |
| 3 | Acceptance criteria | ✅ PASS (6/6) | AC1 claim em `route.ts:53-57`, antes do select (`:102`), do `buildAnalyticsReportData` (`:121`) e do `renderToBuffer` (`:124`) · AC2 constante em `claim-run.ts:35` · AC3 fail-closed no chamador (`:80-100`), helper intacto · AC4 `maxDuration = 300` (`:19`) com teste · AC5 `finishCronRun` aguardado em `:109` **e** `:170` · AC6 sem migration, `vercel.json` fora do diff. |
| 4 | No regressions | ✅ PASS | `git diff --stat`: 2 arquivos de código. `claim-run.ts` = **+11/-0**, `claimCronRun`/`finishCronRun` byte-idênticos; `claim-run.test.ts` verde **sem edição**, inclusive o caso "RPC com erro: fail-OPEN" (linha 69); `followup/route.ts` ausente do diff. Corpo do e-mail, PDF e destinatários intactos — o teste do caminho vencedor assere subject, `to`, `contentType` do anexo e `<strong>69</strong>` no HTML. |
| 5 | Performance | ✅ PASS (com ganho) | Troca ~105s de render de PDF descartado (o que a invocação duplicada pagava) por um round-trip de RPC. `maxDuration = 300` remove a dependência do default implícito da plataforma numa rota de ~105s. |
| 6 | Security | ✅ PASS | Claim **depois** do `Bearer ${CRON_SECRET}` (`:33`) — nenhuma requisição não autenticada queima a janela de 144h; o teste do 401 assere `rpcs` vazio. O desvio do `createAdminClient()` antes do claim é aceitável: conferi `lib/supabase/admin.ts`, a função só lê env e chama `createClient` com `autoRefreshToken:false`/`persistSession:false` — **zero I/O**, nenhuma query antes do `claim_cron_run`. Sem segredo novo, sem PII nos metadata, `cron_locks` segue RLS-on sem policy. |
| 7 | Documentation | ✅ PASS | Dev Agent Record com ordem e decisões; "Verificar depois do deploy" com as duas queries que tornam o AC1 falsificável em produção; procedimento de liberar a trava à mão. Nada fora da story precisa mudar. |

**Validações independentes:** `npx tsc --noEmit` direto em `packages/web` → EXIT=0 (não confiei no cache
do turbo) · `npx eslint` nos 3 arquivos → saída vazia · `npm run lint` → 0 errors / 29 warnings, todas
pré-existentes e nenhuma nos arquivos da story · `npm run build` → 5/5.
**CodeRabbit:** ⏭️ **SKIP** — CLI não instalada nesta máquina (darwin, sem WSL; nada em
`~/.local/bin/coderabbit` nem no PATH). Revisão 100% manual.

### O que eu fui checar com desconfiança

**A assimetria fail-open/fail-closed.** É o coração da correção e o ponto onde um "conserto" bem
intencionado no helper quebraria o `followup` em silêncio. Conferido nos dois sentidos: o helper não
mudou uma linha (só ganhou a constante vizinha) e o `claim-run.test.ts` passa sem edição — se o
fail-closed tivesse ido para dentro do helper, aquele teste estaria vermelho. O discriminante
`claimed === true && runId === null` é de fato inalcançável pelo caminho de sucesso: em
`claim-run.ts:71` o `claimed` é derivado de `runId !== null`, então o par só sai do `return` da linha 66,
que é o ramo de erro do RPC.

**Cobertura da causa-raiz, não só "o Resend não foi chamado".** Este era o risco de teste-que-não-prova-nada.
Os mocks de `buildAnalyticsReportData` e `renderToBuffer` incrementam contadores próprios
(`dadosMontados`, `pdfsRenderizados`) e os dois testes de skip assertam **0** nos dois, além de
`emailsEnviados` vazio. Quem perde a corrida não monta dado nem renderiza PDF — é a asserção certa,
porque o custo do bug não era só o e-mail, eram os 105s de lambda.

**A atomicidade no banco.** Reli a 234: `claim_cron_run` é um único
`insert … on conflict do update … where l.started_at < now() - make_interval(...)`. A segunda invocação
espera o row lock, reavalia o `WHERE` contra o `started_at` já atualizado, não encontra linha e devolve
`NULL`. Cobre concorrente e retry com um número só. Não há linha de `analytics-report` em `cron_locks`
hoje (só `followup`), então a primeira run pós-deploy passa pelo caminho de `INSERT` — que também
serializa corretamente.

**O recibo do early return.** A correção (b) do @po está aplicada e testada: `finishCronRun` aguardado
em `route.ts:109`, antes do `return` de "No organizations found", com o teste "sem organização: fecha o
recibo antes de sair" assertando `p_result: { sent: 0, errors: 0 }`. Sem isso, `finished_at` ficaria
nulo para sempre numa run que terminou.

**`logEventOnce` é a escolha certa.** Conferido em `logger.ts`: é a versão aguardada, e o dedupe é
**opt-in por `metadata.dedupe_key`** (índice único parcial da 218). Nenhum dos dois eventos passa
`dedupe_key`, então cada invocação duplicada grava a sua linha — que é exatamente o que a query de
contagem da seção "Verificar depois do deploy" precisa. `logEvent` fire-and-forget aqui morreria no
congelamento da lambda (Story 87-6), já que é a última escrita antes do response.

### Concerns (4 · todos LOW · nenhum bloqueia o push)

- **C1 — run vencedora que falhe no envio não gera evento.** O trade-off dos 144h está bem documentado
  e a mitigação existe de fato (conferi `/api/analytics/report`: sem trava, PDF sob demanda). O que
  sobra é o **gatilho** da mitigação: `errors` é contado e vai para `cron_locks.last_result`, mas o
  caminho de falha só escreve `console.error` (`:159` e `:165`) — nada em `system_events`. Das três
  situações pós-deploy, duas gritam e a única que custa 6 dias de atraso depende de alguém rodar a
  query 1 por conta própria. Não é regressão desta story (a rota nunca teve recibo de sucesso, ao
  contrário do `FOLLOWUP_EXECUTED`), mas é a classe de silêncio que a 75-350/75-351 pagaram caro.
  **Recomendação para backlog:** `logEventOnce` de `ANALYTICS_REPORT_ENVIO_FALHOU` (level error,
  category cron, metadata com `sent`/`errors`) quando `errors > 0`, antes do `finishCronRun`.
- **C2 — causa-raiz externa segue desconhecida** (herdado da 75-352, decisão explícita e correta).
  Reconferido o que dava: `vercel.json` tem a rota 1 vez, não há `.github/workflows/`. O
  `ANALYTICS_REPORT_RUN_DUPLICADA` é o que vai dizer se o gatilho persiste.
- **C3 — nenhum teste prova que o claim precede o select de `organizations`.** O mock rastreia `rpc()`
  em `rpcs[]`, mas `from().select()` não é registrado; `expect(rpcs[0])` prova "primeiro RPC", não
  "antes da query". A ordem está correta por código (`:53` vs `:102`) e o efeito está coberto pelos
  contadores em zero — risco de refactor futuro, não de hoje. Um `push` no mock de `from()` fecharia
  isso em 3 linhas.
- **C4 — o PDF sob demanda cai em 30 dias por padrão**, não nos 7 dias do e-mail: a rota usa
  `resolvePeriod` a partir da URL, o cron usa `resolvePeriod("7d")` fixo. Para reproduzir o conteúdo do
  relatório semanal é preciso `?range=7d`. Detalhe de procedimento nas Dev Notes, não de código.

### Nota para o futuro

Se o relatório passar a ser por organização com múltiplas orgs, a trava única de RUN vira gargalo: uma
org que falhe bloqueia todas as outras por 6 dias. Aí é a dupla trava do `followup` (run + item), como
a própria story antecipa em "Fora de escopo".
