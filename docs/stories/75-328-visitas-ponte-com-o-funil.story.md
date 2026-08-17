# Story 75-328 — Card de Visitas mostra quantas são da safra do período

**Story ID:** 75-328 · **Status:** Done · **Estimativa:** XS (~1 pt)
**Fluxo:** @sm → @po GO → @dev → @qa → @devops · **Pedido do Marcos (17/08)**, logo após o deploy da 75-321..326

## O relato

Marcos olhou o Analytics em 30 dias e perguntou: *"por que mostra 23 visitas realizadas, mas
no funil vejo 7?"*

Nenhum dos dois estava errado — mas para entender era preciso saber de cabeça que os cards
respondem a perguntas diferentes:

- **Card Visitas** conta agendamentos **pela data da visita**: "aconteceram 23 visitas nos
  últimos 30 dias", não importa quando o lead entrou.
- **Funil** conta **leads que entraram nos últimos 30 dias** e, desses, quantos visitaram.

A reconciliação medida em prod na hora da pergunta:

```
23 visitas realizadas no período
 └─ 21 leads distintos            (2 leads visitaram 2 vezes)
     ├─  6 entraram ANTES da janela → fora da coorte do Funil
     └─ 15 entraram no período
```

(O "7" que ele viu era, na verdade, a tela ainda **não deployada** — o funil antigo, por
etapa atual. O deploy correto mostra 16. Mas a pergunta continuou válida depois disso, e é
o que esta story resolve.)

## O que mudou

Uma linha nova no card de Visitas, logo abaixo da composição:

> As 23 realizadas são de 21 leads; **15** entraram no período. Os outros 6 entraram
> antes — visitaram agora, mas não são da safra do período, então o Funil abaixo não os conta.

- `buildVisits` ganhou `cohortLeadIds` (a MESMA coorte que alimenta o Funil — o `fetchLeads`
  que a rota já fazia) e devolve `leadsRealizadas` / `leadsRealizadasNaCoorte`.
- O select de `appointments` passou a trazer `lead_id`.
- Sem coorte informada, os dois totais saem **zerados** em vez de chutar, e a linha some.

É a mesma ideia da régua da 75-326: colocar as duas leituras onde o olho já está, em vez de
exigir que o leitor cruze dois cards de cabeça.

## O que esta linha NÃO afirma

Ela **não** diz que os 15 são o número do Funil. O Funil mostra 16 na mesma janela, porque
inclui 2 leads que passaram por "Visitou" sem ter um agendamento concluído dentro da janela
(visita registrada retroativamente ou realizada fora do recorte). A linha se limita a dizer
quantos leads visitaram e quantos deles são da safra — daí o leitor entende a direção da
diferença sem que a tela prometa uma igualdade que não existe.

## Evidências

Gates: `tsc` 0 · `eslint` 0 erros / 23 warnings (baseline) · `build` 5/5 · vitest **2443
passed** (191 arquivos), +3 casos novos: lead que visitou duas vezes contando como 1 lead e
2 visitas, coorte ausente devolvendo zero em vez de chute, e visita sem `lead_id` não
quebrando nem inflando a contagem.
