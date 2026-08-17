# Story 75-326 — Pipeline e Funil: uma régua, duas leituras

**Story ID:** 75-326 · **Status:** InReview · **Estimativa:** S (~2 pts)
**Fluxo:** @sm → @po GO → @dev → @qa → @devops · **Decisão do Marcos (17/08)**, escolhida entre 3 opções

## A pergunta que originou a story

Depois da 75-323, Pipeline e Funil voltaram a mostrar números diferentes. Marcos perguntou:
*"se temos uma base, leads sempre, por que dados diferentes?"*

**Não são dados diferentes.** É a mesma query, os mesmos 84 leads. O que muda é quantas
VEZES cada lead é contado. Exemplo real do período (log de etapas de um lead que entrou
em 10/08):

```
Aguardando → 1º Contato → Visita Agendada → Aguardando → Atendimento → Visita Agendada → Visitou
```

- Na régua ele aparece **uma vez**, em "Visitou" (onde está agora).
- No funil ele aparece **em cinco andares** (por onde passou).

E é exatamente por isso que o funil precisa contar assim: se contasse como a régua, esse
lead — o melhor do período, o único que visitou — seria **subtraído** de "Visita Agendada".
Quanto melhor o time trabalha, menor ficaria o topo do funil.

O problema real não era o número: era ter as duas leituras em **cards distantes**, sem
nada dizendo que uma delas conta o mesmo lead várias vezes.

## O que mudou

- A régua do Pipeline passa a mostrar **as duas colunas por etapa**: `agora` (grande) e
  `chegaram` (abaixo, discreto), com a legenda explicando que a primeira fecha as entradas
  do período e a segunda não soma.
- `agora` cobre a coorte **inteira** — sem filtrar ativo/perdido —, então a linha soma
  exatamente as entradas. Isso exigiu listar etapas **inativas que ainda guardam lead**:
  "Perdido" é `is_active = false` e tinha 11 dos 84 na janela auditada. Etapas inativas e
  vazias seguem fora (entulho de pipeline antigo).
- O funil desenhado abaixo lê a coluna `chegaram` da mesma lista — mesma fonte, por
  construção.
- **PDF idem**: cada linha do funil mostra `chegaram` e, entre parênteses, `agora`.
- `buildPipelineRows` (novo, puro) monta as duas leituras. `stages`/`stagesOrdenadas`
  saíram da página: eram a fonte antiga da régua e ficaram órfãos.

## Snapshot de prod na entrega (janela 09→16/08)

| Etapa | agora | chegaram |
|---|---|---|
| Aguardando atendimento | 6 | 81 |
| 1º Contato | 28 | 69 |
| Atendimento | 28 | 36 |
| Visita Agendada | 3 | 7 |
| Visitou | 1 | 2 |
| Represamento | 6 | 7 |
| SDR | 1 | 2 |
| Perdido | 11 | 11 |
| **soma** | **84** ✓ | não soma (por design) |

## Correção de um erro meu

No preview que apresentei ao Marcos, a coluna "agora" mostrava Aguardando = 0 e omitia
SDR — eu tinha misturado o número de *vivos* (67) com a base de *entradas* (84), e a
coluna não fechava como afirmei. Os valores corretos são os da tabela acima. A escolha do
formato não muda; o número que eu mostrei, sim.

## Evidências

Gates: `tsc` 0 · `eslint` 0 erros / 23 warnings (baseline) · `build` 5/5 · vitest **2387
passed** (189 arquivos), +6 casos novos em `funnel-reached.test.ts`: soma da coorte × soma
das aparições, o lead que avançou aparecendo 1× na régua e em todos os andares, etapa
inativa COM lead (Perdido) incluída, etapa inativa vazia descartada, etapa ativa zerada
mantida (o funil não pode perder andar) e ordenação por `position`.
