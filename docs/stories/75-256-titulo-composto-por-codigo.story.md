# Story 75-256 — O título da arte sai da IA e vira composição

**Epic:** 75 (CRM Trifold) · **Status:** Draft
**Criada por:** @sm (River) em 2026-08-03
**Formato:** Bug de produto + fechamento de dívida arquitetural

---

## Story

**Como** time de marketing usando a Lídia,
**Quero** que o título e o subtítulo da arte sejam desenhados pelo código, e não pelo modelo de imagem,
**Para que** a pílula do CTA nunca mais caia por cima do título — e para que a faixa inferior da peça seja exata, como já são o logo e o CTA.

---

## Context — a causa medida, não suposta

Reproduzido em produção em 03/08, no story do Vind com 2 telas (prints do Marcos).
Na **Tela 2** a pílula "Agende sua visita" cobriu o título: sobrou `48` à esquerda e `TO.` à direita.

**A geometria está correta** — foi a primeira hipótese e ela caiu:

| elemento | fonte | posição em 9:16 (1080×1920) |
|---|---|---|
| área que o prompt manda deixar limpa | `arte-gen.ts:87` | últimos **25%** → a partir de 1440px (75%) |
| pílula do CTA | `arte-cta.ts:126` (`ctaBox`) | topo em **1497px (78%)** |
| faixa do logo | `arte-logo.ts:50` (`logoBox`) | topo em **1651px (86%)** |

A pílula cai **dentro** da área reservada, com **57px de folga**. Logo a colisão significa uma coisa só:
**o modelo desenhou o título dentro dos 25% que o prompt manda deixar limpos.** A Tela 1 obedeceu, a Tela 2 não.

### Por que isso não se resolve endurecendo o prompt

É a quarta vez no mesmo ciclo que instrução de prompt não segura o que precisa ser exato:

| story | o que se pediu por prompt | o que o modelo fez |
|---|---|---|
| 75-244 | "CTA com peso visual" | botão desproporcional |
| 75-246 | "faixa inferior limpa" | invadiu 58px dela |
| 75-248 | "paleta OBRIGATÓRIA do Kit" | arte coral em marca verde |
| **75-256** | "os últimos 25% ficam limpos" | **desenhou o título dentro deles** |

Logo (75-246), cor e CTA (75-248) já saíram do modelo e viraram composição. **O título é a última peça de texto que ficou nos pixels** — e é justamente a que colide com o que já foi composto.

### A virada de lógica que resolve de verdade

Hoje o código **evita** a região onde o modelo pode ter escrito. Isso é indefensável: depende de obediência.
Desta story em diante o código **pinta por cima** da região inteira. Se o modelo desobedecer, o que ele
desenhou é **coberto** — a desobediência deixa de ter consequência em vez de precisar ser prevenida.

---

## Scope

### IN

- Módulo novo `arte-faixa.ts`: **layout puro** da pilha inferior (título → subtítulo → CTA → logo) + render da faixa via `satori` + composição via `sharp`.
- A faixa é **opaca** e cobre a região inteira: título e subtítulo passam a ser desenhados pelo código, com a cor e a fonte do Kit.
- `artes[]` (contrato do Sonnet) ganha `titulo` e `subtitulo`. O Sonnet passa a devolver o **texto**, não a descrição de como desenhá-lo.
- Prompt do motor de imagem: proibido **qualquer** texto na arte (hoje só logo e CTA são proibidos), e a fração reservada passa a ser **calculada pela mesma função** que compõe a faixa — fonte única, não dois números que podem divergir.
- Fração reservada informada ao modelo = altura real da faixa. Sem faixa, comportamento de hoje preservado.
- "Refazer arte" (`[id]/arte/route.ts`) respeita título/subtítulo persistidos.

### OUT

- Fidelidade da fachada (a IA regenerar o render em vez de usar o de referência) — é decisão de produto em aberto, e a `arte-gen.ts:77` a protege pelo mesmo mecanismo frágil que esta story está substituindo. **Vale story própria**, e esta cria o padrão que ela vai usar.
- Sobreposição de texto no preview — é `75-257`.
- Mudar `bandRatio` do logo (0.14/0.12) — mexer nele quebraria os testes de `arte-logo` sem ganho.

---

## Acceptance Criteria

- [ ] **AC1 — layout puro e único:** `faixaLayout(aspectRatio, w, h, { temSubtitulo, temCta })` devolve `faixaTop`, `faixaHeight`, `tituloBox`, `subtituloBox`, e é a **única** fonte da fração reservada. Testado em unidade para os 3 formatos × 4 combinações de conteúdo.
- [ ] **AC2 — a faixa cobre, não evita:** `composeFaixa` pinta retângulo **opaco** de `faixaTop` até a base, com a cor de faixa do Kit. Teste prova que um pixel escrito pelo modelo em `faixaTop + 1` fica coberto.
- [ ] **AC3 — cor vem do Kit ou não há faixa:** `pickBandColor(cores)` devolve a cor de **menor luminância** com `lum > 0.02` (evita preto puro). Paleta sem candidata ⇒ `null` ⇒ **sem faixa**, e o prompt volta ao comportamento de hoje (25% reservados, modelo pode escrever). **Nunca inventar cor** — mesma regra da `pickAccentColor` (75-248).
- [ ] **AC4 — contraste do texto garantido:** título e subtítulo usam `pickTextColor(corDaFaixa)` (reuso de `arte-cta.ts`), preto ou branco pelo maior contraste WCAG.
- [ ] **AC5 — ordem de composição:** faixa → CTA → logo. Cada uma com `try/catch` **próprio** (fail-open em camadas, padrão da 75-246/248): falha de faixa não custa o logo, e vice-versa.
- [ ] **AC6 — o prompt e a composição não podem divergir:** a fração passada ao `buildArtePrompt` vem de `faixaLayout`. Teste que falha se alguém mudar uma sem a outra.
- [ ] **AC7 — proibição total de texto:** com faixa ativa, o prompt proíbe título, subtítulo, legenda, número, selo e qualquer letra na arte — a arte é **só imagem**.
- [ ] **AC8 — contrato do Sonnet:** `artes[]` aceita `titulo` (≤ 40 chars) e `subtitulo` (≤ 60 chars); parser tolerante (ausente ⇒ `null` ⇒ sem faixa, post não quebra).
- [ ] **AC9 — sem regressão:** post sem `titulo` gera arte exatamente como hoje. `arte_url`/`artes[0]` seguem concordando (`montarPatchDeArtes` continua a única a gravar).

---

## Dev Notes

- `satori` vetoriza texto (SVG `<path>`), que é o que viabiliza isso em serverless — `sharp` com texto dependeria de fonte no sistema. Padrão já estabelecido pela 75-248; **reusar**, não recriar.
- Fonte: `selectFonteAsset` do Kit, com fallback `fontePadrao()` (Montserrat SemiBold empacotada). Título e subtítulo usam a mesma família em corpos diferentes — não há segundo peso empacotado.
- `MIN_*` de legibilidade: a 75-248 aprendeu que arte pequena produz pílula de 2px que "cabe na matemática e é lixo na tela". Mesmo piso vale para a faixa.
- `pickTextColor`, `hexToRgb`, `luminancia`, `contraste` já existem em `arte-cta.ts` e são puros — importar.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-03 | 0.1 | Story criada. Causa medida em produção: geometria correta (pílula a 78%, reservado a 75%, 57px de folga) ⇒ a colisão é desobediência do modelo, não erro de conta. Decisão de desenho: **cobrir em vez de evitar**. | @sm (River) |
