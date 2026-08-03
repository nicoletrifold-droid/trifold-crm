# Story 75-259 — A faixa e a fonte obedecem ao que o Kit declara

**Epic:** 75 (CRM Trifold) · **Status:** Draft
**Criada por:** @sm (River) em 2026-08-03
**Formato:** Fidelidade de marca — fecha as duas heurísticas que sobraram da 75-256

---

## Story

**Como** dono da marca,
**Quero** que a cor da faixa e o peso da tipografia sejam os que o Kit **declara**,
**Para que** a peça não seja decidida por heurística de saturação nem por qual linha o banco devolveu primeiro.

---

## Context

A 75-256 tirou o texto da IA e passou a compor título, subtítulo, CTA e logo por código. Ficaram
duas escolhas resolvidas por heurística, e as duas erram em caso real e verificado.

### Problema 1 — a cor da faixa ignora o que o Kit diz ser o fundo

`pickBandColor` (`arte-faixa.ts`) escolhe, entre as cores escuras, a **mais cromática** — regra
que eu adotei para não deixar a faixa cair em preto e perder a identidade da marca. Ela acerta em
Vind e Yarden, e **erra na institucional**.

Paleta da Trifold, como está cadastrada em produção:

| hex | nome no Kit | luminância | o que a regra faz |
|---|---|---|---|
| `#000000` | **"Primária (fundo prioritário)"** | 0.000 | descarta (é neutra) |
| `#F27A5E` | "Laranja (energia/promo)" | 0.336 | **escolhe** (é cromática) |
| `#2E2E2E` | "Cinza de apoio" | 0.027 | descarta (é neutra) |
| `#FFFFFF` | "Branco de apoio" | 1.000 | descarta (clara) |

Resultado: post institucional sai com **faixa laranja**, quando o próprio Kit escreveu que o preto
é o *fundo prioritário* e que o laranja é para *energia/promo*.

**A informação necessária já está no banco e está sendo ignorada:** `marketing_brands.cores` é
`[{hex, nome}]`, e o `nome` carrega a intenção. A heurística de saturação foi construída sem olhar
para ele.

### Problema 2 — a fonte do texto composto é sorteada

`selectFonteAsset` (`arte-cta.ts`) devolve **o primeiro** asset de `tipo='fonte'` da marca. A
consulta que alimenta os candidatos (`arte-service.ts`) **não tem `ORDER BY`**, então qual fonte
vem primeiro é indefinido pelo Postgres.

O Kit do Vind tem, hoje: `Montserrat-Light.ttf` (duplicado), `Montserrat-Medium.ttf`,
`Montserrat-Regular.ttf` — **nenhuma SemiBold**. A `Montserrat-SemiBold.ttf` empacotada no repo só
entra quando a marca não tem fonte nenhuma.

Ou seja: o título — que a 75-256 desenha em ~100px — pode sair em **Light**, e a peça de amanhã
pode sair diferente da de hoje sem ninguém ter mudado nada. Na validação de 03/08 saiu bom, o que
é sorte, não garantia.

> Este é um defeito **pré-existente** (75-248, o CTA), que a 75-256 amplificou: numa pílula de
> 40px o peso da fonte quase não aparece; num título de 100px ele é a peça.

### Problema 3 (dado, não código) — o Kit do Vind tem assets duplicados

`Montserrat-Light.ttf` e `VIND_RENDER_FACHADA_DIA_FEED.png` estão cadastrados **duas vezes**. Não
quebra nada (`selectArteReferencias` deduplica por `file_name`), mas aumenta a chance de a fonte
sorteada ser a Light e polui a lista que a Lídia lê.

---

## Scope

### IN

- `pickBandColor` passa a considerar a **intenção declarada no nome da cor** antes da heurística.
- `selectFonteAsset` passa a **ordenar por peso**, deduzido do nome do arquivo, e o fallback para a
  SemiBold empacotada passa a valer também quando a marca só tem fontes leves.
- Limpeza das 2 linhas duplicadas em `marketing_brand_assets` (script idempotente, sem migration
  de schema).

### OUT

- Cadastrar SemiBold no Kit do Vind — é trabalho de quem administra o Kit, não de código. A story
  garante que, **quando** ela for cadastrada, seja a escolhida.
- Campo novo de "papel da cor" no cadastro — a informação já existe em `nome`; criar coluna nova
  exigiria migration e retrabalho de UI para resolver o que uma leitura resolve.

---

## Acceptance Criteria

- [ ] **AC1 — nome da cor tem prioridade sobre saturação:** `pickBandColor` procura, entre as
      cores com luminância ≤ 0.6, cujo `nome` contenha (sem acento, case-insensitive) `fundo`,
      `primaria` ou `background`. Havendo, ganha a mais escura delas. Não havendo, cai na regra
      atual (cromática > neutra). Teste com as 3 paletas reais: Trifold ⇒ `#000000`,
      Vind ⇒ `#11220f`, Yarden ⇒ `#002338`.
- [ ] **AC2 — cor sem nome continua funcionando:** a paleta do Vind tem `nome: null` nas três
      cores. Ela **precisa** seguir caindo na heurística e devolvendo `#11220f`.
- [ ] **AC3 — fonte por peso declarado no nome do arquivo:** `selectFonteAsset` ordena os
      candidatos por peso — `black`/`extrabold`/`bold`/`semibold` na frente, depois `medium`,
      `regular`/`book`, e `light`/`thin`/`extralight` no fim — e devolve o primeiro. Determinístico
      para o mesmo conjunto de arquivos, independente da ordem do banco.
- [ ] **AC4 — Kit só com fonte leve usa a empacotada:** se a melhor fonte da marca for
      `light`/`thin`, a `Montserrat-SemiBold.ttf` do repo ganha — título fino não é decisão de
      marca, é ausência de arquivo. Registrado em log (`console.warn`) para quem administra o Kit
      saber que falta um peso.
- [ ] **AC5 — a escolha é observável:** log com o nome do arquivo de fonte escolhido e a cor de
      faixa resolvida. Hoje, quando a peça sai estranha, não há como saber qual dos dois foi.
- [ ] **AC6 — duplicados removidos:** as 2 linhas duplicadas saem, mantendo a mais antiga
      (`created_at` menor). Script idempotente; re-rodar não apaga nada além.
- [ ] **AC7 — sem regressão:** a arte do Vind validada em 03/08 continua saindo com faixa
      `#11220f` e pílula `#8FE6A7`.

---

## Dev Notes

- Normalizar o nome antes de casar: o cadastro tem `"Primária (fundo prioritário)"` — com acento,
  com maiúscula e com parênteses. `unaccent` em JS é `normalize("NFD").replace(/\p{Diacritic}/gu, "")`.
- `pickAccentColor` (a cor da pílula) **não** muda nesta story: "destaque" é justamente o papel do
  laranja, e a heurística de saturação está correta para ele. Só a faixa confundia fundo com destaque.
- O `satori` recebe `fontWeight: 600` mas usa o arquivo que a gente entrega — o peso declarado no
  CSS não sintetiza negrito. Por isso a escolha do arquivo é a única coisa que decide o peso real.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-03 | 0.1 | Story criada. Problemas 1 e 2 encontrados ao preparar o briefing de teste da 75-256, conferindo as paletas e os assets reais de produção — não em revisão de código. | @sm (River) |
