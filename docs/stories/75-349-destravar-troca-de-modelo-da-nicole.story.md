# Story 75-349 — Destravar a troca de modelo da Nicole (hoje, trocar pelo painel derruba a Nicole em silêncio)

**Status:** Draft
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

## Bloqueio 2 — a resposta é lida em `content[0]`

`pipeline.ts:1174` lê `response.content[0]` e só usa o texto se `type === "text"`. Nos modelos atuais o
thinking é **ligado por padrão** e o bloco 0 pode ser `thinking` → `rawAssistantMessage` vira string
vazia e **a Nicole responde nada** (sem exceção, sem alerta — o pior tipo de falha, igual à do token da
Meta em 10/08). É o mesmo gotcha que já nos mordeu com Sonnet 5 em outro consumidor.

## AC1 — `temperature` só quando o modelo aceita

O parâmetro passa a ser condicional: enviado apenas para modelos que suportam sampling
(`claude-sonnet-4-6`, `claude-opus-4-6` e anteriores); omitido nos demais. A regra vive **em uma
função pura** (`supportsSampling(model)`), não espalhada por `if` no meio da chamada.

## AC2 — Ler o texto por filtro, nunca por posição

`response.content[0]` → `content.filter(b => b.type === "text")` concatenado (ou o primeiro texto).
Vale para as três chamadas do pipeline (`1120`, `1151`, `1172`), não só a principal — guarda aplicada a
um caminho só é a lição da 75-268.

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

## File List (previsto)

- `packages/ai/src/chat/pipeline.ts` — AC1/AC2/AC3
- `packages/ai/src/client/anthropic.ts` — `supportsSampling` + tabela de modelos (AC1)
- `packages/ai/src/chat/pipeline-model-compat.test.ts` *(novo)* — AC4
- `docs/qa/gates/75-349-destravar-troca-de-modelo.yml` *(novo)*

## Verificar depois do deploy

- Sem trocar nada: a Nicole responde igual (o modelo atual continua recebendo `temperature`).
- Em DEV, apontar `model_primary` para `claude-sonnet-5` e conferir resposta com texto (não vazia).
- Voltar `model_primary` para `claude-sonnet-4-6` em DEV ao fim do teste.
- ⚠️ **Nunca** testar troca de modelo direto em produção: `agent_config` é global da org.

Relacionado: 87-5 (confirmou o modelo de produção) · 75-289 (falha silenciosa que só existe se ninguém
mede) · 21-3 (prompt caching — o bloco estático segue cacheável) · 75-347 · 75-348
