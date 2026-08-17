# Story 75-323 — Funil de Conversão conta quem CHEGOU a cada etapa

**Story ID:** 75-323 · **Status:** Done · **Estimativa:** M (~5 pts)
**Fluxo:** @sm → @po GO → @dev → @qa → @devops · Origem: auditoria do Analytics (17/08), item 4

## O relato e o diagnóstico

O "Funil de Conversão" contava leads pela etapa **atual**. Isso não é um funil: cada andar
perde quem avançou, então o topo encolhe conforme o time trabalha bem e a conversão entre
andares mede o contrário do que parece. Medido em prod, mesma coorte (84 entradas, janela
09→16/08/2026):

| etapa | por etapa atual (antes) | chegaram a (agora) |
|---|---|---|
| Entradas | não aparecia | **84** |
| 1º Contato | não aparecia | 69 |
| Atendimento | 30 | **36** |
| Visita Agendada | 4 | **7** |
| Visitou | 1 | **2** |
| Represamento | não aparecia | 6 |

Dois efeitos somados:

1. **Cada andar estava subestimado**, porque quem avançou saía dele.
2. **O topo não era o volume de entrada.** O funil abria em "Atendimento 30" enquanto 84
   leads entraram e 69 passaram por "1º Contato" — uma etapa que o funil nem desenha. A
   conversão Visita Agendada → Visitou lida na tela era 1/4 = 25%; a real é 2/7 = 29%.

Achado colateral: **a etapa chamada "Atendimento" tem slug `no-show`** e a "Fechamento" tem
slug `fechou` (herança da nomenclatura antiga). `pickFunnelTiers` procurava pelos slugs
`atendimento`/`fechamento`, não achava, e os dois andares só funcionavam pelo fallback de
NOME — renomear a etapa em Configurações → Pipeline zeraria o funil em silêncio.

## O que mudou

- **`lib/analytics/funnel-reached.ts`** (novo, puro) — um lead chegou a uma etapa se está
  nela agora, **ou** alguma `stage_change` dele aponta para ela (`to_stage`), **ou** alguma
  `stage_change` dele SAIU dela (`from_stage`).
  O `from_stage` não é firula: o trigger de log (mig 124) só dispara no UPDATE, então lead
  **criado** direto numa etapa nunca registra chegada nela — na janela medida, 3 dos 84
  leads estavam em "Atendimento" com zero `stage_change`. Sem o `from_stage`, a etapa de
  origem de quem já avançou sumiria da conta.
- **Tela** — o Funil usa as contagens novas; o cabeçalho mostra as entradas do período e
  cada andar ganha "% das entradas". A régua do nível do líquido (75-320) passa a ser a
  entrada, então o topo deixa de estar sempre cheio: a perda de 84 → 36 vira visível.
- **PDF** — a seção "Funil de Conversão" lia `stages` (etapa atual) sob o mesmo título que
  a tela usava para outra conta. Agora usa o mesmo helper e o mesmo recorte. `stages`
  continua existindo para o card Ativos.
- **`pickFunnelTiers`** — cada andar aceita a LISTA de slugs que já significam aquilo
  (`atendimento|no-show`, `fechamento|fechou`); o nome segue como último recurso.
- Uma implementação só para os dois caminhos da página (com e sem filtro): a coorte sai de
  `leads` com os filtros de sempre e o histórico sai de `activities` recortado por
  **período** — não por lista de ids, que estouraria a URL do PostgREST com centenas de
  uuid. O cruzamento é em memória. Volume medido: 2.082 `stage_change` em 90 dias.

## Decisão consciente: Pipeline ≠ Funil (e agora está escrito na tela)

A 75-319 sincronizou a régua do Pipeline com o Funil. Eles voltam a mostrar números
diferentes — **de propósito**, porque respondem a perguntas diferentes:

- **Pipeline** = "onde estão AGORA os leads que entraram no período" (Atendimento 30)
- **Funil** = "quantos chegaram até aqui" (Atendimento 36)

Quem avançou sai da régua e permanece no funil. Os dois títulos dizem isso explicitamente,
e o funil ganhou uma linha apontando para a régua. Divergência é a mesma pergunta com duas
respostas; isto são duas perguntas.

## Evidências

Gates: `tsc` 0 · `eslint` 0 erros / 23 warnings (baseline) · `build` 5/5 · vitest 143 passed
(11 arquivos de analytics), +7 casos novos: 6 em `funnel-reached.test.ts` (etapa atual sem
log, caminho completo, origem pelo `from_stage`, ida-e-volta sem contar duas vezes, lead
fora da coorte, metadata torta) e 1 em `funnel-tiers.test.ts` casando pelos slugs reais de
prod com os nomes trocados.

Conferência contra o banco: a query que replica `buildReachedCounts` em SQL devolve
81/69/36/7/2/0 para a janela auditada — os mesmos números que a tela passa a mostrar.
