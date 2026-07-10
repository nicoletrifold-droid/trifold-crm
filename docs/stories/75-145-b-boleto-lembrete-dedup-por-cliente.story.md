# Story 75-145-b — Lembrete de boleto: dedup por cliente (não colidir entre clientes)

## Metadata
- **Status:** Done
- **Epic:** 75 — Notificações do Portal / Boleto
- **Branch:** story-75-145b-boleto-lembrete-dedup

## Context
Investigando a dúvida do Marcos ("hoje foi disparado o lembrete de vencimento?"), o banco confirmou que a rodada das 09h BRT (10/07/2026) disparou, MAS só **2 grupos `venc_hoje`** (Vind + Yarden) e 1 `atraso15` (Vind). Ao rastrear, achou-se um bug:

A chave de dedup dos lembretes (`sienge_webhook_dedup`, PK = `event_key`) era `${marco}:${obra.id}:${dueKey}` — **sem o cliente**. O cron itera por cliente, mas o "claim" é global por (marco, obra, vencimento). Como parcelas de financiamento costumam vencer no mesmo dia para todos, o **1º cliente** de cada obra com boleto vencendo naquele dia reivindicava a chave e **todos os outros clientes da mesma obra+vencimento eram silenciosamente pulados**. Resultado: forte sub-notificação (só ~1 cliente por obra/dia recebia).

O comentário do próprio código (Story 75-147) dizia a intenção correta — "1 mensagem por **cliente**+obra+marco/dia" — mas a chave esquecia o cliente. O teste do route existente usava um único cliente, então nunca pegou a colisão.

## Acceptance Criteria
- [x] AC1: a chave de dedup do lembrete inclui o `userId`: `marco:obra:userId:vencimento`. Clientes diferentes na mesma obra+vencimento geram chaves distintas → cada um recebe.
- [x] AC2: dedup intencional preservado — o MESMO cliente+obra+marco+vencimento não recebe 2x na mesma janela (chave idêntica).
- [x] AC3: marcos diferentes (venc_hoje/atraso5/atraso15) continuam sem colidir.
- [x] AC4: caminho de "novo boleto" (Passo 1, chave por receivableBillId:installmentId) inalterado — já era único por cliente.
- [x] AC5: teste do route atualizado para o novo formato + teste unitário do helper que trava a regressão (chave DEVE conter o userId).

## Out of Scope
- Reprocessar os clientes pulados HOJE (10/07): os lembretes só rodam às 09 BRT e são específicos da data — a janela passou. O fix vale da próxima rodada em diante. (Se quiser, dá para um disparo pontual manual.)
- Levantar via Sienge quem exatamente ficou sem aviso hoje.

## Dependencies
- `sienge_webhook_dedup` (claim_sienge_webhook), cron `boleto-scan`, `notifyBoletoLembrete`. Story 75-141/75-147 (origem).

## Complexity
- **T-shirt:** XS (helper de chave + 1 linha no cron + testes).

## Business Value
Garante que TODO cliente com boleto vencendo/atrasado receba o lembrete — antes, a maioria dos clientes de uma obra ficava sem aviso quando compartilhavam a data de vencimento. Impacto direto em inadimplência/experiência do portal.

## Risks
- Baixo. Só muda a granularidade da chave (mais específica). Não reenvia para quem já recebeu (dedup por cliente mantido). Chaves novas não colidem com as antigas.

## Definition of Done
- AC1–AC5; testes 880/880; `tsc`+ESLint limpos; deploy via @devops. Vale já na próxima rodada de 09h BRT.

## File List
- `docs/stories/75-145-b-boleto-lembrete-dedup-por-cliente.story.md` (this file)
- `packages/web/src/lib/boleto-lembrete-key.ts` (novo helper `lembreteEventKey`)
- `packages/web/src/lib/boleto-lembrete-key.test.ts` (novo — 4 testes)
- `packages/web/src/app/api/cron/boleto-scan/route.ts` (usa o helper com `cliente.id`)
- `packages/web/src/app/api/cron/boleto-scan/route.test.ts` (asserções atualizadas p/ chave com userId)

## QA Results (@qa / Quinn)
- **Gate: PASS.** 880/880 (4 novos do helper + 16 do route atualizados), `tsc` 0, ESLint limpo. Causa raiz confirmada por leitura do código + dado de prod (2 grupos hoje). O teste antigo usava 1 cliente → não pegava a colisão; agora o helper trava a regressão explicitamente.
- **Nota:** clientes pulados em 10/07 não são recuperados automaticamente (lembrete é date-specific e só roda 09h BRT).
