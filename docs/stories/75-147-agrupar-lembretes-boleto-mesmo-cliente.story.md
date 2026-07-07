# Story 75-147 — Agrupar lembretes de boleto do mesmo cliente no mesmo dia

**Status:** Ready for Review
**Epic:** Notificações do Portal do Cliente
**Depende de:** 75-145 (lembretes de vencimento/atraso — já LIVE)

## Contexto
O cron `boleto-scan` (passo de lembretes, run 09h BRT) envia **1 notificação por parcela**
em cada marco (`venc_hoje` / `atraso5` / `atraso15`), nos 3 canais (WhatsApp/e-mail/push).
Cliente com N parcelas caindo no mesmo marco/dia (ex.: Carolina, 3 boletos vencendo 10/07)
recebe **N mensagens** — ruído. O passo de "novo boleto" já tem cap de 1/cliente/run, mas
os **lembretes não tinham** agrupamento.

## Decisão do diretor (2026-07-07)
Agrupar em **1 mensagem por cliente + obra + marco** reaproveitando os templates HSM **já
aprovados** (`boleto_vence_hoje`, `boleto_em_atraso`) — SEM nova aprovação na Meta. E-mail e
push ganham copy ciente da quantidade ("Você tem 3 boletos vencendo hoje na obra X"); o
WhatsApp mantém a copy singular do template aprovado, mas passa a ser enviado **1× só**.

Fundamento técnico: dentro de um mesmo (cliente, obra, marco) o **vencimento é sempre igual**
(venc_hoje = hoje; atraso5 = hoje−5; atraso15 = hoje−15), então o template de var única de
vencimento continua correto ao agrupar.

## Acceptance Criteria
1. **AC1** — N parcelas com boleto em aberto do mesmo cliente+obra caindo no MESMO marco/dia →
   **1** `notifyBoletoLembrete` (não N), com `quantidade = N`.
2. **AC2** — Parcelas do mesmo cliente em **obras diferentes** (mesmo marco) → 1 mensagem por obra
   (o template deep-linka para a obra).
3. **AC3** — Marcos diferentes no mesmo cliente/obra (ex.: venc_hoje + atraso5 no mesmo dia) →
   1 mensagem por marco (copy e template diferentes).
4. **AC4** — Dedup por **(marco, obra, vencimento)** — chave `${marco}:${obraId}:${dueDateISO}`.
   Não colide entre meses (parcela nova da mesma obra no mês seguinte tem vencimento diferente →
   dispara). 1 envio por grupo por run, mesmo com o cron rodando 4×/dia.
5. **AC5** — E-mail e push com copy no plural quando `quantidade > 1`; singular quando `= 1`.
6. **AC6** — WhatsApp inalterado (template aprovado, singular), enviado 1× por grupo.
7. **AC7** — Passo de "novo boleto" (75-101) e demais rodadas (12/15/18 BRT) **sem regressão**.

## Tasks
- [x] `boleto-scan/route.ts`: agrupar o passo de lembretes por (marco, obraId); resolver obra
      antes de agrupar; claim 1× por grupo com chave nova; contadores por mensagem enviada.
- [x] `notificacoes.ts`: `BoletoLembreteParams.quantidade?`; copy count-aware (e-mail subject/intro,
      push title/body); WhatsApp singular inalterado; `buildBoletoLembreteEmailHtml` recebe `quantidade`.
- [x] Testes: `boleto-scan/route.test.ts` (agrupamento, dedup por grupo, multi-obra) + copy plural.

## Dev Notes
- Chave de dedup ANTIGA (`${marco}:${billId}:${instId}`) fica órfã/inócua; a nova é por grupo.
  Edge de transição (deploy no mesmo dia em que a antiga já enviou) é aceito — marcos são de dia exato.
- Resolução de obra migra para ANTES do claim (necessária p/ agrupar). Falha transitória do Sienge
  no pré-passo lança e cai no catch por-cliente (nada foi claimado → re-tenta no próximo run). Mais
  limpo que o release-de-claim anterior.

## QA Results
**Gate: PASS** (Quinn, 2026-07-07) — `docs/qa/gates/75.147-agrupar-lembretes-boleto.yml`.
Os 7 ACs verificados contra o código. Dedup por (marco, obra, vencimento) não colide entre meses
(a chave inclui o vencimento). Copy plural cobre e-mail+push; WhatsApp mantém o template aprovado.
tsc 0, eslint 0 nos arquivos da story, **vitest 834/834** (+5 novos: 3 de agrupamento no cron, 2 de copy).
