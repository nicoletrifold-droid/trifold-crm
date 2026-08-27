---
name: epic-87-qa-patterns
description: Epic 87 (Nicole — confiabilidade de contexto/estado) QA: oferta de horário custa 1 query POR candidato, erro de rede engolido em WEBHOOK_ASYNC_ERROR deixa o lead sem resposta, e campos reservados sem escritor a conferir por diff de grep
metadata:
  type: project
---

Fatos de domínio do Epic 87 que não se derivam de ler um arquivo só, medidos no gate da
**87-17 Fatia 1** (commit `1454d4ca`, PASS-com-CONCERNS em 27/08/2026).

## A oferta de horário da Nicole custa 1 query POR candidato

`isSlotFree` (`packages/ai/src/flows/visit-slot.ts`) é **uma ida ao `appointments` por horário
candidato**. `freeSlotsInPeriod` varre o período inteiro: **11 candidatos em `tarde`, 7 em `manha`**
(o teto é geométrico: `lastStart = min(toMin, close*60) - 60`, passo de 30min). Depois da 87-17 as
consultas vão em `Promise.all` → 11 concorrentes, profundidade sequencial 1.

**Why:** qualquer story que mexa na oferta de período está mexendo em latência no caminho da
resposta ao lead, e o Epic 88 tem teto medido de p95 (`D88-3`).

**How to apply:** ao revisar mudança em `freeSlotsInPeriod`/`isSlotFree`/`checkSlotAvailability`,
exigir teto de round-trips medido no fake — e mutar a FORMA, não a contagem (ver
[[mutacao-prova-teste-real]]). O p95 real se mede por
`metadata->>'ms_async'` do evento `whatsapp_async_done` (o webhook já registra, em
`packages/web/src/app/api/webhook/whatsapp/route.ts`).

## Erro na cadeia da agenda = lead sem resposta, com evento

Nenhum dos dois chamadores de `freeSlotsInPeriod` (`packages/ai/src/chat/pipeline.ts`, ramos
"dia+período" e remarcação) tem `try/catch`. Uma rejeição sobe até o `catch (asyncErr)` do webhook
do WhatsApp, vira `WEBHOOK_ASYNC_ERROR` em `system_events` e **o lead não recebe resposta nenhuma**.

**Why:** é o modo de falha de sempre, não uma regressão da 87-17 — mas a exposição por oferta subiu
de 3 para 11 queries (~3,7×). Registrado em `docs/backlog.md` como P2.

**How to apply:** a correção "falha de `isSlotFree` = trate como não livre" **não é obviamente
certa**: sob erro transitório ela esconde horário livre, que é uma versão branda do defeito que o
Epic 87 combate ("negar disponibilidade que existe"). Se alguém propuser isso como one-liner,
exigir a decisão explícita entre "não responder" e "responder com lista possivelmente incompleta",
mais evento próprio em `system_events`.

## Campos reservados sem escritor: `ofertas_do_sistema` / `afirmado_pela_nicole`

Declarados em `packages/ai/src/flows/agenda-state.ts` e **sem nenhum escritor ou leitor de
produção** — são da `87-10` (Onda 1) e a leitura é `W3-2e` (Onda 3). Em 27/08/2026 eram exatamente
**8 ocorrências** em `packages/ai/src` + `packages/web/src`, todas em `agenda-state.ts` e no teste
dele.

**Why:** várias stories do epic passam perto e a arbitragem recorrente é "não antecipar o campo".

**How to apply:** a prova de "zero escrita/leitura nova" é `diff` das saídas de `git grep` nos DOIS
commits, não a contagem de ocorrências (contagem igual com arquivos diferentes passaria). Comando
que funcionou: `git grep -n -E "ofertas_do_sistema|ofertasDoSistema|afirmado_pela_nicole" <sha> --
packages/ai/src packages/web/src` nos dois shas, `sed` para tirar o prefixo do sha, `diff`.

## Goldens byte-a-byte de `pipeline-agenda-state.test.ts`

O bloco `AC7 — o bloco [SISTEMA] dos turnos-ouro é byte a byte o do HEAD` tem docstring dizendo
"qualquer diferença aqui é achado bloqueante". Duas das strings são de PERÍODO e mudam legitimamente
quando a oferta muda.

**How to apply:** recalibração aceitável = a frase original **fica**, a justificativa é
**apendada, datada e nomeada** (story + motivo + aritmética), e a guarda é reafirmada para o resto.
E a prova de que o golden ainda morde não é o comentário: é reverter o conserto de produção e ver
os dois goldens vermelhos. Cuidado com a assimetria de cobertura: o golden "G6" cobre o sítio
"dia+período" (fixture com `appointments: []`); o ramo de **remarcação** (que passa
`excludeAppointmentId`) só tem `toContain("Horários LIVRES nesse período")` — sem asserção de
conteúdo.

## `checkSlotAvailability` ainda usa "os 3 primeiros"

A 87-17 consertou `freeSlotsInPeriod`, mas `checkSlotAvailability` mantém
`if (alternatives.length >= 3) break`. Ali a semântica é diferente ("as 3 alternativas mais
próximas DEPOIS do horário pedido") e está explicitamente fora de escopo — não confundir com o
defeito consertado.

Relacionado: [[reverificacao-focada]], [[mutacao-prova-teste-real]]
