/**
 * Story 75-366 — pré-aviso do bolsão: a régua de quem entra na janela, quem
 * dispara mensagem nova e quantos minutos restam. O cron roda a cada 5 min, então
 * a janela [10, 15) é o que garante "avisar antes de cair" sem avisar duas vezes.
 */
import { describe, it, expect } from "vitest"
import {
  BOLSAO_REBALANCE_MIN,
  PRE_BOLSAO_AVISO_MIN,
  selecionarPreAviso,
  paramsPreAviso,
} from "./pre-aviso"

describe("selecionarPreAviso", () => {
  it("a janela é [10, 15): antes não é urgente, depois já caiu (é o toMove que cuida)", () => {
    const s = selecionarPreAviso(
      [
        { id: "cedo", elapsed: 9.9 },
        { id: "borda-entra", elapsed: 10 },
        { id: "meio", elapsed: 12.5 },
        { id: "borda-sai", elapsed: 15 },
        { id: "tarde", elapsed: 22 },
      ],
      new Set()
    )
    expect(s.naJanela.map((c) => c.id)).toEqual(["borda-entra", "meio"])
    expect(PRE_BOLSAO_AVISO_MIN).toBe(BOLSAO_REBALANCE_MIN - 5)
  })

  it("lead já avisado não dispara de novo, mas CONTINUA na contagem da mensagem", () => {
    const s = selecionarPreAviso(
      [
        { id: "velho", elapsed: 13 },
        { id: "novo", elapsed: 10.5 },
      ],
      new Set(["velho"])
    )
    expect(s.novos.map((c) => c.id)).toEqual(["novo"])
    // A mensagem diz o retrato real: 2 leads a caminho, não 1.
    expect(s.naJanela).toHaveLength(2)
  })

  it("sem lead novo na janela → nada dispara (novos vazio), mesmo com janela cheia", () => {
    const s = selecionarPreAviso([{ id: "velho", elapsed: 14 }], new Set(["velho"]))
    expect(s.novos).toHaveLength(0)
    expect(s.naJanela).toHaveLength(1)
  })

  it("minutosRestantes segue o MAIS URGENTE e nunca diz zero", () => {
    // 12 min decorridos → restam 3; 14,7 → restam 0,3, arredonda para o piso 1
    expect(selecionarPreAviso([{ id: "a", elapsed: 12 }], new Set()).minutosRestantes).toBe(3)
    expect(
      selecionarPreAviso(
        [
          { id: "a", elapsed: 10.2 },
          { id: "b", elapsed: 14.7 },
        ],
        new Set()
      ).minutosRestantes
    ).toBe(1)
    expect(selecionarPreAviso([], new Set()).minutosRestantes).toBeNull()
  })
})

describe("paramsPreAviso — ordem {{1}}=nome {{2}}=qtd {{3}}=min", () => {
  it("monta na ordem e converte números", () => {
    expect(paramsPreAviso("Joabe", 3, 4)).toEqual(["Joabe", "3", "4"])
  })

  it("nome vazio nunca vira variável vazia (75-356: derruba o template inteiro)", () => {
    expect(paramsPreAviso("", 1, 2)[0]).toBe("gerente")
    expect(paramsPreAviso("   ", 1, 2)[0]).toBe("gerente")
    expect(paramsPreAviso(null, 1, 2)[0]).toBe("gerente")
  })

  it("minutos quebrados arredondam com piso 1", () => {
    expect(paramsPreAviso("Joabe", 2, 0.4)[2]).toBe("1")
    expect(paramsPreAviso("Joabe", 2, 2.6)[2]).toBe("3")
  })
})
