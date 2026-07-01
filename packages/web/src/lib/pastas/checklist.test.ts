import { describe, it, expect } from "vitest"
import { buildDocSlots, buildInfoFields } from "./checklist"

describe("buildDocSlots (Story 75-104)", () => {
  it("PF solteiro: 4 docs do titular", () => {
    const d = buildDocSlots("pf", false)
    expect(d.map((x) => x.slug)).toEqual([
      "rg_cnh", "cpf", "comprovante_estado_civil", "comprovante_endereco",
    ])
    expect(d.every((x) => x.titular === "interessado")).toBe(true)
  })
  it("PF casado: 4 do titular + 4 do cônjuge", () => {
    const d = buildDocSlots("pf", true)
    expect(d).toHaveLength(8)
    expect(d.filter((x) => x.titular === "conjuge")).toHaveLength(4)
    expect(d.some((x) => x.slug === "rg_cnh_conjuge")).toBe(true)
  })
  it("PJ: contrato social + 4 docs do representante (casado é ignorado)", () => {
    const d = buildDocSlots("pj", true)
    expect(d.some((x) => x.slug === "contrato_social")).toBe(true)
    expect(d.filter((x) => x.titular === "representante")).toHaveLength(4)
    expect(d.some((x) => x.titular === "conjuge")).toBe(false)
  })
})

describe("buildInfoFields", () => {
  it("PF solteiro: profissão/email/celular do titular", () => {
    expect(buildInfoFields("pf", false).map((f) => f.key)).toEqual([
      "profissao", "email", "celular",
    ])
  })
  it("PF casado: dobra p/ cônjuge", () => {
    expect(buildInfoFields("pf", true)).toHaveLength(6)
  })
  it("PJ: infos do representante", () => {
    expect(buildInfoFields("pj", false).map((f) => f.key)).toEqual([
      "profissao_representante", "email_representante", "celular_representante",
    ])
  })
})
