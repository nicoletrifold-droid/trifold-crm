/**
 * Story 87-14 — AC4: a decisão da tela é uma função pura, e ela é testada.
 *
 * Este arquivo é a ÚNICA régua automatizada da superfície nesta story. O
 * componente que a consome não é testável aqui (sem `@testing-library`, `.test.tsx`
 * fora do `include` do vitest — AC8), então a conferência do JSX é humana e está
 * numerada. O que dá para blindar por teste é a decisão, e é o que segue.
 */
import { describe, it, expect } from "vitest"
import { estadoSwitchNicole, MOTIVO_SEM_PERMISSAO } from "./nicole-switch"

describe("AC4 — estadoSwitchNicole", () => {
  it("(i) as 4 combinações: `interativo === podeAtivar`, e `motivo` é não-nulo EXATAMENTE quando não é interativo", () => {
    const combinacoes = [
      { nicoleEnabled: false, podeAtivar: false },
      { nicoleEnabled: false, podeAtivar: true },
      { nicoleEnabled: true, podeAtivar: false },
      { nicoleEnabled: true, podeAtivar: true },
    ] as const

    for (const c of combinacoes) {
      const rotulo = `${c.nicoleEnabled}/${c.podeAtivar}`
      const estado = estadoSwitchNicole({ ...c, nome: "Yarden" })

      expect(estado.interativo, rotulo).toBe(c.podeAtivar)
      expect(estado.ligado, rotulo).toBe(c.nicoleEnabled)

      // 🔴 Os DOIS lados. Um `expect(motivo).toBeTruthy()` sozinho passaria com
      // `motivo` sempre preenchido — e aí a régua não separaria nada.
      if (estado.interativo) {
        expect(estado.motivo, rotulo).toBeNull()
      } else {
        expect(estado.motivo, rotulo).toBe(MOTIVO_SEM_PERMISSAO)
      }
    }
  })

  it("(ii) `rotulo` é EXATAMENTE o texto que já está em produção no badge da lista", () => {
    // Um teste de string literal aqui é barato e impede que um refactor renomeie
    // o badge sem querer. Com a D2 (quem não pode continua vendo o estado), este
    // rótulo é o que 20 das 24 pessoas ativas leem na tela.
    expect(estadoSwitchNicole({ nicoleEnabled: true, podeAtivar: true, nome: "Yarden" }).rotulo).toBe(
      "Nicole: ligada"
    )
    expect(estadoSwitchNicole({ nicoleEnabled: false, podeAtivar: true, nome: "Yarden" }).rotulo).toBe(
      "Nicole: desligada"
    )
    // E o rótulo NÃO depende da permissão — some o controle, não a informação.
    expect(estadoSwitchNicole({ nicoleEnabled: true, podeAtivar: false, nome: "Yarden" }).rotulo).toBe(
      "Nicole: ligada"
    )
    expect(estadoSwitchNicole({ nicoleEnabled: false, podeAtivar: false, nome: "Yarden" }).rotulo).toBe(
      "Nicole: desligada"
    )
  })

  it("(iii) `textoConfirmacao` deriva da DIREÇÃO do clique, nas duas direções, com o nome interpolado", () => {
    // Igualdade de string, com o `nome` dentro: um texto fixo ("Confirmar?")
    // passaria em qualquer asserção mais frouxa.
    expect(
      estadoSwitchNicole({ nicoleEnabled: false, podeAtivar: true, nome: "Yarden" }).textoConfirmacao
    ).toBe("Ligar a Nicole no Yarden?")

    expect(
      estadoSwitchNicole({ nicoleEnabled: true, podeAtivar: true, nome: "Yarden" }).textoConfirmacao
    ).toBe("Desligar a Nicole no Yarden?")

    // O nome é interpolado de verdade, não decorativo.
    expect(
      estadoSwitchNicole({ nicoleEnabled: true, podeAtivar: true, nome: "Vind Residence" })
        .textoConfirmacao
    ).toBe("Desligar a Nicole no Vind Residence?")
  })
})
