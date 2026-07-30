# Story 75-241 — Direção visual da arte no "Pedir à Lídia"

**Status:** InReview
**Tipo:** Feature (pequena)
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** S

## Contexto
Marcos (30/07), depois de ver o Refazer arte: *"e se tivéssemos um plus — na
hora de CRIAR a arte dar um norte pra ela, tipo 'colocar pôr do sol atrás',
'usar sol da manhã'… criaria uma imagem mais assertiva"*. O pedido livre já
influencia a arte, mas passa pela interpretação do Sonnet; um campo dedicado
garante que a direção visual chegue ao motor de imagem palavra por palavra.

## Entrega
- Campo **"Direção da arte (opcional)"** no modal Pedir à Lídia (≤500 chars,
  some quando formato=reel — reel não gera imagem).
- O texto segue por DOIS canais: (a) prompt do Sonnet, com instrução de
  incorporar na `arte.descricao`; (b) **verbatim ao motor de imagem** via o
  mesmo parâmetro `ajuste` do Refazer (prioridade máxima).
- **Persistência determinística** (QA #1): o norte é ANCORADO na
  `arte_descricao` gravada (`…\n\nDIREÇÃO DO HUMANO (prioridade): …`) — todo
  Refazer o preserva, sem depender de o Sonnet ter incorporado.
- Reel zera a direção **no servidor** (QA #3): texto digitado antes de trocar o
  formato não vira instrução fantasma.

## Decisão de produto (registrada — QA #2)
A direção visual é um **override consciente do humano**: vai ao motor sem
passar pelo filtro de diretrizes do Sonnet, igual ao ajuste do Refazer
(75-240). Coerente com a regra da casa ("o humano é superior ao sistema",
mesma filosofia da 75-237). A rede de segurança continua sendo a fila: nada
publica sem aprovação humana.

## Arquivos
- `packages/ai/src/flows/marketing-post-request.ts` (+ `.test.ts`)
- `packages/web/src/app/api/marketing-posts/pedir/route.ts`
- `packages/web/src/app/dashboard/campaigns/agente/agente-client.tsx`

## QA Results
Quinn: **CONCERNS** (2 medium + 2 low) — resolvidos/decididos neste ciclo:
1. *(medium)* persistência do norte dependia de o Sonnet incorporar → ancorado
   na `arte_descricao` no insert (determinístico).
2. *(medium)* canal verbatim contorna as diretrizes da marca → **aceito e
   documentado** como override consciente (decisão acima).
3. *(low)* direção fantasma ao trocar p/ reel → zerada no servidor.
4. *(low)* story sem doc → este arquivo.
Verificado por ele: sem direção o prompt é byte-idêntico ao anterior (zero
regressão); validação 500 chars client+server; modo manual não repassa a
direção (correto — post manual usa o Refazer).

## Validação
- Suíte 1318/1318 (1 teste novo) · tsc limpo nos 2 pacotes · build OK.
- Sem migração.
