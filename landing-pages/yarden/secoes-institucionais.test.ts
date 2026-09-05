/**
 * Story 86-13 — as 6 seções institucionais do `index.html` do Yarden.
 *
 * Por que existe um segundo arquivo de teste em vez de crescer o
 * `tracking-browser.test.ts`: aquele arquivo é o contrato de TRACKING da 86-12
 * e a 86-13 tem ordem explícita de não modificá-lo (o extrator de assets dele
 * é dinâmico e já cobre as imagens novas de graça). O que falta guardar é
 * outra coisa — conteúdo travado por decisão do stakeholder.
 *
 * O que cada bloco aqui protege, e por que não dá para confiar em inspeção
 * visual:
 *
 * - **Âncoras do nav (AC1/AC9).** Um `href="#lazer"` para uma seção sem
 *   `id="lazer"` não quebra nada visível: o clique simplesmente não sai do
 *   lugar. É o modo de falha mais silencioso de uma landing de uma página só.
 * - **Números e chips (AC3/AC4).** São citação literal da Ficha Técnica, com a
 *   curadoria travada pelo stakeholder. Uma "melhoria" de copy num merge
 *   futuro publicaria dado de empreendimento errado — em especial um stat de
 *   preço, que a Ficha NÃO tem (D1.2) e que a landing irmã tem.
 * - **Proporção por slot da galeria (AC5).** 12 dos 35 renders do book são
 *   QUADRADOS (4000x4000). Um quadrado num slot `.g-wide` perde ~55% da
 *   altura no recorte e o ambiente fica irreconhecível. O teste confere a
 *   proporção lendo o cabeçalho do JPEG no disco, não o atributo do HTML —
 *   atributo errado é exatamente o que se quer pegar.
 * - **Localização (AC6).** O link do Maps é o oficial da Ficha; montar uma
 *   busca por nome, que é o reflexo natural, manda o visitante para outro
 *   lugar.
 * - **Fundo da banda (AC7/AC15).** `background-image` é invisível para o
 *   extrator de assets do outro teste. A regra é reaproveitar um arquivo já
 *   referenciado por atributo; se alguém trocar por um arquivo exclusivo, o
 *   outro teste reprova por órfão e este explica o porquê.
 *
 * O arquivo mora fora de `api/` e está coberto pelo `*.test.ts` do
 * `.vercelignore`.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import path from "path"

const DIR = path.dirname(fileURLToPath(import.meta.url))
const HTML = readFileSync(path.join(DIR, "index.html"), "utf8")

/** O `<style>` sem comentários — asserção sobre a FORMA do CSS, não sobre o
 *  texto que explica o CSS (há um comentário que cita um hex do mockup). */
const CSS = (() => {
  const bloco = /<style>([\s\S]*?)<\/style>/.exec(HTML)![1]!
  return bloco.replace(/\/\*[\s\S]*?\*\//g, "")
})()

/** O HTML sem comentários — os comentários citam ACs, decisões e nomes de
 *  arquivo, e casariam com quase toda asserção de conteúdo abaixo. */
const MARCACAO = HTML.replace(/<!--[\s\S]*?-->/g, "")

/** Todos os `id="..."` do documento. */
const IDS = new Set([...MARCACAO.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!))

/** Recorta uma `<section>` pelo `id`, para asserção localizada. */
function secao(id: string): string {
  const inicio = MARCACAO.indexOf(`<section class=`)
  void inicio
  const re = new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`)
  const m = re.exec(MARCACAO)
  expect(m, `seção #${id} não encontrada`).not.toBeNull()
  return m![0]
}

/**
 * Largura x altura de um JPEG, lidas do próprio arquivo.
 *
 * Sem dependência de imagem: o marcador SOF (0xFFC0–0xFFCF, tirando C4/C8/CC)
 * traz altura e largura em big-endian nos bytes 5 e 7 do segmento. É o
 * suficiente para separar paisagem larga de quadrado, que é a decisão da AC5.
 */
function dimensoesJpeg(arquivo: string): { largura: number; altura: number } {
  const buf = readFileSync(path.join(DIR, "assets", arquivo))
  let i = 2 // pula o SOI (0xFFD8)
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marcador = buf[i + 1]!
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  throw new Error(`não achei o marcador SOF em ${arquivo}`)
}

// ---------------------------------------------------------------------------
// AC1 / AC9 — nav do header e do rodapé
// ---------------------------------------------------------------------------

const DESTINOS_NAV = ["#empreendimento", "#lazer", "#galeria", "#localizacao", "#sobre", "#cadastro"]

describe("nav do header e do rodapé (AC1, AC9)", () => {
  it("TODA âncora do nav aponta para um id que existe no documento", () => {
    // O modo de falha silencioso desta story: `href="#lazer"` sem
    // `id="lazer"` não gera erro nenhum — o clique só não sai do lugar.
    const header = /<header[\s\S]*?<\/header>/.exec(MARCACAO)![0]
    const rodape = /<nav class="fnav"[\s\S]*?<\/nav>/.exec(MARCACAO)![0]

    for (const bloco of [header, rodape]) {
      const ancoras = [...bloco.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!)
      expect(ancoras.length).toBeGreaterThanOrEqual(5)
      for (const alvo of ancoras) expect(IDS.has(alvo), `âncora #${alvo} sem destino`).toBe(true)
    }
  })

  it("o header tem os 5 links de seção mais o CTA, na ordem da landing irmã", () => {
    const header = /<header[\s\S]*?<\/header>/.exec(MARCACAO)![0]
    const ancoras = [...header.matchAll(/href="(#[^"]+)"/g)].map((m) => m[1]!)
    // O primeiro `#cadastro` é o logo (volta ao topo); depois vêm os 5 links e
    // o botão. Comparar o conjunto ordenado sem o logo:
    expect(ancoras.slice(1)).toEqual(DESTINOS_NAV)
  })

  it("o rodapé mantém o que já existia e ganhou os links (AC9)", () => {
    const rodape = /<footer[\s\S]*?<\/footer>/.exec(MARCACAO)![0]
    // Nada foi removido: 2 logos, o texto de direitos e o link da política.
    expect(rodape).toContain("assets/logo-trifold-branco.svg")
    expect(rodape).toContain("assets/logo-yarden-creme.svg")
    expect(rodape).toContain("Todos os direitos reservados")
    expect(rodape).toContain("assets/politica-de-privacidade.pdf")
    // E a nav entrou ENTRE os logos e o parágrafo de direitos.
    expect(rodape.indexOf('class="fnav"')).toBeGreaterThan(rodape.indexOf("logo-yarden-creme"))
    expect(rodape.indexOf('class="fnav"')).toBeLessThan(rodape.indexOf('class="direitos"'))
  })

  it("o header é fixo E a página compensa a altura dele nas âncoras (AC1)", () => {
    // Header fixo sem `scroll-padding-top` esconde o topo da seção atrás dele
    // a cada clique no nav — a seção "chega", mas cortada.
    expect(CSS).toMatch(/\.topo\{[^}]*position:fixed/)
    expect(CSS).toMatch(/html\{[^}]*scroll-padding-top:\s*\d+px/)
  })

  it("o hambúrguer mobile é anunciado e reporta o estado (AC13)", () => {
    expect(MARCACAO).toMatch(/id="topoToggle"[^>]*aria-label="Menu"/)
    expect(MARCACAO).toMatch(/id="topoToggle"[^>]*aria-expanded="false"/)
    // Fecha ao clicar em link, senão o scroll da âncora roda atrás do painel.
    expect(HTML).toContain("links.classList.remove('aberto')")
  })

  it("o fundo do header ao rolar é `--marrom`, e o limiar é 60px", () => {
    expect(CSS).toMatch(/\.topo\.rolado\{[^}]*background:var\(--marrom\)/)
    expect(HTML).toContain("window.scrollY > 60")
  })
})

// ---------------------------------------------------------------------------
// AC3 — O Empreendimento
// ---------------------------------------------------------------------------

describe("seção O Empreendimento (AC3)", () => {
  const STATS: [string, string][] = [
    ["60", "unidades"],
    ["83,66 m²", "de área privativa"],
    ["2 suítes", "e lavabo"],
    ["15", "pavimentos"],
    ["2 subsolos + rooftop", "lazer completo em dois níveis"],
    ["4", "apartamentos por pavimento"],
  ]

  it("tem exatamente os 6 stats travados, com o texto e a ordem da decisão D1", () => {
    const bloco = secao("empreendimento")
    const pares = [
      ...bloco.matchAll(
        /<div class="numero-grande">([\s\S]*?)<\/div>\s*<div class="numero-legenda">([\s\S]*?)<\/div>/g,
      ),
    ].map((m) => [m[1]!.trim(), m[2]!.trim()] as [string, string])

    expect(pares).toEqual(STATS)
  })

  it("NÃO tem stat de preço/entrada — a Ficha Técnica não traz o dado (D1.2)", () => {
    // A landing irmã tem `R$65mil / entrada`. É dado de OUTRO empreendimento:
    // importá-lo aqui seria publicar preço inventado (Artigo IV).
    const bloco = secao("empreendimento")
    expect(bloco).not.toMatch(/R\$/)
    expect(bloco.toLowerCase()).not.toContain("entrada")
  })

  it("não usa os candidatos descartados na curadoria", () => {
    // Área do terreno e área construída ficaram fora por decisão, não por
    // falta de fonte — voltar com elas desfaz a escolha do stakeholder.
    const bloco = secao("empreendimento")
    expect(bloco).not.toContain("1.344")
    expect(bloco).not.toContain("6.128")
    expect(bloco).not.toContain("6.129")
    // E a segunda metragem de área privativa continua fora (D1.1).
    expect(bloco).not.toContain("79,81")
  })
})

// ---------------------------------------------------------------------------
// AC4 — Lazer
// ---------------------------------------------------------------------------

describe("seção Lazer (AC4)", () => {
  it("tem exatamente os 6 chips travados, com o texto e a ordem da decisão D2", () => {
    const bloco = secao("lazer")
    const chips = [...bloco.matchAll(/<span class="chip">([\s\S]*?)<\/span>/g)].map((m) => m[1]!.trim())

    expect(chips).toEqual([
      "Sports bar (rooftop)",
      "Yoga",
      "Brinquedoteca",
      "Petcare",
      "Espaço gourmet com piscina privativa",
      "E muito mais",
    ])
  })

  it("a foto vai por <picture> na marcação, não por background-image (AC15)", () => {
    // A landing irmã põe o fundo do `.amen` por CSS. Aqui isso deixaria o par
    // `lazer-terreo.{jpg,webp}` sem referência em atributo — órfão, e o
    // `tracking-browser.test.ts` reprova.
    const bloco = secao("lazer")
    expect(bloco).toContain('srcset="assets/lazer-terreo.webp"')
    expect(bloco).toContain('src="assets/lazer-terreo.jpg"')
    expect(CSS).not.toMatch(/\.lazer-img\{[^}]*background-image/)
  })

  it("não cita amenidade fora da Ficha Técnica no parágrafo", () => {
    // O parágrafo é paráfrase autorizada do tom da landing irmã. O que ele NÃO
    // pode fazer é herdar as amenidades dela, que são de outro prédio.
    const bloco = secao("lazer").toLowerCase()
    for (const alheia of ["piscina aquecida", "spots bar", "coworking"]) {
      expect(bloco).not.toContain(alheia)
    }
  })
})

// ---------------------------------------------------------------------------
// AC5 — Galeria
// ---------------------------------------------------------------------------

describe("galeria (AC5)", () => {
  const bloco = secao("galeria")
  const figuras = [...bloco.matchAll(/<figure([^>]*)>([\s\S]*?)<\/figure>/g)].map((m) => ({
    classe: m[1]!,
    corpo: m[2]!,
  }))

  it("tem exatamente 9 fotos", () => {
    expect(figuras).toHaveLength(9)
  })

  it("tem exatamente 2 slots largos e 1 slot alto", () => {
    expect(figuras.filter((f) => f.classe.includes("g-wide"))).toHaveLength(2)
    expect(figuras.filter((f) => f.classe.includes("g-tall"))).toHaveLength(1)
  })

  it("cada foto é um par jpg+webp servido por <picture>, com as DUAS URLs em atributo", () => {
    for (const [i, fig] of figuras.entries()) {
      const webp = /srcset="assets\/(galeria-\d\d)\.webp"/.exec(fig.corpo)
      const jpg = /src="assets\/(galeria-\d\d)\.jpg"/.exec(fig.corpo)
      expect(webp, `figura ${i + 1} sem <source webp>`).not.toBeNull()
      expect(jpg, `figura ${i + 1} sem <img jpg>`).not.toBeNull()
      // Mesmo nome nos dois: um par cruzado serviria a foto errada em metade
      // dos navegadores, e passaria por qualquer conferência de contagem.
      expect(webp![1]).toBe(jpg![1])
      expect(fig.corpo).toContain('type="image/webp"')
    }
  })

  it("os 2 slots largos recebem paisagem larga e o slot alto recebe o quadrado", () => {
    // Risco #5 da story: quadrado em slot largo perde ~55% da altura. A
    // proporção é lida do ARQUIVO, não do atributo `width`/`height` do HTML —
    // atributo mentiroso é justamente o que se quer pegar.
    const arquivoDe = (fig: { corpo: string }) => /src="assets\/(galeria-\d\d\.jpg)"/.exec(fig.corpo)![1]!

    for (const larga of figuras.filter((f) => f.classe.includes("g-wide"))) {
      const { largura, altura } = dimensoesJpeg(arquivoDe(larga))
      expect(largura / altura, `${arquivoDe(larga)} em slot largo`).toBeGreaterThan(1.9)
    }

    const alta = figuras.find((f) => f.classe.includes("g-tall"))!
    const { largura, altura } = dimensoesJpeg(arquivoDe(alta))
    expect(largura / altura, `${arquivoDe(alta)} em slot alto`).toBeCloseTo(1, 1)
  })

  it("no grid de 2 colunas o slot largo volta a 1 coluna, senão sobra célula vazia", () => {
    // Medido no navegador, não deduzido: com `.g-wide{grid-column:span 2}` num
    // grid de 2 colunas, o auto-placement não encaixa a 2ª foto ao lado da 1ª
    // (que ocupa 2 linhas), empurra-a para a linha seguinte e deixa uma célula
    // de 170x310 VAZIA no canto superior direito. A landing irmã carrega esse
    // buraco em produção.
    const tablet = /@media \(max-width:979\.98px\)\{([\s\S]*?)\n {4}\}/.exec(CSS)![1]!
    expect(tablet).toMatch(/\.g-wide\{grid-column:span 1\}/)
    expect(tablet).toMatch(/\.galeria-grid\{grid-template-columns:repeat\(2,1fr\)/)
  })

  it("nenhum arquivo passa do teto de 330KB e o webp é o mais leve do par", () => {
    for (let i = 1; i <= 9; i++) {
      const nome = `galeria-${String(i).padStart(2, "0")}`
      const jpg = readFileSync(path.join(DIR, "assets", `${nome}.jpg`)).length
      const webp = readFileSync(path.join(DIR, "assets", `${nome}.webp`)).length
      expect(jpg, `${nome}.jpg`).toBeLessThanOrEqual(330 * 1024)
      expect(webp, `${nome}.webp`).toBeLessThanOrEqual(330 * 1024)
      // Se o webp ficar maior que o jpg, o <source> está piorando a página.
      expect(webp, `${nome}.webp maior que o jpg`).toBeLessThan(jpg)
    }
  })

  it("toda foto tem alt descritivo, lazy e decoding assíncrono (AC13)", () => {
    for (const [i, fig] of figuras.entries()) {
      const alt = /alt="([^"]*)"/.exec(fig.corpo)?.[1] ?? ""
      expect(alt.length, `figura ${i + 1} com alt curto/genérico`).toBeGreaterThan(25)
      expect(alt.toLowerCase()).toContain("yarden")
      expect(fig.corpo).toContain('loading="lazy"')
      expect(fig.corpo).toContain('decoding="async"')
    }
  })

  it("o CTA da galeria é âncora para o formulário, não JS (AC5, AC10)", () => {
    expect(bloco).toMatch(/<a href="#cadastro" class="btn-secao">Agende sua visita<\/a>/)
  })

  it("o lightbox usa currentSrc, senão amplia o jpg mesmo onde o webp carregou", () => {
    expect(HTML).toContain("img.currentSrc || img.src")
    expect(HTML).toContain("if (e.key === 'Escape')")
  })
})

// ---------------------------------------------------------------------------
// AC6 — Localização
// ---------------------------------------------------------------------------

describe("seção Localização (AC6)", () => {
  const bloco = secao("localizacao")

  it("é a MESMA seção que já existia (mapa e copy preservados), agora com id", () => {
    expect(bloco).toContain("Invista no novo centro urbano de Maringá.")
    expect(bloco).toContain('src="assets/mapa-gleba-itororo.jpg"')
    expect(bloco).toContain("a Gleba Itororó se tornou")
    expect(bloco).toContain('<span class="kicker">Localização</span>')
  })

  it("usa o link OFICIAL do Maps que a Ficha Técnica traz, e abre externo", () => {
    // O reflexo natural é montar uma busca por nome
    // (`google.com/maps?q=Yarden`), que resolve para outro lugar. A Ficha traz
    // o link curto do empreendimento — é este.
    const link = /<a class="loc-maps"[^>]*>/.exec(bloco)![0]
    expect(link).toContain('href="https://maps.app.goo.gl/RFibC7xZ7KZx6cwQA"')
    expect(link).toContain('target="_blank"')
    expect(link).toContain('rel="noopener"')
  })

  it("traz o endereço literal da Ficha, sem abreviar o logradouro", () => {
    expect(bloco).toMatch(/<p class="loc-endereco">Rua Carlos Meneghetti, 168[^<]*Gleba Itororó, Maringá<\/p>/)
  })

  it("os 5 pontos de referência são TEXTO VISÍVEL, não só o alt da imagem", () => {
    // Era o estado anterior: os marcos existiam apenas no `alt`, invisíveis
    // para leitor de tela e para busca. Este teste falha se alguém remover a
    // lista e "confiar no alt".
    const itens = [...bloco.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1]!.trim())
    expect(itens).toEqual(["Catedral", "Parque do Ingá", "Av. JK", "Bosque II", "Av. Itororó"])
  })

  it("o alt do mapa CONTINUA listando os marcos — a lista é acréscimo", () => {
    const alt = /alt="([^"]*)"/.exec(bloco)![1]!
    for (const marco of ["Catedral", "Parque do Ingá", "Av. JK", "Bosque II", "Av. Itororó"]) {
      expect(alt).toContain(marco)
    }
  })

  it("não introduz iframe de mapa (veto explícito da AC6)", () => {
    // Um terceiro domínio na CSP e um JS pesado, quando a página já tem uma
    // imagem de mapa própria com os pins desenhados.
    expect(MARCACAO).not.toContain("<iframe")
    expect(MARCACAO).not.toContain("google.com/maps?q=")
  })
})

// ---------------------------------------------------------------------------
// AC7 — banda CTA
// ---------------------------------------------------------------------------

describe("banda CTA (AC7, AC15)", () => {
  it("o fundo reaproveita uma foto que o HTML já referencia por atributo", () => {
    // Este é o ponto exato em que a AC15 morde: `background-image` é invisível
    // para o extrator de assets do outro teste. Reaproveitar uma das 9 da
    // galeria é o que mantém o arquivo referenciado.
    const url = /\.banda\{[\s\S]*?url\('assets\/([^']+)'\)/.exec(CSS)![1]!
    expect(url).toMatch(/^galeria-\d\d\.(jpg|webp)$/)

    const referenciadoPorAtributo = new RegExp(`(?:src|srcset)="assets/${url.replace(".", "\\.")}"`)
    expect(MARCACAO).toMatch(referenciadoPorAtributo)
  })

  it("o parallax é desligado no mobile", () => {
    // `background-attachment:fixed` é ignorado no iOS e estica a imagem.
    expect(CSS).toMatch(/\.banda\{[^}]*fixed/)
    expect(CSS).toMatch(/\.banda\{background-attachment:scroll\}/)
  })

  it("não é destino de âncora nenhuma e não cria asset próprio", () => {
    expect(MARCACAO).toMatch(/<section class="banda">/)
    expect(MARCACAO).not.toContain('assets/banda-')
  })
})

// ---------------------------------------------------------------------------
// AC8 — Sobre a Trifold
// ---------------------------------------------------------------------------

describe("seção Sobre a Trifold (AC8)", () => {
  const bloco = secao("sobre")

  it("o texto institucional é reuso VERBATIM, palavra por palavra (decisão D4)", () => {
    const paragrafo = /<p class="texto-secao">([\s\S]*?)<\/p>/
      .exec(bloco)![1]!
      .replace(/\s+/g, " ")
      .trim()

    expect(paragrafo).toBe(
      "Fundada em 2019 com a união de uma equipe experiente — atuante em conjunto no mercado desde 1997 — a Trifold trabalha na orçamentação e execução de obras residenciais, comerciais, industriais e hospitalares, além da incorporação e execução de empreendimentos próprios que reúnem alta qualidade.",
    )
    expect(bloco).toContain('<span class="kicker">Sobre a Trifold</span>')
    expect(bloco).toContain("Referência no conceito de morar bem")
  })

  it("serve os DOIS formatos da foto por <picture> (AC15)", () => {
    // A landing irmã serve só o `.webp`; copiar os dois arquivos e imitar isso
    // deixaria o `.jpg` órfão.
    expect(bloco).toContain('srcset="assets/trifold-fachada.webp"')
    expect(bloco).toContain('src="assets/trifold-fachada.jpg"')
  })

  it("não tem CTA próprio — a seção seguinte já é um formulário", () => {
    expect(bloco).not.toContain('class="btn-secao"')
  })
})

// ---------------------------------------------------------------------------
// AC10, AC11, AC12, AC14 — fora de escopo e não-regressão
// ---------------------------------------------------------------------------

describe("fora de escopo e não-regressão (AC10, AC11, AC12, AC14)", () => {
  it("nenhuma estrutura de Depoimentos foi criada, nem placeholder (AC12)", () => {
    // Os vídeos do Yarden não estão hospedados. A AC12 proíbe até o
    // placeholder — meia seção em produção é pior que seção nenhuma.
    //
    // Os marcadores são específicos de propósito: procurar só por "depo" casa
    // com "depois" dentro dos comentários de código, e um teste que falha por
    // uma palavra em português é um teste que alguém vai afrouxar.
    const semComentarios = MARCACAO.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase()
    for (const marca of ['class="depo', 'id="depoimentos"', "data-yt", "youtube", "depoimento"]) {
      expect(semComentarios, `marcador de depoimentos encontrado: ${marca}`).not.toContain(marca)
    }
  })

  it("os 3 formulários e as 3 chamadas de ligarFormulario seguem intactos (AC14)", () => {
    for (const id of ["leadForm", "leadFormMobile", "leadFormSaber"]) {
      expect(MARCACAO).toContain(`id="${id}"`)
    }
    expect(HTML).toContain("['leadForm',        'formMsg']")
    expect(HTML).toContain("['leadFormMobile',  'formMsgMobile']")
    expect(HTML).toContain("['leadFormSaber',   'formMsgSaber']")
    // Os 6 campos que armam o InitiateCheckout continuam os mesmos.
    expect(HTML).toContain("['nome','whats','nomeMobile','whatsMobile','nomeSaber','whatsSaber']")
  })

  it("o script de interface novo não toca em tracking nem em formulário (AC10)", () => {
    const scripts = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
    const interface_ = scripts.find((s) => s.includes("topoToggle"))!
    const codigo = interface_.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

    expect(codigo).not.toContain("TrifoldTracking")
    expect(codigo).not.toContain("fbq")
    expect(codigo).not.toContain("leadEndpoint")
    expect(codigo).not.toMatch(/console\.(log|debug|info)/)
    // E é um bloco separado do script de captação, para o diff daquele ficar
    // em zero linha.
    expect(interface_).not.toContain("leadForm")
  })

  it("nenhuma cor hex nova entrou no CSS (AC11)", () => {
    // As seções novas só podem usar as variáveis do `:root`. Este teste congela
    // o inventário de literais: qualquer hex novo (mesmo "só um cinzinha")
    // aparece aqui antes de virar dívida de identidade visual.
    const root = /:root\{([\s\S]*?)\n {4}\}/.exec(CSS)![1]!
    const doRoot = new Set([...root.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]!.toLowerCase()))
    const todos = new Set([...CSS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]!.toLowerCase()))

    // Literais que já existiam fora do `:root` antes desta story.
    const HERDADOS = new Set(["#fff", "#8c8c8c", "#a9c6cf", "#eeeeee", "#ffd9d9", "#25d366"])
    const novos = [...todos].filter((h) => !doRoot.has(h) && !HERDADOS.has(h))

    expect(novos).toEqual([])
  })

  it("nenhuma fonte nova foi carregada (AC11)", () => {
    const fontes = [...HTML.matchAll(/family=([^&"]+)/g)].map((m) => m[1]!)
    expect(new Set(fontes)).toEqual(new Set(["Montserrat:wght@300;400;500;600;700"]))
  })

  it("nenhum logo novo — só os 2 SVGs que já existiam (AC11)", () => {
    const svgs = new Set([...MARCACAO.matchAll(/assets\/([\w-]+\.svg)/g)].map((m) => m[1]!))
    expect([...svgs].sort()).toEqual(["logo-trifold-branco.svg", "logo-yarden-creme.svg"])
  })
})
