# Story 75-349 — Destravar a troca de modelo da Nicole (hoje, trocar pelo painel derruba a Nicole em silêncio)

**Status:** Done — gate PASS · **PR #460 mergeado em 19/08** (squash) · deploy de produção `success`
**Tipo:** Dívida técnica bloqueante (2 incompatibilidades com a geração atual de modelos)
**Epic:** 75 — CRM Trifold
**Complexidade:** S (~2 pts — 1 arquivo, 0 migrations)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** nenhuma. **Esta story NÃO troca o modelo** — ela torna a troca possível.

## Por que existe

Marcos perguntou (19/08) se para melhorar a Nicole precisamos de um modelo mais forte (Opus 5 / Fable 5).
A resposta é que o gargalo hoje é prompt e dado (75-347/75-348) — mas ao conferir o caminho da troca
achei **dois bloqueios que fazem a Nicole responder vazio ou estourar 400** se alguém mudar
`agent_config.model_primary` pelo banco. Como o campo é editável fora do deploy, isso é uma armadilha
armada.

Produção hoje: **`claude-sonnet-4-6` · temperature 0,70 · max_tokens 1024** (confirmado por Management
API na 87-5).

## Bloqueio 1 — `temperature` é rejeitada pela geração atual

`pipeline.ts:1122` envia `temperature: agentConfig.temperature` em **toda** chamada. Fable 5, Opus 5,
Opus 4.7/4.8 e Sonnet 5 **removeram os parâmetros de sampling**: a requisição volta **HTTP 400**. Ou
seja: trocar o modelo pelo painel/banco para qualquer modelo atual = Nicole muda para 100% de erro,
sem uma linha de código alterada.

## Bloqueio 2 — a resposta é lida em `content[0]` (e é pior do que "responder vazio")

`pipeline.ts` lia `response.content[0]` e só usava o texto se `type === "text"`. Nos modelos atuais o
thinking é **ligado por padrão** e o bloco 0 pode ser `thinking` → o texto sai vazio.

**Correção do que escrevi ao abrir a story:** a Nicole não ficaria muda. O vazio cai no
`SANITIZED_EMPTY_FALLBACK` (75-279) e o lead recebe **uma frase neutra em todo turno** — sem exceção,
sem log, com a conversa parecendo funcionar enquanto tudo que o modelo disse é descartado. É pior que
silêncio: silêncio alguém percebe. Mesma família do token da Meta em 10/08 (75-289).

**Escopo real, medido:** há UMA chamada `messages.create` no pipeline (não três, como supus) — mas
`content[0]` aparecia em **6 lugares** do repo, e três flows já tinham a leitura certa com comentário
explicando o risco. Todos passam a usar a mesma função.

## AC1 — `temperature` só quando o modelo aceita

O parâmetro passa a ser condicional: enviado apenas para modelos que suportam sampling
(`claude-sonnet-4-6`, `claude-opus-4-6` e anteriores); omitido nos demais. A regra vive **em uma
função pura** (`supportsSampling(model)`), não espalhada por `if` no meio da chamada.

## AC2 — Ler o texto por filtro, nunca por posição

`textoDaResposta(content)` — filtra `type === "text"` e concatena — em `packages/ai/src/client/anthropic.ts`,
ao lado das strings de modelo. Aplicada aos **6** leitores: pipeline, `/handoff`, `/summary`,
`memory/writer`, `classify-contact`, `lead-memory`. Os cinco últimos rodam em Haiku (sem thinking por
padrão) e não estavam quebrados hoje — mas deixar cinco cópias da leitura frágil é rearmar a armadilha
para a próxima troca. Guarda aplicada a um caminho só é a lição da 75-268.

## AC2-b (achado não previsto) — a string de modelo que a 82-1 deixou passar

`/api/leads/[id]/handoff/route.ts` ainda tinha `claude-haiku-4-20250414` — exatamente a string que a
82-1 unificou em `/summary` e no cron. **Esse modelo não existe mais**: toda chamada dessa rota falhava
na API, e o `catch` ao redor engolia o erro e seguia sem resumo de handoff. Passa a usar
`ANTHROPIC_MODELS.haiku`.

## AC3 — Falha vazia deixa de ser silenciosa

Se o texto sair vazio, emitir evento de nível `error` (`event_type: "nicole_resposta_vazia"`, com
`model` no metadata) em vez de mandar string vazia ao lead. **Medir a falha é parte do conserto** — foi
o que faltou no token da Meta (75-289).

## AC4 — Teste que congela os dois bloqueios

Testes puros: (a) `supportsSampling` para cada modelo da tabela, (b) extração de texto quando o bloco 0
é `thinking`, (c) resposta vazia emite o evento. Sem esses testes, a próxima troca de modelo reabre a
armadilha.

## O que fica FORA desta story (decisão a tomar depois, com os prints na mão)

Trocar o modelo é decisão do Marcos, depois de 75-347/75-348 rodarem — senão não saberemos o que
melhorou. Referência de custo/latência para a decisão:

| Modelo | Custo (in/out por 1M) | Serve para a Nicole? |
|---|---|---|
| `claude-sonnet-4-6` (atual) | $3 / $15 | Sim — é o que roda |
| `claude-sonnet-5` | $3 / $15 (promo $2/$10 até 31/08) | Passo natural: mesma faixa, escrita melhor |
| `claude-opus-5` | $5 / $25 | Mais nuance de subtexto; usar `effort: low` para segurar latência |
| `claude-fable-5` | $10 / $50 | **Não** — thinking sempre ligado, turnos podem levar minutos. Em WhatsApp, 40s de silêncio parece abandono |

O custo real por turno já é mensurável sem estimativa: o pipeline emite `input_tokens`, `output_tokens`
e `prompt_cache_stats` a cada resposta. Antes de decidir, ler esses eventos de 7 dias.

## Dev Agent Record

- [x] **AC1** — `supportsSampling()` (lista de PERMISSÃO: desconhecido sai sem `temperature`) e o
      parâmetro agora é condicional. Verificado que a Nicole é o **único** consumidor do repo que
      envia sampling — o estrago era só dela, mas total.
- [x] **AC2** — `textoDaResposta()` nos 6 leitores.
- [x] **AC2-b** — string de modelo inexistente no `/handoff` trocada pela constante.
- [x] **AC3** — evento `nicole_resposta_vazia` (level `error`, com `model` e `tipos_de_bloco`).
- [x] **AC4** — 14 casos em 2 arquivos, com controle negativo (turno normal não acende o evento).

### Decisões de implementação

- **Lista de permissão, não de bloqueio.** Modelo novo desconhecido sai sem `temperature`: o pior caso
  é uma resposta mais determinística, contra uma conversa que não acontece.
- **A fixture precisa de `is_active: true`.** Sem isso `loadAgentConfig` cai no default do código e o
  teste mediria o fallback (`sonnet-4-6`) em vez do modelo configurado — verde por acidente. Está
  comentado na fixture porque é o tipo de detalhe que ninguém lembra na segunda vez.
- **O contrato de `textoDaResposta` é estreito** (`{ type, text? }`): a função só precisa ler texto. O
  teste declara um alias com `thinking` para as fixtures, em vez de alargar a função.

### Validações

`npx vitest run` 226 arquivos / **2.768 testes** ✅ · `type-check` 8/8 ✅ · `lint` 0 erros ✅ ·
`turbo run build --force` exit 0 ✅

## File List

- `packages/ai/src/chat/pipeline.ts` — AC1/AC2/AC3
- `packages/ai/src/client/anthropic.ts` — `supportsSampling` + tabela de modelos (AC1)
- `packages/ai/src/chat/pipeline-model-compat.test.ts` *(novo)* · `packages/ai/src/client/model-compat.test.ts` *(novo)* — AC4
- `packages/web/src/app/api/leads/[id]/handoff/route.ts` — AC2/AC2-b
- `packages/web/src/app/api/leads/[id]/summary/route.ts` · `packages/ai/src/memory/writer.ts` ·
  `packages/ai/src/flows/classify-contact.ts` · `packages/ai/src/flows/lead-memory.ts` — AC2
- `docs/qa/gates/75-349-destravar-troca-de-modelo.yml` *(novo)*

## Verificar depois do deploy

- Sem trocar nada: a Nicole responde igual (o modelo atual continua recebendo `temperature`).
- Em DEV, apontar `model_primary` para `claude-sonnet-5` e conferir resposta com texto (não vazia).
- Voltar `model_primary` para `claude-sonnet-4-6` em DEV ao fim do teste.
- ⚠️ **Nunca** testar troca de modelo direto em produção: `agent_config` é global da org.

Relacionado: 87-5 (confirmou o modelo de produção) · 75-289 (falha silenciosa que só existe se ninguém
mede) · 21-3 (prompt caching — o bloco estático segue cacheável) · 75-347 · 75-348
