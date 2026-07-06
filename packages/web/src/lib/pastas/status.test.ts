import { describe, it, expect } from "vitest"
import { computePastaStatus } from "./status"

const doc = (slug: string, situacao: string, signed = false) => ({ slug, situacao, signed })

describe("computePastaStatus", () => {
  it("aguardando quando falta documento chegar", () => {
    const r = computePastaStatus([doc("rg_cnh", "deferido"), doc("cpf", "pendente")])
    expect(r.status).toBe("aguardando")
    expect(r).toMatchObject({ total: 2, entregues: 1, deferidos: 1 })
  })

  it("em_analise quando tudo entregue mas nem tudo deferido", () => {
    const r = computePastaStatus([doc("rg_cnh", "deferido"), doc("cpf", "entregue")])
    expect(r.status).toBe("em_analise")
    expect(r).toMatchObject({ total: 2, entregues: 2, deferidos: 1 })
  })

  it("em_analise quando tudo deferido mas Termo não assinado", () => {
    const r = computePastaStatus([
      doc("rg_cnh", "deferido"),
      doc("cpf", "deferido"),
      doc("termo_intencao", "deferido", false),
    ])
    expect(r.status).toBe("em_analise")
  })

  it("em_analise quando tudo deferido mas SEM Termo na pasta", () => {
    const r = computePastaStatus([doc("rg_cnh", "deferido"), doc("cpf", "deferido")])
    expect(r.status).toBe("em_analise")
  })

  it("concluida quando todos deferidos e Termo assinado", () => {
    const r = computePastaStatus([
      doc("rg_cnh", "deferido"),
      doc("cpf", "deferido"),
      doc("termo_intencao", "deferido", true),
    ])
    expect(r.status).toBe("concluida")
    expect(r).toMatchObject({ total: 3, entregues: 3, deferidos: 3 })
  })

  it("concluida mesmo se o Termo não estiver 'deferido', desde que assinado", () => {
    const r = computePastaStatus([
      doc("rg_cnh", "deferido"),
      doc("cpf", "deferido"),
      doc("termo_intencao", "entregue", true),
    ])
    expect(r.status).toBe("concluida")
  })

  it("aguardando (não concluída) quando não há documentos", () => {
    expect(computePastaStatus([]).status).toBe("aguardando")
  })
})
