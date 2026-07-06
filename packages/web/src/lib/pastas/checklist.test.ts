import { describe, it, expect } from "vitest"
import { buildDocSlots, buildInfoFields } from "./checklist"

describe("buildDocSlots (Story 75-104)", () => {
  it("PF solteiro (Story 75-125): sem comprovante de estado civil (3 docs)", () => {
    const d = buildDocSlots("pf", false)
    expect(d.map((x) => x.slug)).toEqual([
      "rg_cnh", "cpf", "comprovante_endereco",
    ])
    expect(d.some((x) => x.slug === "comprovante_estado_civil")).toBe(false)
    expect(d.every((x) => x.titular === "interessado")).toBe(true)
  })
  it("PF casado (Story 75-125): titular volta a ter comprovante de estado civil", () => {
    const d = buildDocSlots("pf", true)
    expect(d.some((x) => x.slug === "comprovante_estado_civil")).toBe(true)
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
  it("PIX (Story 75-123): injeta comprovante_pix ao final; sem PIX não aparece", () => {
    expect(buildDocSlots("pf", false).some((x) => x.slug === "comprovante_pix")).toBe(false)
    const pf = buildDocSlots("pf", false, true)
    expect(pf.at(-1)?.slug).toBe("comprovante_pix")
    expect(pf.at(-1)?.titular).toBe("interessado")
    const pj = buildDocSlots("pj", false, true)
    expect(pj.some((x) => x.slug === "comprovante_pix")).toBe(true)
  })
  it("União estável (Story 75-124): docs do parceiro + comprovante próprio", () => {
    const d = buildDocSlots("pf", false, false, true)
    // 4 docs do titular + 4 do parceiro (titular=conjuge) + comprovante de união estável
    expect(d.filter((x) => x.titular === "conjuge")).toHaveLength(4)
    expect(d.some((x) => x.slug === "comprovante_uniao_estavel")).toBe(true)
    // casado normal NÃO traz o comprovante de união estável
    expect(buildDocSlots("pf", true).some((x) => x.slug === "comprovante_uniao_estavel")).toBe(false)
    // solteiro NÃO traz docs do parceiro
    expect(buildDocSlots("pf", false, false, false).some((x) => x.titular === "conjuge")).toBe(false)
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
