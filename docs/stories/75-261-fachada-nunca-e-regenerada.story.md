# Story 75-261 — A fachada nunca é regenerada

**Epic:** 75 (CRM Trifold) · **Status:** Draft — **precisa de UMA decisão estética do Marcos (ver §Decisão)**
**Criada por:** @sm (River) em 2026-08-03
**Formato:** Mitigação de risco jurídico + fecha a última dívida da 75-256

---

## Story

**Como** incorporadora anunciando um empreendimento real,
**Quero** que a fachada que aparece na peça seja **o render do projeto**, nunca uma versão redesenhada por IA,
**Para que** não exista anúncio nosso mostrando um prédio que não é o nosso.

---

## Context

### O risco, e por que ele deixou de ser teórico hoje

O motor de imagem recebe o render do Kit como **referência** e **desenha um prédio parecido**. A
proteção contra ele mudar a arquitetura é uma frase no prompt (`arte-gen.ts:77`):

> *"fotos de referência (quando houver) são a base visual — não distorcer arquitetura nem inventar
> fachadas diferentes das fotos."*

Em 03/08, no mesmo dia, **instrução de prompt falhou duas vezes** em coisas mais simples que essa:
o modelo escreveu título dentro da área que devia deixar limpa (75-256), depois de já ter ignorado
a paleta obrigatória (75-248), a faixa limpa (75-246) e a proporção do CTA (75-244).

**Cinco falhas do mesmo mecanismo.** Não há razão para acreditar que a instrução sobre arquitetura
seja a que ele respeita — e essa é a única cuja consequência é jurídica, não estética.

### O que a 75-256 mudou a favor de resolver isso agora

Antes, o modelo produzia a imagem **e** o texto **e** o layout. Hoje produz **só a imagem** — e a
imagem boa já existe no Kit, feita por quem projetou o prédio. **A contribuição dele caiu perto de
zero e o risco continua inteiro.**

### O que o Meta diz, e ele empurra na mesma direção

Performance real (17/05 a 02/08, 54 anúncios com insight, R$ 3.690, 95 leads):

| anúncio | leads | CPL | CTR |
|---|---|---|---|
| ETÁTICO NOVOS MARÇO | 21 | **R$ 23,18** | 0,96 |
| PLANTA COM ENTRADA 60K | 20 | R$ 25,51 | 0,96 |
| **fachada (Yarden de frente)** | 15 | **R$ 43,80** | **1,49** |

O criativo de fachada tem o **melhor CTR e o pior CPL** — chama o olho, converte pior. O que
converte fala de entrada, parcela, planta e prazo.

**Consequência para esta story:** restringir a fachada ao render real **não sacrifica performance**,
porque a fachada não é o criativo que performa. O custo da mitigação é ainda menor do que parecia.

> ⚠️ **Base pequena:** R$ 3.690 e 95 leads em 11 semanas. A diferença entre 15 e 21 leads não é
> estatisticamente forte. É indício direcional, e está aqui como argumento de custo — não como
> justificativa principal. A justificativa principal é o risco jurídico, que não depende disso.

### O achado técnico que define o desenho — proporção dos assets, medida

Baixei o cabeçalho de **todos** os assets de foto do Kit e medi:

| arquivo | dimensão | proporção |
|---|---|---|
| `VIND_RENDER_FACHADA_NOITE_STORY.png` | 1080×1920 | **9:16 exato** |
| `VIND_RENDER_FACHADA_NOITE_FEED.png` | 1080×1080 | 1:1 |
| `VIND_RENDER_FACHADA_DIA_FEED.png` | 1080×1080 | 1:1 |
| `VIND_RENDER_FACHADA_NOITE.png` / `_DIA.png` | 1080×1265 | 0,85 |
| `VIND_RENDER_PISCINA.png` | 1647×1080 | 1,52 (paisagem) |
| `VIND_RENDER_ACADEMIA.png` / `_PILATES.png` | 1920×1080 | 16:9 (paisagem) |
| `VIND_PLANTA_PRIVATIVA.png` | 1356×1356 | 1:1 |
| `YARDEN_RENDER_*` (piscina, academia, gourmet) | 3127×1422 | 2,20 (paisagem larga) |
| `YARDEN_RENDER_TERRAÇO.jpg` | 2875×2875 | 1:1 |

**Duas conclusões que mudam o escopo:**

1. **A fachada do Vind JÁ tem um render nativo 9:16.** Ou seja: no caso de maior risco jurídico, dá
   para eliminar a geração **sem perder nada** — o arquivo está pronto e na proporção exata do story.
2. **Quase todo o resto é paisagem.** Recortar `PISCINA` (1,52) para 9:16 jogaria fora ~65% da
   largura e destruiria a composição. Foi exatamente por isso que "gerar a partir da referência"
   parecia resolver: o modelo produzia uma cena vertical plausível.

Logo, a regra **não** pode ser "sempre use o render". Precisa distinguir os dois casos.

---

## A regra proposta

**A fachada nunca é gerada. O resto pode ser.**

O critério é o *assunto*, não a proporção — porque o dano é específico: prédio diferente do projeto
é propaganda enganosa; piscina com espreguiçadeira em outro ângulo não é.

| assunto do asset | o que a peça faz |
|---|---|
| **fachada** (nome casa `fachada`) | usa o arquivo **direto**, sem passar pelo motor |
| lazer, academia, planta, decorado | pode gerar, com o arquivo como referência (como hoje) |

E para usar o arquivo direto quando a proporção **não** casa com o formato, entra a decisão abaixo.

---

## 🔴 Decisão que preciso do Marcos

Quando a fachada existe no Kit mas **não** na proporção do post — ex.: story 9:16 pedindo a
`FACHADA_NOITE_FEED` (1:1), ou qualquer fachada do Yarden — o que a peça faz?

**Opção 1 — bloco de imagem + cor da marca (recomendada).**
O render entra inteiro, como um bloco horizontal, e a cor da faixa preenche o resto. A peça fica
"foto + área de marca", que é o que a faixa da 75-256 já criou de fato. Zero geração, zero recorte,
funciona para qualquer proporção. Muda a cara das peças em que o render não é 9:16.

**Opção 2 — recorte inteligente.**
Recorta para a proporção alvo. Mantém a peça "cheia de foto", mas em asset 2,20 joga fora ~70% da
largura — e num render de fachada isso significa cortar o prédio.

**Opção 3 — só usa direto quando a proporção casa; senão, gera como hoje.**
Menor mudança visual, mas **mantém o risco** exatamente nos casos em que o Kit não tem o formato —
inclusive em todo o Yarden, que não tem nenhuma fachada vertical.

**Opção 4 — bloco com recorte LIMITADO (a que eu recomendo depois de renderizar).**
Usa o render direto, ajustado à largura, mas permite recortar até um teto (ex.: nunca reduzir a
proporção original em mais de ~35%). Fica entre a 1 e a 2: preenche mais o quadro que a 1, sem
o estrago da 2.

### Por que a 4 e não a 1 — eu renderizei as duas antes de recomendar

Compus a opção 1 com o `YARDEN_RENDER_PISCINA.png` (2,20, o caso mais difícil do Kit):

- **Centralizando o bloco na área livre:** sobra cor lisa em cima **e** um vão entre a imagem e a
  faixa. O vão é o pior dos dois — parece defeito, não composição.
- **Encostando o bloco na faixa** (variação melhor): o vão desaparece e o vazio fica todo no topo,
  onde a UI do story (foto de perfil, nome, barra de progresso) ocupa de qualquer forma.
- **Mas o vazio continua grande:** com 2,20, o render ajustado à largura tem 490px de altura num
  canvas de 1920. Imagem 25% + faixa 28% = **47% de cor lisa**. Metade da peça.

Para asset até ~1,5 (a piscina do **Vind** é 1,52; os 1:1 são melhores ainda) a opção 1 fica boa.
Para os 2,20 do **Yarden** fica fraca. Como o Yarden **não tem nenhuma fachada vertical**, é
justamente lá que a regra precisa funcionar — daí a 4.

A opção 3 é a única que deixa risco jurídico na mesa, e por isso eu a descartaria.

---

## Scope

### IN (depois da decisão)

- Detecção de asset de fachada por nome, com allowlist explícita (não heurística frágil).
- Caminho "usar direto": baixa o arquivo, ajusta para o canvas do formato conforme a opção escolhida,
  compõe faixa + CTA + logo por cima. **Não chama o motor de imagem.**
- Quando o post pede fachada e o Kit **não tem** nenhuma: a peça é gerada, e a `descricao` recebe
  instrução explícita de **não mostrar prédio** (cena de entorno, céu, detalhe) — em vez de inventar
  uma fachada.
- Log dizendo qual caminho foi usado, por peça.

### OUT

- Provedor de edição fiel (image-to-image que preserva o prédio). Fica registrado como alternativa
  se um dia a peça precisar de cena de fachada que não exista em render — hoje não precisa.
- Recorte automático inteligente por detecção de objeto. Se a opção 2 for escolhida, começa com
  recorte central e ponto.
- Fachada em vídeo/reel — reel não gera imagem.

---

## Acceptance Criteria (a detalhar depois da decisão)

- [ ] **AC1 — fachada nunca passa pelo motor:** post cujo asset principal é de fachada gera a peça
      sem uma única chamada ao Vertex. Verificável por log e por teste que falha se `gerarArte` for
      chamado nesse caminho.
- [ ] **AC2 — o pixel é o do render:** comparar um trecho do prédio na peça final com o mesmo trecho
      do arquivo do Kit — têm de ser idênticos. É a única prova de que não houve regeneração.
- [ ] **AC3 — sem fachada no Kit, não se inventa uma:** a `descricao` enviada ao motor proíbe
      mostrar o prédio.
- [ ] **AC4 — o resto segue como hoje:** piscina, academia, planta e decorado continuam gerando.
- [ ] **AC5 — Yarden funciona:** a marca não tem nenhuma fachada vertical; a peça tem de sair
      correta pela regra da decisão, não por acidente do Vind ter o arquivo 9:16.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-03 | 0.1 | Story criada por decisão do Marcos. Proporção de todos os assets do Kit medida (não estimada) — é o que revelou que a fachada do Vind já tem 9:16 nativo e que o resto é paisagem, e é o que faz a regra ser por ASSUNTO e não por proporção. Dado de performance do Meta anexado como argumento de custo, com a ressalva de base pequena. | @sm (River) |
