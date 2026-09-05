import { describe, expect, it, vi } from "vitest"

// Story 75-372 (T6, contraprovas 3 e 4) — versão automatizada da medição feita à mão
// contra produção: com `?tamanho=M` o `total` caiu de 200 para 10; sem o parâmetro voltou
// a 200. O que decide isso é o select ser `!inner` SÓ quando o filtro existe. Sem
// `!inner`, o PostgREST faz left join e o `.eq` na coluna do embed não filtra nada —
// medido: `brindes_tipos.tamanho=eq.M` sem `!inner` devolveu os mesmos 200 registros.
// Este teste tranca as duas metades: a string do select e o argumento do `.eq`.
const calls: { select?: string; eqs: [string, unknown][] } = { eqs: [] }

function makeBuilder() {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.eq = (col: string, val: unknown) => {
    calls.eqs.push([col, val])
    return chain()
  }
  builder.ilike = chain
  builder.order = chain
  builder.range = chain
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 })
  return builder
}

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    error: null,
    appUser: { id: "u1", org_id: "org1" },
    supabase: {
      from: () => ({
        select: (cols: string) => {
          calls.select = cols
          return makeBuilder()
        },
      }),
    },
  }),
}))
vi.mock("@web/lib/permissions", () => ({ canAccess: async () => true }))

import { GET } from "./route"

describe("GET /api/brindes/destinatarios — select condicional", () => {
  it("🔴 com ?tamanho=M usa !inner e filtra a coluna do embed", async () => {
    calls.select = undefined
    calls.eqs = []
    await GET(new Request("http://x/api/brindes/destinatarios?tamanho=M") as never)
    expect(calls.select).toBe("*, brindes_tipos!inner(nome, tamanho, cor)")
    expect(calls.eqs).toContainEqual(["brindes_tipos.tamanho", "M"])
  })

  it("🔴 sem o parâmetro NÃO usa !inner e não filtra por tamanho", async () => {
    calls.select = undefined
    calls.eqs = []
    await GET(new Request("http://x/api/brindes/destinatarios") as never)
    expect(calls.select).toBe("*, brindes_tipos(nome, tamanho, cor)")
    expect(calls.eqs.map(([c]) => c)).not.toContain("brindes_tipos.tamanho")
  })
})
