/**
 * Story 75-371 (@qa R3) — a tabela nunca mostra duas etapas padrão.
 */
import { describe, it, expect } from "vitest"
import { aplicarAtualizacaoDeEtapa } from "./aplicar-atualizacao-de-etapa"
import type { Stage } from "./types"

const etapa = (over: Partial<Stage>): Stage => ({
  id: "s-1",
  name: "Etapa",
  slug: "etapa",
  type: "novo",
  position: 0,
  color: null,
  is_default: false,
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
})

describe("aplicarAtualizacaoDeEtapa", () => {
  const base = [
    etapa({ id: "a", name: "Aguardando atendimento", position: 0, is_default: true }),
    etapa({ id: "b", name: "1º Contato", position: 3 }),
    etapa({ id: "c", name: "Follow-up", position: 18 }),
  ]

  it("marcar OUTRA etapa como padrão tira o padrão da anterior", () => {
    const depois = aplicarAtualizacaoDeEtapa(base, etapa({ ...base[2]!, is_default: true }))

    expect(depois.filter((s) => s.is_default).map((s) => s.id)).toEqual(["c"])
  })

  it("nunca sobra mais de uma padrão, que é a invariante da migration 250", () => {
    const depois = aplicarAtualizacaoDeEtapa(base, etapa({ ...base[1]!, is_default: true }))

    expect(depois.filter((s) => s.is_default)).toHaveLength(1)
  })

  it("editar campo que não é o padrão não mexe em quem é a padrão", () => {
    const depois = aplicarAtualizacaoDeEtapa(base, etapa({ ...base[2]!, name: "Follow-up 2" }))

    expect(depois.filter((s) => s.is_default).map((s) => s.id)).toEqual(["a"])
    expect(depois[2]!.name).toBe("Follow-up 2")
  })

  it("editar a PRÓPRIA etapa padrão a mantém padrão", () => {
    const depois = aplicarAtualizacaoDeEtapa(base, etapa({ ...base[0]!, color: "#000000" }))

    expect(depois.filter((s) => s.is_default).map((s) => s.id)).toEqual(["a"])
    expect(depois[0]!.color).toBe("#000000")
  })
})
