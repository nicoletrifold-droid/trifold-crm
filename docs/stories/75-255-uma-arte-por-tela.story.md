# Story 75-255 — Uma arte por tela do story

**Status:** InReview
**Tipo:** Feature
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** M/L

## Contexto
Marcos (31/07), depois de abrir o preview da 75-254: *"Realmente não tem imagem e
isto não pode ficar assim."*

O preview da 75-254 foi feito justamente para revelar isso, e revelou: **o motor
gera UMA arte por post, e a Lídia propõe 2 telas de story.** A tela 2 sai só com
texto. A justificativa dela em produção já dizia — *"a arte gerada corresponde à
Tela 1… já que o sistema gera apenas uma arte por post"* — mas ninguém lia, porque
não havia como ver.

Consequência prática: o marketing recebe um story pela metade e precisa produzir a
segunda tela à mão, ou publica só a primeira e perde o fecho (que é onde está o
CTA, o "72% vendido", o "arraste").

## Decisão de produto por formato
Não é "N artes para tudo" — cada formato tem intenção própria, e duas delas já
estão certas hoje:

| Formato | Quantas artes | Por quê |
|---|---|---|
| `story` | **uma por TELA** (teto 3) | é o caso do Marcos: cada tela é uma imagem publicada |
| `carrossel` | **só a capa** (como hoje) | o prompt já diz *"os demais cards a equipe monta seguindo o mesmo estilo"* — intenção existente, não mexer |
| `estatico` | 1 (como hoje) | peça única |
| `reel` | 0 (como hoje) | o vídeo é produção humana |

**Teto de 3 no story:** cada geração leva ~15s e a rota tem `maxDuration = 300`.
Story de 3 telas = ~45s de arte + ~30s de Sonnet. Com folga. Sem teto, um dia
alguém pede 8 telas e a rota estoura no meio, deixando artes órfãs.

## Desenho
**Dados — coluna `jsonb`, não tabela nova.** `marketing_posts.artes` =
`[{ordem, url, descricao, cta}]`, ordenado. Segue a convenção da casa
(`arte_arquivos`, `cores`, `fontes` já são jsonb), não exige RLS nova, e essas
linhas nunca são consultadas relacionalmente. **`arte_url` continua existindo e
apontando para a arte da tela 1** — é o que a miniatura do card, o
`removerArteAntiga` e o preview legado já leem; quebrar isso seria trocar um bug
por outro.

**Contrato com o Sonnet — uma direção de arte POR TELA.** O bloco `arte` (objeto)
passa a `artes` (lista), cada item com `descricao`, `cta` e **`arquivos_kit`
próprios**. Isso é ganho lateral importante: a tela 1 cita o render da fachada, a
tela 2 cita a piscina — e **cada geração passa a ter seu próprio teto de 7MB de
referência**, em vez de as duas disputarem o mesmo.

**Retrocompatibilidade:** se o modelo devolver o `arte` singular antigo, tratar
como lista de 1. Nenhum post existente quebra.

## Critérios de aceite
- **AC1** — Story com N telas gera **N artes** (teto 3), uma por tela, cada uma com
  a direção de arte daquela tela.
- **AC2** — `carrossel`, `estatico` e `reel` mantêm o comportamento atual —
  respectivamente capa, 1 e 0. Nada de gerar 7 artes de carrossel.
- **AC3** — As artes ficam em `marketing_posts.artes` (jsonb ordenado) e
  **`arte_url` continua apontando para a arte da tela 1**.
- **AC4** — Migração faz **backfill**: post que já tem `arte_url` ganha
  `artes = [{ordem:1, url:<arte_url>, …}]`. Nenhum post existente fica sem arte.
- **AC5** — **Refazer arte é POR TELA.** Refazer a tela 2 não pode destruir a tela
  1 já aprovada — hoje o Refazer troca a arte única do post.
- **AC6** — O **preview (75-254)** mostra a arte de cada tela; a tela sem arte
  continua com o aviso honesto, para o caso de o teto de 3 cortar ou de uma
  geração falhar.
- **AC7** — **Fail-open por tela:** falha na arte da tela 2 não perde a tela 1 nem
  a copy. Cada falha loga.
- **AC8** — A seleção "quantas artes este post pede" é **função pura**, testável
  por formato e por número de telas.
- **AC9** — Zero regressão: suíte verde, `tsc` limpo nos 2 pacotes, build OK.

## Escopo
**IN:** migração 208 + backfill; contrato `artes` no flow do Sonnet com
retrocompatibilidade; orquestração de N gerações no `arte-service`; `arte_url`
sincronizado com a tela 1; refazer por tela (rota + UI); preview e card lendo a
lista; testes.

**OUT (decidido):**
- **Carrossel com arte em todos os cards.** Contraria a intenção já registrada no
  prompt. Se o marketing pedir, é decisão de produto própria.
- **Geração em paralelo.** Sequencial é previsível e não briga com limite de taxa
  do provedor; 45s no pior caso cabe folgado nos 300s.
- **Regenerar as artes dos 4 posts que já existem.** O backfill preserva o que há;
  quem quiser a tela 2 usa o Refazer.

## Dependências
75-239 (formato), 75-240 (motor), 75-248 (CTA composto), 75-250 (referência
forçada), 75-254 (o preview que revelou). **Migração 208** — o 207 está reservado
para o PR #308, conforme comentado lá.

## Riscos
1. 🔥 **Tempo da rota.** Story de 3 telas: ~30s de Sonnet + ~45s de arte = ~75s.
   Cabe nos 300s, mas o teto de 3 é o que impede a próxima surpresa. O post é
   inserido ANTES das artes (padrão da 75-240), então estouro não perde a copy.
2. **Custo por post multiplica por N.** Story de 2 telas = 2 gerações. Irrelevante
   no volume atual, relevante se a cadência subir muito.
3. **`arte_url` fora de sincronia com `artes[0]`** se algum caminho escrever só um
   dos dois. Mitigação: uma única função escreve os dois juntos.
4. **Post legado sem `formato`** (11 em produção) não deve virar N artes — cai em
   peça única.

## Valor
O story sai completo do CRM. Hoje o marketing recebe metade e improvisa a outra —
justamente a tela do CTA, que é onde a peça converte.

## Definição de pronto
AC1–AC9 verdes, gate do @qa, PR pelo @devops, deploy, e verificação com o Marcos:
pedir um story de 2 telas do Vind e ver **duas artes** no preview, uma por tela.

## Change Log
- 31/07/2026 — @sm: story criada (Draft). Nasce de um achado da 75-254 — o preview
  foi construído para expor exatamente isto. Numeração da migração: **208**, porque
  o 207 foi publicamente reservado ao PR #308 num comentário meu.
- 31/07/2026 — @po: validação 10 pontos = **10/10, GO**, com **quatro** ressalvas
  (a maior story do dia): backfill em dado de produção; `arte_url` e `artes[0]`
  concordarem sempre; refazer por tela não destruir as outras; e medir o tempo
  REAL da rota.
- 31/07/2026 — @dev: migração 208 + backfill; contrato `artes` (lista) no flow com
  retrocompatibilidade do `arte` singular; `gerarArtesParaPost` sequencial com
  fail-open por tela; `montarPatchDeArtes` como única escritora; refazer por
  `ordem`; preview e botões por tela. **`MARKETING_POST_SELECT` extraído** — a
  string estava duplicada em 5 arquivos e a coluna nova quase ficou de fora de um.
- 31/07/2026 — @qa: gate **PASS**. 🔥 A ressalva (b) **achou bug real**: o PATCH
  manual de `arte_url` (link do Canva) não mexia em `artes` — os dois divergiriam
  e o preview ignoraria o link colado. Fechado no mesmo ciclo, com teste.
  ⏳ A ressalva (d) — tempo real da rota — fica pendente de verificação em produção.
