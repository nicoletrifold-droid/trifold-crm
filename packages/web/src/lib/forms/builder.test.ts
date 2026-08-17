import { describe, it, expect } from "vitest"
import {
  gerarId,
  moverPergunta,
  limparCondicoesOrfas,
  candidatasParaCondicao,
  novaPergunta,
  novaOpcao,
  montarSchema,
  aceitaOpcoes,
} from "./builder"
import { parseFormSchema, type Pergunta } from "./schema"

// Story 75-334 — o construtor visual. O caso que mais pode dar errado é a
// REORDENAÇÃO: mover uma pergunta para cima de outra que ela referencia
// produziria um schema que o próprio `parseFormSchema` recusa. Salvar isso
// deixaria o formulário quebrado NO AR, com a tela dizendo que estava tudo bem.

const p = (id: string, over: Partial<Pergunta> = {}): Pergunta => ({
  id,
  tipo: "texto",
  titulo: id,
  ...over,
})

describe("gerarId", () => {
  it("deriva do título, sem acento e sem espaço", () => {
    expect(gerarId("Qual é a sua renda?", [])).toBe("qual_e_a_sua_renda")
  })

  it("não colide com id existente", () => {
    expect(gerarId("Renda", ["renda"])).toBe("renda_2")
    expect(gerarId("Renda", ["renda", "renda_2"])).toBe("renda_3")
  })

  it("título só com símbolos ainda gera id utilizável", () => {
    expect(gerarId("??? !!!", [])).toBe("pergunta")
  })
})

describe("moverPergunta", () => {
  it("move sem mexer em nada quando não há condição", () => {
    const { perguntas, condicoesRemovidas } = moverPergunta([p("a"), p("b"), p("c")], 2, 0)
    expect(perguntas.map((x) => x.id)).toEqual(["c", "a", "b"])
    expect(condicoesRemovidas).toEqual([])
  })

  it("🔴 remove a condição que a mudança tornaria inválida, e avisa qual", () => {
    // "b" só aparece se "a" for X. Mover "b" para ANTES de "a" deixaria a
    // condição apontando para frente — schema que o parse recusa.
    const lista = [
      p("a", { tipo: "escolha", opcoes: [{ valor: "x", rotulo: "X" }] }),
      p("b", { titulo: "Depende de A", condicoes: [{ pergunta: "a", em: ["x"] }] }),
    ]
    const { perguntas, condicoesRemovidas } = moverPergunta(lista, 1, 0)

    expect(perguntas.map((x) => x.id)).toEqual(["b", "a"])
    expect(perguntas[0]!.condicoes).toBeUndefined()
    expect(condicoesRemovidas).toEqual(["Depende de A"])
  })

  it("o resultado do movimento SEMPRE passa no parse — é o ponto", () => {
    const lista = [
      p("a", { tipo: "escolha", opcoes: [{ valor: "x", rotulo: "X" }] }),
      p("b", { condicoes: [{ pergunta: "a", em: ["x"] }] }),
      p("c", { condicoes: [{ pergunta: "a", em: ["x"] }] }),
    ]
    for (const [de, para] of [
      [0, 2],
      [2, 0],
      [1, 0],
      [0, 1],
    ] as const) {
      const { perguntas } = moverPergunta(lista, de, para)
      expect(() => parseFormSchema({ perguntas })).not.toThrow()
    }
  })

  it("índice inválido não faz nada", () => {
    const lista = [p("a"), p("b")]
    expect(moverPergunta(lista, 0, 0).perguntas).toBe(lista)
    expect(moverPergunta(lista, 5, 0).perguntas).toBe(lista)
  })
})

describe("limparCondicoesOrfas", () => {
  it("mantém a condição válida e descarta só a inválida", () => {
    const lista = [
      p("a", { tipo: "escolha", opcoes: [{ valor: "x", rotulo: "X" }] }),
      p("b", {
        titulo: "Mista",
        condicoes: [
          { pergunta: "a", em: ["x"] },
          { pergunta: "z", em: ["y"] }, // "z" não existe antes
        ],
      }),
    ]
    const { perguntas, condicoesRemovidas } = limparCondicoesOrfas(lista)
    expect(perguntas[1]!.condicoes).toEqual([{ pergunta: "a", em: ["x"] }])
    expect(condicoesRemovidas).toEqual(["Mista"])
  })
})

describe("candidatasParaCondicao", () => {
  it("oferece só perguntas ANTERIORES e com opções", () => {
    const lista = [
      p("texto_livre"),
      p("escolha_a", { tipo: "escolha", opcoes: [{ valor: "1", rotulo: "1" }] }),
      p("alvo"),
      p("escolha_b", { tipo: "escolha", opcoes: [{ valor: "2", rotulo: "2" }] }),
    ]
    // Para a pergunta de índice 2, só "escolha_a" serve: "texto_livre" não tem
    // opções e "escolha_b" vem depois.
    expect(candidatasParaCondicao(lista, 2).map((x) => x.id)).toEqual(["escolha_a"])
  })

  it("a primeira pergunta não tem candidatas", () => {
    expect(candidatasParaCondicao([p("a")], 0)).toEqual([])
  })
})

describe("novaPergunta / novaOpcao", () => {
  it("escolha nasce com uma opção — sem opção o parse recusa", () => {
    const nova = novaPergunta("escolha", "Como pretende pagar?", [])
    expect(nova.opcoes).toHaveLength(1)
    expect(() => parseFormSchema({ perguntas: [nova] })).not.toThrow()
  })

  it("texto não ganha opções", () => {
    expect(novaPergunta("texto", "Nome", []).opcoes).toBeUndefined()
    expect(aceitaOpcoes("texto")).toBe(false)
    expect(aceitaOpcoes("multipla")).toBe(true)
  })

  it("opção nova não colide com as existentes", () => {
    const existentes = [{ valor: "sim", rotulo: "Sim" }]
    expect(novaOpcao("Sim", existentes).valor).toBe("sim_2")
  })
})

describe("montarSchema", () => {
  it("produz schema que passa no parse, com agenda", () => {
    const s = montarSchema({
      perguntas: [
        novaPergunta("texto", "Nome", []),
        { ...novaPergunta("telefone", "WhatsApp", ["nome"]), campo_contato: "telefone" },
      ],
      mensagemFinal: "Obrigado!",
      agendaAtiva: true,
      agendaLocal: "Decorado Vind",
    })
    expect(() => parseFormSchema(s)).not.toThrow()
    expect(s.agenda).toEqual({ ativa: true, local: "Decorado Vind" })
    expect(s.mensagem_final).toBe("Obrigado!")
  })

  it("🔴 condição sem valor marcado é descartada, não vira erro técnico", () => {
    // A tela grava {pergunta, em: []} no instante em que o alvo é escolhido,
    // antes de marcar as opções. Salvar assim daria "condição 1: 'em' precisa
    // listar ao menos um valor" — correto e inútil para quem monta o formulário.
    const s = montarSchema({
      perguntas: [
        { id: "a", tipo: "escolha", titulo: "A", opcoes: [{ valor: "x", rotulo: "X" }] },
        { id: "b", tipo: "texto", titulo: "B", condicoes: [{ pergunta: "a", em: [] }] },
      ],
      mensagemFinal: "",
      agendaAtiva: false,
      agendaLocal: "",
    })
    expect(s.perguntas[1]!.condicoes).toBeUndefined()
    expect(() => parseFormSchema(s)).not.toThrow()
  })

  it("mantém a condição que TEM valor marcado", () => {
    const s = montarSchema({
      perguntas: [
        { id: "a", tipo: "escolha", titulo: "A", opcoes: [{ valor: "x", rotulo: "X" }] },
        { id: "b", tipo: "texto", titulo: "B", condicoes: [{ pergunta: "a", em: ["x"] }] },
      ],
      mensagemFinal: "",
      agendaAtiva: false,
      agendaLocal: "",
    })
    expect(s.perguntas[1]!.condicoes).toEqual([{ pergunta: "a", em: ["x"] }])
  })

  it("mensagem em branco não vira campo vazio", () => {
    const s = montarSchema({
      perguntas: [],
      mensagemFinal: "   ",
      agendaAtiva: false,
      agendaLocal: "",
    })
    expect(s.mensagem_final).toBeUndefined()
    expect(s.agenda).toEqual({ ativa: false })
  })
})
