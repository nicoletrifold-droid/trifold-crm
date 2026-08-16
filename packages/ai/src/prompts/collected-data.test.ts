/**
 * Story 87-11 (item `W1-6`) — o `collected_data` deixa de ir ao prompt como JSON cru.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO ESTE ARQUIVO SE PROTEGE DE FICAR VERDE POR ACIDENTE
 *
 * O risco desta story tem nome, e a família já tem sete casos medidos nesta
 * semana: um teste que verifique só *"o JSON cru não aparece"* fica verde
 * **porque o bloco inteiro sumiu**. Uma asserção negativa sozinha não distingue
 * "o dado entrou classificado" de "o dado não entrou".
 *
 * Por isso NENHUM bloco deste arquivo tem só a direção negativa:
 *
 *   • **controle positivo** em par com cada negativo, no MESMO teste — o que
 *     deve continuar chegando ao prompt chega, com o mesmo texto;
 *   • **asserção sobre a lista inteira** (`toEqual`) onde é a forma que importa,
 *     não `toContain` de um fragmento;
 *   • **mutação medida** — o número de testes que cai ao reverter a subtração,
 *     ao trocar a guarda de tipo por `String(valor)`, ao subir o teto de 120
 *     para 10.000 e ao fazer o renderizador mutar o objeto está no Dev Agent
 *     Record da story, com a saída bruta colada. Vermelho medido, não declarado.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Todas as fixtures são coladas de PRODUÇÃO (`dsopqkqjkmhytudaaolv`, somente
 * SELECT, remedidas em 16/08). O `now` é FIXO em todo teste que toca o
 * `agenda_state`: ele tem TTL de 48 h, e sem relógio fixo a fixture do Ronaldo
 * ficaria verde só até 12/08 e depois quebraria sozinha.
 */
import { describe, it, expect } from "vitest"
import { buildAgendaState } from "../flows/agenda-state"
import {
  renderDadosColetados,
  CABECALHO_DADOS_COLETADOS,
  VALOR_MAX_CHARS,
  MAX_LINHAS_DADOS,
} from "./collected-data"

/**
 * O `collected_data` do lead Ronaldo, ÍNTEGRO, colado do banco
 * (`conversation_id c3eb7ee1-a1ac-4b33-8b5f-2ff34c051b9e`, `updated_at
 * 2026-08-10 00:30:17`, 356 chars). É o lead da primeira detecção real da guarda
 * `NICOLE_SLOT_UNAUTHORIZED` (10/08 00:13 UTC) e o único registro de produção
 * com `agenda_state` na data em que a story foi escrita.
 *
 * Função, e não constante: se um teste mutasse o objeto, uma constante
 * compartilhada faria o teste seguinte rodar sobre o estado já sujo — verde por
 * acidente. (E a pureza é justamente o que a AC5-iii mede.)
 */
const ESTADO_DO_RONALDO = (): Record<string, unknown> => ({
  name: "Ronaldo",
  floor: "alto",
  bedrooms: 2,
  profissao: "corretor de imóveis",
  agenda_state: {
    hora: 17,
    fonte: "pendencia",
    minuto: 30,
    origem: "lead",
    citacao: "3ª feira às 17:30",
    periodo: null,
    expira_em: "2026-08-12T00:15:45.465Z",
    ancorado_em: "2026-08-10T00:15:45.465Z",
    data_absoluta: null,
  },
  property_interest: "vind",
})

/** O instante do último turno real dele. Dentro do TTL (`expira_em` é 12/08). */
const NOW_RONALDO = new Date("2026-08-10T00:30:17.946Z")

/**
 * A fala da lead Ivone gravada em `visit_availability` — 2.103 chars, o maior
 * `collected_data` de produção. Colada do banco, íntegra. Note o `"name": "Tudo"`
 * no mesmo registro: o modelo estava sendo informado de que o lead se chama
 * "Tudo".
 */
const FALA_DA_IVONE =
  "Olá, o meu nome é Ivone, eu moro aqui no Jardim Oasis, e eu estou precisando, estou precisando muito, a casa que eu moro é minha, e eu já coloquei ela à venda, e tem um terreno também no Portal das Torres que eu coloquei à venda, porque eu moro sozinha e eu preciso de segurança, e para ter segurança eu preciso morar num apartamento, que daí eu vou ter gente do lado, em cima, embaixo, etc, né, e aqui onde eu moro, se eu depender de alguém, se eu precisar, Deus queira que eu não precise, que até hoje não precisei, se eu precisar de um socorro à noite, eu posso gritar aqui que ninguém vai me atender não, então eu preciso de segurança. Primeiro eu gostaria de saber onde é, ver onde, a localização, procurar saber valores, que é o mais importante, é, aqui já falou que são duas suítes, tudo bem, beleza. Então, é isso que eu gostaria de saber, se já está pronto, se está em construção, porque eu completei agora no último dia 4, 83 anos, e eu sempre, desde que meus filhos casaram, aprimorei só, eu já faz mais de 25 anos que eu sou aposentada, então eu preciso de um pouco mais de gente ao meu redor, não só para uma necessidade, como para conversar, eu gosto de conversar, eu gosto de sair, eu moro sozinha, eu faço tudo sozinha, eu vou e eu volto de poucos, porque eu nunca aprendi a dirigir, eu tenho pressão baixa, e sei lá, então eu nunca me dei certo com isso não, cheguei ter carro e acabei vendendo, porque não adiantava que eu não tinha coragem de sair, fiz autoescola, tudo, mas depois não, não, não, não, falei não, isso não é normal, isso que eu era jovem, meus filhos eram pequenos, hoje esses meus filhos já são avós e eu sou bisavó, mas então, a gente não pode forçar, né? Eu acho que a gente não deve forçar, que vai que força aí, dá uma coisa errada aí, daí não vai faltar alguém para falar, tá vendo, te falei, bem mas então, essas são as informações que eu preciso, onde fica, se já está construído, valor, isso que eu preciso saber, tá bom? Muito obrigada."

const ESTADO_DA_IVONE = (): Record<string, unknown> => ({
  name: "Tudo",
  bedrooms: 2,
  property_interest: "vind",
  visit_availability: FALA_DA_IVONE,
  visit_pending_date: "2026-08-03",
})

// ═══════════════════════════════════════════════════════════════════════════
// AC2 — turno-ouro: o estado REAL do Ronaldo, byte a byte
// ═══════════════════════════════════════════════════════════════════════════

describe("AC2 — turno-ouro (Ronaldo): o bloco inteiro, byte a byte", () => {
  /**
   * Snapshot INLINE, não arquivo externo, e por `toEqual` da lista inteira —
   * não `toContain`. Um `toContain` aqui deixaria passar uma linha a mais (que
   * é exatamente a classe de defeito desta story: informação a mais, sem rótulo).
   *
   * ⚠️ UMA diferença em relação ao rascunho do §2 da story, e ela é deliberada:
   * a linha do extra sai como `- profissao:` e não `- Profissão:`. A regra
   * normativa é a do §1 do Desenho (*"outras chaves escalares → `- chave: valor`"*);
   * capitalizar exigiria um segundo mapa de rótulos, que é a allow-list fechada
   * que o próprio §1 proíbe por *"matar os extras em silêncio"*. As outras duas
   * diferenças já estavam declaradas pelo @po (E7): a data de ancoragem não
   * entra na citação (`data_absoluta` é `null`), e a linha do `visit_proposed`
   * mora em `pipeline.ts`, não aqui — ela é verificada no teste de pipeline.
   */
  it("🔴 produz EXATAMENTE estas 7 linhas — nem uma a mais", () => {
    expect(renderDadosColetados(ESTADO_DO_RONALDO(), NOW_RONALDO)).toEqual([
      "Dados já coletados nesta conversa (podem ter vindo da fala do lead OU de inferência da própria conversa — NÃO são fatos verificados no sistema):",
      "- Nome: Ronaldo",
      "- Empreendimento de interesse: vind",
      "- Quartos: 2",
      "- Andar: alto",
      "- profissao: corretor de imóveis",
      '- O lead mencionou disponibilidade, nas palavras dele: "3ª feira às 17:30". Isso NÃO é visita marcada — só o bloco [SISTEMA] confirma dia e horário.',
    ])
  })

  it("🔴 (i) NENHUMA das seis strings de maquinário chega ao prompt", () => {
    const bloco = renderDadosColetados(ESTADO_DO_RONALDO(), NOW_RONALDO).join("\n")
    // Uma asserção só, sobre a LISTA do que vazou, e não seis `not.toContain`
    // em sequência: seis asserções param na primeira e o vermelho mostraria UMA
    // string. A AC2-(iii) pede a saída bruta com as SEIS — é ela que prova que a
    // remoção alcançou o objeto inteiro, e não só o primeiro campo dele.
    const MAQUINARIO = ["expira_em", "ancorado_em", '"fonte"', '"origem"', "data_absoluta", "agenda_state"]
    expect(MAQUINARIO.filter((s) => bloco.includes(s))).toEqual([])
  })

  it("(ii) CONTROLE POSITIVO — a citação e o dado de qualificação continuam entrando", () => {
    const bloco = renderDadosColetados(ESTADO_DO_RONALDO(), NOW_RONALDO).join("\n")
    // A citação É a peça honesta do estado: ela entra, com a negação colada.
    expect(bloco).toContain("3ª feira às 17:30")
    expect(bloco).toContain("Isso NÃO é visita marcada")
    expect(bloco).toContain("Quartos: 2")
  })

  it("o estado de agenda VENCIDO não é citado — o TTL de 48 h vale aqui também", () => {
    // `expira_em` é 12/08 00:15. Lido em 13/08, o pipeline apagaria o objeto 70
    // linhas adiante (`pipeline.ts:799`); o prompt não pode citá-lo antes disso.
    const linhas = renderDadosColetados(ESTADO_DO_RONALDO(), new Date("2026-08-13T00:00:00Z"))
    expect(linhas.join("\n")).not.toContain("3ª feira às 17:30")
    // CONTROLE POSITIVO: o resto do estado continua entrando — não é o bloco
    // inteiro que some, é só a citação vencida.
    expect(linhas).toContain("- Nome: Ronaldo")
  })

  it("um `agenda_state` de forma inválida não vira citação nem vaza como objeto", () => {
    // `origem: 'nicole'` é rejeitado por `parseAgendaState` — e o objeto NÃO
    // pode cair na regra dos extras e virar `[object Object]`.
    const estado = ESTADO_DO_RONALDO()
    ;(estado.agenda_state as Record<string, unknown>).origem = "nicole"
    const bloco = renderDadosColetados(estado, NOW_RONALDO).join("\n")
    expect(bloco).not.toContain("3ª feira às 17:30")
    expect(bloco).not.toContain("[object Object]")
    expect(bloco).not.toContain("agenda_state")
    expect(bloco).toContain("- Nome: Ronaldo") // controle positivo
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC3 — par negativo/positivo no MESMO teste
// ═══════════════════════════════════════════════════════════════════════════

describe("AC3 — a fala da Ivone não entra; o extra útil entra", () => {
  /**
   * As duas direções no MESMO teste é a disciplina que salvou a AC2 da 87-8
   * quando a previsão do @architect foi falsificada por medição. Uma AC escrita
   * só na direção prevista vira lixo no dia em que a medição chega.
   */
  it("🔴 (i) NEGATIVO: nenhum fragmento dos 2.103 chars aparece · (ii) POSITIVO: `profissao` aparece", () => {
    const estado = { ...ESTADO_DA_IVONE(), profissao: "corretor de imóveis" }
    const bloco = renderDadosColetados(estado, NOW_RONALDO).join("\n")

    // (i) Trechos do MEIO e do FIM da fala — não do começo. Assertar sobre o
    // começo deixaria verde um truncamento que ainda despejasse 1.900 chars.
    expect(bloco).not.toContain("eu completei agora no último dia 4, 83 anos")
    expect(bloco).not.toContain("hoje esses meus filhos já são avós e eu sou bisavó")
    expect(bloco).not.toContain("Muito obrigada")
    expect(bloco).not.toContain("Jardim Oasis")
    // e a segunda chave legada do mesmo registro também não entra
    expect(bloco).not.toContain("2026-08-03")
    expect(bloco).not.toContain("visit_pending_date")

    // (ii) CONTROLE POSITIVO, no mesmo teste: o extra útil chega intacto.
    expect(bloco).toContain("- profissao: corretor de imóveis")
    // e o que a Ivone tem de qualificação também — inclusive o `name` errado,
    // que esta story NÃO conserta (ela não julga o conteúdo, só a forma).
    expect(bloco).toContain("- Nome: Tudo")
    expect(bloco).toContain("- Quartos: 2")
  })

  it("o bloco da Ivone cabe em 4 linhas de dado — contra o HEAD eram 2.103 chars de JSON", () => {
    const linhas = renderDadosColetados(ESTADO_DA_IVONE(), NOW_RONALDO)
    expect(linhas).toEqual([
      CABECALHO_DADOS_COLETADOS,
      "- Nome: Tudo",
      "- Empreendimento de interesse: vind",
      "- Quartos: 2",
    ])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC4 — objeto e array desconhecidos nunca são renderizados
// ═══════════════════════════════════════════════════════════════════════════

describe("AC4 — a guarda ESTRUTURAL contra o próximo `agenda_state`", () => {
  it("objeto e array desconhecidos somem; o `agenda_state` do mesmo estado vira a linha de citação", () => {
    const estado: Record<string, unknown> = {
      ...ESTADO_DO_RONALDO(),
      chave_nova_objeto: { segredo: "x" },
      chave_nova_array: ["a", "b"],
    }
    const bloco = renderDadosColetados(estado, NOW_RONALDO).join("\n")

    expect(bloco).not.toContain("chave_nova_objeto")
    expect(bloco).not.toContain("segredo")
    expect(bloco).not.toContain("chave_nova_array")
    expect(bloco).not.toContain('["a","b"]')
    expect(bloco).not.toContain("[object Object]")

    // CONTROLE POSITIVO no mesmo teste: o `agenda_state` — que TAMBÉM é objeto —
    // continua produzindo a linha de citação. Sem isto, "objetos somem" ficaria
    // verde num renderizador que descartasse todos os objetos, inclusive o único
    // que tem tratamento.
    expect(bloco).toContain('"3ª feira às 17:30"')
  })

  it("os cinco extras escalares de produção passam, e os três tipos escalares são exercitados", () => {
    // Os NOMES das chaves são os reais do Haiku do cron (`profissao`,
    // `cidade_bairro`, `filhos`, `estado_civil`, `situacao_moradia`). Os TIPOS
    // aqui são deliberadamente mistos, para exercitar os três escalares num
    // teste só — em produção `filhos` é string, e quem é `number` de verdade é
    // `bedrooms`/`garages`.
    //
    // Medição de 16/08 sobre as 853 entradas de `collected_data` em produção:
    // string 628 · number 211 · boolean 14 · object 2 · array 0 — e os DOIS
    // objects são `agenda_state`, que tem linha dedicada. A guarda estrutural da
    // AC4 não perde NENHUMA informação real hoje.
    const linhas = renderDadosColetados(
      {
        cidade_bairro: "Maringá / Zona 7",
        profissao: "corretor de imóveis",
        filhos: 2,
        estado_civil: "casado",
        situacao_moradia: "nao_mencionado",
        has_down_payment: true,
      },
      NOW_RONALDO
    )
    expect(linhas).toEqual([
      CABECALHO_DADOS_COLETADOS,
      "- Tem entrada disponível: sim",
      "- cidade_bairro: Maringá / Zona 7",
      "- profissao: corretor de imóveis",
      "- filhos: 2",
      "- estado_civil: casado",
      "- situacao_moradia: nao_mencionado",
    ])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC5-(iii) — o renderizador é PURO
// ═══════════════════════════════════════════════════════════════════════════

describe("AC5-(iii) — pureza: o objeto persistido não é tocado", () => {
  /**
   * É o vetor REAL de regressão desta story. O mesmo `collected_data` alimenta
   * `calculateQualificationScore` (`qualification.ts`), cujo peso 20 de
   * `visit_availability` é ~1/5 do score, e score ≥ 70 é condição de
   * `shouldHandoff`. Um renderizador que apagasse uma chave — por exemplo, para
   * "limpar" o resíduo de agenda — mudaria o objeto persistido e o gatilho de
   * handoff, sem que ninguém associasse as duas coisas.
   */
  it("🔴 o `collected_data` sai da chamada idêntico ao que entrou", () => {
    const estado = ESTADO_DO_RONALDO()
    const original = structuredClone(estado)
    renderDadosColetados(estado, NOW_RONALDO)
    expect(estado).toEqual(original)
  })

  it("idem para o estado com chaves legadas — que são FILTRADAS, não apagadas", () => {
    // A distinção importa: quem apaga as legadas é `stripLegacyAgendaKeys`, no
    // pipeline, DEPOIS deste ponto do turno e com evento emitido. Este módulo só
    // deixa de imprimi-las.
    const estado = ESTADO_DA_IVONE()
    const original = structuredClone(estado)
    renderDadosColetados(estado, NOW_RONALDO)
    expect(estado).toEqual(original)
    expect(estado).toHaveProperty("visit_availability")
    expect(estado).toHaveProperty("visit_pending_date")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC6 — truncamento e teto, com os números fixados
// ═══════════════════════════════════════════════════════════════════════════

describe("AC6 — os dois tetos são constantes nomeadas e são assertados", () => {
  it("os números são 120 e 12", () => {
    expect(VALOR_MAX_CHARS).toBe(120)
    expect(MAX_LINHAS_DADOS).toBe(12)
  })

  it("valor escalar acima de 120 chars entra TRUNCADO, com reticência", () => {
    const longo = "x".repeat(500)
    const linhas = renderDadosColetados({ profissao: longo }, NOW_RONALDO)
    const linha = linhas[1]!
    expect(linha).toBe(`- profissao: ${"x".repeat(VALOR_MAX_CHARS)}…`)
    expect(linha.length).toBeLessThan(140)
    // CONTROLE POSITIVO: exatamente 120 chars NÃO é truncado.
    const noLimite = "y".repeat(VALOR_MAX_CHARS)
    expect(renderDadosColetados({ profissao: noLimite }, NOW_RONALDO)[1]).toBe(
      `- profissao: ${noLimite}`
    )
  })

  /**
   * 🔴 ESTE TESTE EXISTE PORQUE A MUTAÇÃO PREVISTA PELA STORY FOI FALSIFICADA.
   *
   * A AC6 previa: *"subir o limite para 10.000 → a asserção do (i) da AC3 cai
   * (a fala da Ivone volta a entrar, truncada)"*. **Medido: não cai.** A fala da
   * Ivone mora em `visit_availability`, que é `LEGACY_AGENDA_KEYS` e some pelo
   * FILTRO, não pelo truncamento — são duas guardas independentes, e a story
   * conflou as duas. Com `VALOR_MAX_CHARS = 10.000` a AC3-(i) continuava verde.
   *
   * A guarda de truncamento só é exercida por prosa longa numa chave que NÃO é
   * legada — que é um cenário real, não hipotético: os extras (`profissao`,
   * `cidade_bairro`, …) são escritos em texto livre pelo Haiku do cron
   * `enrich-leads`, o último escritor de 70 % dos estados. Este teste põe a
   * MESMA prosa de produção nessa posição, e é ele que fica vermelho quando o
   * teto sobe.
   */
  it("🔴 prosa de produção numa chave NÃO-legada é truncada — a guarda que o filtro não cobre", () => {
    const linhas = renderDadosColetados({ cidade_bairro: FALA_DA_IVONE }, NOW_RONALDO)
    const linha = linhas[1]!
    // Os trechos do MEIO e do FIM não sobrevivem ao corte…
    expect(linha).not.toContain("eu completei agora no último dia 4, 83 anos")
    expect(linha).not.toContain("Muito obrigada")
    // …e o que entra é exatamente 120 chars de valor + a reticência.
    expect(linha).toBe(`- cidade_bairro: ${FALA_DA_IVONE.slice(0, VALOR_MAX_CHARS)}…`)
    // CONTROLE POSITIVO: o começo REAL da fala entra — a guarda trunca, não apaga.
    expect(linha).toContain("Olá, o meu nome é Ivone")
  })

  it("o bloco nunca passa de 12 linhas de dado, e a linha de agenda sobrevive ao teto", () => {
    const estado: Record<string, unknown> = { ...ESTADO_DO_RONALDO() }
    for (let i = 0; i < 40; i++) estado[`extra_${i}`] = `v${i}`

    const linhas = renderDadosColetados(estado, NOW_RONALDO)
    const dados = linhas.slice(1) // sem o cabeçalho
    expect(dados).toHaveLength(MAX_LINHAS_DADOS)
    // A linha de agenda é a ÚNICA do bloco que carrega uma negação
    // ("isso NÃO é visita marcada"). Perdê-la por excesso de extras deixaria a
    // citação sem a ressalva — por isso o teto corta os dados, não ela.
    expect(dados[dados.length - 1]).toContain("Isso NÃO é visita marcada")
    expect(dados[0]).toBe("- Nome: Ronaldo") // controle positivo: o corte é na cauda
  })

  it("estado vazio (ou só com chaves não-renderizáveis) devolve [] — o bloco nem aparece", () => {
    expect(renderDadosColetados({}, NOW_RONALDO)).toEqual([])
    expect(renderDadosColetados({ visit_availability: FALA_DA_IVONE }, NOW_RONALDO)).toEqual([])
    expect(renderDadosColetados({ visit_explicitly_confirmed: "sábado 10h" }, NOW_RONALDO)).toEqual([])
    // CONTROLE POSITIVO: uma chave renderizável no meio das não-renderizáveis
    // faz o bloco voltar a existir.
    expect(
      renderDadosColetados({ visit_availability: FALA_DA_IVONE, name: "Ana" }, NOW_RONALDO)
    ).toEqual([CABECALHO_DADOS_COLETADOS, "- Nome: Ana"])
  })

  it("string vazia e null são ausência, não dado", () => {
    expect(renderDadosColetados({ name: "", floor: null, view: undefined }, NOW_RONALDO)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC6 · C1 do gate R1 — o truncamento da CITAÇÃO tinha ZERO vermelhos
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔴 GUARDA ÓRFÃ, achado A1 do @qa (gate R1, 16/08): remover o `truncar()` da
 * linha de agenda (`collected-data.ts:160`) deixava a suíte INTEIRA verde —
 * **zero vermelhos em 2.441 testes**. Era a única linha do bloco novo cujo
 * comprimento nenhuma fixture media, e é justamente a que carrega **texto livre
 * do lead**, que é a classe de dano que esta story existe para remover.
 *
 * ⚠️ POR QUE A GUARDA É LOAD-BEARING — são DUAS réguas, e elas não são a mesma:
 *
 *   escrita  `agenda-state.ts:149`  `input.citacao.trim().slice(0, CITACAO_MAX)`  → 280
 *   leitura  `agenda-state.ts:190`  `citacao: o.citacao`                          → SEM relimite
 *
 * `parseAgendaState` **não** relimita na leitura, e **280 > 120**. Logo uma
 * citação de 121–280 chars é valor perfeitamente legítimo, produzido pelo
 * escritor oficial, e o `truncar()` daqui é o único ponto que a impede de entrar
 * inteira no prompt. Os dois testes 🔴 abaixo cobrem as duas procedências que o
 * A1 nomeia: (a) o máximo que o escritor legítimo produz; (b) o que chega por
 * outro caminho, onde não há limite nenhum.
 *
 * Sem exposição em produção hoje — as duas citações vivas têm 17 e 5 chars
 * (Ronaldo e Rita). O que faltava era a régua, não o código.
 */
describe("AC6 (C1) — a citação do `agenda_state` também é truncada em 120", () => {
  /**
   * A fixture é a fala REAL da Ivone passada pelo escritor REAL
   * (`buildAgendaState`), e não uma string sintética: é exatamente o que o
   * `processMessage` grava hoje quando o lead fala longo. O `slice(0, 280)` da
   * escrita devolve 280 chars — mais que o dobro do teto de leitura.
   */
  const ESTADO_DE_CITACAO_LONGA = () =>
    buildAgendaState({ citacao: FALA_DA_IVONE, now: NOW_RONALDO, fonte: "mencao" })

  it("🔴 (a) citação no MÁXIMO que o escritor legítimo produz (280) entra com 120 + `…`", () => {
    const state = ESTADO_DE_CITACAO_LONGA()
    // A desigualdade é o motivo de a guarda existir. Não é `toBe(280)`: o que
    // importa não é o número da escrita, é ele ser MAIOR que o da leitura.
    expect(state.citacao.length).toBeGreaterThan(VALOR_MAX_CHARS)

    const linhas = renderDadosColetados({ name: "Ivone", agenda_state: state }, NOW_RONALDO)
    const linhaAgenda = linhas[linhas.length - 1]!

    // (i) NEGATIVO — trechos que existem na citação GRAVADA (dentro dos 280) mas
    // caem fora dos 120. Do MEIO e do FIM do que foi gravado, não do começo.
    expect(linhaAgenda).not.toContain("Portal das Torres")
    expect(linhaAgenda).not.toContain("preciso de segurança")

    // (ii) A linha INTEIRA, não um fragmento: o corte é de 120 chars de VALOR,
    // e a ressalva sobrevive ao corte (truncar a linha em vez do valor comeria
    // a negação, que é a única do bloco).
    expect(linhaAgenda).toBe(
      `- O lead mencionou disponibilidade, nas palavras dele: "${FALA_DA_IVONE.slice(0, VALOR_MAX_CHARS)}…". ` +
        "Isso NÃO é visita marcada — só o bloco [SISTEMA] confirma dia e horário."
    )

    // (iii) CONTROLE POSITIVO — a guarda TRUNCA, não apaga: o começo real da
    // fala entra, a negação está lá e o resto do bloco continua de pé.
    expect(linhaAgenda).toContain("Olá, o meu nome é Ivone")
    expect(linhaAgenda).toContain("Isso NÃO é visita marcada")
    expect(linhas).toContain("- Nome: Ivone")
  })

  it("🔴 (b) citação gravada por OUTRO caminho (jsonb cru, 500 chars) também é truncada", () => {
    // `parseAgendaState` valida a FORMA e devolve `citacao: o.citacao` sem
    // `slice`. Um escritor futuro — ou uma escrita manual no `jsonb` — passa sem
    // limite nenhum. Aqui não há `CITACAO_MAX` no caminho: o único teto é este.
    const cru = {
      name: "Ivone",
      agenda_state: {
        citacao: FALA_DA_IVONE.slice(0, 500),
        origem: "lead",
        fonte: "mencao",
        data_absoluta: null,
        hora: null,
        minuto: null,
        periodo: null,
        ancorado_em: "2026-08-10T00:15:45.465Z",
        expira_em: "2026-08-12T00:15:45.465Z",
      },
    }
    const linhas = renderDadosColetados(cru, NOW_RONALDO)
    const linhaAgenda = linhas[linhas.length - 1]!

    expect(linhaAgenda).not.toContain("Deus queira que eu não precise")
    expect(linhaAgenda).toBe(
      `- O lead mencionou disponibilidade, nas palavras dele: "${FALA_DA_IVONE.slice(0, VALOR_MAX_CHARS)}…". ` +
        "Isso NÃO é visita marcada — só o bloco [SISTEMA] confirma dia e horário."
    )
    expect(linhas).toContain("- Nome: Ivone") // controle positivo
  })

  /**
   * ⚠️ Declarado: este teste é o CONTROLE de fronteira e fica **VERDE** quando o
   * `truncar()` da citação some — ele não conta como vermelho da guarda órfã. O
   * que ele impede é o conserto grosseiro (um `slice` incondicional, que poria
   * `…` numa citação curta e transformaria as duas citações vivas de produção —
   * 17 e 5 chars — em falas cortadas).
   */
  it("(c) CONTROLE DE FRONTEIRA: citação de exatamente 120 chars não é truncada", () => {
    const noLimite = FALA_DA_IVONE.slice(0, VALOR_MAX_CHARS)
    const state = buildAgendaState({ citacao: noLimite, now: NOW_RONALDO, fonte: "mencao" })
    const linhas = renderDadosColetados({ agenda_state: state }, NOW_RONALDO)
    expect(linhas[linhas.length - 1]).toBe(
      `- O lead mencionou disponibilidade, nas palavras dele: "${noLimite}". ` +
        "Isso NÃO é visita marcada — só o bloco [SISTEMA] confirma dia e horário."
    )
  })
})
