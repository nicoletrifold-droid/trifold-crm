# Story 75-366 — Pré-aviso do bolsão: o gerente sabe ANTES de o lead cair

**Status:** InReview — implementada · template APPROVED na Meta · testes/lint/type-check verdes · sem migration
**Tipo:** Notificação preventiva (WhatsApp template + push) ao gerente comercial
**Epic:** 75 — CRM Trifold
**Complexidade:** S (~2 pts)
**Fluxo:** @sm → @po → @dev → @qa → @devops

## Pedido do Marcos (21/08)

> "5 minutos antes do lead ir para o bolsão, que seja enviada uma mensagem para o gerente
> comercial via WhatsApp: leads indo para o bolsão em X minutos."

Hoje o gerente só fica sabendo DEPOIS (resumo da 75-82/109, leads já parados no pool). O pedido
inverte o tempo: avisar enquanto o lead ainda tem dono, para acionar o corretor antes da queda.

## Como funciona

O lead vai ao bolsão aos **15 min de relógio comercial** sem atendimento (`bolsao-rebalance`,
cron a cada 5 min). O pré-aviso dispara quando um lead entra na **janela [10, 15)** — na prática
a mensagem sai com 1–5 min de antecedência, e o "X min" é calculado de verdade (15 − decorrido
do mais urgente, piso 1).

**Template novo `aviso_pre_bolsao_gestor`** (UTILITY, pt_BR, id `1629073791939942`, **APPROVED**
em 21/08, criado via Graph API — convenção: aprovado nunca se edita, muda-se para `_v2`):

> ⏳ Olá {{1}}! {{2}} lead(s) sem atendimento há mais de 10 minutos — vão para o bolsão em {{3}}
> min se o corretor não responder. Vale acionar agora.
> [Botão "Ver leads" → /dashboard/pipeline]

Destinatário: usuários ativos com role **`gerente-comercial`** (hoje: Joabe) — mesma regra do
resumo da 75-109. Push espelhado junto.

## ACs

**AC1 — Janela [10, 15) com o MESMO relógio do rebalance.** `businessMinutesBetweenSchedule`
sobre a última distribuição — relógio comercial, idêntico ao que decide a queda. Constante única:
`BOLSAO_REBALANCE_MIN` mudou-se para `lib/bolsao/pre-aviso.ts` e o cron importa de lá
(route files não exportam consts; a janela é derivada — nada duplicado).

**AC2 — 1 pré-aviso por lead, NA VIDA.** Marcador `activities.type='pre_bolsao_aviso'`; só lead
novo na janela dispara mensagem. A contagem da mensagem é a janela INTEIRA (retrato real), o
gatilho é a chegada de lead novo.

**AC3 — Anti-metralhadora.** Claim `(org,'pre_bolsao_aviso')` de 10 min (mesma RPC do digest):
pico de leads ≠ mensagem a cada 5 min. Lead que ficou de fora por causa do claim não é marcado —
entra na rodada seguinte.

**AC4 — Mensagem coalescida e honesta.** "{{2}} lead(s)… em {{3}} min": qtd = janela inteira,
X = do mais urgente. Nome com fallback "gerente" — variável vazia derruba o template (75-356).

**AC5 — Rastro e fail-safe.** Envio via `notificarGerentesComerciais` (extraído do
`sendBolsaoDigest`, que passou a usá-lo — comportamento do digest inalterado):
`whatsapp_send_log` com sent/failed + push espelho. Marcador gravado ANTES do envio: falha de
WhatsApp não vira spam de retry, e aparece no log (falha nunca é muda).

**AC6 — Sem migration, sem env.** Marcador em `activities`, claim na RPC existente.

## Fora de escopo

- Avisar o CORRETOR (já existe: SLA 10 min por push, e 75-354 por template).
- Configurar a antecedência pela UI — fica derivada (15−5); se pedirem, vira setting.
- Mudar o resumo pós-queda (75-82/109) — intacto.

## Dev Agent Record

**Branch:** `75-366-pre-aviso-bolsao` (worktree `~/tmp_claude/wt-75-366`)

| arquivo | o quê |
|---|---|
| `packages/web/src/lib/bolsao/pre-aviso.ts` | novo — constantes (fonte única) + `selecionarPreAviso` + `paramsPreAviso`, puros |
| `packages/web/src/lib/bolsao/pre-aviso.test.ts` | novo — 7 casos (janela, dedup, contagem, piso 1 min, variável vazia) |
| `packages/web/src/app/api/cron/bolsao-rebalance/route.ts` | bloco de pré-aviso + `notificarGerentesComerciais` compartilhado com o digest |

**Como conferir depois do deploy**

```sql
-- o aviso saiu?
select created_at, template, status, error from whatsapp_send_log
 where template = 'aviso_pre_bolsao_gestor' order by created_at desc limit 10;
-- quais leads foram avisados (e a queda aconteceu depois?)
select a.created_at, l.name, a.description from activities a join leads l on l.id = a.lead_id
 where a.type = 'pre_bolsao_aviso' order by a.created_at desc limit 10;
```

Esperado: todo `pre_bolsao_aviso` ~1–5 min antes do `bolsao_in` do mesmo lead (ou sem `bolsao_in`
nenhum — que é o aviso funcionando: o corretor atendeu a tempo).

## QA Results

**Verdict: PASS** (com 1 observação)

1. Code review ✓ — decisão extraída para função pura (convenção do projeto sem jsdom);
   REUSO: digest refatorado para o helper comum sem mudança de comportamento; constante
   `BOLSAO_REBALANCE_MIN` com fonte única (não duplicada).
2. Testes ✓ — 7 novos cobrindo bordas da janela (10 entra, 15 sai), dedup vs contagem,
   piso de 1 min e variável vazia; suíte completa 2904 passando.
3. ACs ✓ — todos; template APPROVED confirmado ANTES do merge (lição da 75-354, que travou
   em PENDING).
4. Regressões ✓ — digest da 75-82/109 preservado (mesmo template, mesma ordem de params,
   mesmo push); único delta: fallback de nome agora também cobre string em branco.
5. Performance ✓ — +1 SELECT em activities e +1 claim por rodada, só quando há candidatos.
6. Segurança ✓ — queries escopadas por org; token do WhatsApp continua vindo do banco.
7. Docs ✓ — queries de verificação pós-deploy na story.

**Observação (não bloqueia):** o claim de 10 min pode segurar o pré-aviso de um lead que
cruzou a janela logo após um pico — no pior caso ele é avisado 1 rodada depois ou cai no
bolsão e o digest da 75-82 cobre. Trade-off aceito contra metralhadora no WhatsApp do Joabe.

## Change Log

- 21/08 @sm: draft do pedido do Marcos (opção A de template, escolhida por ele).
- 21/08 @po: GO (10/10).
- 21/08 @dev: template criado e APPROVED · implementada + testes.
