import { describe, it, expect } from "vitest"
import { validateImobiliaria } from "./imobiliarias"

describe("validateImobiliaria (Story 75-92)", () => {
  it("exige nome na criação", () => {
    const r = validateImobiliaria({ cidade: "SP" })
    expect(r.ok).toBe(false)
  })

  it("aceita e trima o nome; normaliza texto vazio p/ null", () => {
    const r = validateImobiliaria({ nome: "  Imob X  ", cidade: "  ", gerente_nome: "Ana" })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.nome).toBe("Imob X")
      expect(r.value.cidade).toBeNull()
      expect(r.value.gerente_nome).toBe("Ana")
    }
  })

  it("nunca deixa passar org_id/id/created_by do body", () => {
    const r = validateImobiliaria({ nome: "X", org_id: "hack", id: "hack", created_by: "hack" })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.org_id).toBeUndefined()
      expect(r.value.id).toBeUndefined()
      expect(r.value.created_by).toBeUndefined()
    }
  })

  it("num_corretores: inteiro ≥ 0, vazio→null, inválido→erro", () => {
    expect((validateImobiliaria({ nome: "X", num_corretores: 12 }) as { value: Record<string, unknown> }).value.num_corretores).toBe(12)
    expect((validateImobiliaria({ nome: "X", num_corretores: "" }) as { value: Record<string, unknown> }).value.num_corretores).toBeNull()
    expect(validateImobiliaria({ nome: "X", num_corretores: -1 }).ok).toBe(false)
    expect(validateImobiliaria({ nome: "X", num_corretores: 1.5 }).ok).toBe(false)
  })

  it("status: só aceita o enum", () => {
    expect(validateImobiliaria({ nome: "X", status: "ativo" }).ok).toBe(true)
    expect(validateImobiliaria({ nome: "X", status: "banido" }).ok).toBe(false)
  })

  it("partial (PATCH): não exige nome, mas rejeita nome vazio se enviado", () => {
    expect(validateImobiliaria({ status: "inativo" }, { partial: true }).ok).toBe(true)
    expect(validateImobiliaria({ nome: "   " }, { partial: true }).ok).toBe(false)
  })

  // Story 75-96 — sócio, contatos do gerente e tipo de produto
  it("aceita e trima os campos de sócio e contatos do gerente", () => {
    const r = validateImobiliaria({
      nome: "X", socio_nome: " Dono ", socio_telefone: " 11 ", socio_email: "",
      gerente_telefone: "22", gerente_email: " g@x.com ",
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.socio_nome).toBe("Dono")
      expect(r.value.socio_telefone).toBe("11")
      expect(r.value.socio_email).toBeNull()
      expect(r.value.gerente_email).toBe("g@x.com")
    }
  })

  it("tipos_produto: aceita keys válidas e dedup", () => {
    const r = validateImobiliaria({ nome: "X", tipos_produto: ["mcmv", "alto_padrao", "mcmv"] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.tipos_produto).toEqual(["mcmv", "alto_padrao"])
  })

  it("tipos_produto: rejeita key inválida e não-array", () => {
    expect(validateImobiliaria({ nome: "X", tipos_produto: ["mcmv", "luxo"] }).ok).toBe(false)
    expect(validateImobiliaria({ nome: "X", tipos_produto: "mcmv" }).ok).toBe(false)
  })

  // Story 75-97 — engajamento
  it("engajamento: aceita key válida; vazio→null; inválido→erro", () => {
    expect((validateImobiliaria({ nome: "X", engajamento: "alta" }) as { value: Record<string, unknown> }).value.engajamento).toBe("alta")
    expect((validateImobiliaria({ nome: "X", engajamento: "" }) as { value: Record<string, unknown> }).value.engajamento).toBeNull()
    expect(validateImobiliaria({ nome: "X", engajamento: "super" }).ok).toBe(false)
  })
})
