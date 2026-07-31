# Story 75-253 — Portal do cliente: todas as fases com foto ficam alcançáveis

**Status:** InReview
**Tipo:** Fix
**Epic:** Portal do Cliente
**Complexidade:** S

## Contexto
Marcos (31/07): *"Na parte das fotos elas estão classificadas conforme as fases da
obra… vi uma falha ali, aparece somente algumas fases e não na navegação
horizontal, ou seja, as outras fases para mostrar as outras fotos não aparecem."*

A desconfiança estava certa, e a causa é pior do que "a rolagem não funciona".

### Medido em produção
| Obra | Fases cadastradas | Fases **com foto** | Fotos |
|---|---|---|---|
| Vind Residence | **38** | **9** | 74 |
| Yarden | **42** | **3** | 15 |
| Solum | 0 | — | 3 (todas sem fase) |

A faixa de filtro (`fotos/page.tsx:81`) desenha **uma pílula por fase cadastrada**
— 38 no Vind. Com nomes como "ESTRUTURAS METÁLICAS E COBERTURA", isso soma
**~6.000px de pílulas num container de ~864px**. Cabem 5 ou 6.

E há três agravantes:

1. **29 das 38 pílulas do Vind levam a tela vazia** — a fase existe no cronograma
   mas não tem foto.
2. **As primeiras da ordem são justamente as vazias.** `#2` e `#3` (SERVIÇOS
   PRELIMINARES) e `#5`, `#6`, `#7` (INFRAESTRUTURA) não têm foto. O cliente vê a
   parte visível da faixa cheia de fases sem nada.
3. **Nomes repetem.** No Vind, "INFRAESTRUTURA" aparece 4× e "REVESTIMENTOS E
   PAVIMENTOS" 3× — porque as fases vêm do cronograma por bloco/torre. Mesmo
   rolando, o cliente vê pílulas idênticas e não sabe distinguir.

O `overflow-x-auto` existe, mas com `scrollbar-none` não há barra nem pista: no
desktop com mouse não dá para chegar nas outras.

## Solução — ideia do Marcos + dois complementos
> *"E se somente liberar as pílulas quando tiver foto vinculada não dá?"*

Dá, e é melhor que consertar a rolagem: **38 → 9 pílulas** no Vind, **42 → 3** no
Yarden. Mas as 9 restantes ainda somam **~1.790px** em 864 — metade continuaria
fora. Então:

1. **Só fase com foto vira pílula** (a ideia dele) — mata 29 pílulas mortas.
2. **Contagem na pílula** (`SUPERESTRUTURA · 38`) — desambigua as duplicadas e diz
   onde está o conteúdo.
3. **Quebrar linha em vez de rolar** (`flex-wrap`) — com 9 pílulas cabe em 2-3
   linhas e **tudo fica visível**. Mata a classe do bug em vez de melhorar a
   rolagem; custa altura, e altura é barata numa tela de fotos.

## Critérios de aceite
- **AC1** — A faixa mostra **só** fases que têm ao menos uma foto vinculada, mais
  a pílula "Todas as fases".
- **AC2** — Cada pílula mostra a **contagem de fotos** daquela fase.
- **AC3** — A faixa **quebra linha** (`flex-wrap`); nenhuma pílula fica fora da
  área visível em nenhuma largura de tela.
- **AC4** — Obra **sem nenhuma** fase com foto (caso Solum, 3 fotos sem fase) não
  mostra faixa nenhuma — e as fotos continuam aparecendo, agrupadas em "Sem fase".
- **AC5** — Link antigo/salvo com `?fase=<id>` de uma fase **sem foto** não mostra
  tela vazia sem saída: cai em "Todas as fases".
- **AC6** — A seleção de fases e a contagem são **função pura**, testável sem DOM.
- **AC7** — Zero regressão: suíte verde, `tsc` limpo, build OK.

## Escopo
**IN:** `app/cliente/[obra_id]/fotos/page.tsx`, a função pura de seleção/contagem,
e os testes.

**OUT (decidido, mas precisa de decisão do Marcos):**
- 🔴 **O `/portal-viewer` não tem fase nenhuma.** A visão mestre
  (`portal-viewer/[vinculo_id]/fotos/page.tsx`, 25 linhas) delega a `FotosGrid` e
  mostra **grade plana com todas as fotos** — sem faixa, sem agrupamento. O
  Marcos supôs que o bug estava nos dois; na verdade o segundo portal tem um
  problema **diferente**: admin/supervisor não vê o portal como o cliente vê, que
  é justamente o propósito da visão mestre. Corrigir implica extrair o
  agrupamento+faixa do portal do cliente para um componente compartilhado e usar
  nos dois. **Story própria** — e resolve a divergência de vez.
- **Nomes de fase duplicados no cronograma.** É dado, não código: o cronograma
  gera 4 fases "INFRAESTRUTURA". A contagem na pílula (AC2) mitiga; distinguir de
  verdade exigiria um rótulo por bloco/torre no cadastro.
- Paginação de fotos. 74 é o máximo hoje; longe do teto de 1000 do PostgREST.

## Dependências
Nenhuma. Sem migração.

## Riscos
1. **Fase com foto que o cliente não deveria ver.** A seleção deriva das fotos que
   a consulta já devolve sob RLS, então uma fase só aparece se houver foto visível
   àquele cliente. Não abre nada novo.
2. **Faixa mais alta** com `flex-wrap` empurra a grade para baixo no celular. É o
   preço de tudo ficar alcançável, e conversa com a convenção da casa de nunca
   cortar conteúdo do cliente.
3. **Fase nova sem foto desaparece da faixa** — pode parecer que "sumiu". É o
   comportamento pedido: a faixa é filtro de fotos, não índice do cronograma (o
   cronograma completo está na aba Fases).

## Valor
Hoje o cliente do Vind alcança 5 ou 6 de 38 pílulas, e as visíveis são as vazias —
ou seja, o portal aparenta não ter fotos, tendo 74. A correção mostra 9 pílulas
úteis, todas alcançáveis, com a contagem à vista.

## Definição de pronto
AC1–AC7 verdes, gate do @qa, PR pelo @devops, deploy, e verificação no portal do
Vind: 9 pílulas, todas visíveis sem rolar, e cada uma abre suas fotos.

## Change Log
- 31/07/2026 — @sm: story criada (Draft). Diagnóstico medido em produção antes de
  especificar. **Correção de dois números meus no caminho:** (a) reportei 2.812
  fotos no Vind — era produto cartesiano da minha query, o real é **74**; (b) por
  isso a suspeita de estouro do teto de 1000 do PostgREST **não existe**.
- 31/07/2026 — @po: validação 10 pontos = **10/10, GO**. Ressalvas: (a) provar o
  caso Solum, que existe em produção; (b) **não confiar** nos números da story —
  reconferir por query independente, já que o autor corrigiu dois deles.
- 31/07/2026 — @dev: `fasesComFotos` (pura, 7 testes) + faixa reescrita com
  `flex-wrap`, contagem no rótulo e normalização de `?fase=` obsoleto.
- 31/07/2026 — @qa: gate **PASS**. Números reconferidos por query independente;
  caso Solum e fase órfã cobertos por teste. Suíte 1452, build 15s.
