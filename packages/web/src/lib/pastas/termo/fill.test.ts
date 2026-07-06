import { describe, it, expect } from "vitest"
import { writeFileSync } from "node:fs"
import { fillTermo } from "./fill"

const SAMPLE = {
  nome1: "Fulano de Tal da Silva",
  profissao: "Engenheiro",
  celular: "(44) 99999-0000",
  email: "fulano@exemplo.com",
  endereco: { logradouro: "Rua das Flores", numero: "123", complemento: "Ap 45", cidade: "Maringá", uf: "PR", cep: "87000-000" },
  conjuge: { nome: "Beltrana Souza", profissao: "Médica", celular: "(44) 98888-1111", email: "beltrana@exemplo.com" },
  corretor: "Carlos Corretor",
  imobiliaria: "Imob Exemplo",
  fluxoPagamento: "fluxo_30_70" as const,
  temPix: true,
  data: { dia: "06", mes: "07" },
}

describe("fillTermo (Story 75-127)", () => {
  it("gera um PDF válido (magic %PDF) e não lança", async () => {
    const bytes = await fillTermo(SAMPLE)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-")
    // grava p/ conferência visual (ignorado se path indisponível)
    try { writeFileSync("/tmp/termo_preenchido.pdf", Buffer.from(bytes)) } catch { /* noop */ }
  })

  it("campos vazios/null não quebram", async () => {
    const bytes = await fillTermo({ nome1: null, endereco: null, conjuge: null, temPix: false })
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-")
  })
})
