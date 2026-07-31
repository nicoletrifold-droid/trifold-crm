# Story 75-254 — Visualizar como a postagem vai ficar

**Status:** InReview
**Tipo:** Feature
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** M

## Contexto
Marcos (31/07): *"Não dá pra colocar um botão de visualizar aqui? Sabe, abrir como
ficaria a postagem, como se comportaria a postagem proposta? Se é story de 2
páginas mostrar isto, e se for outro tipo mostrar."*

Hoje o card mostra a copy como **texto corrido** e a arte como **miniatura solta**.
Quem aprova precisa montar na cabeça: *"TELA 1: … TELA 2: …"* é uma sequência de
duas telas, mas na tela do CRM é um parágrafo. E a arte aparece ao lado, sem
relação visível com qual tela ela é.

Ou seja: aprova-se no escuro. O preview fecha isso mostrando o que o seguidor vai
ver, na ordem em que vai ver.

## O que os dados já oferecem (verificado em produção)
A copy **já vem estruturada por marcador**, porque o prompt do Sonnet manda:
- `story` → `TELA 1:`, `TELA 2:` …
- `carrossel` → `CARD 1:`, `CARD 2:` … (capa é o card 1)
- `estatico` → legenda única
- `reel` → legenda + `roteiro` em campo próprio

⚠️ **Gotcha real dos dados:** o marcador aparece **em linha separada OU no meio da
linha**. Um post em produção tem `"TELA 1: Vind. Obra avançando… TELA 2: Área de
lazer…"` tudo na mesma linha. O parser tem que quebrar pelo **marcador**, não por
linha — foi o primeiro erro que eu ia cometer.

⚠️ **11 posts têm `formato` NULL** (legado de antes da 75-239). Precisam de um
caminho de fallback, não podem quebrar o preview.

## 🔴 A verdade que o preview vai expor
**O sistema gera UMA arte por post, mas a Lídia propõe 2 telas de story.** A
própria justificativa dela em produção diz: *"a arte gerada corresponde à Tela 1…
já que o sistema gera apenas uma arte por post"*.

Então a Tela 2 **não tem arte**. O preview vai mostrar isso **explicitamente**, com
rótulo, em vez de repetir a arte da tela 1 e fingir que está completo. É o valor
principal da feature: hoje ninguém percebe essa lacuna; depois do preview ela fica
óbvia na hora de aprovar.

## Critérios de aceite
- **AC1** — Botão **Visualizar** no card do post, em **todas** as listas
  (sugeridos, aprovados, publicados). Fica dentro do `PostCard`, não em cada
  chamada — senão nasce faltando em alguma.
- **AC2** — `story`: mockup vertical **9:16** com **uma barra de progresso por
  tela** no topo, navegação para frente e para trás, e a arte na tela que a tem.
- **AC3** — Tela **sem arte** aparece com rótulo explícito de que não há arte
  gerada para ela. **Nunca** repetir a arte de outra tela.
- **AC4** — `carrossel`: mockup **1:1** com indicador de card, navegação, arte no
  card 1 (capa) e a legenda embaixo.
- **AC5** — `estatico`: mockup **4:5** com a arte e a legenda embaixo, como um post
  de feed.
- **AC6** — `reel`: sem arte (o vídeo é humano) — mostra o **roteiro** e a legenda.
- **AC7** — `formato` NULL (legado): não quebra; mostra arte, se houver, e a copy
  como legenda, sinalizando que o formato não está definido.
- **AC8** — A quebra da copy em telas/cards é **função pura**, testável sem DOM, e
  tolerante: marcador inline, marcador em linha, marcador ausente, numeração fora
  de ordem, copy vazia.
- **AC9** — Zero regressão: suíte verde, `tsc` limpo, build OK.

## Escopo
**IN:** função pura de parsing, componente de modal com o mockup, botão no
`PostCard`, testes.

**OUT (decidido):**
- **Gerar arte para as telas 2+.** É o problema que o preview *revela*, não o que
  ele resolve. Depois de ver, o Marcos decide se quer N artes por post — é story
  própria e mexe no motor.
- **Publicar direto no Instagram.** Segue manual, como hoje.
- **Editar dentro do preview.** O preview é de leitura; para mudar existe Editar.
- **Fidelidade pixel-perfect ao app do Instagram.** É mockup para decidir, não
  emulador.

## Dependências
75-239 (formato + roteiro), 75-240 (arte). Nenhuma migração — todos os dados
necessários já estão em `marketing_posts`.

## Riscos
1. **Marcador escrito diferente pelo modelo** (`Tela 1)`, `TELA1:`, `Card 1 -`). O
   parser aceita variação de caixa e espaço; se não achar marcador nenhum, cai em
   uma tela única com a copy inteira — nunca perde texto.
2. **Copy sem texto sobrando fora dos marcadores** — o que vem antes do primeiro
   marcador (se houver) não pode ser descartado.
3. **Mockup dar impressão de "já publicado".** Mitigação: rótulo de pré-visualização
   e nada de botão de publicar dentro dele.

## Valor
Quem aprova para de montar a sequência na cabeça. E a lacuna das telas sem arte —
que hoje passa batida e vira post incompleto na mão do marketing — fica visível no
momento da decisão.

## Definição de pronto
AC1–AC9 verdes, gate do @qa, PR pelo @devops, deploy, e verificação com o Marcos
naquele story de 2 telas do Vind: a tela 1 mostra a arte, a tela 2 mostra o texto
com o aviso de que não tem arte.

## Change Log
- 31/07/2026 — @sm: story criada (Draft). Estrutura da copy e o gotcha do marcador
  inline verificados por query em produção antes de especificar; contagem de posts
  com `formato` NULL (11) também.
- 31/07/2026 — @po: validação 10 pontos = **10/10, GO**. Três ressalvas: (a) o AC3
  é o coração — preview que repete a arte MENTE; (b) provar que o botão está no
  `PostCard`, não replicado por lista; (c) o texto antes do 1º marcador é perda
  SILENCIOSA se descartado.
- 31/07/2026 — @dev: `buildPostPreview` (pura, 19 testes) + `PostPreviewModal` +
  botão no `PostCard`. `actionBtn` elevado a constante de módulo em vez de duplicar
  a string de estilo. 🔥 O gotcha do marcador **inline** (copy real de produção com
  as duas telas na mesma linha) foi coberto — era o erro que eu ia cometer.
- 31/07/2026 — @qa: gate **PASS**. As 3 ressalvas verificadas, a (b) por contagem:
  1 ocorrência do botão, **4 listas** usam `PostCard`. Suíte 1471, build 17.9s.
