# Story 75-360 — "Melquiades Jesus" virou "Já Comprei": palpite apagando nome real

**Status:** InReview — testes/lint/type-check verdes · sem migration
**Tipo:** Corrupção silenciosa de dado em produção
**Epic:** 75 — CRM Trifold
**Complexidade:** S (~2 pts — 1 guarda pura, 1 normalização, 10 testes)
**Fluxo:** @sm → @po → @dev → @qa → @devops

## O sintoma

Na varredura das conversas de 20/08 (a mesma que gerou a 75-358 e a 75-359), três leads apareceram
na lista com o nome trocado pela própria resposta que acabaram de mandar:

| nome real | mandou | `leads.name` ficou | hora |
|---|---|---|---|
| Melquiades Jesus | "Já comprei" | **"Já Comprei"** | 11:01:31 |
| Cleonice Viana | "Oii" | **"Oii"** | 11:01:36 |
| Amauri | "Morar" | **"Morar"** | 11:21:03 |

A prova de que o nome era real: o próprio template disparado 45 segundos antes dizia
*"Oi **Melquiades Jesus**! Tudo bem?"* — o `{nome}` saiu de `leads.name`.

Em 45 dias, ~12 nomes assim: "E Aí", "Tá bom", "Pede senha", "É parcelado", "Até", "Bom dia".

## As duas causas

**1. O pipeline escrevia sem olhar.** `pipeline.ts` fazia:

```ts
if (finalData.name && finalData.name.toLowerCase() !== "nicole") leadPatch.name = finalData.name
```

Sem nenhuma consulta ao que já havia em `leads.name`.

**2. A guarda do extrator olhava o lugar errado.** `qualification.ts` protege com `if (!updated.name)`,
mas `updated` vem do `collected_data` da **CONVERSA** — que está vazio mesmo quando o lead chegou do
Meta com nome completo. Então o *short message fallback* ("1 a 3 palavras começando com maiúscula =
nome") disparava, e o pipeline gravava por cima.

E era **silencioso**: nenhuma activity, nada na timeline. Ninguém percebe até o nome errado aparecer
na tela.

## AC1 — Palpite preenche vazio; só nome DECLARADO substitui

Nova função pura `podeGravarNomeDoLead(nomeAtual, nomeNovo, origem)`:

| lead atual | origem do novo | grava? |
|---|---|---|
| vazio/nulo | qualquer | ✅ — é o que preenche o vazio |
| "Amauri" | `declarado` ("meu nome é…", "me chamo…", "prazer, X") | ✅ — a pessoa disse |
| "Amauri" | `inferido` (palpite de mensagem curta) | ⛔ |
| "joao" | `inferido` = "João" | ✅ — mesmo nome, só corrige acento/caixa |

A origem passou a viajar dentro do dado extraído (`name_origin`): os padrões explícitos marcam
`declarado`, o fallback marca `inferido`. É a mesma disciplina da 87-4 e da 75-347 — **fato de
qualificação carrega de onde veio**, e o que decide não é o valor, é a procedência.

Comparação sem acento (`João` == `Joao`), pela mesma razão que a busca de leads usa `unaccent`.

## AC2 — Stoplist tolerante a letra repetida

A stoplist **já tinha "oi"** e ainda assim gravou **"Oii"**. Caçar variante por variante — oii, oiii,
oiiii — é jogo perdido, então `ehStopword` colapsa letra repetida antes de comparar (`"Oii"` → `"oi"`,
`"simm"` → `"sim"`). Sem estragar nome com letra dobrada legítima: `"Anna"` → `"ana"`, que não é
stopword.

Entraram também as palavras que a produção mostrou virando nome: `morar`, `comprei`, `investimento`,
`parcelado`, `senha`, `já`, `tá`, `aí`, `até`, `faz`, `tempo` e vizinhas.

⚠️ Stoplist é a **segunda** camada, de propósito. A garantia é o AC1: se a lista falhar de novo com
uma palavra que ninguém previu, o lead que já tem nome continua com ele.

## AC3 — Troca de nome deixa rastro

`emit` de `LEAD_NAME_REPLACED` com anterior, novo e origem. As três trocas de 20/08 foram silenciosas —
e é por isso que passaram.

## AC4 — O contrapeso está testado

Stoplist agressiva demais deixaria de captar nome de verdade. O teste trava os dois lados: os 12
textos-lixo **não** viram nome, e `"João Silva"`, `"Priscila Tanijo"`, `"Maria Cristina Gonzalez"`
continuam virando.

O gatilho do fallback **não** mudou. A primeira versão desta story exigia `nameExpected` (a Nicole ter
acabado de perguntar o nome), e o teste da 75-161 apontou o excesso: `"João Silva"` mandado sozinho
*é* um nome. Como a stoplist normalizada já cobre todos os casos observados e o AC1 cobre os não
observados, o gatilho ficou como estava.

## Sem backfill

Os quatro leads afetados **já estavam com o nome certo** quando fui conferir: restaurados às 11:30 do
próprio dia 20/08 (`leads.updated_at` entre 11:30:15 e 11:30:24), provavelmente pelo cron de
enriquecimento, que lê a conversa e repõe o perfil.

Ou seja: um caminho corrompia e outro consertava, e o dano visível durava ~20 minutos. Isso explica
por que os ~12 nomes-lixo de 45 dias são os que o enrich **não** pegou. Não é motivo para relaxar — é
motivo para não precisar de backfill agora. Vale, em outra story, olhar se o enrich está reparando
corrupção por acidente em vez de por desenho.

## Fora de escopo

- **75-358** (PR #472) — `no_show` apontando para a etapa "Atendimento"
- **75-359** (PR #474) — rajada do lead abrindo um pipeline por webhook

## Dev Agent Record

**Branch:** `75-360-nome-do-lead-sobrescrito` (worktree `~/tmp_claude/wt-75-360`)

**File List**

| arquivo | o quê |
|---|---|
| `packages/ai/src/flows/qualification.ts` | `podeGravarNomeDoLead()` + `semAcento()` + `ehStopword()`/`normalizaParaStopword()` + stoplist ampliada + `name_origin` nos dois caminhos de extração |
| `packages/ai/src/flows/nome-do-lead.test.ts` | novo — 10 casos, com os 3 de produção nomeados |
| `packages/ai/src/chat/pipeline.ts` | `currentLead` passa a ler `name`; a escrita passa pela guarda; `LEAD_NAME_REPLACED` |

**Validações**

- `vitest run` — **2845 testes passando** (+10), 6 expected-fail pré-existentes
- `turbo type-check` — 8/8 · `turbo lint` — **0 erros** (29 warnings pré-existentes)
- Sem migration, sem env nova.

**Como conferir depois do deploy**

```sql
-- nome de lead igual a uma mensagem que ele mesmo mandou: a lista não deve ganhar
-- caso NOVO com cara de resposta ("Oii", "Morar", "Tá bom"…)
select l.name, l.updated_at at time zone 'America/Sao_Paulo' as upd
from leads l
where exists (
  select 1 from conversations c join messages m on m.conversation_id = c.id
  where c.lead_id = l.id and m.role = 'user'
    and lower(trim(m.content)) = lower(trim(l.name))
) and l.updated_at >= now() - interval '7 days'
order by l.updated_at desc;
```

E `logs` com `event_type = 'LEAD_NAME_REPLACED'`: toda troca agora aparece ali, com a origem.
