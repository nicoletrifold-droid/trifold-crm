import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { escolherVinculoPorLead, fetchImobiliariaNomePorLead } from "./lead-imobiliaria"

describe("escolherVinculoPorLead (pipeline IMOB)", () => {
  it("usa o agendamento MAIS RECENTE que conhece a parceira", () => {
    // rows já vêm ordenados do mais recente p/ o mais antigo (como a query).
    const m = escolherVinculoPorLead([
      { lead_id: "lead-1", imobiliaria_id: "imob-nova", metadata: null },
      { lead_id: "lead-1", imobiliaria_id: "imob-antiga", metadata: null },
    ])
    expect(m.get("lead-1")?.imobiliariaId).toBe("imob-nova")
  })

  it("ignora agendamento sem parceira e segue para o próximo", () => {
    const m = escolherVinculoPorLead([
      { lead_id: "lead-1", imobiliaria_id: null, metadata: { origem: "interno" } },
      { lead_id: "lead-1", imobiliaria_id: "imob-1", metadata: null },
    ])
    expect(m.get("lead-1")?.imobiliariaId).toBe("imob-1")
  })

  it("aceita metadata.imobiliaria_nome como fallback (appointment sem FK)", () => {
    const m = escolherVinculoPorLead([
      { lead_id: "lead-1", imobiliaria_id: null, metadata: { imobiliaria_nome: " Barak Imóveis " } },
    ])
    expect(m.get("lead-1")).toEqual({ imobiliariaId: null, nomeMetadata: "Barak Imóveis" })
  })

  it("lead sem nenhum agendamento com parceira fica fora do mapa", () => {
    const m = escolherVinculoPorLead([{ lead_id: "lead-1", imobiliaria_id: null, metadata: {} }])
    expect(m.has("lead-1")).toBe(false)
  })
})

// Fake mínimo do client: encadeia os métodos e devolve `rows` da tabela pedida.
function fakeAdmin(rows: Record<string, unknown[]>, calls: string[] = []) {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const self = () => q
    for (const m of ["eq", "in", "order"]) q[m] = self
    // `then` faz o await resolver com { data }
    ;(q as { then: unknown }).then = (resolve: (v: { data: unknown[] }) => void) =>
      resolve({ data: rows[table] ?? [] })
    return q
  }
  return {
    from: (table: string) => {
      calls.push(table)
      return { select: () => chain(table) }
    },
  } as unknown as SupabaseClient
}

describe("fetchImobiliariaNomePorLead (pipeline IMOB)", () => {
  it("resolve o nome pela TABELA imobiliarias (não pelo metadata)", async () => {
    const admin = fakeAdmin({
      appointments: [{ lead_id: "lead-1", imobiliaria_id: "imob-1", metadata: { imobiliaria_nome: "Nome Velho" } }],
      imobiliarias: [{ id: "imob-1", nome: "Barak Imóveis" }],
    })
    const m = await fetchImobiliariaNomePorLead(admin, "org-1", ["lead-1"])
    expect(m.get("lead-1")).toBe("Barak Imóveis")
  })

  it("cai no metadata quando o agendamento não tem FK da imobiliária", async () => {
    const admin = fakeAdmin({
      appointments: [{ lead_id: "lead-1", imobiliaria_id: null, metadata: { imobiliaria_nome: "Patrimônio" } }],
      imobiliarias: [],
    })
    const m = await fetchImobiliariaNomePorLead(admin, "org-1", ["lead-1"])
    expect(m.get("lead-1")).toBe("Patrimônio")
  })

  it("sem leadIds não toca no banco", async () => {
    const calls: string[] = []
    const admin = fakeAdmin({}, calls)
    const m = await fetchImobiliariaNomePorLead(admin, "org-1", [])
    expect(m.size).toBe(0)
    expect(calls).toEqual([])
  })

  it("nenhum agendamento com parceira → mapa vazio, sem consultar imobiliarias", async () => {
    const calls: string[] = []
    const admin = fakeAdmin({ appointments: [{ lead_id: "lead-1", imobiliaria_id: null, metadata: {} }] }, calls)
    const m = await fetchImobiliariaNomePorLead(admin, "org-1", ["lead-1"])
    expect(m.size).toBe(0)
    expect(calls).toEqual(["appointments"])
  })
})
