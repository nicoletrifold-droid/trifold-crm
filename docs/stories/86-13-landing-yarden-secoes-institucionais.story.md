# Story 86-13 — Landing do Yarden: seções institucionais completas (Overview, Lazer, Galeria, Sobre a Trifold, Nav, Banda CTA)

**Status:** **Ready for Review** (`InReview` no vocabulário do
`story-lifecycle.md`) — implementação concluída pelo @dev em 2026-09-04, T1–T13
fechadas mais uma T14 acrescentada pelo executor. Ver Change Log 0.4 e o Dev
Agent Record. Histórico: validação @po **GO 9/10**, e as 5 decisões de curadoria
**D1–D5 respondidas pelo stakeholder em 2026-09-03** e travadas nos ACs
(Change Log 0.3). Próximo passo: `@qa *qa-gate`.
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @dev (Dex)
**Quality Gate:** @qa (Quinn) — `*qa-gate` ao fim da implementação
**Prioridade:** P2 (mesma razão da 86-12: não há tráfego pago ativo apontando para
`trifold.eng.br/yarden/` hoje, e a URL segue offline enquanto as tarefas T12/T13
de infraestrutura da 86-12 não forem concluídas por @devops — ver
`docs/stories/epics/epic-86-meta-capi-tracking.md`)
**Estimativa:** **9 pontos (G)** — era 8 no cabeçalho da 0.2 (o Change Log 0.2
não registrou estimativa), **+1 ponto pela D5**, que o
stakeholder confirmou na **Opção B** (redesenho da seção de Localização no
padrão do Vind: endereço em destaque, link do Maps e os 5 pontos de referência
como lista visível). O resto da conta continua: conteúdo+layout de 6 seções
novas e processamento de imagens reais (recorte/otimização de até 11 fotos),
sem nenhum código server-side novo. A curadoria (D1–D4) deixou de ser custo de
descoberta — está travada nos ACs.
**Depende de:** 86-12 (o `landing-pages/yarden/index.html` atual — Hero, Pixel/
CAPI, 3 formulários, footer — já está em `main`, squash `86ea676a`; esta story
constrói em cima dele. A 86-12 segue `InReview`/não-`Done` por pendência de
infraestrutura (T12/T13), mas isso **não bloqueia** o trabalho desta story, que
é só conteúdo dentro do mesmo diretório)

> ## ✅ Implementação liberada — as 5 decisões estão travadas
>
> A validação @po de 2026-09-03 deu **GO (9/10)**, e o gate que mantinha a story
> em `Draft` **caiu**: o stakeholder (lucas@trifold.eng.br) respondeu **D1–D5 em
> 2026-09-03**, todas seguindo as recomendações do @po. As respostas estão
> **travadas no corpo das ACs** (AC3, AC4, AC5, AC6, AC7, AC8) e registradas no
> checklist **T0** e no Change Log 0.3. `Draft → Ready` feito. Nenhum outro gate
> pendente.
>
> **O que o @dev ainda decide sozinho** (delegado explicitamente pelo
> stakeholder, não é ambiguidade): **quais arquivos específicos** de render
> entram na Galeria dentro das categorias e proporções fixadas na AC5/D3, e
> **qual das 9 vira o fundo da banda CTA** (AC7/D3.1), por critério de
> contraste. Tudo o mais é conteúdo travado — não reabrir.
>
> **Antes de codar, ler a AC15** — é a correção bloqueante desta validação e ela
> contradiz de propósito o "copie o padrão do Vind Residence".

**Não confundir com 86-12:** esta story **não adiciona tracking novo**. Zero
evento CAPI novo, zero formulário novo, zero mudança em
`packages/web/src/lib/meta/*` ou nas rotas `/api/webhooks/landing-page/*`. É
puramente HTML/CSS/imagens dentro de `landing-pages/yarden/`.

## Story

**As a** time de marketing/vendas da Trifold,
**I want** a landing do Yarden ter a mesma riqueza de seções institucionais e de
produto que a landing do Vind Residence (visão geral com números, lazer,
galeria de fotos, localização, prova institucional da construtora),
**so that** um visitante que chega à landing do Yarden receba informação
suficiente para se cadastrar, com o mesmo padrão de qualidade já validado no
Vind Residence — hoje a página do Yarden só tem Hero + 2 blocos de texto curtos
+ um segundo formulário, sem nenhuma das seções de produto que a irmã tem.

## Contexto — por que esta story existe

O usuário (lucas@trifold.eng.br) pediu explicitamente para replicar, na landing
do Yarden, a MESMA estrutura de seções da landing do Vind Residence
(`landing-pages/vind-residence/index.html`, em produção em
`https://trifold.eng.br/vindresidence/`), preenchida com conteúdo real do
Yarden (dados da Ficha Técnica oficial, renders reais do empreendimento) e a
identidade visual já estabelecida do Yarden (cores/fontes/logo já presentes no
`:root` do `index.html` atual — nada disso deve mudar).

A 86-12 entregou a base: Hero com foto+formulário, Pixel+CAPI completos, e só
duas seções de conteúdo próprias do Yarden ("Onde a natureza encontra a
sofisticação" e "Invista no novo centro urbano de Maringá") mais um segundo
formulário ("Quer saber mais?") e o rodapé. Essas quatro peças **já existem e
não são recriadas aqui** — ver "Descoberta" abaixo para o inventário exato.

## Descoberta (verificado lendo o código e os documentos-fonte, não presumido)

### O que já existe em `landing-pages/yarden/index.html` hoje

Lido diretamente do arquivo antes de escrever esta story:

1. `<head>`: Pixel base code (dataset `1337310707164669`), script de tracking
   vanilla (`visitor_id`, `fbc`/`fbp`/`fbclid`, `TrifoldTracking`), Google
   Fonts (Montserrat, `display=optional`), e o bloco `:root` com toda a
   paleta/tipografia do Yarden.
2. `<section class="hero" id="cadastro">` — foto de piscina do rooftop
   (`assets/hero-piscina-rooftop*.{jpg,webp}`), marca "LANÇAMENTO | yarden"
   sobreposta, e o formulário `#leadForm` (versão desktop sobreposta à foto) +
   `#leadFormMobile` (versão mobile em fluxo, mesma marcação).
3. `<section class="split split--natureza">` — "Onde a natureza encontra a
   sofisticação", texto + foto `assets/interior-lounge-gourmet.{jpg,webp}`.
   **Sem `id` próprio hoje.**
4. `<section class="split split--invista">` — "Invista no novo centro urbano
   de Maringá", foto `assets/mapa-gleba-itororo.{jpg,webp}` (mapa com pins dos
   pontos de referência, alt-text já lista os marcos) + texto sobre a Gleba
   Itororó. **É, na prática, a seção de localização do Yarden hoje — mas sem
   `id="localizacao"`, sem `kicker`, e sem lista de pontos de interesse
   separada (os marcos estão só no `alt` da imagem).**
5. `<section class="saber" id="saber-mais">` — "Quer saber mais?", terceiro
   formulário (`#leadFormSaber`), fundo `--tan`, foto
   `assets/familia-quer-saber-mais.{jpg,webp}`.
6. `<footer>` — logos Trifold + Yarden centralizados, texto de direitos com
   link para a política de privacidade. **Sem nav de links** (só os 2 logos e
   o texto).
7. WhatsApp flutuante (`.wa-float`) e o script final com `CONFIG`,
   `ligarFormulario` (chamado 3x, um por formulário) e o listener de
   `InitiateCheckout` no primeiro foco de qualquer um dos 6 campos de
   nome/whats.
8. **Não existe `<header>`/nav nenhum.** Nenhum menu, nenhuma âncora de
   navegação, nenhum comportamento de scroll no header — porque não há header.

### O que a landing do Vind Residence tem, por seção (lido do código-fonte)

| # | Seção (classe/`id`) | Conteúdo |
|---|---|---|
| 1 | `header.nav` | Logo + 5 links âncora (`#empreendimento`, `#lazer`, `#galeria`, `#localizacao`, `#sobre`) + botão CTA "Cadastre-se" (`#cadastro`). Fixo, transparente no topo, ganha fundo sólido (`--verde-escuro`) quando `scrollY > 60`. Hambúrguer mobile abre painel lateral. |
| 2 | `.hero#cadastro` | **Já existe equivalente no Yarden — não recriar.** |
| 3 | `.overview#empreendimento` | kicker + H2 (nome do empreendimento) + localização curta + grid `.stats` com 5 números grandes + legenda. Fundo `--verde-escuro` sólido. |
| 4 | `.amen#lazer` | kicker + H2 + parágrafo + `.chips` (6 pills) + foto de fundo em split. |
| 5 | `.section.center#galeria` | kicker + H2 + parágrafo + `.gallery-grid` de 9 fotos (mix `.g-tall`/`.g-wide`) + CTA "Agende sua visita". |
| 6 | `.loc-sec#localizacao` | **Já existe equivalente mais simples no Yarden — dentro da seção "invista".** No Vind: mapa (iframe sob demanda) + endereço + lista `.poi` de 11 pontos de interesse. |
| 7 | `.band` (sem id) | Faixa estreita com foto de fundo fixa, H2 + parágrafo curto + 1 CTA. Fica entre Localização e Depoimentos. |
| 8 | `.depo.section#depoimentos` | 3 vídeos do YouTube (thumbnail → iframe ao clicar). **Fora de escopo desta story — ver "Fora de escopo".** |
| 9 | `.section#sobre` | kicker "Sobre a Trifold" + H2 + parágrafo institucional sobre a empresa (fundada 2019, atuante desde 1997) + foto da sede (`trifold-fachada.webp`) + 1 CTA. |
| 10 | `footer` | Logo + `.fnav` com os mesmos 5 links do nav + copyright. **Yarden já tem footer, mas sem `.fnav`.** |

### Dados reais do Yarden (Ficha Técnica oficial, lida integralmente para esta
story — `Ficha Técnica/9-YAR FICHA TÉCNICA.pdf`, Google Drive do stakeholder)

- **Endereço:** Rua Carlos Meneghetti, 168 – Gleba Itororó.
- **Torre:** 2 subsolos, térreo com pé direito ampliado, 15 pavimentos tipo com
  4 apartamentos por pavimento, rooftop.
- **Apartamento:** 2 suítes e lavabo OU 2 quartos + 1 suíte + 1 banheiro
  social; sala de jantar, estar, cozinha, lavanderia, sacada com churrasqueira.
- **Lazer (térreo):** boulevard mirante, *fire place*, piscina adulto e
  infantil com deck, *playground*, brinquedoteca, *market*, cozinha e salão de
  festas e terraço, *delivery*, *beautyroom*, *petplace*, *petcare*, praça de
  convivência, miniquadra, bicicletário, espaço gourmet, espaço gourmet com
  piscina privativa.
- **Rooftop:** *sports bar*, *lounge*, coworking com sala para reuniões,
  terraço, pilates, academia, yoga.
- **Área do terreno:** 1.344,00m². **Área construída total:** 6.128,96m².
  **Número de apartamentos:** 60 unidades.
- **Área privativa:** 83,66m² e 79,81m². **Garagem:** 11,25m² (1 vaga) /
  22,50m² (2 vagas). **Área total:** 126,41m² (1 vaga) / 141,40m² (2 vagas).
- **Não há dado de preço/entrada na Ficha Técnica** — ao contrário do card do
  Vind Residence (que tem um stat "R$65mil entrada"), não existe fonte
  verificada de preço para o Yarden. **Não inventar um valor** (Artigo IV). Se
  o stakeholder quiser um stat de preço, é dado que só ele pode fornecer —
  fora do escopo desta story até isso acontecer.

### Inventário real dos renders (Google Drive, `Empreendimentos/Yarden/Book/RENDERS/`)

Contado agora, arquivo por arquivo (o pedido original mencionava "41 arquivos";
a contagem real, excluindo os 2 `.DS_Store` que não são imagens, é **39**):

| Pasta | Qtde | Arquivos |
|---|---|---|
| Decorado 1 | 5 | quarto, sala estar, sala estar-3, sala estar+cozinha, suíte |
| Decorado 2 | 5 | cozinha, quarto, sacada, sala estar+cozinha, suíte |
| Fachada | 2 | Fachada_2, Fachada_3 |
| Humanizadas | 4 | tipo 1, tipo 2, tipo 3, tipo 4 (⚠️ são **plantas** humanizadas, não ambientes — ver D3) |
| Rooftop | 8 | Coworking, Fitness, Lounge, Pilates, Sala de Jogos, Sala de Reuniões, Sport bar, Terraço |
| Subsolo 1 | 1 | Car Wash |
| Térreo | 14 | Beauty Room, Espaço Bikes, Espaço Kids, Estar, Fireplace, Gourmet, Lazer, Market, Mini Quadra Poliesportiva, Pet place, Piscina Infantil, Piscina privativa gourmet, Piscina, Salão de Festas |

Caminho completo de cada pasta:
`/Users/lucasprado/Library/CloudStorage/GoogleDrive-lupradogomes@gmail.com/Meu Drive/TRIFOLD/Empreendimentos/Yarden/Book/RENDERS/{pasta}/{arquivo}`

**Confirmado pelo @po na validação de 2026-09-03** (contagem refeita arquivo por
arquivo com `find`): 39 imagens em 7 pastas, com as quantidades por pasta
exatamente como na tabela acima. 41 arquivos no total, dos quais 2 são
`.DS_Store` (o da raiz e o de `Decorado 1/`) — daí os "41" do pedido original.
35 `.jpg` + 4 `.png` (as 4 `.png` são as Humanizadas).

⚠️ **Proporção: NÃO são todas paisagem 16:7.** Medido com `sips` arquivo por
arquivo nesta validação (a versão 0.1 desta story afirmava "todas paisagem,
`.jpg` a 4000×1818 / 6–9 MB, `.png` a 3200×1802 / 6–8 MB" — **incorreto nas três
dimensões**). O real:

| Proporção | Qtde | Dimensão | Observação |
|---|---|---|---|
| Paisagem larga (~2,2:1) | 22 | 4000×1818 | encaixa bem em `.g-wide` |
| **Quadrada (1:1)** | **12** | 4000×4000 | **corta muito num slot `.g-wide`** |
| Paisagem 16:9 | 1 | 3966×2250 | `Térreo/Gourmet Yarden.jpg` |
| `.png` (Humanizadas) | 4 | 2945×1856 a 3200×2084 | proporção irregular entre si |

Peso real dos arquivos: `.jpg` de **2,9 MB a 18,2 MB** (não 6–9 MB; a mais
pesada é `Térreo/Piscina Infantil Yarden.jpg`, 18,2 MB); `.png` de **5,8 MB a
7,9 MB**.

**Por que isso importa para a AC5:** o grid da galeria alterna slots
`.g-wide`/`.g-tall`, e uma origem quadrada num slot largo perde ~55% da altura
no recorte. A proporção de cada arquivo está anotada na decisão **D3**, para a
escolha das 9 já sair compatível com o slot. **A lista nominal completa, com
caminho relativo e proporção de cada arquivo agrupado por categoria, está em
D3** (é o insumo que o stakeholder precisa para escolher as 9 da galeria).

## Decisão de escopo — ordem das seções na página (AUTO-DECISION)

**[AUTO-DECISION]** Onde encaixar as 6 seções novas em relação às 3 seções de
conteúdo que já existem (natureza, invista, quer-saber-mais) → a ordem final da
página passa a ser:

1. Header/Nav (novo)
2. Hero `#cadastro` (existente, sem mudança de conteúdo)
3. Overview/Stats `#empreendimento` (novo)
4. "Onde a natureza encontra a sofisticação" (existente, sem `id`)
5. Lazer `#lazer` (novo)
6. Galeria `#galeria` (novo)
7. "Invista no novo centro urbano de Maringá" → ganha `id="localizacao"` e o
   redesenho completo da AC6 (D5 travado na **Opção B**)
8. Banda CTA (novo, sem `id`)
9. Sobre a Trifold `#sobre` (novo)
10. "Quer saber mais?" `#saber-mais` (existente, sem mudança de conteúdo)
11. Footer (existente + nav de links)

**Reason:** (a) nenhuma seção existente é removida ou tem seu conteúdo
alterado — só ganham posição/`id`/estilo de cabeçalho quando fizer sentido;
(b) agrupamento temático: "natureza" funciona como ponte emocional entre os
números (Overview) e o lazer, já que fala de bem-estar; "invista" já fala de
localização/Gleba Itororó, então vira a própria seção de Localização em vez de
ficar solta; (c) terminar em "Quer saber mais?" (um formulário) em vez de
"Sobre a Trifold" (como o Vind termina) é uma escolha melhor de conversão dado
que o Yarden já tem esse formulário funcionando em produção — não faz sentido
mover o CTA final institucional para depois dele.

## Acceptance Criteria

### AC1 — Header/Nav fixo (novo, ADAPT do padrão do Vind Residence)

Adicionar `<header>` fixo no topo do `index.html` do Yarden:

- Logo: `assets/logo-yarden-creme.svg` (já existe, não criar um novo).
- Links âncora: Empreendimento (`#empreendimento`), Lazer (`#lazer`), Galeria
  (`#galeria`), Localização (`#localizacao`), A Trifold (`#sobre`) — mesmos 5
  links do Vind Residence, mesma ordem.
- Botão CTA "Cadastre-se" → `#cadastro`.
- Comportamento: transparente sobre o Hero; ganha fundo sólido quando
  `scrollY > 60` (mesmo limiar do Vind). **[AUTO-DECISION]** cor do fundo ao
  rolar = `--marrom` (não `--navy`): é a cor mais associada à marca no restante
  da página (card do hero, títulos, botões da seção "Quer saber mais"),
  reforçando identidade ao rolar, enquanto `--navy` fica reservado ao rodapé.
- Menu mobile: hambúrguer (`&#9776;`, `aria-label="Menu"`) abre painel lateral
  com os mesmos 5 links + CTA; fecha ao clicar em qualquer link. Reusar a
  MESMA lógica JS do Vind (`nav.classList.toggle('scrolled', ...)`, toggle de
  `.open`, fechar ao clicar em link dentro do painel), renomeando classes para
  o padrão de nomes em português já usado no CSS do Yarden.
- `z-index` acima de qualquer conteúdo do Hero (mesmo valor do Vind, 50), sem
  sobrepor `.hero-brand`/`.hero-form`.
- Ancoragem de scroll: aplicar `scroll-margin-top` (ou `html{scroll-padding-top}`)
  equivalente à altura do header nas seções-alvo das âncoras, para que o clique
  no nav não esconda o topo da seção atrás do header fixo.

### AC2 — Hero permanece intacto, só validado contra o nav novo

Nenhuma mudança de conteúdo/copy/imagem do Hero. Validar visualmente (desktop
e mobile) que o header novo não sobrepõe `.hero-brand` nem `.hero-form`/
`.hero-form--estatico` em nenhum breakpoint. Nenhuma AC de conteúdo aqui — é
checagem de não-regressão visual.

### AC3 — Seção Overview/Stats (`#empreendimento`, nova)

- kicker (rótulo curto maiúsculo, ex. "O empreendimento") + H2 "Yarden" +
  linha de localização curta (ex. "Maringá · Gleba Itororó") + grid de stats
  (número grande + legenda).
- **Os 6 stats estão TRAVADOS** (D1/D1.1/D1.2 respondidas pelo stakeholder em
  2026-09-03, pacote recomendado pelo @po). São exatamente estes, nesta ordem:

  | # | Número grande | Legenda | Fonte literal na Ficha Técnica |
  |---|---|---|---|
  | 1 | **60** | unidades | "NÚMERO DE APARTAMENTOS: 60 unidades" |
  | 2 | **83,66 m²** | de área privativa | "ÁREA PRIVATIVA: 83,66m² e 79,81m²" — **só a maior**, 1 stat único (D1.1) |
  | 3 | **2 suítes** | e lavabo | "TIPO DE APARTAMENTO: 2 suítes e lavabo…" |
  | 4 | **15** | pavimentos | "TIPO DE TORRE: … 15 pavimentos tipo…" |
  | 5 | **2 subsolos + rooftop** | lazer completo em dois níveis | "TIPO DE TORRE: 2 subsolos … rooftop" |
  | 6 | **4** | apartamentos por pavimento | "TIPO DE TORRE: … com 4 apartamentos por pavimento…" |

- **D1.1 travado:** a área privativa vira **1 stat só, com a maior metragem**
  (`83,66 m²`) — mesma forma do Vind Residence (`<div class="big">66,91 m²</div>`).
  **Não** criar dois stats nem escrever "83,66 e 79,81 m²" no número grande.
- **D1.2 travado: NÃO existe stat de preço/entrada nesta seção.** A Ficha
  Técnica não traz preço em nenhuma das 7 páginas e o stakeholder não forneceu
  valor. O @dev está **proibido** de inventar um (Artigo IV) e de importar o
  "R$65mil entrada" do Vind Residence, que é dado de outro empreendimento.
- Não usar os candidatos descartados nesta curadoria (área do terreno
  1.344 m² e área construída 6.129 m²) — ficaram fora por decisão, não por
  falta de fonte.
- Fundo `--navy` sólido (reforça a paleta já usada no rodapé; não introduz cor
  nova). Números em `--branco` ou `--creme`, legendas em tom mais claro/opaco.
- Grid responsivo: múltiplas colunas no desktop, reduzindo para 2 e depois 1
  nos breakpoints já existentes do Yarden (não criar breakpoint novo).

### AC4 — Seção Lazer/Amenidades (`#lazer`, nova)

- kicker + H2 + parágrafo curto + os **6 chips travados** + imagem de fundo em
  layout split (texto de um lado, foto do outro — mesma técnica do `.amen` do
  Vind, adaptada aos nomes de classe do Yarden).
- **Os 6 chips estão TRAVADOS** (D2 respondida pelo stakeholder em 2026-09-03,
  pacote recomendado pelo @po). São exatamente estes, nesta ordem:

  1. **Sports bar (rooftop)** — "sports bar" é item literal da Ficha, listado
     sob o cabeçalho "Rooftop"; o "(rooftop)" só explicita esse nível, e é o
     texto que o stakeholder aprovou. Não é métrica nem amenidade inventada.
  2. **Yoga** — item literal do rooftop.
  3. **Brinquedoteca** — item literal do térreo.
  4. **Petcare** — item literal do térreo.
  5. **Espaço gourmet com piscina privativa** — item literal do térreo.
  6. **E muito mais** — coringa de fechamento, mesmo padrão do 6º chip do Vind
     Residence (lá o texto é literalmente "E muito mais").

- **Nenhum outro chip.** Não acrescentar, não trocar por sinônimo, não expandir
  para 7+. Os 19 candidatos restantes da D2 ficaram fora por decisão de
  curadoria — em especial "cozinha", que o @po recomendou não usar como chip
  isolado.
- Imagem de fundo: **[AUTO-DECISION]** `Térreo/Lazer Yarden.jpg` — nome do
  arquivo já corresponde ao propósito da seção, e evita repetir a foto de
  piscina já usada no Hero. Proporção `[L]` (4000×1818), 8,8 MB na origem —
  comprimir conforme AC5. ⚠️ **Servir via `<picture>`/`<img>` na marcação, não
  só por `background-image` no CSS — ver AC15**, ou o par vira asset órfão e o
  teste automatizado reprova.
- Parágrafo: pode parafrasear o tom do Vind ("Desfrute de momentos com toda a
  família...") adaptando ao Yarden, mas sem citar nenhuma amenidade que não
  esteja na Ficha Técnica.

### AC5 — Galeria (`#galeria`, nova)

- kicker + H2 + parágrafo + grid de exatamente 9 fotos reais do Yarden,
  variando tamanho (`.g-tall`/`.g-wide`, mesma técnica do Vind) + CTA "Agende
  sua visita" → `#cadastro`.
- **A curadoria está TRAVADA na composição por categoria** (D3 respondida pelo
  stakeholder em 2026-09-03, curadoria recomendada pelo @po). As 9 fotos são,
  obrigatoriamente:

  | Categoria | Quantidade |
  |---|---|
  | Fachada | **1** |
  | Rooftop | **3** |
  | Térreo | **3** |
  | Decorado (1 ou 2, à escolha do @dev) | **2** |
  | Humanizadas | **0 — proibido** |
  | Subsolo 1 (Car Wash) | 0 (não escolhido) |

- **As 4 "Humanizadas" são plantas baixas, não ambientes — NÃO entram na
  galeria** (decisão explícita do stakeholder, conforme recomendação do @po).
- **Delegado ao @dev pelo stakeholder:** escolher os **arquivos específicos**
  dentro dessas categorias e nessas proporções, a partir do inventário nominal
  de D3. Isto é autorização explícita — não é decisão em aberto e não precisa
  voltar ao @po.
- **Restrição técnica de proporção (vinculante):** os **2 slots `.g-wide`
  recebem obrigatoriamente imagens `[L]`** (paisagem larga 4000×1818); o slot
  `.g-tall` é o único que aproveita bem uma `[Q]` (quadrada 4000×4000). Nenhuma
  `[Q]` em slot largo — perde ~55% da altura no recorte (Risco #5).
- **Evitar redundância visual** (orientação do @po, mantida): o Hero já usa a
  piscina do rooftop e a seção "natureza" já usa um lounge gourmet — preferir
  não repetir `Rooftop/Lounge` nem `Térreo/Piscina`. E `Térreo/Lazer Yarden.jpg`
  **já está reservada** para o fundo da AC4: os 3 Térreo da galeria saem dos
  outros 13 arquivos da pasta.
- Processamento: converter os JPGs originais (alta resolução) para o par
  jpg+webp já otimizado, seguindo a convenção de nome já em uso
  (`galeria-01.{jpg,webp}` … `galeria-09.{jpg,webp}`), **cada par servido via
  `<picture>` com as duas URLs em atributo (AC15)** — não no padrão
  `<img src="…webp">` avulso da galeria do Vind, que deixaria os 9 `.jpg`
  órfãos e reprovaria o teste. Em tamanho de arquivo
  na mesma ordem de grandeza dos assets já existentes. **Faixas medidas pelo
  @po nesta validação** (não estimadas): os assets atuais do Yarden
  (`landing-pages/yarden/assets/*`) vão de **56KB a 324KB**; os da galeria do
  Vind Residence (`landing-pages/vind-residence/assets/galeria-*`) são bem mais
  leves, de **10KB a 226KB** (webp entre 10KB e 153KB, jpg entre 24KB e 226KB).
  **Alvo desta story: ≤ 330KB por arquivo, preferindo a faixa do Vind
  (webp abaixo de ~150KB)** — o teto de 330KB é o que o Yarden já pratica no
  seu asset mais pesado (`hero-piscina-rooftop.jpg`), não uma meta a perseguir.
- Lightbox ao clicar: reusar o comportamento do Vind (`.lb`, `.lb.open`, clique
  fora fecha, `Escape` fecha), adaptado aos nomes de classe do Yarden.

### AC6 — Seção "Invista..." vira a seção de Localização (`id="localizacao"`)

A seção `.split.split--invista` existente ganha `id="localizacao"` e um
`kicker` consistente com as demais seções novas (ela já usa `.titulo-secao`/
`.texto-secao`, então herda a tipografia automaticamente — só falta o
`kicker`, hoje ausente nela e em "natureza"/"quer saber mais").

**D5 TRAVADO na Opção B — redesenho no padrão do Vind Residence** (respondida
pelo stakeholder em 2026-09-03, conforme recomendação do @po; é a decisão que
elevou a estimativa de 8 para 9 pontos). Além do `id` + `kicker`, é
**obrigatório**:

- **Endereço em destaque**, literal da Ficha Técnica: "Rua Carlos Meneghetti,
  168 — Gleba Itororó, Maringá". Não parafrasear, não abreviar o logradouro.
- **Link clicável "Ver no Google Maps"** apontando para a URL oficial que a
  Ficha Técnica traz: `https://maps.app.goo.gl/RFibC7xZ7KZx6cwQA`. Usar
  exatamente essa — **não** montar uma busca por nome/coordenada (o Vind usa o
  mesmo formato, `maps.app.goo.gl/2nHahagzSPaDA11CA`). Link externo com
  `target="_blank"` + `rel="noopener"`.
- **Os 5 pontos de referência como lista de TEXTO VISÍVEL** (não só dentro do
  `alt` da imagem, que é o estado de hoje): **Catedral · Parque do Ingá ·
  Av. JK · Bosque II · Av. Itororó** — os mesmos 5 que já constam no `alt` do
  `mapa-gleba-itororo`, equivalentes ao `.poi` do Vind (lá são 11). Duas
  colunas no desktop, coluna única no mobile, dentro dos breakpoints já
  existentes (AC13).
- O `alt` da imagem do mapa **continua** listando os marcos — a lista visível
  é acréscimo, não substituição (o ganho de acessibilidade/SEO é o motivo da
  Opção B).
- **Não** replicar o mapa interativo em iframe sob demanda do Vind
  (`#mapCard` → Google Maps embed): o Yarden já tem uma imagem de mapa própria
  com os pins desenhados, que é melhor de performance e não adiciona um
  terceiro domínio ao CSP. **Manter a imagem atual** — e ela já é referenciada
  por `<picture>`, então não cria nenhum asset novo (AC15).
- **Opção A (mínima) está descartada.** Só `id` + `kicker` não satisfaz a AC6.

O texto e a foto atuais da seção "Invista no novo centro urbano de Maringá"
**não mudam** — o redesenho é acréscimo de estrutura ao redor deles.

### AC7 — Banda CTA (nova, sem `id`)

Faixa estreita entre a seção de Localização (AC6) e Sobre a Trifold (AC8), com
H2 curto + parágrafo + 1 CTA → `#cadastro`. Fundo: foto com overlay escuro
(`background-attachment:fixed` no desktop, `scroll` no mobile — mesma técnica
do `.band` do Vind, **confirmada pelo @po** na regra `.band` de
`vind-residence/index.html` e no override `@media` que troca para `scroll`).
⚠️ Aqui o `background-image` por CSS **é aceitável justamente porque nenhum
asset novo é criado** — a foto já está referenciada por `<picture>` na Galeria,
então não há órfão (AC15). **Não** introduzir um arquivo exclusivo desta banda.
A foto de fundo é uma reaproveitada das 9 da Galeria (AC5) — não cria asset
novo. **D3.1 travado: o stakeholder delegou a escolha ao @dev**, pelo critério
de contraste para texto branco sobreposto (precisa de área "calma"), dentre as
9 confirmadas na AC5. É o mesmo critério que o Vind usa ao reaproveitar
`galeria-03.webp` no seu `.band` (verificado pelo @po em
`vind-residence/index.html`, regra `.band`). **Não** introduzir um arquivo
exclusivo desta banda e **não** reabrir esta decisão com o @po — a delegação é
explícita.

### AC8 — Seção Sobre a Trifold (`#sobre`, nova)

- kicker "Sobre a Trifold" + H2 "Referência no conceito de morar bem" (mesmo
  texto do Vind — é sobre a empresa, não sobre o empreendimento) + parágrafo
  institucional + foto da sede.
- **D4 TRAVADO na Opção (A) — reuso VERBATIM de texto E foto** do Vind
  Residence (respondida pelo stakeholder em 2026-09-03, conforme recomendação
  do @po: mesma empresa, mesmo prédio, texto já publicado em produção). O
  parágrafo é copiado **palavra por palavra** da transcrição em D4 —
  começa em "Fundada em 2019 com a união de uma equipe experiente" e termina em
  "que reúnem alta qualidade.". O @dev **não reescreve, não resume e não
  adapta** o texto institucional (Artigo IV). As Opções (B) foto nova e (C)
  texto novo estão descartadas.
- Foto da sede: **conforme D4(A)**, reusar o MESMO arquivo já existente em
  `landing-pages/vind-residence/assets/trifold-fachada.{jpg,webp}` (copiar
  para `landing-pages/yarden/assets/`) — é o mesmo prédio, a mesma empresa;
  não há motivo para gerar/buscar uma foto nova (REUSE, Artigo IV). Tamanhos
  conferidos pelo @po: `.jpg` 114KB, `.webp` 39KB — já dentro do alvo da AC5,
  **não precisa de reprocessamento**. ⚠️ Se copiar os dois, **os dois** têm de
  ser referenciados via `<picture>` (AC15); o Vind serve só o `.webp`, e imitar
  isso deixaria o `.jpg` órfão. **Foto nova está descartada** — D4 ficou em (A),
  então é este arquivo, sem reprocessamento.
- Sem CTA próprio nesta seção (diferente do Vind): a seção seguinte já é
  "Quer saber mais?", um formulário — um segundo CTA aqui seria redundante.

### AC9 — Footer com nav de links

Adicionar ao `<footer>` existente uma lista de links equivalente ao `.fnav` do
Vind (Empreendimento, Lazer, Galeria, Localização, Cadastre-se), inserida
entre os logos e o parágrafo de direitos autorais — sem remover nada do que já
existe (logos, texto de direitos, link de política).

### AC10 — Nenhuma mudança na infraestrutura de tracking (reforço)

- Nenhum evento CAPI novo, nenhum formulário novo, nenhum `event_id` novo.
  `TrifoldTracking`, `ligarFormulario`, o array `FORMULARIOS` e os 3 `<form>`
  existentes (`leadForm`, `leadFormMobile`, `leadFormSaber`) permanecem
  exatamente como estão — nenhuma linha do `<script>` de tracking do `<head>`
  nem do script final de envio é alterada.
- Todo CTA das seções novas aponta para `#cadastro` (âncora HTML padrão; o
  `html{scroll-behavior:smooth}` já existente cuida do scroll suave — nenhum
  JS novo necessário para isso).
- O nav (AC1) não dispara nenhum evento de tracking próprio — é só navegação.

### AC11 — Identidade visual: zero cor/fonte/logo novos

Todas as cores das seções novas vêm exclusivamente das variáveis já
declaradas em `:root` do `index.html` atual: `--creme`, `--marrom`,
`--marrom-escuro`, `--tan`, `--navy`, `--dourado`, `--dourado-tinta`,
`--cinza-texto`, `--branco`, `--preto`, `--erro`. Nenhum novo valor hex,
nenhuma nova fonte (`--fonte`/`--fonte-serif` continuam Montserrat/Georgia),
nenhum logo novo — só `assets/logo-yarden-creme.svg` e
`assets/logo-trifold-branco.svg`, já existentes.

### AC12 — Fora de escopo: seção de Depoimentos (explícito)

**Não construir** a seção de depoimentos em vídeo — nem a estrutura, nem um
placeholder, nem um comentário "em breve" no HTML. Os vídeos reais do Yarden
ainda não estão hospedados no YouTube (dependência externa do usuário, ainda
sem link). Quando os links existirem, uma story futura replica `.depo` do
Vind Residence. Se o @dev tocar em algo adjacente por engano, reverter e
registrar no Dev Agent Record.

### AC13 — Responsividade e acessibilidade mínima

- Toda seção nova tem contraparte mobile coerente com os breakpoints JÁ
  definidos no Yarden (`min-width:980px` e `max-width:979.98px`, com reforço
  em `max-width:560px` se necessário) — não introduzir breakpoints novos sem
  necessidade clara.
- Imagens novas com `alt` descritivo (nunca vazio/genérico), `loading="lazy"`
  e `decoding="async"` — nenhuma imagem nova está acima da dobra, então
  nenhuma precisa de `fetchpriority="high"`.
- Nav mobile com `aria-label="Menu"` no botão hambúrguer, foco visível ao
  tabular pelos links, fecha ao clicar em link (mesmo padrão do Vind).

### AC14 — Sem regressão nos 3 formulários/tracking existentes

Após todas as mudanças, os 3 formulários continuam funcionando exatamente
como antes: `ligarFormulario` é chamado para os mesmos 3 pares
(`leadForm`/`formMsg`, `leadFormMobile`/`formMsgMobile`,
`leadFormSaber`/`formMsgSaber`), `InitiateCheckout` dispara uma única vez no
primeiro foco de qualquer um dos 6 campos de nome/whats, `PageView`/
`ViewContent` disparam no carregamento. Validar manualmente com
`python3 -m http.server` (mesmo runtime sem bundler da 86-12) + console do
navegador limpo de erros JS novos.

**Além do manual, esta AC tem guarda automático** (achado do @po nesta
validação — ver AC15): `tracking-browser.test.ts` já verifica os ids dos campos,
a live region, a trava de duplo submit e os dois endpoints do proxy. Rodá-lo é
mais barato e mais confiável do que a inspeção manual desses pontos.

### AC15 — Integridade de assets: todo arquivo novo REFERENCIADO POR ATRIBUTO HTML

> ⚠️ **AC acrescentada pelo @po na validação de 2026-09-03.** É a única correção
> bloqueante que esta validação encontrou, e ela contradiz parcialmente o
> "seguir o padrão do Vind Residence" das AC4/AC5/AC7/AC8.

Existe um teste automatizado **que roda nesta landing** e que reprova esta
story se ela for implementada no padrão do Vind:
`landing-pages/yarden/tracking-browser.test.ts`, incluído pelo
`vitest.config.ts` da raiz via `include: ["landing-pages/**/*.test.ts"]`
(verificado pelo @po; baseline medido hoje: **23/23 passando**).

Ele faz duas asserções cruzadas sobre `landing-pages/yarden/assets/`:

1. `expect(inexistentes).toEqual([])` — toda referência do HTML existe no disco.
2. `expect(orfaos).toEqual([])` — **todo arquivo do disco é referenciado pelo
   HTML.** Um asset não referenciado reprova o teste.

E o extrator de referências dele lê **somente atributos HTML**:
`/(?:src|srcset|href|content)="([^"]*)"/g`. Consequência: **uma imagem
referenciada apenas por `background-image` no CSS é invisível para o teste e
conta como órfã.**

**Contraprova executada pelo @po** (extrator copiado literalmente do teste):

| Cenário | Resultado |
|---|---|
| Fundo de seção via CSS `url('assets/lazer-*.jpg')` (técnica do `.amen`/`.band` do Vind) | **FALHA** — os 2 arquivos ficam órfãos |
| Galeria no padrão do Vind (`<img src="assets/galeria-01.webp">`, par `.jpg` no disco) | **FALHA** — o `.jpg` fica órfão |
| `trifold-fachada` servido só em `.webp` com o par `.jpg` copiado | **FALHA** — o `.jpg` fica órfão |
| Mesmo asset via `<picture>` + `<source srcset>` + `<img src>` (padrão atual do Yarden) | **PASSA** |

**Portanto, obrigatório:**

- Todo par `jpg+webp` novo é servido via `<picture>` com **as duas** URLs em
  atributo (`<source srcset="assets/x.webp">` + `<img src="assets/x.jpg">`) —
  o padrão que o `index.html` do Yarden já usa em `interior-lounge-gourmet`,
  `mapa-gleba-itororo` e `familia-quer-saber-mais`. **Não** copiar o
  `<img src="…webp">` avulso da galeria do Vind.
- **AC4 (fundo do Lazer)** e **AC7 (fundo da banda)**: se a imagem for aplicada
  por CSS `background-image`, ela **não pode** existir como arquivo próprio em
  `assets/` sem referência HTML. Duas saídas válidas: (i) usar `<img>`/
  `<picture>` na marcação (o `.split` do Yarden já faz assim) e posicionar por
  CSS; ou (ii) **reusar um arquivo que já esteja referenciado em outro ponto do
  HTML** — o que a AC7 já prevê, ao reaproveitar uma das 9 da Galeria, e que por
  isso **não cria asset novo nenhum**.
- Não copiar nenhum arquivo cujo nome contenha `vind-residence`/`vindresidence`:
  há asserção específica contra isso. `trifold-fachada.*` é seguro — o nome não
  casa com o padrão.
- Se um par `jpg+webp` for gerado e depois descartado na curadoria, **apagar os
  dois arquivos** do diretório; sobra de curadoria também é órfã.

## Decisões de curadoria — RESPONDIDAS e travadas (2026-09-03)

> **Como usar esta seção.** Eram 5 decisões de curadoria de conteúdo que o @dev
> não podia resolver sozinho (mesmo padrão de T0 na 86-12). **O stakeholder
> (lucas@trifold.eng.br) respondeu todas em 2026-09-03**, e as respostas foram
> **travadas no corpo das ACs** — que são a fonte normativa para a
> implementação. Esta seção fica no arquivo como **registro da decisão e do
> insumo** (candidatos, citações da Ficha Técnica, inventário nominal dos
> renders), não como pergunta pendente.
>
> Todos os candidatos foram **conferidos pelo @po na validação** contra a fonte
> primária (Ficha Técnica em PDF e os arquivos de render no Google Drive) —
> nada aqui é estimado.
>
> **Onde cada resposta está travada:** D1→AC3, D2→AC4, D3→AC5, D3.1→AC7,
> D4→AC8, D5→AC6. Se AC e esta seção divergirem em algum detalhe, **a AC
> vence** — e é bug de story, reportar ao @po.

### 📋 As 5 decisões e as respostas do stakeholder (em uma tela)

Perguntas organizadas pelo @po em 2026-09-03; respostas colhidas no mesmo dia.
**Todas as 8 respostas seguiram a recomendação do @po.** O detalhe completo do
insumo de cada uma está nas seções D1–D5 abaixo.

| # | Pergunta | ✅ Resposta do stakeholder | Travada em |
|---|---|---|---|
| **D1** | Quais números destacar em "O empreendimento"? | **Pacote recomendado, 6 stats:** 60 unidades · 83,66 m² de área privativa · 2 suítes e lavabo · 15 pavimentos · 2 subsolos + rooftop completo · 4 apartamentos por pavimento | AC3 |
| **D1.1** | A área privativa tem 2 metragens — 1 stat, 2 stats, ou só a maior? | **Só a maior (83,66 m²), 1 stat único** — mesma forma do Vind | AC3 |
| **D1.2** | Quer um stat de preço/entrada, como o Vind tem? | **NÃO.** A Ficha Técnica não tem esse dado em nenhuma das 7 páginas e nenhum valor foi fornecido — nada de preço na página | AC3 |
| **D2** | Quais amenidades viram os chips de "Lazer"? | **Pacote recomendado, 6 chips:** Sports bar (rooftop) · Yoga · Brinquedoteca · Petcare · Espaço gourmet com piscina privativa · **"E muito mais"** como 6º | AC4 |
| **D3** | Quais 9 fotos entram na Galeria? | **Curadoria recomendada:** 1 Fachada + 3 Rooftop + 3 Térreo + 2 Decorado = 9, priorizando `[L]` nos 2 slots `.g-wide`, **SEM as 4 "Humanizadas"** (são plantas baixas). **Arquivos específicos delegados ao @dev** dentro dessas categorias/proporções | AC5 |
| **D3.1** | Qual das 9 vira o fundo da banda CTA? | **Delegado ao @dev**, por critério de contraste | AC7 |
| **D4** | "Sobre a Trifold": reusar o texto do Vind ou variar? | **(A) verbatim** — texto **E** foto idênticos ao Vind Residence | AC8 |
| **D5** | Quanto mudar a seção "Localização"? | **(B) redesenho no padrão do Vind** — endereço em destaque + link clicável do Google Maps + os 5 pontos de referência como lista de texto visível. **É a decisão que mudou a estimativa: 8 → 9 pontos** | AC6 |

**O que ficou explicitamente delegado ao @dev** (autorização do stakeholder, não
ambiguidade): os arquivos específicos das 9 fotos (D3) e o fundo da banda CTA
(D3.1). **O que ficou explicitamente proibido:** stat de preço (D1.2, sem
fonte — Artigo IV), plantas humanizadas na galeria (D3), texto institucional
reescrito (D4).

---

### D1 — Quais stats destacar na seção Overview? ✅ RESPONDIDA (travada na AC3)

> ✅ **Resposta (2026-09-03):** os 6 stats do pacote recomendado — **(a) 60
> unidades, (b) 83,66 m² só a maior metragem, (c) 2 suítes e lavabo, (d) 15
> pavimentos, (e) 2 subsolos + rooftop, (h) 4 apartamentos por pavimento**,
> nessa ordem. Descartados: (f) área do terreno e (g) área construída.
> **D1.1** = 1 stat único com a maior metragem. **D1.2** = **sem stat de
> preço**. Texto normativo: **AC3**.

**Pergunta original:** dos 8 candidatos abaixo, quais **5 ou 6** devem virar os
números grandes da seção "O empreendimento"? E como ordená-los?

Todos os 8 foram reconferidos pelo @po em 2026-09-03 contra o texto extraído do
PDF — cada um é **citação literal** da Ficha:

| # | Stat (número grande) | Legenda sugerida | Fonte na Ficha |
|---|---|---|---|
| a | **60** | unidades | "NÚMERO DE APARTAMENTOS: 60 unidades" |
| b | **83,66 m² e 79,81 m²** | de área privativa | "ÁREA PRIVATIVA: 83,66m² e 79,81m²" |
| c | **2 suítes** | e lavabo | "TIPO DE APARTAMENTO: 2 suítes e lavabo…" |
| d | **15** | pavimentos tipo | "TIPO DE TORRE: … 15 pavimentos tipo…" |
| e | **2 subsolos + rooftop** | lazer completo em dois níveis | "TIPO DE TORRE: 2 subsolos … rooftop" |
| f | **1.344 m²** | de área de terreno | "ÁREA DO TERRENO: 1.344,00m²" |
| g | **6.129 m²** | de área construída | "ÁREA CONSTRUÍDA TOTAL: 6.128,96m²" |
| h | **4** | apartamentos por pavimento | "TIPO DE TORRE: … com 4 apartamentos por pavimento…" |

> **(h) foi acrescentado pelo @po nesta validação** — está literalmente na Ficha
> (na mesma linha que originou (d) e (e)) e a 0.1 não o havia oferecido. É o
> candidato que melhor comunica exclusividade/baixa densidade, então vale estar
> na mesa. Não é recomendação vinculante.

**Sub-pergunta (D1.1):** o candidato **(b)** tem duas metragens. Vira **um**
stat com as duas ("83,66 e 79,81 m²"), **dois** stats separados, ou só a maior
("83,66 m²")? No Vind Residence o equivalente é um stat único — **confirmado
pelo @po** em `vind-residence/index.html`: `<div class="big">66,91 m²</div>`
com legenda "de área privativa".

**Sub-pergunta (D1.2):** o Vind Residence tem um stat de preço — **confirmado
pelo @po**: `<div class="big">R$65mil</div>` com legenda "entrada".
**A Ficha Técnica do Yarden não traz preço nem valor de entrada** — o @po
extraiu e leu o texto das 7 páginas do PDF nesta validação; as únicas grandezas
numéricas do documento são áreas, contagens (60 unidades, 15 pavimentos, 4
apartamentos/pavimento, 2 subsolos) e códigos de acabamento/louça. **Não há
preço em nenhuma página.** Se o stakeholder quiser um stat assim no Yarden,
**ele precisa fornecer o valor**; o @dev está proibido de inventar um
(Artigo IV). Quer um stat de preço? Se sim, qual valor?

---

### D2 — Quais amenidades virar chips na seção Lazer? ✅ RESPONDIDA (travada na AC4)

> ✅ **Resposta (2026-09-03):** o pacote recomendado pelo @po, 6 chips —
> **Sports bar (rooftop) · Yoga · Brinquedoteca · Petcare · Espaço gourmet com
> piscina privativa · "E muito mais"** (6º, mesmo padrão do Vind). Os outros 19
> candidatos ficaram fora. Texto normativo: **AC4**.

**Pergunta original:** dos **25** candidatos abaixo (todos da Ficha Técnica), quais
**5 ou 6** devem virar os chips da seção "Lazer"? No Vind Residence são 6, e o
sexto é o coringa "E muito mais" (**confirmado pelo @po** lendo
`vind-residence/index.html`: 6 `.chip`, o último literalmente "E muito mais") —
vale repetir esse padrão aqui?

> **Correção de contagem (@po, 2026-09-03).** A versão 0.1 dizia "24
> candidatos (17 térreo + 7 rooftop)", mas a lista enumerada tem **18** itens de
> térreo, não 17 — o total correto é **25**. A origem da divergência: a Ficha
> Técnica traz **17 itens literais** de lazer de térreo, e a story desdobra
> "piscina adulto e infantil com deck" em dois candidatos (ver nota ¹), o que
> leva a 18. Os dois números estão certos em contextos diferentes: **17 = itens
> da fonte; 18 = candidatos oferecidos aqui.**

**Térreo (18 candidatos, de 17 itens literais da Ficha):** boulevard mirante ·
fire place · piscina adulto\* · piscina infantil com deck\* · playground ·
brinquedoteca · market · cozinha† · salão de festas e terraço · delivery ·
beautyroom · petplace · petcare · praça de convivência · miniquadra ·
bicicletário · espaço gourmet · espaço gourmet com piscina privativa

**Rooftop (7):** sports bar · lounge · coworking com sala para reuniões ·
terraço · pilates · academia · yoga

> \* A Ficha traz "piscina adulto **e** infantil com deck" como item único — a
> separação em dois é paráfrase do @sm, não citação literal.
> † "Cozinha" aparece na lista de lazer da Ficha entre "market" e "salão de
> festas", provavelmente a cozinha de apoio do salão. **Recomendação do @po:
> não usar como chip isolado** — lê mal numa vitrine de lazer.

**Recomendação do @po (não vinculante):** os chips que melhor diferenciam o
Yarden são os que o Vind **não** tem — *rooftop* com sports bar, yoga,
brinquedoteca, petcare, e o "espaço gourmet com piscina privativa".

---

### D3 — Quais 9 fotos usar na Galeria? ✅ RESPONDIDA (travada na AC5 e AC7)

> ✅ **Resposta (2026-09-03):** a curadoria recomendada pelo @po —
> **1 Fachada + 3 Rooftop + 3 Térreo + 2 Decorado = 9**, com `[L]` (paisagem
> larga) nos 2 slots `.g-wide` e **sem nenhuma das 4 "Humanizadas"** (são
> plantas baixas, não ambientes). **A escolha dos arquivos específicos dentro
> dessas categorias/proporções foi delegada ao @dev pelo stakeholder** — o
> inventário abaixo é o insumo dessa escolha, não uma pergunta pendente.
> **D3.1** (qual das 9 vira o fundo da banda CTA) também **delegada ao @dev**,
> por contraste. Texto normativo: **AC5** e **AC7**.

**Pergunta original:** quais **9** dos 39 renders abaixo entram na galeria, e em
que ordem? (A ordem importa: o grid alterna tamanhos — 2 fotos ficam largas
`.g-wide` e 1 fica alta `.g-tall`, como no Vind.)

Inventário **completo e conferido pelo @po em 2026-09-03** (39 arquivos; os 2
`.DS_Store` do diretório não são imagens). Caminho relativo à pasta base
`…/TRIFOLD/Empreendimentos/Yarden/Book/RENDERS/`. Todos vão precisar de
compressão (ver AC5).

**Legenda de proporção** (medida com `sips`, arquivo por arquivo):
`[L]` = paisagem larga 4000×1818 (~2,2:1) · `[Q]` = **quadrada 4000×4000** ·
`[W]` = 16:9 (3966×2250). Um `[Q]` num slot `.g-wide` perde ~55% da altura no
recorte — prefira `[L]` para os 2 slots largos.

**Fachada (2)**
- `Fachada/Fachada_2 Yarden.jpg` `[L]` — 8,7 MB
- `Fachada/Fachada_3 Yarden.jpg` `[L]` — 8,6 MB

**Térreo (14)**
- `Térreo/Beauty Room Yarden.jpg` `[Q]` — 7,4 MB
- `Térreo/Espaço Bikes Yarden.jpg` `[L]` — 5,5 MB
- `Térreo/Espaço Kids Yarden.jpg` `[Q]` — 9,3 MB
- `Térreo/Estar Yarden.jpg` `[L]` — 4,2 MB
- `Térreo/Fireplace Yarden.jpg` `[L]` — 6,8 MB
- `Térreo/Gourmet Yarden.jpg` `[W]` — 7,6 MB
- `Térreo/Lazer Yarden.jpg` `[L]` — 8,8 MB — **já reservada** para o fundo da seção Lazer (AC4)
- `Térreo/Market Yarden.jpg` `[L]` — 5,0 MB
- `Térreo/Mini Quadra Poliesportiva Yarden.jpg` `[L]` — 3,6 MB
- `Térreo/Pet place Yarden.jpg` `[Q]` — 12,0 MB
- `Térreo/Piscina Infantil Yarden.jpg` `[Q]` — 18,2 MB (a mais pesada do book)
- `Térreo/Piscina privativa gourmet Yarden.jpg` `[L]` — 8,5 MB
- `Térreo/Piscina Yarden.jpg` `[L]` — 8,5 MB
- `Térreo/Salão de Festas Yarden.jpg` `[L]` — 5,3 MB

**Rooftop (8)**
- `Rooftop/Coworking Yarden.jpg` `[L]` — 3,8 MB
- `Rooftop/Fitness Yarden.jpg` `[L]` — 3,5 MB
- `Rooftop/Lounge Yarden.jpg` `[L]` — 6,2 MB
- `Rooftop/Pilates Yarden.jpg` `[L]` — 3,9 MB
- `Rooftop/Sala de Jogos Yarden.jpg` `[L]` — 4,2 MB
- `Rooftop/Sala de Reuniões Yarden.jpg` `[Q]` — 6,3 MB
- `Rooftop/Sport bar Yarden.jpg` `[L]` — 5,8 MB
- `Rooftop/Terraço Yarden.jpg` `[Q]` — 11,8 MB

**Decorado 1 (5)** — apartamento decorado, opção 1
- `Decorado 1/Decorado 1_quarto Yarden.jpg` `[Q]` — 8,6 MB
- `Decorado 1/Decorado 1_sala estar Yarden.jpg` `[Q]` — 11,7 MB
- `Decorado 1/Decorado 1_sala estar-3 Yarden.jpg` `[L]` — 4,3 MB
- `Decorado 1/Decorado 1_sala estar+cozinha Yarden.jpg` `[L]` — 3,9 MB
- `Decorado 1/Decorado 1_suite Yarden.jpg` `[L]` — 3,5 MB

**Decorado 2 (5)** — apartamento decorado, opção 2
- `Decorado 2/Decorado 2_cozinha Yarden.jpg` `[Q]` — 6,7 MB
- `Decorado 2/Decorado 2_quarto Yarden.jpg` `[Q]` — 5,4 MB
- `Decorado 2/Decorado 2_sacada Yarden.jpg` `[Q]` — 5,2 MB
- `Decorado 2/Decorado 2_sala estar + cozinha Yarden.jpg` `[L]` — 3,4 MB
- `Decorado 2/Decorado 2_suite Yarden.jpg` `[Q]` — 8,5 MB

**Humanizadas (4)** — ⚠️ **são PLANTAS humanizadas, não ambientes.** O @po
abriu a `tipo 1` para conferir: é planta baixa vista de cima, com os rótulos
SUÍTE / SUÍTE MASTER / SALA / COZINHA / VARANDA GOURMET / LAVABO / ÁREA
TÉCNICA. **Recomendação do @po: NÃO misturar na galeria de ambientes** (a
galeria do Vind é 100% ambiente; planta baixa num lightbox de fotos quebra a
leitura). Se o stakeholder quiser plantas na página, isso é uma **seção
própria** e fica **fora do escopo desta story**. São também as únicas de
proporção irregular entre si (não servem para um grid uniforme):
- `Humanizadas/Humanizada Final tipo 1.png` — 3200×1802, 6,7 MB
- `Humanizadas/Humanizada Final tipo 2.png` — 3029×2060, 7,9 MB
- `Humanizadas/Humanizada Final tipo 3.png` — 2945×1856, 5,8 MB
- `Humanizadas/Humanizada Final tipo 4.png` — 3200×2084, 7,1 MB

**Subsolo 1 (1)**
- `Subsolo 1/Car Wash Yarden.jpg` `[L]` — 2,9 MB (a mais leve do book)

**Recomendação de variedade do @po (não vinculante):** 1 Fachada + 3 Rooftop +
3 Térreo + 2 Decorado. Evitar repetir visualmente o que já está na página:
o Hero já usa a piscina do rooftop e a seção "natureza" já usa um lounge
gourmet — então `Rooftop/Lounge` e `Térreo/Piscina` podem ficar redundantes.

**Recomendação de proporção do @po (não vinculante, mas técnica):** os 2 slots
`.g-wide` devem receber `[L]` (paisagem larga) e o slot `.g-tall` é o único que
aproveita bem uma `[Q]` (quadrada) — de todo o book, **nenhuma imagem é
retrato**, então o slot alto sempre vai recortar; uma `[Q]` é a que perde menos
ali. As 6 fotos de slot normal aceitam qualquer proporção. Se a escolha do
stakeholder cair em `[Q]` para um slot largo, o @dev deve sinalizar em vez de
recortar no escuro.

**Sub-pergunta (D3.1):** dentre as 9 escolhidas, qual serve de **fundo da banda
CTA** (AC7)? Precisa de área "calma" para texto branco sobreposto. Se o
stakeholder não opinar, o @dev escolhe pelo critério de contraste (AC7 já
autoriza).

---

### D4 — "Sobre a Trifold": reusar o texto do Vind ou variar? ✅ RESPONDIDA (travada na AC8)

> ✅ **Resposta (2026-09-03):** **Opção (A) — reuso verbatim de texto E foto**,
> conforme recomendação do @po. Kicker, H2 e parágrafo são copiados palavra por
> palavra da transcrição abaixo, e a foto é o mesmo
> `trifold-fachada.{jpg,webp}` do Vind. Opções (B) e (C) descartadas. Texto
> normativo: **AC8**.

**Pergunta original:** a seção institucional do Vind Residence tem este conteúdo exato:

- **Kicker:** "Sobre a Trifold"
- **H2:** "Referência no conceito de morar bem"
- **Parágrafo:** *"Fundada em 2019 com a união de uma equipe experiente —
  atuante em conjunto no mercado desde 1997 — a Trifold trabalha na
  orçamentação e execução de obras residenciais, comerciais, industriais e
  hospitalares, além da incorporação e execução de empreendimentos próprios
  que reúnem alta qualidade."*
- **Foto:** `trifold-fachada.{jpg,webp}` (sede da Trifold)

**Opções:**
- **(A)** Reusar **tudo verbatim** — é a mesma empresa, o mesmo prédio, e o
  texto já está publicado em produção no Vind Residence. *Default do @po.*
- **(B)** Mesmo texto, **foto diferente** (stakeholder fornece).
- **(C)** **Texto variado** para o Yarden (stakeholder fornece a nova redação —
  o @dev não pode reescrever texto institucional por conta própria, Artigo IV).

---

### D5 — Quanto mudar a seção de Localização? ✅ RESPONDIDA (travada na AC6)

> ✅ **Resposta (2026-09-03):** **Opção (B) — redesenho no padrão do Vind**,
> conforme recomendação do @po: endereço em destaque, link clicável para o
> Google Maps (URL oficial da Ficha) e os 5 pontos de referência como lista de
> texto visível. Opção (A) descartada. **Esta é a única das 5 decisões que
> mexeu na estimativa: 8 → 9 pontos.** Texto normativo: **AC6**.

**Pergunta original:** hoje o Yarden tem a seção "Invista no novo centro urbano de
Maringá" (foto do mapa + texto sobre a Gleba Itororó). Os pontos de referência
existem **só no `alt` da imagem** (Catedral, Parque do Ingá, Av. JK, Bosque II,
Av. Itororó) — não são visíveis para quem lê a página.

**Opções:**
- **(A) Mínima** — só ganha `id="localizacao"` (para a âncora do nav
  funcionar) + um `kicker` "Localização". Conteúdo e imagem intactos.
- **(B) Redesenho no padrão do Vind** — além do (A), o endereço em destaque
  ("📍 Rua Carlos Meneghetti, 168 — Gleba Itororó, Maringá", da Ficha Técnica)
  + link "Ver no Google Maps" (a Ficha traz a URL) + os 5 pontos de referência
  como lista visível em duas colunas. Mais trabalho, mas é a estrutura que o
  Vind usa (lá são 11 pontos).

**Nota do @po:** a Opção B tem um ganho real de SEO/acessibilidade — hoje os
pontos de referência são invisíveis para leitor de tela e para busca. Mas é a
única das 5 decisões que **muda a estimativa** da story (~1 ponto a mais).

## Fora de escopo (explícito, não inventar na implementação)

- Seção de Depoimentos (AC12).
- Qualquer mudança em `packages/web/*`, nas rotas de tracking, ou em
  `landing-pages/trifold-design-system/vercel.json` — esta story não toca
  infraestrutura nem CAPI.
- Qualquer mudança nos 3 formulários existentes além de, no máximo, novos
  `id`s de campos DENTRO dos formulários **não é esperada** — nenhum AC pede
  isso; se algo exigir tocar nos formulários, é sinal de que a story saiu do
  escopo e deve ser escalada, não decidida sozinha.
- Preço/valor de entrada do Yarden (não há dado verificado — ver D1.2).
- **Seção de plantas do apartamento.** As 4 "Humanizadas" do book são plantas
  baixas humanizadas (confirmado pelo @po abrindo o arquivo `tipo 1`), não
  ambientes. Publicá-las exige uma seção própria com tratamento próprio
  (zoom/legenda por tipologia) — **não é esta story**, e elas não entram na
  galeria da AC5.
- Criar projeto Vercel, mexer em DNS ou em qualquer coisa de T12/T13 — essa
  pendência é da 86-12, não desta story.

## Riscos

1. ~~**Curadoria (D1–D3) pode atrasar o início da implementação.**~~
   **MITIGADO em 2026-09-03:** o stakeholder respondeu D1–D5 e as respostas
   estão travadas nas ACs (ver Change Log 0.3). Não há mais espera de curadoria,
   e **não existe cenário de PLACEHOLDER** nesta story — todo conteúdo já tem
   texto definitivo. Risco residual: o @dev implementar a partir das tabelas de
   *candidatos* das seções D1/D2 em vez das listas travadas das AC3/AC4 — as
   seções D são registro/insumo, **a AC é a norma**.
2. **Processamento de imagem é trabalho manual** (recorte/otimização de até
   11 fotos: 9 galeria + 1 lazer + 1 sobre-a-trifold, sendo a última já
   reusada). Pode exceder a estimativa se as imagens de origem exigirem
   tratamento extra (as `Humanizadas/*.png` são bem mais pesadas que os
   `.jpg` das demais pastas).
3. **Header fixo pode colidir com o `.hero-brand`/`.hero-form` em telas muito
   baixas** (notebooks com pouca altura) — validar visualmente, não só por
   largura.
4. **(acrescentado pelo @po, 2026-09-03) Seguir o padrão do Vind Residence "ao
   pé da letra" reprova o teste automatizado desta landing.** As AC4/AC5/AC7/
   AC8 mandam adaptar o Vind, e o Vind serve imagem de galeria como
   `<img src="…webp">` avulso e fundos de seção por CSS — os dois modos deixam
   arquivos órfãos em `assets/`, e `tracking-browser.test.ts` reprova órfão.
   Mitigado pela **AC15**, que fixa a convenção do Yarden (`<picture>` com as
   duas URLs) e foi confirmada por contraprova executada, não por leitura.
   Risco residual: o @dev copiar o trecho do Vind por conveniência sem ler a
   AC15.
5. **(acrescentado pelo @po) 12 dos 35 renders são quadrados (4000×4000).**
   Se a curadoria da D3 escolher uma foto quadrada para um dos 2 slots
   `.g-wide`, o recorte come ~55% da altura e o ambiente fica irreconhecível.
   Mitigado anotando a proporção de cada arquivo em D3; o @dev deve sinalizar
   em vez de recortar no escuro.

## Dev Notes

### Mapa de reuso (verificado nesta sessão)

| Fonte | O que oferece | Uso nesta story |
|---|---|---|
| `landing-pages/vind-residence/index.html` | Estrutura/CSS/comportamento de `header.nav`, `.overview`/`.stats`, `.amen`/`.chips`, `.gallery-grid`+lightbox, `.loc-sec`+`.poi`, `.band`, `.about`/Sobre, `.fnav` | **Referência de estrutura e comportamento** (ADAPT) — não copiar nomes de classe literalmente; seguir a convenção de classes em português já usada no `index.html` do Yarden (`.titulo-secao`, `.texto-secao`, `.saber`, `.check`, `.hero-form`, etc.) |
| `landing-pages/yarden/index.html` (atual) | `:root` com paleta/tipografia, os 3 formulários + tracking, Hero, footer | **Base sobre a qual esta story constrói** — nenhuma variável de cor/fonte nova |
| `landing-pages/vind-residence/assets/trifold-fachada.{jpg,webp}` | Foto da sede da Trifold | **REUSE direto (AC8)** — copiar para `landing-pages/yarden/assets/` |
| Ficha Técnica (PDF) | Dados factuais do empreendimento | Fonte única de verdade para stats (AC3) e chips (AC4) — nada fora dela |
| Renders reais (Google Drive) | 39 fotos do book do Yarden | Fonte única de imagens novas (AC4 fundo, AC5 galeria) — nenhuma imagem de banco de imagens genérico |

### Candidatos de stats (Ficha Técnica — insumo da D1, JÁ DECIDIDA)

> ⚠️ Esta é a lista de **candidatos** que foi levada ao stakeholder. Os 6 stats
> efetivamente aprovados estão na **AC3** — implementar por lá, não por aqui.


- 60 unidades
- 83,66m² e 79,81m² de área privativa (duas metragens — decidir se vira 1 ou 2
  stats)
- 2 suítes e lavabo (tipo de apartamento)
- 15 pavimentos tipo
- 2 subsolos + rooftop completo
- Área do terreno: 1.344,00m²
- Área construída total: 6.128,96m²

### Candidatos de amenidades/chips (Ficha Técnica — insumo da D2, JÁ DECIDIDA)

> ⚠️ Lista de **candidatos**. Os 6 chips aprovados estão na **AC4** —
> implementar por lá.


**25 candidatos no total** (18 de térreo + 7 de rooftop), conferidos pelo @po
contra o PDF na validação de 2026-09-03 — a Ficha traz **17** itens literais de
térreo e a story desdobra um deles em dois (ver D2 e a nota ¹). Cada item abaixo
aparece **literalmente** na Ficha Técnica, com duas exceções sinalizadas:

Térreo (17): boulevard mirante · *fire place* · piscina adulto¹ · piscina
infantil com deck¹ · *playground* · brinquedoteca · *market* · cozinha ·
salão de festas e terraço · *delivery* · *beautyroom* · *petplace* ·
*petcare* · praça de convivência · miniquadra · bicicletário · espaço
gourmet · espaço gourmet com piscina privativa.

Rooftop (7): *sports bar* · *lounge* · coworking com sala para reuniões ·
terraço · pilates · academia · yoga.

> ¹ **Paráfrase, não citação literal.** A Ficha Técnica traz um único item,
> "piscina adulto e infantil com deck". A separação em dois candidatos é
> defensável (as pastas de render têm `Térreo/Piscina Yarden.jpg` e
> `Térreo/Piscina Infantil Yarden.jpg` separadas), mas o @dev deve saber que
> está parafraseando — não são dois itens da fonte.
>
> Note também que o item "cozinha" da Ficha é ambíguo em contexto de lazer
> (aparece entre "*market*" e "salão de festas e terraço", provavelmente a
> cozinha de apoio do salão). **Não usar como chip isolado** sem confirmação —
> um chip "Cozinha" numa lista de lazer lê mal.

### Inventário completo de renders (insumo da D3 — composição JÁ DECIDIDA)

Ver tabela em "Descoberta" acima e a lista nominal com proporções em **D3** —
39 arquivos em 7 pastas. Caminho base:
`.../Empreendimentos/Yarden/Book/RENDERS/{pasta}/{arquivo}`.

A **composição** da galeria está travada na **AC5** (1 Fachada + 3 Rooftop +
3 Térreo + 2 Decorado, zero Humanizadas, `[L]` nos slots largos); a escolha dos
**arquivos** dentro disso é do @dev, por delegação do stakeholder.

### Convenção de assets a seguir (a do YARDEN, não a do Vind)

> **Correção do @po (2026-09-03).** A 0.1 intitulava esta seção "mesma do Vind
> Residence". **Não é.** A galeria do Vind serve `<img src="assets/galeria-01.webp">`
> avulso, com o par `.jpg` no disco sem referência — o que no Yarden reprova
> `tracking-browser.test.ts` (asset órfão, ver AC15). A convenção a seguir é a
> que o próprio Yarden já pratica.

- Toda imagem de conteúdo (galeria, fundos de seção) vai como par
  `nome.jpg` + `nome.webp`, servidos via `<picture>` com `<source type="image/webp">`
  **e as duas URLs em atributo HTML** (mesmo padrão já usado em
  `interior-lounge-gourmet`, `mapa-gleba-itororo`, `familia-quer-saber-mais` no
  `index.html` atual do Yarden). Ver AC15 — é requisito, não estilo.
- Nomes de arquivo descritivos em português, kebab-case, sem espaço (ex.:
  `galeria-01.jpg`, `lazer-piscina.jpg` — não copiar os nomes originais dos
  renders, que têm espaços e "Yarden" repetido).
- Tamanho de arquivo alvo: **≤ 330KB por arquivo**, preferindo a faixa mais
  leve do Vind Residence (webp abaixo de ~150KB). Medições feitas pelo @po na
  validação: assets atuais do Yarden 56KB–324KB; `galeria-*` do Vind
  10KB–226KB. Não subir os JPGs originais em alta resolução sem compressão.

### Testing

> ⚠️ **Correção do @po (2026-09-03).** A 0.1 afirmava que "não há suíte
> automatizada a rodar/atualizar para esta story" e que "não é esperado rodar
> `pnpm vitest`". **Isso está errado, e era o risco mais concreto da story.**
> `landing-pages/yarden/tracking-browser.test.ts` roda nesta landing —
> `vitest.config.ts` da raiz tem `include: ["landing-pages/**/*.test.ts"]` — e
> ele valida exatamente o que esta story mais faz: **mexer em `assets/`**.
> Rodar é obrigatório (ver AC15).

**Passo automatizado (obrigatório, antes e depois):**

```bash
# na raiz do repo
npx vitest run landing-pages/yarden/tracking-browser.test.ts
```

- **Baseline medido pelo @po em 2026-09-03, antes desta story: 23/23 passando
  (exit 0).** Qualquer falha depois da implementação é regressão introduzida
  aqui, não ruído pré-existente.
- Ele cobre: par HTML↔`assets/` nos dois sentidos (inexistente e órfão), ids
  dos campos dos 3 formulários, live region, trava de duplo submit, os dois
  endpoints do proxy, o id do Pixel e a ausência de `console.log` do payload.
  É o guarda automático das AC14 e AC15.
- `landing-pages/yarden/api-proxy.test.ts` **não lê o `index.html`**
  (verificado) — não é afetado por esta story, mas roda junto de graça.

**Validação manual (o layout em si não tem teste automatizado):** mesmo runtime
da 86-12 — `cd landing-pages/yarden && python3 -m http.server 8080`.
- Checklist manual (por breakpoint: desktop >980px, mobile <980px, e
  <560px):
  - Nav: aparece transparente no topo do Hero, ganha fundo `--marrom` após
    60px de scroll, hambúrguer mobile abre/fecha corretamente, cliques nas
    âncoras levam à seção certa sem escondê-la atrás do header fixo.
  - Todas as 6 seções novas renderizam com as cores/fontes/logo corretos (só
    variáveis já existentes) e sem overflow horizontal.
  - Galeria: lightbox abre ao clicar em qualquer uma das 9 fotos, fecha com
    Esc/clique fora/botão X.
  - Console do navegador sem erros JS novos (comparar antes/depois desta
    story).
  - Os 3 formulários continuam enviando normalmente (ou, sem backend local,
    ao menos disparando as chamadas esperadas — confirmar via aba Network que
    `fetch` para `CONFIG.leadEndpoint`/`TRACK_ENDPOINT` continua idêntico ao
    de antes desta story).
  - `InitiateCheckout` dispara uma única vez ao focar qualquer um dos 6 campos
    de nome/whats (verificar via `console.log` temporário ou Meta Pixel
    Helper — remover antes de finalizar).
- **Nenhum arquivo `.ts` de teste deve ser MODIFICADO** por esta story: os dois
  testes existentes já passam e continuam válidos sem alteração (o extrator de
  assets é dinâmico — lê o diretório com `readdirSync`, não tem contagem
  fixa —, então 11 assets novos **referenciados** passam sem tocar no teste).
  Se o @dev sentir necessidade de editar `tracking-browser.test.ts` para fazer
  a story passar, isso é sinal de que a implementação violou a AC15, não de que
  o teste está errado. Escalar em vez de afrouxar a asserção.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` in core-config.yaml

## Tasks / Subtasks

- [x] **T0 (CONCLUÍDA em 2026-09-03 — era bloqueante para AC3/AC4/AC5/AC6/AC7/
      AC8)** — @po levou ao stakeholder as decisões **D1 a D5** e registrou as
      respostas nesta story: cada resposta está travada na AC correspondente, e
      a seção "Decisões de curadoria" virou registro. **Nada de curadoria
      pendente para o @dev.**
      - [x] D1 respondida (6 stats do Overview; D1.1 = só a maior metragem;
            D1.2 = **sem stat de preço**) → AC3 travada
      - [x] D2 respondida (6 chips: sports bar, yoga, brinquedoteca, petcare,
            espaço gourmet com piscina privativa, "E muito mais") → AC4 travada
      - [x] D3 respondida (composição 1 Fachada + 3 Rooftop + 3 Térreo +
            2 Decorado, sem Humanizadas; arquivos e D3.1 delegados ao @dev) →
            AC5 e AC7 travadas
      - [x] D4 respondida (**(A) verbatim** — texto e foto do Vind) → AC8 travada
      - [x] D5 respondida (**(B) redesenho**) → AC6 travada **e estimativa
            confirmada em 9 pontos** (8 + 1 pela Opção B)
- [x] **T1 (AC1)** — Criar `<header class="nav">` fixo com logo + 5 links +
      CTA; JS de scroll (`scrolled` no fundo) e toggle mobile; ajustar
      `scroll-margin-top`/`scroll-padding-top` nas seções-alvo.
      → `<header class="topo" id="topo">`, `html{scroll-padding-top:72px}`.
- [x] **T2 (AC2)** — Validar visualmente (todos os breakpoints) que o nav novo
      não sobrepõe o Hero existente. → medido em screenshot a 1440px e 390px.
- [x] **T3 (AC3)** — Construir seção Overview/Stats (`#empreendimento`) com os
      stats confirmados em T0.
- [x] **T4 (AC4)** — Construir seção Lazer (`#lazer`) com os chips confirmados
      em T0 + imagem de fundo `Térreo/Lazer Yarden.jpg` processada.
      → `assets/lazer-terreo.{jpg,webp}`, servida por `<picture>` (não por CSS).
- [x] **T5 (AC5)** — Processar as 9 imagens da Galeria confirmadas em T0
      (redimensionar/otimizar para jpg+webp, nomear `galeria-01..09`),
      construir `.gallery-grid` + lightbox + CTA.
- [x] **T6 (AC6)** — Ajustar a seção "invista" existente: `id="localizacao"` +
      `kicker` + o **redesenho da Opção B** (endereço em destaque, link do
      Google Maps `maps.app.goo.gl/RFibC7xZ7KZx6cwQA`, e os 5 pontos de
      referência como lista de texto visível), conforme D5 travada em T0.
- [x] **T7 (AC7)** — Construir Banda CTA reaproveitando uma das 9 imagens da
      Galeria (T5). → `galeria-05`, escolhida por luminância medida.
- [x] **T8 (AC8)** — Copiar `trifold-fachada.{jpg,webp}` do Vind Residence
      para `landing-pages/yarden/assets/`; construir seção Sobre a Trifold com
      o texto confirmado em T0.
- [x] **T9 (AC9)** — Adicionar `.fnav` ao footer existente.
- [x] **T10 (AC10, AC11)** — Revisão final: nenhuma linha do `<script>` de
      tracking tocada; nenhuma cor/fonte/logo fora do `:root` já existente.
      → provado por comparação byte a byte com `HEAD` (ver Dev Agent Record).
- [x] **T11 (AC12)** — Confirmar que nenhuma estrutura de Depoimentos foi
      criada, nem placeholder.
- [x] **T11b (AC15)** — Rodar
      `npx vitest run landing-pages/yarden/tracking-browser.test.ts` e obter
      **23/23 (ou mais) passando**. Baseline pré-story medido pelo @po: 23/23.
      Se acusar asset órfão/inexistente, corrigir a marcação (nunca o teste).
      → 23/23, arquivo NÃO modificado. As duas asserções foram provadas vivas
      por mutação (asset órfão e referência inexistente reprovam de fato).
- [x] **T12 (AC13, AC14)** — Checklist manual completo (ver Testing) nos 3
      breakpoints + confirmação de não-regressão dos 3 formulários.
      → automatizado com Playwright em vez de manual (mais confiável): âncoras,
      overflow, lightbox, menu mobile e console comparado com o `HEAD`.
- [x] **T13** — Atualizar `landing-pages/yarden/README.md` (contagem de
      assets, lista de seções) se a estrutura documentada lá ficar
      desatualizada. **Vai ficar:** o README hoje diz literalmente
      `assets/ # 13 arquivos: 5 imagens (jpg + webp cada) + 2 logos SVG + 1 PDF`
      — com as ~11 imagens novas da AC5/AC4/AC8 esse número muda
      necessariamente. T13 não é condicional. → 13 → **35 arquivos**.
- [x] **T14 (acrescentada pelo @dev)** — Suíte de testes das seções novas,
      em arquivo NOVO (`secoes-institucionais.test.ts`) para não modificar os
      dois testes existentes, como a story exige. 39 testes; todas as
      asserções centrais provadas por mutação.

## Definition of Done

A story está pronta para o gate do @qa quando **todas** as condições abaixo
valem:

1. ✅ **D1–D5 respondidas** pelo stakeholder e registradas nesta story —
   **satisfeita em 2026-09-03** (T0 concluída, respostas travadas em
   AC3/AC4/AC5/AC6/AC7/AC8, cada uma rastreável à Ficha Técnica ou ao
   inventário de renders). O que o @qa verifica aqui é que a implementação
   **seguiu** as decisões travadas — não que elas existam.
2. **AC1 a AC15 satisfeitas**, cada uma verificada pelo checklist manual de
   "Testing" nos 3 breakpoints (>980px, <980px, <560px).
3. **Zero dado inventado** (Artigo IV): todo número da seção Overview e todo
   chip da seção Lazer cita a Ficha Técnica; nenhum texto de marketing novo
   sobre o empreendimento foi escrito pelo @dev sem fonte.
4. **Zero regressão de tracking:** `git diff` do `index.html` não mostra
   nenhuma linha alterada no `<script>` de tracking do `<head>` nem no script
   final de envio; os 3 formulários continuam com os mesmos `id`s e as mesmas
   3 chamadas de `ligarFormulario`; console do navegador sem erro JS novo.
5. **Zero arquivo fora de `landing-pages/yarden/`** no File List — em especial
   nada em `packages/web/`, nada em `landing-pages/trifold-design-system/`.
   Única exceção permitida: a cópia de `trifold-fachada.{jpg,webp}` **para
   dentro** de `landing-pages/yarden/assets/` (AC8).
6. **Nenhuma estrutura de Depoimentos** criada, nem placeholder, nem
   comentário (AC12).
7. **Assets novos comprimidos** para ≤ 330KB por arquivo, em pares jpg+webp
   servidos via `<picture>` (AC5).
8. **`npx vitest run landing-pages/yarden/tracking-browser.test.ts` verde**,
   com **zero asset órfão e zero referência inexistente** (AC15). Baseline
   pré-story: 23/23. Nenhum arquivo `.test.ts` modificado.
9. **`README.md` do Yarden atualizado** (T13) — a contagem de assets muda; hoje
   a linha diz `13 arquivos: 5 imagens (jpg + webp cada) + 2 logos SVG + 1 PDF`
   (citação verificada pelo @po, e os 13 arquivos conferem no diretório).
10. **Dev Agent Record preenchido:** Agent Model, Completion Notes e File List.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-09-05 | 0.5 | **Ajuste visual pós-gate a pedido do usuário (screenshot em tela larga): respiro entre seções e alinhamento à direita da Localização. Só CSS, num arquivo só (`landing-pages/yarden/index.html`) — zero copy, zero cor, zero tipografia, zero HTML, zero tracking.** **(1) Causa raiz do problema de espaçamento — regressão real da 86-13, não "padrão full-bleed do Vind mal interpretado".** A `.split--natureza` foi escrita na 86-12 com `padding-bottom:0` **de propósito**: a seção seguinte era a `.split--invista`, que traz `padding-top:7.1%` próprio — o respiro era **emprestado da vizinha**. Esta story inseriu a `.lazer` entre as duas, e a `.lazer` (cópia do padrão da `.amen` da landing irmã) é um grid `1fr 1fr` **sem padding no container**: só a coluna `.lazer-txt` tem padding, a coluna da foto não tem nenhum. Resultado medido com Playwright, não estimado: a foto do lounge terminava e a faixa bege começava **no mesmo pixel** — `0px` de folga a 1440/1728/1920 e `14px` a 2560. **Dois defeitos irmãos, da mesma família, também medidos:** (i) a foto do térreo da `.lazer` encostava na borda **direita da viewport em todas as larguras** (`0px` de 390 a 2560; a 2560 virava uma foto de 1280px sangrando na tela) — esse sim é o padrão full-bleed intencional da irmã, mantido por cópia e agora **contido por decisão**, porque o resultado na prática foi reprovado; (ii) percentual de `padding` resolve contra a largura do **bloco continente** (o viewport), mas a `.split` para de crescer em `max-width:1464px` — acima disso o padding continuava crescendo **dentro de uma caixa que não crescia**, e a 2560 o `padding-left` de 13.8% virava **353px de uma caixa de 1464px**, espremendo o conteúdo contra a direita e abrindo um vazio à esquerda (é o que o screenshot do usuário mostrava). **Correções:** `padding-bottom` próprio na `.split--natureza` (`min(6.4%,94px)`); `min()` congelando cada percentual de `padding`/`gap` das duas `.split` no valor que ele tem quando a seção atinge `--max` (a 1464px **nada muda** — acima disso a seção passa a renderizar igual a 1464px); piso de `40px` nos lados onde a foto sangra (`right` na natureza, `left` na invista, que estavam a 38px e 34px da borda a 1440); e `max-width:var(--max)` + `padding:0 clamp(40px,2.66%,48px)` na `.lazer`, **só dentro de `@media (min-width:980px)`**. Medições depois: folga natureza→lazer **0 → 92px** (1440), **0 → 94px** (1728/1920), **14 → 94px** (2560); borda direita da foto da Lazer **0 → 40px** (1440), **0 → 276px** (1920), **0 → 596px** (2560), e nessas três larguras a foto da Lazer, a foto da natureza e a foto do mapa terminam **na mesma linha vertical** a partir da borda — consistência que antes não existia. **(2) Alinhamento da Localização.** O kicker "LOCALIZAÇÃO", o endereço, a linha do "Ver no Google Maps →" e a lista dos 5 POIs ficavam à **esquerda** dentro de uma coluna que o H2 e o parágrafo alinhavam à **direita**. A regra de desktop cobria só `.titulo-secao` e `.texto-secao` — mas o **reset de mobile já listava** `.kicker`, `.loc-endereco` e `.loc-maps-linha` com `text-align:left` desde a 0.4: o alinhamento à direita deles era o comportamento esperado e só faltava a regra de desktop. Os 4 seletores entraram na regra, mais a `.loc-pontos`; e o ponto dourado dos `li` foi **espelhado** junto com o texto (`padding:9px 20px 9px 0` + `::before{left:auto;right:0}`), senão ficaria órfão a 20px da palavra que marca — o ponto continua visível e na mesma cor. **O breakpoint mobile não foi alterado, foi COMPLETADO**: as duas linhas novas ali (`.loc-pontos` para `left` e o desespelhamento do `::before`) existem exatamente para que o mobile continue idêntico, e isso foi provado por medição — a 390px e a 768px a geometria e o `text-align` de **todos os 7 elementos** conferidos saem byte a byte iguais ao baseline (folgas, caixas e bordas incluídas). **Conferência visual em 5 larguras reais (390, 768, 1440, 1920, 2560) com Playwright/chromium**, mais a costura do breakpoint a 979/980/981 — sem salto nem sobreposição. *Nota de método:* o primeiro lote de prints mostrou a foto da Lazer **sumida** a 2560; era artefato de `fullPage:true` + `loading="lazy"` no Playwright (o relayout do print derruba a imagem), não CSS — provado consultando `complete`/`naturalWidth`/`getBoundingClientRect` no DOM (`684×520`, `currentSrc` = `lazer-terreo.webp`) e refeito com clip em coordenadas de viewport. **Validações, com paridade de baseline medida na mesma árvore** (`git stash push -- landing-pages/yarden/index.html`, por pathspec): `npx vitest run landing-pages/yarden` **89/89**; suíte inteira **as mesmas 71 falhas / os mesmos 3 arquivos** antes e depois, `diff` **vazio**; `npm run type-check` **os mesmos 12 erros**, `diff` **vazio**; `npm run lint` **0 erros / 30 avisos** (as falhas e os erros são o symlink `node_modules` da worktree, pré-existentes). Nenhuma asserção de teste precisou mudar. **Observação registrada e NÃO corrigida (fora do escopo pedido):** a `.saber-grid` (seção da 86-12) tem o mesmo padrão de percentual contra `max-width` — a 2560 a coluna de copy encolhe de 444px para 371px — mas a foto dela fica a 600px da borda a 2560 e a 30px a 1440, ou seja, não é o caso de "colada em tela larga" que o usuário reportou; fica como candidato a follow-up, não como correção silenciosa aqui. **Status mantido em `Ready for Review`:** o gate PASS da 0.4 avaliou o CSS anterior, então esta rodada pede re-conferência do @qa antes do push. | @dev (Dex) |
| 2026-09-04 | 0.4 | **Implementação concluída — T1 a T13 fechadas, mais uma T14 que eu acrescentei (suíte de testes das seções novas). `Ready → Ready for Review`.** O que foi entregue em `landing-pages/yarden/`: header/nav fixo com os 5 links + CTA e menu mobile (AC1); "O Empreendimento" com os 6 números travados da Ficha Técnica e **sem stat de preço** (AC3); "Lazer" com os 6 chips travados e a foto do térreo (AC4); Galeria de 9 renders com lightbox e CTA (AC5); a seção "Invista no novo centro urbano de Maringá" redesenhada como `#localizacao`, com endereço literal, link oficial do Maps e os 5 pontos de referência como texto visível — o `alt` do mapa **continua** listando os marcos, a lista é acréscimo (AC6/D5-B); banda CTA reaproveitando `galeria-05` (AC7); "Sobre a Trifold" com texto e foto verbatim da landing irmã (AC8/D4-A); `.fnav` no rodapé (AC9). **As duas delegações do stakeholder foram exercidas com critério explícito, não por gosto:** os 9 arquivos da Galeria (D3) foram escolhidos por proporção-compatível-com-o-slot → paleta quente (o `Rooftop/Coworking`, único azul/turquesa do book, foi descartado por destoar do `:root`) → não-redundância com o que a página já mostra → correspondência com um chip da AC4; e o fundo da banda (D3.1) saiu de **medição de luminância das 9 com `PIL.ImageStat`**, não de olho: `galeria-05` é simultaneamente a mais escura (média 106,6 de 255) e a mais uniforme entre as escuras (desvio 49,0 contra 64,7 da fachada) — as duas propriedades que o texto branco precisa. Detalhamento arquivo por arquivo, com o motivo de cada escolha **e de cada descarte**, no Dev Agent Record. **A AC15 foi o eixo da implementação, e as 3 armadilhas que ela previa se confirmaram**: os pares `jpg+webp` novos vão todos por `<picture>` com as duas URLs em atributo, a foto do Lazer vai por `<picture>` posicionado com `object-fit:cover` (não por `background-image`), e a `trifold-fachada` é servida nos dois formatos. O único `background-image` da página é o da banda CTA — legítimo porque aponta para `galeria-05.jpg`, que a Galeria já referencia por atributo, e portanto não cria arquivo nenhum; há teste que verifica exatamente essa condição. **`assets/` foi de 13 para 35 arquivos, com zero órfão e zero referência inexistente**, e as duas asserções cruzadas do `tracking-browser.test.ts` foram **provadas vivas por mutação** (criar um `galeria-10.jpg` sem referência reprova; trocar `galeria-07.webp` por `galeria-77.webp` reprova) — o baseline de 23/23 do @po foi confirmado antes de qualquer alteração e o arquivo **não** foi modificado. **Dois defeitos que só a conferência visual pegaria, encontrados e corrigidos:** (i) copiar o `.g-wide{grid-column:span 2}` da landing irmã para o grid mobile de 2 colunas deixa uma **célula vazia de 170×310** no canto superior direito (o auto-placement não encaixa a 2ª foto ao lado da 1ª, que ocupa 2 linhas) — a landing do Vind Residence carrega esse buraco em produção, e é um **quarto** ponto, não previsto na story, em que "seguir o padrão do Vind" era a resposta errada; corrigido para `span 1` no breakpoint de 979.98px, com teste próprio; (ii) o parágrafo do "Sobre a Trifold" corria **por baixo** do botão flutuante de WhatsApp (texto até x=1360, botão a partir de x=1360) — corrigido com `max-width:62ch`, remedido em x=1208. **Zero regressão de tracking, provado por bytes e não por leitura:** os 3 blocos `<script>` anteriores (511, 6.359 e 8.243 bytes), o `<noscript>` do Pixel e os 3 `<form>` são **byte a byte idênticos** ao `HEAD`; o JS novo (nav + lightbox) vive num 4º bloco separado justamente para tornar isso verificável. Console do navegador comparado lado a lado (HEAD na porta 8098 vs. versão nova na 8099): 2 mensagens antes, 2 depois, a mesma — nenhum erro JS novo. **Conferência visual com Playwright a 1440×900 e 390×844, com número e não com impressão:** as 5 âncoras param com o topo da seção em y=72 contra um header de 67px/58px (a seção chega **abaixo** dele, nunca escondida); `scrollWidth == clientWidth` nos dois breakpoints; as 9 fotos carregaram e as 9 foram servidas como `.webp`; lightbox abre e fecha com `Escape`; menu mobile abre e fecha ao clicar no link. **Testes:** `landing-pages/yarden` foi de 50/50 para **89/89**, e os 39 testes novos moram em **arquivo novo** (`secoes-institucionais.test.ts`) porque a story proíbe modificar os dois `.ts` existentes — as asserções centrais deles foram submetidas a **16 mutações e capturaram todas as 16** (âncora quebrada, quadrado em slot largo, POIs removidos, Maps trocado por busca por nome, `rel="noopener"` removido, 7º chip, stat de preço importado, hex novo, galeria com 8 fotos, fundo da banda em arquivo exclusivo, texto do "Sobre" reescrito, `scroll-padding-top` removido, fundo do Lazer por CSS, `<source webp>` removido, seção de depoimentos criada, `.fnav` fora de lugar). **Não-regressão do resto do repo, com baseline medido:** a suíte inteira falha nos **mesmos 3 arquivos e nas mesmas 71 asserções** com e sem esta story (verificado com `git stash push -u -- landing-pages/yarden`, por pathspec, para não tocar o trabalho paralelo de outros agentes na árvore); `type-check` tem os mesmos 12 erros, **diff vazio**; `lint` 0 erros / 30 avisos, 8/8 tasks em cache. As 71 falhas e os 12 erros são do symlink `packages/web/node_modules/@trifold/{ai,shared}` da worktree, que resolve para o checkout principal — nenhum dos 3 arquivos tem relação com `landing-pages/`. `landing-pages/` está fora do `pnpm-workspace.yaml`, então o `lint` do turbo não o alcança (mesma situação da 86-12); o arquivo de teste novo foi conferido com `tsc --strict` sobre o `tsconfig.json` da raiz: **0 erros**. **Nada de copy inventado (Artigo IV):** cada texto novo é rastreável — números e chips à Ficha Técnica; o H2 do Lazer ("Lazer completo em dois níveis") é a **legenda do stat 5 da própria AC3**, aprovada pelo stakeholder; o parágrafo do Lazer é a paráfrase que a AC4 autoriza, e há teste que reprova as amenidades da landing irmã ("piscina aquecida", "spots bar", "coworking"), que são de outro prédio; a copy da banda reusa a linha literal já publicada em "Quer saber mais?"; e o "Sobre a Trifold" é comparado por igualdade estrita de string inteira. AC11 conferida por **inventário** de literais hex: zero cor nova, zero fonte nova, zero logo novo, os três com teste. **Fora de escopo respeitado:** nenhum arquivo fora de `landing-pages/yarden/` (a cópia da `trifold-fachada` é para dentro de `assets/`, a exceção que a DoD #5 permite), nada em `packages/web/`, nada em `trifold-design-system/`, nenhum evento CAPI novo, nenhum formulário novo, e nenhuma estrutura de Depoimentos — nem placeholder, nem comentário. Próximo passo: `@qa *qa-gate`. **Pendência que NÃO é desta story:** a URL `trifold.eng.br/yarden/` segue offline até o @devops concluir as tarefas T12/T13 de infraestrutura da 86-12 — nada aqui muda esse estado. | @dev (Dex) |
| 2026-09-03 | 0.3 | **As 5 decisões de curadoria foram respondidas pelo stakeholder (lucas@trifold.eng.br) e estão travadas nos ACs. Status promovido `Draft → Ready` — o gate que a 0.2 declarou explicitamente como o único pendente caiu.** As 8 respostas (D1, D1.1, D1.2, D2, D3, D3.1, D4, D5) **seguiram todas a recomendação do @po** da validação 0.2. O que ficou travado, AC por AC: **D1 → AC3** — 6 stats, nesta ordem: 60 unidades · 83,66 m² de área privativa · 2 suítes e lavabo · 15 pavimentos · 2 subsolos + rooftop completo · 4 apartamentos por pavimento (todos citação literal da Ficha Técnica); **D1.1** = a área privativa vira **1 stat só com a maior metragem** (`83,66 m²`), mesma forma do Vind (`66,91 m²`), e não dois stats; **D1.2** = **NÃO existe stat de preço/entrada** — a Ficha não traz esse dado em nenhuma das 7 páginas e nenhum valor foi fornecido, então o "R$65mil entrada" do Vind **não** é importado (Artigo IV); descartados os candidatos (f) área do terreno e (g) área construída. **D2 → AC4** — 6 chips: Sports bar (rooftop) · Yoga · Brinquedoteca · Petcare · Espaço gourmet com piscina privativa · **"E muito mais"** como 6º coringa (mesmo padrão do Vind); os outros 19 candidatos, inclusive o ambíguo "cozinha", ficaram fora. **D3 → AC5** — curadoria por categoria: **1 Fachada + 3 Rooftop + 3 Térreo + 2 Decorado = 9**, com `[L]` (paisagem larga) obrigatório nos 2 slots `.g-wide` e `[Q]` admitida só no `.g-tall`, e **zero das 4 "Humanizadas"** (são plantas baixas, não ambientes — vão para uma story futura, se houver). A escolha dos **arquivos específicos** dentro dessas categorias/proporções foi **delegada ao @dev** pelo stakeholder — é autorização explícita, não ambiguidade; **D3.1 → AC7** também delegada ao @dev, por critério de contraste para texto branco. **D4 → AC8** — **Opção (A) verbatim**: kicker, H2 e parágrafo institucional copiados palavra por palavra do Vind Residence e a **mesma** foto `trifold-fachada.{jpg,webp}`; (B) foto nova e (C) texto novo descartadas, e o @dev segue proibido de reescrever texto institucional. **D5 → AC6** — **Opção (B) redesenho no padrão do Vind**: endereço em destaque literal da Ficha ("Rua Carlos Meneghetti, 168 — Gleba Itororó, Maringá"), link clicável para a URL oficial do Maps que a Ficha traz (`maps.app.goo.gl/RFibC7xZ7KZx6cwQA`, com `rel="noopener"`), e os **5 pontos de referência como lista de texto visível** (Catedral, Parque do Ingá, Av. JK, Bosque II, Av. Itororó) — hoje eles existem só no `alt` da imagem, invisíveis para leitor de tela e para busca; o `alt` continua como está, a lista é acréscimo. **Mantido o veto ao iframe do Google Maps** (a imagem de mapa própria do Yarden fica, e não cria asset novo). **Estimativa: 8 → 9 pontos (G)**, o `+1` exclusivamente pela Opção B da D5, exatamente como a nota do @po em D5 previa ("~1 ponto a mais"); nenhuma outra decisão mexeu no tamanho — a curadoria D1–D4 deixou de ser custo de descoberta em vez de virar escopo novo. *Rastreabilidade honesta: a base de 8 pontos vem do cabeçalho das versões 0.1/0.2, que não registraram a estimativa no Change Log; este commit é o primeiro do arquivo em git, então não há diff anterior para citar.* **Consertos de consistência aplicados nesta entrada** (auditoria @po: uma tentativa anterior editara só o cabeçalho e morreu antes de tocar o corpo): (i) o bloco "⛔ **Não iniciar implementação ainda** / está em `Draft` por decisão explícita" **contradizia frontalmente** o cabeçalho já em `Ready` — substituído por "✅ Implementação liberada", com a lista do que segue delegado ao @dev; (ii) AC3/AC4/AC5/AC6/AC7/AC8 ainda estavam com a linguagem de "fica em aberto — ver decisão D*" e, na AC6, com o menu "Opção A **ou** B" + "não decidir sozinho em modo YOLO" — todas reescritas com o texto definitivo; (iii) a seção "Decisões abertas — perguntas objetivas para o stakeholder" virou "**Decisões de curadoria — RESPONDIDAS e travadas**", a tabela "Resumo para levar ao stakeholder" virou tabela de **respostas**, e cada uma das 5 subseções D ganhou o cabeçalho "✅ RESPONDIDA" com a resposta no topo — o insumo (candidatos, citações da Ficha, inventário nominal dos 39 renders com proporção) **fica no arquivo como registro**, com a regra explícita de que **a AC vence** se divergir; (iv) as 3 referências cruzadas de Dev Notes ("para 'Decisões abertas' #1/#2/#3") ficaram penduradas numa seção renomeada — reapontadas para D1/D2/D3 e marcadas como insumo histórico, não como norma; (v) **Risco #1 (curadoria atrasa o início) marcado MITIGADO** e o cenário de PLACEHOLDER que ele autorizava foi **eliminado** — não há mais conteúdo sem texto definitivo, e o risco residual passou a ser o @dev implementar pelas tabelas de *candidatos* em vez das listas travadas; (vi) **T0 marcada `[x]`** com as 5 sub-respostas; (vii) T6 deixou de dizer "a Opção A ou B confirmada em T0" e passou a descrever a Opção B; (viii) DoD #1 marcada satisfeita, com a nota de que o @qa verifica **aderência** às decisões, não a existência delas. **Nada de escopo técnico mudou nesta entrada:** AC15 (a correção bloqueante da 0.2), o baseline de 23/23 do `tracking-browser.test.ts`, o teto de 330KB por asset e o "zero tracking novo" seguem exatamente como estavam. Próximo passo: `@dev *develop` — nenhum gate pendente. | @po (Pax) |
| 2026-09-03 | 0.2 | **Validação @po (`*validate-story-draft`): GO, 9/10 — e a story permanece deliberadamente em `Draft`.** ⚠️ **Exceção consciente ao `story-lifecycle.md`**, que manda o @po promover `Draft → Ready` em veredito GO: as decisões de curadoria **D1–D5 seguem pendentes com o stakeholder** e duas delas podem **mudar o escopo material** da story (quais 9 fotos processar em D3 e se entra um stat de preço em D1.2, que hoje não tem fonte). Promover a `Ready` agora convidaria o @dev a começar e depois refazer trabalho de imagem/conteúdo. **Promover a `Ready` só depois das respostas de D1–D5** (checklist T0); nenhum outro gate está pendente. Correções aplicadas nesta validação, todas por conferência em fonte primária: **(1) CRÍTICO — acrescentada a AC15**: `landing-pages/yarden/tracking-browser.test.ts` roda nesta landing (`vitest.config.ts` da raiz inclui `landing-pages/**/*.test.ts`) e reprova **asset órfão**; seguir o padrão do Vind Residence nas AC4/AC5/AC7/AC8 (galeria como `<img src="…webp">` avulso e fundo de seção por CSS) deixaria os `.jpg` e os fundos sem referência HTML e **quebraria o teste** — comprovado por contraprova executada com o extrator copiado do próprio teste (3 cenários falham, o `<picture>` do Yarden passa); baseline pré-story medido: **23/23 passando**. A seção "Testing" da 0.1 dizia o oposto ("não há suíte automatizada", "não é esperado rodar `pnpm vitest`") e foi corrigida. **(2)** Inventário de renders remedido com `sips`: a 0.1 afirmava "todas paisagem, `.jpg` 4000×1818 / 6–9 MB, `.png` 3200×1802 / 6–8 MB" — errado nas três dimensões; o real é **22 paisagem 4000×1818 + 12 QUADRADAS 4000×4000 + 1 de 3966×2250**, `.jpg` de 2,9 a 18,2 MB, `.png` de 2945×1856 a 3200×2084 / 5,8–7,9 MB. Proporção anotada arquivo por arquivo em D3 (importa: quadrada em slot `.g-wide` perde ~55% da altura) e virou Risco #5. **(3)** Contagem da D2 corrigida de 24 para **25** candidatos — a lista enumerava 18 itens de térreo, não 17; a Ficha traz 17 literais e a story desdobra "piscina adulto e infantil com deck" em dois. **(4)** Acrescentado o 8º candidato de stat (**4 apartamentos por pavimento**), citação literal da Ficha que a 0.1 não ofereceu. **(5)** Acrescentado o "Resumo para levar ao stakeholder" — as 5 decisões (8 perguntas com as sub) em uma tabela única. **(6)** Corrigido o título "Convenção de assets (mesma do Vind Residence)" → é a convenção do **Yarden**; a do Vind quebra o teste. Confirmações independentes (o que a 0.1 afirmava e **está correto**): 39 imagens em 7 pastas com as quantidades exatas por pasta (41 arquivos − 2 `.DS_Store`); faixas de peso dos assets (Yarden 56–324KB, `galeria-*` do Vind 10–226KB, webp até 153KB, jpg 24–226KB); os 7 dados da Ficha Técnica (endereço, torre, apartamento, lazer, áreas, 60 unidades) e a **ausência de preço** nas 7 páginas; a URL oficial do Maps `maps.app.goo.gl/RFibC7xZ7KZx6cwQA`; a transcrição **verbatim** do "Sobre a Trifold" do Vind (kicker, H2 e parágrafo, palavra por palavra) e a URL do Maps do Vind; nav do Vind com 5 links + CTA e `scrollY > 60`; 6 chips com "E muito mais" no 6º; galeria de 9 fotos com 2 `.g-wide` + 1 `.g-tall`; `.band` reusando `galeria-03.webp`; 11 POIs; 3 depoimentos em vídeo; o Sobre do Vind ter CTA (a AC8 corretamente omite); estado atual do Yarden (4 seções, nenhum `<header>`, 3 formulários e os 6 campos, breakpoints 980/979.98/560, `scroll-behavior:smooth`, os 11 tokens de cor do `:root`, os 5 marcos no `alt` do mapa); a citação literal da linha do `README.md`; 86-12 em `InReview` com `landing-pages/yarden/` já em `main` (squash `86ea676a`). Registro do epic 86 conferido: 86-13 consta em `stories_added`, na tabela de stories e no Change Log 0.7. | @po (Pax) |
| 2026-09-03 | 0.1 | Story criada a pedido do usuário: expandir a landing do Yarden para ter a mesma estrutura rica de seções da landing do Vind Residence (Overview/Stats, Lazer, Galeria, Sobre a Trifold, Nav, Banda CTA), preservando as 3 seções de conteúdo já existentes do Yarden (natureza, invista→localização, quer-saber-mais) e a infraestrutura de tracking da 86-12 intacta. Depoimentos ficou explicitamente fora de escopo (vídeos ainda não hospedados no YouTube). 5 decisões de curadoria/conteúdo deixadas abertas para o @po levar ao stakeholder (stats, chips de amenidades, 9 fotos da galeria, texto/foto de "Sobre a Trifold", profundidade do redesenho de "Localização"). Dados técnicos verificados na Ficha Técnica oficial (PDF) e inventário real de 39 renders no Google Drive (não 41, como estimado inicialmente). | @sm (River) |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (`claude-opus-4-6-20260219`) — @dev (Dex), 2026-09-04.

### Debug Log References

Baselines medidos **antes** de qualquer alteração, na worktree
`.claude/worktrees/86-12-lancamento-mapa` (branch
`fix/86-12-yarden-lancamento-mapa`):

| Comando | Antes | Depois |
|---|---|---|
| `npx vitest run landing-pages/yarden/tracking-browser.test.ts` | **23/23** (confirma o baseline do @po) | **23/23**, arquivo não modificado |
| `npx vitest run landing-pages/yarden` | 50/50 (2 arquivos) | **89/89** (3 arquivos) |
| `npx vitest run landing-pages` | 64/64 | **103/103** |
| `npx vitest run` (suíte inteira) | 71 falhas / 3 arquivos | **as MESMAS 71 falhas / os mesmos 3 arquivos** |
| `npm run type-check` | 12 erros `TS` | **os mesmos 12**, diff vazio |
| `npm run lint` | 0 erros, 30 avisos | **0 erros, 30 avisos** (8/8 tasks, FULL TURBO) |

**As 71 falhas e os 12 erros de tipo são pré-existentes e do ambiente, não
desta story** — e isso foi *provado*, não presumido: com
`git stash push -u -- landing-pages/yarden` (pathspec, para não tocar no
trabalho paralelo de outros agentes na árvore) os **mesmos 3 arquivos** e as
**mesmas 71 falhas** aparecem sem nenhuma mudança minha, e o diff dos erros de
`type-check` antes/depois é vazio. Causa: os symlinks
`packages/web/node_modules/@trifold/{ai,shared}` apontam para `../../../ai`, que
resolve para o checkout principal, não para a worktree — nenhum dos 3 arquivos
tem qualquer relação com `landing-pages/`.

`npm run lint` deu **FULL TURBO (8/8 em cache)**: `landing-pages/` está fora do
`pnpm-workspace.yaml` (`packages/*`), então o turbo não o alcança — mesma
situação do `tracking-browser.test.ts` que a 86-12 entregou. O arquivo de teste
novo foi conferido com `tsc --strict` usando o `tsconfig.json` da raiz:
**0 erros** (o `tracking-browser.test.ts` também).

**Provas por mutação (carrasco declarado, executado — não afirmado).**
As duas asserções cruzadas de asset da AC15 foram verificadas vivas:

| Mutação | Resultado |
|---|---|
| criar `assets/galeria-10.jpg` sem referência | `tracking-browser.test.ts` reprova: `expected [ 'galeria-10.jpg' ] to deeply equal []` |
| trocar `galeria-07.webp` por `galeria-77.webp` no HTML | reprova: `expected [ 'galeria-77.webp' ] to deeply equal []` |

E as 39 asserções novas foram submetidas a **16 mutações**, todas capturadas
(baseline 38 passed → 1 ou 2 failed em cada, e 38 passed de volta ao restaurar):
âncora `#lazer` quebrada · quadrado no slot `.g-wide` · lista de POIs removida ·
link do Maps trocado por busca por nome · `rel="noopener"` removido · 7º chip ·
stat de preço importado da landing irmã · hex novo no CSS · galeria com 8 fotos ·
fundo da banda apontando para arquivo exclusivo · texto do "Sobre" reescrito ·
`scroll-padding-top` removido · fundo do Lazer virando `background-image` ·
`<source webp>` removido de uma foto · seção de depoimentos criada · `.fnav`
antes dos logos.

**Prova de não-regressão de tracking (DoD #4), por comparação byte a byte com
`git show HEAD:...`:**

| Bloco | Idêntico? |
|---|---|
| `<script>` do Pixel base (511 bytes) | **sim** |
| `<script>` de tracking do `<head>` (6.359 bytes) | **sim** |
| `<script>` de captação/envio (8.243 bytes) | **sim** |
| `<noscript>` do Pixel | **sim** |
| `<form id="leadForm">` | **sim** |
| `<form id="leadFormMobile">` | **sim** |
| `<form id="leadFormSaber">` | **sim** |

O JS novo (nav + lightbox) vive num **4º bloco `<script>` separado** exatamente
para que o diff dos 3 anteriores fique em zero linha. Console do navegador
comparado lado a lado (HEAD servido na porta 8098, versão nova na 8099):
**2 mensagens antes, 2 depois, a mesma mensagem única** (aviso de
*traffic permission* do Pixel) — zero erro JS novo.

**Validação visual (Playwright/chromium, 1440×900 e 390×844).** Medido, não
presumido:

- **Âncoras (AC1):** as 5 param com o topo da seção em **y=72** nos dois
  breakpoints, com o header medindo 67px (desktop) e 58px (mobile) — a seção
  chega **abaixo** do header, nunca escondida atrás dele.
- **Hero (AC2):** o header transparente não toca `.hero-brand` (y≈350 no
  desktop, rodapé da foto no mobile) nem `.hero-form` (card começa em y≈180).
- **Overflow horizontal:** `scrollWidth == clientWidth` nos dois breakpoints
  (1440/1440 e 390/390).
- **Galeria:** as 9 carregaram (`naturalWidth > 0`) e as 9 foram servidas como
  `.webp` — o `<picture>` está negociando, e é isso que faz o `currentSrc` do
  lightbox ampliar o webp em vez do jpg.
- **Lightbox:** abre no clique e fecha com `Escape` nos dois breakpoints.
- **Menu mobile:** abre no hambúrguer e **fecha ao clicar no link**.
- **Sem `assets/*` em 404**: a única requisição falha é o proxy
  `yarden.vercel.app/api/track`, bloqueado por CORS a partir de `localhost` —
  idêntico ao baseline.

**Dois defeitos encontrados na conferência visual e corrigidos** (nenhum dos
dois apareceria numa leitura do código):

1. **Célula vazia na galeria no mobile.** Copiar o `.g-wide{grid-column:span 2}`
   da landing irmã para o grid de 2 colunas deixa um buraco de **170×310** no
   canto superior direito: o auto-placement não encaixa a 2ª foto ao lado da 1ª
   (que ocupa 2 linhas) e a empurra para a linha seguinte. Medido célula por
   célula. Corrigido com `.g-wide{grid-column:span 1}` no breakpoint de 979.98px
   — 1 alta (2 células) + 8 normais = 10 = 5 linhas × 2, sem sobra. **A landing
   do Vind Residence carrega esse buraco em produção** (a 1ª figura dela também
   é `.g-tall`); é mais um ponto em que "seguir o padrão do Vind" era a resposta
   errada. Ficou com teste próprio.
2. **Parágrafo do "Sobre a Trifold" por baixo do WhatsApp flutuante.** A linha
   de texto ia até x=1360 e o botão fixo começa em x=1360. Corrigido com
   `max-width:62ch`; remedido: texto termina em **x=1208**, botão em x=1360.

### Completion Notes List

**Curadoria da Galeria (AC5/D3) — os 9 arquivos escolhidos e por quê.**
A composição (1 Fachada + 3 Rooftop + 3 Térreo + 2 Decorado, zero Humanizadas)
é a travada pelo stakeholder; a escolha dos arquivos era delegada. Critérios
usados, em ordem: (a) proporção compatível com o slot, (b) **paleta quente**,
para não brigar com o `:root` do Yarden (creme/marrom/tan), (c) não repetir o
que a página já mostra, (d) preferência por ambiente que corresponde a um chip
da AC4.

| Slot | Arquivo | Nome no `assets/` | Proporção | Por quê |
|---|---|---|---|---|
| `.g-tall` | `Rooftop/Terraço Yarden.jpg` | `galeria-01` | `[Q]` 4000×4000 | é o slot que **sempre** recorta (nenhum render do book é retrato) e a quadrada é a que perde menos; a marca d'água fica na base e sobrevive ao recorte |
| `.g-wide` | `Fachada/Fachada_2 Yarden.jpg` | `galeria-02` | `[L]` | a foto de maior peso comercial merece o slot largo; escolhida sobre a `Fachada_3` porque enquadra o prédio inteiro e a entrada centralizada, em vez de cortá-lo à esquerda |
| normal | `Rooftop/Sport bar Yarden.jpg` | `galeria-03` | `[L]` | corresponde ao **chip 1** ("Sports bar (rooftop)") |
| normal | `Rooftop/Pilates Yarden.jpg` | `galeria-04` | `[L]` | o ambiente de bem-estar mais próximo do **chip 2** ("Yoga"); madeira clara, casa com a paleta |
| `.g-wide` | `Térreo/Piscina privativa gourmet Yarden.jpg` | `galeria-05` | `[L]` | corresponde ao **chip 5**, literal ("Espaço gourmet com piscina privativa"); cena noturna, o contraponto às fotos claras |
| normal | `Térreo/Salão de Festas Yarden.jpg` | `galeria-06` | `[L]` | amenidade de alto valor percebido e a foto mais **clara** das 9 — equilibra o conjunto |
| normal | `Térreo/Fireplace Yarden.jpg` | `galeria-07` | `[L]` | *fire place* é item literal da Ficha; céu de fim de tarde, dá variação de horário à galeria |
| normal | `Decorado 1/Decorado 1_sala estar+cozinha Yarden.jpg` | `galeria-08` | `[L]` | mostra o living com cozinha integrada — o que a Ficha descreve como sala de estar + cozinha |
| normal | `Decorado 1/Decorado 1_suite Yarden.jpg` | `galeria-09` | `[L]` | a suíte, que sustenta o stat "2 suítes"; **ambas do `Decorado 1`** de propósito: `Decorado 1` e `Decorado 2` têm acabamentos diferentes, e misturar os dois leria como dois apartamentos distintos |

Descartadas com motivo explícito, não por acaso:
- `Rooftop/Lounge` e `Térreo/Piscina` — orientação de não-redundância do @po: o
  Hero já usa a piscina do rooftop e a seção "natureza" já usa um lounge gourmet.
- `Térreo/Lazer` — **reservada** ao fundo da AC4.
- `Rooftop/Coworking` — a única do book com paleta **azul/turquesa** (paredes,
  cadeiras); ao lado das outras 8 destoava do `:root` quente do Yarden.
- `Térreo/Espaço Kids` e `Rooftop/Sala de Reuniões` — quadradas, e o único slot
  que aproveita quadrada já estava ocupado pela `Terraço`. Em slot normal
  (1,61:1) uma quadrada perde ~38% da altura; com 7 paisagens disponíveis, não
  havia motivo para pagar esse recorte.
- As 4 `Humanizadas` — proibição explícita da AC5 (são plantas baixas).

**Fundo da banda CTA (AC7/D3.1) — `galeria-05`, escolhida por medição.**
A delegação pedia "critério de contraste"; em vez de decidir a olho, medi a
luminância das 9 com `PIL.ImageStat`, na imagem inteira e na faixa central
(onde o texto cai):

| | média | desvio | faixa central |
|---|---|---|---|
| **`galeria-05`** (piscina privativa gourmet) | **106,6** | **49,0** | **111,3** |
| `galeria-02` (fachada) | 127,0 | 64,7 | 123,6 |
| `galeria-07` (fire place) | 127,2 | 58,8 | 132,6 |
| `galeria-01` (terraço) | 140,1 | 69,0 | 145,1 |
| as outras 5 | 155–165 | 43–52 | 147–174 |

`galeria-05` é ao mesmo tempo a **mais escura** e a mais **uniforme** entre as
escuras (desvio 49,0 contra 64,7 da fachada e 58,8 do fire place) — as duas
propriedades que o texto branco sobreposto precisa. Confirmado no screenshot: o
H2 e o parágrafo em branco leem limpo sobre o overlay.

**Processamento das imagens.** `sips` do macOS **não** exporta WebP (`sips -s
format webp` falha), e não há `cwebp`/ImageMagick na máquina — usei
`PIL` 11.3.0 (tem WebP), com busca decrescente de qualidade até caber no
orçamento em vez de chutar um número fixo por imagem. Larguras: 1200px para as
paisagens (o slot mais largo renderiza a 693px — sobra folga para retina) e
900px para a quadrada (slot de 340×454). Resultado: **maior jpg 197KB, maior
webp 140KB**, ambos abaixo do teto de 330KB da AC5, e o webp é o mais leve do
par em todas as 10 (há teste). Nota: a `lazer-terreo` a 1400px só caberia no
alvo de webp com qualidade 56 (visivelmente borrada, é uma aérea densa de
folhagem) — baixei para 1200px, onde cabe com q72.

**Onde a story mandou NÃO seguir a landing irmã, e por quê importou.** Três
pontos, todos previstos pela AC15 (e um quarto que descobri sozinho):
1. galeria por `<img src="…webp">` avulso → deixaria os 9 `.jpg` órfãos;
2. fundo de seção por `background-image` → deixaria `lazer-terreo.{jpg,webp}`
   órfão (por isso a foto do Lazer vai por `<picture>` e é posicionada com
   `object-fit:cover` numa caixa absoluta);
3. `trifold-fachada` servida só em `.webp` → deixaria o `.jpg` copiado órfão;
4. **(não previsto na story)** `.g-wide{grid-column:span 2}` no grid mobile de
   2 colunas → célula vazia, ver Debug Log.
O `background-image` da banda CTA é a **única** exceção legítima, exatamente
como a AC7 previu: ele aponta para `galeria-05.jpg`, que a Galeria já referencia
por atributo — então não cria arquivo nenhum. O teste novo verifica justamente
essa condição (a URL do CSS tem de casar `galeria-\d\d` **e** existir como
`src`/`srcset` na marcação).

**Copy: nada inventado sobre o empreendimento (Artigo IV, DoD #3).** Rastreio de
cada texto novo:
- os 6 números e as 6 legendas: citação da Ficha Técnica, na ordem da AC3;
- os 6 chips: itens literais da Ficha, texto exato da AC4;
- H2 do Lazer "Lazer completo em dois níveis": é a **legenda do stat 5 da
  própria AC3**, aprovada pelo stakeholder — não redação minha;
- parágrafo do Lazer: paráfrase que a AC4 autoriza explicitamente, com "do
  térreo ao rooftop" (os dois níveis da Ficha) no lugar das amenidades da
  landing irmã; há teste que reprova "piscina aquecida", "spots bar" e
  "coworking", que são amenidades do **outro** prédio;
- Galeria: kicker/H2/parágrafo descrevem **o que a seção mostra** ("Renders
  oficiais das áreas comuns — térreo e rooftop — e do apartamento decorado") +
  a instrução funcional do lightbox. Sem adjetivação de marketing;
- banda CTA: "Deixe seu contato e receba informações exclusivas" é **a linha
  literal já publicada** na seção "Quer saber mais?" (86-12, transcrita do
  mockup);
- "Sobre a Trifold": verbatim, palavra por palavra (teste compara a string
  inteira, normalizada, com igualdade estrita);
- Localização: endereço e URL do Maps literais da Ficha; os 5 pontos são os
  mesmos que já estavam no `alt` do mapa (que **continua** listando-os).
- **Nenhum stat de preço** e nenhum dos candidatos descartados (área do terreno,
  área construída, a segunda metragem privativa) — três testes dedicados.

**AC11 conferida por inventário, não por confiança.** Extraí todos os literais
hex do `<style>` (sem comentários) e comparei com os 11 do `:root`: os 6
restantes (`#fff`, `#8c8c8c`, `#a9c6cf`, `#eeeeee`, `#ffd9d9`, `#25d366`) já
existiam antes desta story. **Zero hex novo, zero fonte nova** (a única
`family=` do arquivo continua sendo `Montserrat:wght@300;400;500;600;700`),
**zero logo novo** (só os 2 SVGs de sempre). Os três viraram teste.

**Decisões de implementação que a story não fixava:**
- `[AUTO-DECISION]` `html{scroll-padding-top:72px}` em vez de
  `scroll-margin-top` seção por seção → uma declaração cobre as 6 âncoras e as
  futuras; a alternativa exigiria lembrar de repetir a regra a cada seção nova.
- `[AUTO-DECISION]` JS novo em **4º bloco `<script>`** em vez de crescer o
  script de captação → o DoD #4 pede que o diff daquele bloco fique em zero
  linha, e um bloco separado torna isso verificável por comparação de bytes.
- `[AUTO-DECISION]` `.lazer-txt .texto-secao{color:var(--marrom-escuro)}` → o
  `--cinza-texto` padrão dos parágrafos sobre o fundo `--tan` são dois tons
  médios, com contraste ruim; a página já usa marrom sobre creme na seção "Quer
  saber mais?".
- `[AUTO-DECISION]` nomes `galeria-01`…`galeria-09` literais (sem sufixo
  descritivo) → é a convenção que a AC5 escreve textualmente.
- `[AUTO-DECISION]` teste em arquivo **novo** em vez de crescer os dois
  existentes → a story proíbe modificar `.ts` de teste; um arquivo novo entrega
  a cobertura sem tocar em nenhum deles (e o `.vercelignore` já exclui
  `*.test.ts`, então não vai para o deploy).
- `[AUTO-DECISION]` `.fnav` com `flex:1 0 100%` (linha própria no rodapé) → numa
  linha só com os 2 logos e o parágrafo de direitos, os 5 links estouravam a
  largura. Ordem no DOM e visual seguem "entre os logos e os direitos", como a
  AC9 pede; nada foi removido (há teste).

**Fora de escopo, respeitado:** nenhum arquivo fora de `landing-pages/yarden/`
(a única exceção permitida — a cópia de `trifold-fachada.{jpg,webp}` — é para
**dentro** de `assets/`); zero mudança em `packages/web/`, em
`trifold-design-system/` ou nos proxies `api/*`; nenhuma estrutura de
Depoimentos, nem placeholder, nem comentário (teste dedicado, com marcadores
específicos — a versão ingênua, que procurava só "depo", casava com "depois"
dentro dos comentários de código).

### File List

**Modificados**
- `landing-pages/yarden/index.html` — 6 seções novas + redesenho da
  Localização + `.fnav` no rodapé + lightbox + 4º bloco `<script>` (nav e
  lightbox). Os 3 blocos `<script>` e os 3 `<form>` anteriores: byte a byte
  idênticos ao `HEAD`. **Ajuste 0.5 (2026-09-05), só CSS, sem tocar no HTML:**
  respiro entre `.split--natureza` e `.lazer`, contenção lateral da `.lazer` no
  desktop, `min()` nos percentuais das duas `.split` (para de deformar acima de
  `--max`) e alinhamento à direita da coluna INTEIRA da Localização, com o
  ponto dourado dos POIs espelhado e o reset de mobile completado.
- `landing-pages/yarden/README.md` — contagem de assets 13 → 35, tabela de
  origem das 16 imagens, o novo arquivo de teste na árvore e na tabela de
  cobertura, e 3 itens novos em "Alterar o conteúdo depois" (curadoria travada,
  proporção por slot da galeria, âncoras do nav).

**Criados — código**
- `landing-pages/yarden/secoes-institucionais.test.ts` — 39 testes das 6
  seções novas (conteúdo travado, âncoras, proporção por slot, proibições).

**Criados — assets** (20 arquivos gerados do book de renders + 2 copiados)
| Arquivo | Origem | Dimensão | jpg | webp |
|---|---|---|---|---|
| `galeria-01.{jpg,webp}` | `Rooftop/Terraço Yarden.jpg` | 900×900 | 122KB | 75KB |
| `galeria-02.{jpg,webp}` | `Fachada/Fachada_2 Yarden.jpg` | 1200×545 | 182KB | 135KB |
| `galeria-03.{jpg,webp}` | `Rooftop/Sport bar Yarden.jpg` | 1200×545 | 86KB | 49KB |
| `galeria-04.{jpg,webp}` | `Rooftop/Pilates Yarden.jpg` | 1200×545 | 77KB | 38KB |
| `galeria-05.{jpg,webp}` | `Térreo/Piscina privativa gourmet Yarden.jpg` | 1200×545 | 156KB | 127KB |
| `galeria-06.{jpg,webp}` | `Térreo/Salão de Festas Yarden.jpg` | 1200×545 | 100KB | 58KB |
| `galeria-07.{jpg,webp}` | `Térreo/Fireplace Yarden.jpg` | 1200×545 | 151KB | 114KB |
| `galeria-08.{jpg,webp}` | `Decorado 1/…sala estar+cozinha Yarden.jpg` | 1200×545 | 93KB | 55KB |
| `galeria-09.{jpg,webp}` | `Decorado 1/Decorado 1_suite Yarden.jpg` | 1200×545 | 65KB | 28KB |
| `lazer-terreo.{jpg,webp}` | `Térreo/Lazer Yarden.jpg` | 1200×545 | 197KB | 140KB |
| `trifold-fachada.{jpg,webp}` | cópia de `vind-residence/assets/` (AC8) | 1000×750 | 111KB | 38KB |

Todos ≤ 330KB (maior: 197KB), todos referenciados por `<picture>` com as duas
URLs em atributo, e o `webp` mais leve que o `jpg` em todos os 11 pares.
`assets/` passou de **13 para 35 arquivos** — zero órfão, zero referência
inexistente (`tracking-browser.test.ts` verde).

**Não modificados, de propósito**
- `landing-pages/yarden/tracking-browser.test.ts` e
  `landing-pages/yarden/api-proxy.test.ts` — a story exige que nenhum `.ts` de
  teste existente seja alterado; os dois passam sem edição.
- `landing-pages/yarden/api/lead.js` e `api/track.js` — esta story não toca
  infraestrutura.

## QA Results

### Re-gate (leva 0.5, ajuste visual): ✅ **PASS** — @qa (Quinn), 2026-09-05

**Gate file:** `docs/qa/gates/86-13-landing-yarden-secoes-institucionais.yml`
(seção `re_review_0_5`)
**Escopo revisado:** commit `ac25b3bc` isolado (base `6a7cd470`), **não pushado**
**Nenhum bloqueador.** 2 achados `low` + 1 `info`, todos não-bloqueantes.

> **Método:** nenhum número do @dev foi aceito por relato. Refiz cada medição com
> harness próprio (Playwright/chromium, `getBoundingClientRect` normalizado por
> `scrollX/scrollY`, `getComputedStyle` inclusive de `::before`), em **11 larguras**
> (390, 768, 979, 980, 1024, 1280, 1440, 1728, 1920, 2560, 3440 — 3 a mais do que o
> @dev usou), com **contraprova de determinismo** do próprio harness antes de
> confiar em qualquer diferença.

---

#### 1. Prova por bytes — o que mudou foi só o `<style>`

Refeita por mim, com extrator próprio (regex `<style…>…</style>`, comparação do
resto byte a byte):

| Medida | `6a7cd470` (antes) | `ac25b3bc` (depois) |
|---|---|---|
| Arquivo inteiro | 74.874 B | 79.130 B |
| Blocos `<style>` | 1 (25.868 B) | 1 (30.124 B) |
| **Tudo fora do `<style>`** | **49.006 B** | **49.006 B** |
| **sha256 do resto** | `7a84281e…31b08a9` | `7a84281e…31b08a9` |
| `diff` do resto | — | **vazio** |

Os 4 blocos `<script>` (528 / 6.448 / 8.393 / 3.093 B) e os 3 `<form>` têm
**sha256 individual idêntico** antes e depois. ⇒ AC10 e AC14 sem regressão possível,
por construção.

⚠️ **Discrepância de narrativa (não de substância):** o @dev alegou "37.600 bytes
fora do CSS". Meu número é **49.006 B**. Não consegui reproduzir 37.600 por nenhum
recorte razoável (com/sem placeholder, com/sem `<script>`). A alegação
*substantiva* — "idêntico byte a byte" — **está provada e confere**; só o número
citado não bate. Registrado como `86.13-QA-006` (`low`, docs).

#### 2. Respiro entre "Onde a natureza" e "Lazer" — medido, não observado

Distância vertical entre o **rodapé da foto do lounge** e o **topo da faixa bege**
da Lazer, em px:

| Largura | Antes | Depois |
|---|---|---|
| 390 | 40 | **40** (inalterado) |
| 768 | 52 | **52** (inalterado) |
| 979 | 52 | **52** (inalterado) |
| 980 | 31,38 | **96,58** |
| 981 | 31,26 | **96,54** |
| 1440 | **0** | **92,16** |
| 1920 | **0** | **94,00** |
| 2560 | 14,45 | **94,00** |

O bug era real e eu o reproduzi: a **0 px** de folga a 1440 e 1920 (foto e faixa
bege encostando no mesmo pixel). O screenshot de 2560 do estado anterior mostra
algo pior do que o relatado — a **última linha do parágrafo da natureza
transbordava para dentro da faixa bege** (`…leveza, presença e sofisticação no dia
a dia.` renderizada sobre fundo `--tan`). Depois do fix, nenhuma sobreposição em
nenhuma das 11 larguras.

#### 3. Fotos coladas na borda da viewport — medido

Distância da borda da viewport até a foto (px):

| Largura | `.lazer-img` direita | `.split--natureza` img direita | `.split--invista` img esquerda |
|---|---|---|---|
| 390 | 0 → **0** | 18 → 18 | 18 → 18 |
| 768 | 0 → **0** | 20 → 20 | 20 → 20 |
| 979 | 0 → **0** | 20 → 20 | 20 → 20 |
| 1440 | 0 → **40** | 38,30 → **40** | 34,41 → **40** |
| 1920 | 0 → **276** | 279,06 → **276** | 273,88 → 273,88 |
| 2560 | 0 → **596** | 616,09 → **596** | 609,17 → **596** |

A alegação de que "as três fotos passam a terminar na mesma linha vertical" é
**verdadeira a 1440 e a 2560** (40/40/40 e 596/596/596). A **1920 sobra uma
assimetria de 2,12 px** entre a direita da natureza (276) e a esquerda da invista
(273,88), porque os percentuais de origem são diferentes (`2,66%` vs `2,39%`) e o
`clamp` satura em pontos distintos. Imperceptível; registrado como
`86.13-QA-005` (`low`, code).

O `0 px` remanescente a 390/768/979 é o full-bleed de mobile — comportamento
esperado e explicitamente fora do escopo do pedido.

#### 4. Mobile intocado — provado por pixel, não por relato

Três provas independentes, todas minhas:

1. **Geometria:** deep-diff de **199 campos medidos** por largura (rects de 8
   elementos, paddings computados, `text-align` de 7 seletores, caixas dos 6
   blocos da Localização, `::before` do `li`, `scrollWidth/clientWidth`):
   **0 campos diferentes** a 390, 768 **e 979** (o último pixel do breakpoint —
   largura que o @dev não conferiu).
2. **Inventário de seções:** 14 seções de topo medidas, **0 com geometria
   alterada** a 390/768/979; `document.scrollHeight` idêntico (6891 / 7634 / 8332).
3. **Pixel:** screenshots das duas regiões afetadas, harness determinístico →
   **`px_diferentes = 0` (0,000%)** em 390/768/979, nas duas regiões (6/6).

> **Nota de método — falso positivo que eu mesmo produzi e derrubei.** A primeira
> rodada de screenshots acusou **66% de pixels diferentes no mobile**, o que
> contradizia a geometria. Antes de reportar, rodei a contraprova óbvia:
> *before vs. before*. Deu **66,95% de diferença também** — ou seja, o defeito era
> do meu harness, não do código. Causa: `html{scroll-behavior:smooth}` faz o
> `window.scrollTo` aterrissar em `scrollY` diferente a cada execução (1740 / 1714
> / 1738). Com `scroll-behavior:auto` forçado e `img.decode()` aguardado, a
> contraprova *before vs. before* foi a **0,000%** e só então os 0,000% do
> mobile passaram a significar alguma coisa.

#### 5. Alinhamento da Localização — `getComputedStyle`, desktop e mobile

| Elemento | ≤979px (antes → depois) | ≥980px (antes → depois) |
|---|---|---|
| `.kicker` | left → **left** | `start` → **right** |
| `.titulo-secao` | left → **left** | right → right |
| `.texto-secao` | left → **left** | right → right |
| `.loc-endereco` | left → **left** | `start` → **right** |
| `.loc-maps-linha` | left → **left** | `start` → **right** |
| `.loc-pontos` | left → **left** | left → **right** |
| `.loc-pontos li` | left → **left** | left → **right** |

Confirmado também pela caixa real do `<a>` do Maps a 1440: antes `L=815`
(encostado à esquerda), depois `R=1240,28` — coincide com a borda direita da
coluna, igual ao H2 e ao parágrafo. Os 6 blocos da coluna terminam **todos** em
`x=1240,28`.

**Ponto dourado:** espelhado, não removido. `::before` vai de `left:0` para
`right:0` e o `li` de `padding:9px 0 9px 20px` para `9px 20px 9px 0`, só no
desktop. Cor inalterada (`rgb(253,217,150)` = `--dourado`) e **adjacente ao
texto** — o texto termina 20 px antes da borda do `li` e o ponto (8 px) ocupa
essa faixa: 12 px de respiro, não órfão. Conferido também a olho no screenshot
("Catedral •", "Bosque II •"). No mobile, `left:0 / padding-left:20px` — idêntico
ao baseline, como o item 4 provou por pixel.

#### 6. Costura do breakpoint 979/980/981

Sem salto anômalo e **sem sobreposição**: testei colisão de retângulos entre
`.lazer-txt` × `.lazer-img` e entre a foto da natureza × a seção `.lazer` em
979/980/981/1440/1920/2560 → **`sobrepõe=false` em todos**. A variação de folga
979→980 (52 → 96,58) é a troca de modo do próprio breakpoint (empilhado →
grid `1fr 1fr`), que já existia antes (52 → 31,38); 980→981 difere em **0,04 px**.

#### 7. Não-regressão fora das duas seções

Inventário de 14 seções de topo em 11 larguras:

- Nenhuma seção **acima** da natureza (header, hero, `#empreendimento`) mudou em
  nenhuma largura.
- Das 10 seções abaixo, **9 só se deslocaram verticalmente** (`left` e `width`
  idênticos). A única com `left`/`width` alterados é a `.lazer` — que é o alvo do
  fix (a ≥1920 passa de `L=0,W=viewport` para `L=(vw−1464)/2, W=1464`).
- **Zero overflow horizontal** (`scrollWidth == clientWidth`) nas 11 larguras,
  inclusive 3440.
- **Console: 0 erro** antes e depois, nas 11 larguras.

#### 8. Sobre o "a 1464px nada muda"

Verifiquei o limiar em 1200/1400/1464/1500/1600/1800. O `min()` de fato **não
altera nada perceptível** em `--max`: a 1464 os valores saem 87,09→87 / 202,03→202
(diferença sub-pixel). Mas o **piso de 40 px é uma mudança de comportamento em
todo o desktop**, não só acima de 1464: a 1200 o `padding-right` da natureza vai
de 31,91 → 40 e o `padding-left` da invista de 28,67 → 40. Isso está descrito no
corpo da mensagem de commit ("piso de 40px… que estavam a 38px e 34px da borda a
1440"), então **não é omissão** — mas o comentário no CSS, lido isolado, sugere
neutralidade abaixo de `--max` que não existe. Registrado como `86.13-QA-007`
(`info`, docs).

#### 9. Suíte, type-check, lint — rodados por mim

| Comando | Resultado |
|---|---|
| `npx vitest run landing-pages/yarden` | **89/89** (3 arquivos) |
| `npx vitest run` (suíte inteira) | 4569 passed / **71 failed** / 6 expected-fail, em **3 arquivos** |
| `npx turbo type-check --force` | **12 erros**, 7/8 tasks OK, 0 cache |
| `npx turbo lint --force` | **0 erros / 30 avisos**, 8/8 tasks, 0 cache |

**Prova de que as 71 falhas e os 12 erros são pré-existentes** — não por leitura,
por diff: `git diff --quiet ac25b3bc^ ac25b3bc -- packages/` **retorna 0**, ou
seja, `packages/` é byte a byte idêntico entre a base e esta leva. Os 3 arquivos
que falham vivem todos em `packages/web/` e os últimos commits que os tocaram são
de 2026-08-27, 2026-08-29 e 2026-09-02. As falhas são de **resolução de módulo**
(`Cannot find package '@trifold/ai/src/flows/loop-breaker'`), não de asserção.

#### 10. Higiene

- `git status --short` **vazio** ao fim da revisão; `sha256` do `index.html` no
  disco idêntico ao do commit — **eu não toquei em nenhum arquivo de código**.
- **Nenhum push aconteceu:** `origin/fix/86-12-yarden-lancamento-mapa` aponta para
  `6a7cd470` (a base); `ac25b3bc` só existe local. 14 commits aguardando @devops.

#### Veredito

**PASS.** Os três diagnósticos de causa raiz do @dev conferem com o que eu medi, e
os dois problemas que o usuário reportou estão **corrigidos de fato** (não apenas
editados): folga de 0 → 92–96 px, fotos de 0 → 40/276/596 px da borda, e a coluna
inteira da Localização à direita com o ponto dourado espelhado. O mobile está
**pixel-idêntico** ao baseline em 390/768/979. Nenhum AC anterior regrediu.

**Status:** mantido em `Ready for Review` — não promovo para `Done` (T12/T13 de
infraestrutura da 86-12 seguem pendentes com @devops e
`https://trifold.eng.br/yarden/` continua offline).
**Próximo agente:** `@devops *push`.

---

### Gate: ✅ **PASS** — @qa (Quinn), 2026-09-04

**Gate file:** `docs/qa/gates/86-13-landing-yarden-secoes-institucionais.yml`
**Escopo revisado:** `06e9ecfa..a1a47d56` (3 commits, nenhum pushado)
**Nenhum bloqueador.** 3 achados `low` + 1 `info`, todos não-bloqueantes.

> **Método:** nada foi aceito por relato do @dev. Cada afirmação do Change Log 0.4
> que eu podia medir, eu medi de novo — por hash, por mutação, por medição
> geométrica no navegador e por leitura de pixel. Onde meu número bateu com o do
> @dev, digo que bateu; onde eu não repeti o método dele, digo isso também.

---

#### 1. AC15 — os dois testes existentes estão intocados (verificação bloqueante)

Não por `git diff` só, mas por identidade de blob:

| Arquivo | blob em `06e9ecfa` | blob em `HEAD` | diff |
|---|---|---|---|
| `tracking-browser.test.ts` | `d89c4fc5…` | `d89c4fc5…` | **0 linhas** |
| `api-proxy.test.ts` | `8d200d24…` | `8d200d24…` | **0 linhas** |

`git diff --name-status 06e9ecfa..HEAD -- 'landing-pages/**/*.test.ts'` devolve
**um único** arquivo, e é `A` (adicionado): `secoes-institucionais.test.ts`.
Baseline confirmado por execução: **23/23**. A estratégia de arquivo separado
funcionou como a AC15 exigia.

**Prova de que os dois guardas da AC15 estão vivos** — mutações que eu mesmo apliquei
e depois reverti (árvore restaurada a 0 linhas de diff em todas):

| Mutação | Resultado |
|---|---|
| `srcset` → `assets/galeria-99.webp` (inexistente) | **3 testes falharam**, incluindo "não referencia asset que não existe no disco" |
| criar `assets/sobra-curadoria.jpg` sem referência | **tracking-browser 22/23** — pegou o órfão pelo nome |
| chip `Yoga` → `Pilates` | 1 falhou |
| fundo da banda → `assets/banda-fundo.jpg` (exclusivo) | 2 falharam |
| remover `html{scroll-padding-top}` | 1 falhou |

#### 2. Integridade de assets — extrator independente, não o do teste

Escrevi meu próprio extrator (mais amplo que o do teste: inclui `poster` e
`data-src`, e cruza também os `url()` do CSS):

- **35** arquivos no disco · **35** referenciados por atributo HTML
- **órfãos: `[]`** · **inexistentes: `[]`**
- único `url()` do CSS: `galeria-05.jpg` — e ele **está** referenciado por
  atributo na Galeria, então não cria arquivo próprio (era exatamente a armadilha da AC7/AC15)
- nenhum asset com `vind` no nome
- maior arquivo novo: **196KB** (`lazer-terreo.jpg`), teto 330KB
- as **11 origens** alegadas no File List existem no Google Drive com o nome exato

#### 3. Tracking intacto — por sha256 dos blocos, medido por mim

Extraí `<script>`, `<noscript>` e `<form>` de `06e9ecfa` e de `HEAD` e comparei hash:

| Bloco | sha (antes) | sha (depois) |
|---|---|---|
| script Pixel (528 B) | `1718484caaba2d4c` | `1718484caaba2d4c` |
| script tracking (6376 B) | `fae3adae3c21483b` | `fae3adae3c21483b` |
| script envio (8260 B) | `91c53f52fed102b3` | `91c53f52fed102b3` |
| `<noscript>` ×2 | `25d18d70…` / `bd4a7032…` | idênticos |
| `leadForm` / `leadFormMobile` / `leadFormSaber` | `aa7f5dab` / `ce1ab784` / `28e38b3b` | idênticos |

*(Os números do @dev — 511/6.359/8.243 — são os mesmos menos os 17 bytes de
`<script></script>`. Convergem.)*

O 4º bloco `<script>` (3056 B, novo) foi lido linha a linha: **sem** `fbq`, **sem**
`TrifoldTracking`, **sem** `leadEndpoint`, **sem** `leadForm`.

Dataset do Pixel `1337310707164669`: **3 ocorrências antes, 3 depois** — comentário
do `<head>`, `window.TRIFOLD_PIXEL_ID` e a URL do `<noscript>`.

#### 4. Os 2 bugs — corrigidos de fato, provado por contraprova

Não bastava ver que estavam bons agora; reverti cada fix e medi o bug reaparecer:

| Bug | Com o fix | **Sem o fix** (contraprova) |
|---|---|---|
| Célula vazia no grid mobile | 375px → 2col×5lin, **buracos: nenhum** | removido `.g-wide{grid-column:span 1}` → **buracos: linha1/col2, linha2/col2** |
| Texto do "Sobre" sob o WhatsApp | 1440px → `<p>` 528px, `right=1208` < `wa.left=1360`, **colide=false** | removido `max-width:62ch` → `<p>` **739px**, `right=1420` > `1360`, **colide=true** |

#### 5. Curadoria D3/D3.1 — composição conferida foto a foto

Abri as 9 imagens e confirmei que o conteúdo bate com cada `alt`:

| Slot | Arquivo | Categoria | Proporção |
|---|---|---|---|
| `.g-tall` | `galeria-01` Terraço | Rooftop | 900×900 **[Q]** ✓ |
| `.g-wide` | `galeria-02` Fachada_2 | **Fachada** | 1200×545 **[L]** ✓ |
| — | `galeria-03` Sport bar | Rooftop | [L] |
| — | `galeria-04` Pilates | Rooftop | [L] |
| `.g-wide` | `galeria-05` Piscina privativa gourmet | Térreo | 1200×545 **[L]** ✓ |
| — | `galeria-06` Salão de Festas | Térreo | [L] |
| — | `galeria-07` Fireplace | Térreo | [L] |
| — | `galeria-08` Decorado 1 sala+cozinha | Decorado | [L] |
| — | `galeria-09` Decorado 1 suíte | Decorado | [L] |

**1 Fachada + 3 Rooftop + 3 Térreo + 2 Decorado = 9.** Zero Humanizadas — as 4 são
`.png` no Drive e **nenhum `.png` foi gerado**. Nenhuma `[Q]` em slot largo. Nenhum
`Rooftop/Lounge` nem `Térreo/Piscina`, como a AC5 orientava.

**Contraste da banda (D3.1) — medi eu mesmo, com luminância relativa WCAG:**

| Foto | Luminância média | | |
|---|---|---|---|
| **`galeria-05`** | **106,6** | ← a mais escura das 9 | |
| `galeria-02` | 127,0 | | |
| `galeria-06` | 165,4 | ← a mais clara | |

Com o overlay `rgba(0,0,0,.55)→.68` que a `.banda` aplica, o contraste do texto
branco fica em **13,30:1 a 15,96:1**. E o **pixel mais claro da imagem inteira**,
sob o overlay mais fraco, ainda dá **5,53:1** — acima do AA (4,5:1). A escolha
está correta e o número 107 do @dev confere.

#### 6. Chips do Lazer — os 6 exatos

`Sports bar (rooftop)` · `Yoga` · `Brinquedoteca` · `Petcare` ·
`Espaço gourmet com piscina privativa` · `E muito mais` — conferidos no DOM e em
screenshot a 1440px. Nenhum sétimo.

#### 7. Localização redesenhada

Endereço em destaque (`Rua Carlos Meneghetti, 168 — Gleba Itororó, Maringá`), link
`https://maps.app.goo.gl/RFibC7xZ7KZx6cwQA` com `target="_blank" rel="noopener"`,
e os 5 POIs como `<li>` **visíveis** em 2 colunas (Catedral · Parque do Ingá ·
Av. JK | Bosque II · Av. Itororó) — confirmado em screenshot, não só no DOM. O `alt`
do mapa continua listando os marcos. Nenhum `<iframe>` na página (a única ocorrência
da palavra é um comentário explicando o veto).

#### 8. Nav fixo — medido em 3 breakpoints

| Viewport | Altura do header | Folga do 1º elemento textual em cada uma das 5 âncoras |
|---|---|---|
| 1440px | 67,2px | 85,6 / 106,5 / 85,4 / 107,3 / 194,3px |
| 768px | 57,6px | 66,8 / 338,8 / 66,6 / 612,4 / 639,9px |
| 375px | 57,6px | 66,6 / 337,9 / 66,7 / 325,6 / 345,4px |

`scroll-padding-top:72px` > header em todos. **Nenhuma âncora esconde o topo da
seção.** Header transparente sobre o Hero, `rgb(141,120,97)` = `--marrom` ao passar
de 60px, e zero sobreposição de `.hero-brand`/`.hero-form`/`.hero-form--estatico`.

#### 9. Suíte, typecheck, lint

- `landing-pages/`: **103/103** (23 tracking-browser + 27 api-proxy Yarden + 39 novos + 14 Vind)
- `turbo lint --force`: **8/8 tasks, 0 errors**, 30 warnings pré-existentes
- `tsc --strict` sobre `secoes-institucionais.test.ts` **e** `tracking-browser.test.ts`: **0 erros**
- Runtime (Playwright): console **sem erro JS**; 0 imagens quebradas; 15 servidas em
  `.webp`; 0 sem `alt`; sem overflow horizontal em 320/375/768/1440; lightbox abre com
  `currentSrc` e fecha no `Escape`; menu mobile alterna `aria-expanded` e fecha ao clicar
  em link; foco visível (`outline 2px var(--dourado)`) com **Tab real**;
  `InitiateCheckout` dispara **1×** após 3 focos distintos.

**Sobre as 71 falhas em `packages/web`** (e os 12 erros de `type-check`): **não são
desta story, e provei em vez de presumir.** `git log $(git merge-base origin/main HEAD)..HEAD -- packages/`
é **vazio** — a branch inteira nunca tocou `packages/`. Os 4 arquivos envolvidos têm
blob idêntico entre `06e9ecfa` e `HEAD`. E a causa é o `node_modules` desta worktree
ser symlink para o da raiz, instalado para um `main` que está **18 commits à frente** —
daí `@trifold/ai/src/flows/loop-breaker` e os símbolos de `@trifold/shared` não
resolverem. Artefato de ambiente, o mesmo já visto em rodadas anteriores.

#### 10. Nenhum push

`git ls-remote origin fix/86-12-yarden-lancamento-mapa` → **`bd44d299`** (último commit
da 86-12). Os 3 commits da 86-13 **não saíram da máquina**. ✅

---

### Achados (nenhum bloqueante)

| ID | Sev | Achado | Encaminhamento |
|---|---|---|---|
| 86.13-QA-001 | low | Stat 5: número `2 subsolos + rooftop` com legenda `lazer completo em dois níveis`. Pela Ficha, os 2 subsolos são **garagem** — o lazer é térreo + rooftop. | **Não é defeito de implementação:** está literalmente conforme a AC3 travada pelo stakeholder (D1). Se quiser precisar, é decisão do @po/stakeholder, não do @dev. |
| 86.13-QA-002 | low | `.banda{background-attachment:fixed}` só volta a `scroll` abaixo de 560px; entre 561–979,98px (iPad) o `fixed` fica, e o iOS o ignora. | Cosmético, herdado do `.band` da landing irmã e autorizado pela AC7. Conferi a 768px em screenshot: legível, sem distorção. Dívida menor. |
| 86.13-QA-003 | low | File List não cita os 3 arquivos de `.claude/agent-memory/aios-dev/` alterados nos commits. | Sem impacto de produto; a DoD #5 (nada de código fora de `landing-pages/yarden/`) continua satisfeita. |
| 86.13-QA-004 | info | 71 falhas de vitest + 12 erros de type-check em `packages/web`. | Ambiental e pré-existente — causa provada acima. Não abrir defeito nesta story. |

### Traço AC → veredito

`AC1` ✅ · `AC2` ✅ · `AC3` ✅ · `AC4` ✅ · `AC5` ✅ · `AC6` ✅ · `AC7` ✅ · `AC8` ✅
`AC9` ✅ · `AC10` ✅ · `AC11` ✅ · `AC12` ✅ · `AC13` ✅ · `AC14` ✅ · **`AC15` ✅**

### Recomendação de status

`Ready for Review` → **`InReview`** (normalização de vocabulário do `story-lifecycle.md`).

⚠️ **NÃO promover para `Done`.** As tarefas T12/T13 de infraestrutura da 86-12 seguem
pendentes com @devops e `https://trifold.eng.br/yarden/` continua offline — mesma
lógica das rodadas anteriores do Epic 86. A qualidade do código está aprovada; o que
falta é deploy, e deploy não é gate de QA.

**Próximo passo:** `@devops *push` — nenhum bloqueador de qualidade.

— Quinn, guardião da qualidade 🛡️
