import { describe, it, expect, vi } from "vitest"
import { fetchAllLeads, LEADS_PAGE_SIZE, type RangeableQuery } from "./fetch-all-leads"

// Story 75-269 — o teste que o @po pediu (R1): provar a lógica de paginação com
// um fake client, em vez de depender de volume real no banco (o dev tem drift
// grande e não serve de prova).

interface Row {
  id: number
}

/**
 * Fake de query PostgREST: devolve fatias de um total imaginário e registra
 * cada `.range()` recebido, para assertar quantas páginas foram pedidas.
 */
function fakeClient(total: number, pageSize = LEADS_PAGE_SIZE) {
  const calls: Array<[number, number]> = []
  const build = (): RangeableQuery<Row> => ({
    range(from: number, to: number) {
      calls.push([from, to])
      const rows: Row[] = []
      for (let i = from; i <= Math.min(to, total - 1); i++) rows.push({ id: i })
      return Promise.resolve({ data: rows, error: null })
    },
  })
  return { build, calls, pageSize }
}

describe("fetchAllLeads", () => {
  it("junta as 3 páginas de um total que passa do teto (1000+1000+137)", async () => {
    const { build, calls } = fakeClient(2137)
    const rows = await fetchAllLeads(build)

    expect(rows).toHaveLength(2137)
    expect(calls).toHaveLength(3)
    expect(calls[0]).toEqual([0, 999])
    expect(calls[1]).toEqual([1000, 1999])
    expect(calls[2]).toEqual([2000, 2999])
    // Sem duplicar nem furar: os ids são 0..2136, cada um uma vez.
    expect(new Set(rows.map((r) => r.id)).size).toBe(2137)
  })

  it("múltiplo EXATO do teto pede uma página extra e para (não faz laço infinito)", async () => {
    const { build, calls } = fakeClient(2000)
    const rows = await fetchAllLeads(build)

    expect(rows).toHaveLength(2000)
    // 2 páginas cheias + 1 vazia para descobrir que acabou.
    expect(calls).toHaveLength(3)
  })

  it("total abaixo do teto faz UMA chamada só (caso de hoje em prod: 612)", async () => {
    const { build, calls } = fakeClient(612)
    const rows = await fetchAllLeads(build)

    expect(rows).toHaveLength(612)
    expect(calls).toHaveLength(1)
  })

  it("zero linhas: uma chamada, lista vazia", async () => {
    const { build, calls } = fakeClient(0)
    expect(await fetchAllLeads(build)).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it("data null (PostgREST sem linhas) não explode", async () => {
    const build = (): RangeableQuery<Row> => ({
      range: () => Promise.resolve({ data: null, error: null }),
    })
    expect(await fetchAllLeads(build)).toEqual([])
  })

  it("propaga o erro do PostgREST em vez de devolver dado parcial", async () => {
    const build = (): RangeableQuery<Row> => ({
      range: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    })
    await expect(fetchAllLeads(build)).rejects.toEqual({ message: "boom" })
  })

  it("erro na SEGUNDA página também aborta — nunca entrega meia janela", async () => {
    let n = 0
    const build = (): RangeableQuery<Row> => ({
      range: (from: number, to: number) => {
        n++
        if (n === 1) {
          const rows: Row[] = []
          for (let i = from; i <= to; i++) rows.push({ id: i })
          return Promise.resolve({ data: rows, error: null })
        }
        return Promise.resolve({ data: null, error: { message: "falhou na 2a" } })
      },
    })
    await expect(fetchAllLeads(build)).rejects.toEqual({ message: "falhou na 2a" })
  })

  it("pageSize customizado é respeitado (usado só em teste)", async () => {
    const { build, calls } = fakeClient(25, 10)
    const rows = await fetchAllLeads(build, 10)

    expect(rows).toHaveLength(25)
    expect(calls).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ])
  })

  it("chama buildQuery uma vez POR PÁGINA (builder PostgREST não se reusa)", async () => {
    const inner = fakeClient(2137)
    const spy = vi.fn(inner.build)
    await fetchAllLeads(spy)
    expect(spy).toHaveBeenCalledTimes(3)
  })
})
