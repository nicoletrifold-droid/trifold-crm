import { describe, it, expect } from "vitest"
import {
  MARKETING_POST_ROLES,
  canTransitionMarketingPost,
  isMarketingPostEditable,
  validateMarketingPostInput,
} from "./posts"

describe("canTransitionMarketingPost — matriz de transições (Story 75-219)", () => {
  it("permite sugerido → aprovado e sugerido → rejeitado", () => {
    expect(canTransitionMarketingPost("sugerido", "aprovado")).toBe(true)
    expect(canTransitionMarketingPost("sugerido", "rejeitado")).toBe(true)
  })

  it("permite aprovado → publicado", () => {
    expect(canTransitionMarketingPost("aprovado", "publicado")).toBe(true)
  })

  it("bloqueia sugerido → publicado (pular aprovação)", () => {
    expect(canTransitionMarketingPost("sugerido", "publicado")).toBe(false)
  })

  it("rejeitado e publicado são terminais", () => {
    for (const to of ["sugerido", "aprovado", "rejeitado", "publicado"]) {
      expect(canTransitionMarketingPost("rejeitado", to)).toBe(false)
      expect(canTransitionMarketingPost("publicado", to)).toBe(false)
    }
  })

  it("bloqueia regressões e estados desconhecidos", () => {
    expect(canTransitionMarketingPost("aprovado", "sugerido")).toBe(false)
    expect(canTransitionMarketingPost("aprovado", "rejeitado")).toBe(false)
    expect(canTransitionMarketingPost("inexistente", "aprovado")).toBe(false)
    expect(canTransitionMarketingPost("sugerido", "inexistente")).toBe(false)
  })
})

describe("isMarketingPostEditable", () => {
  it("permite edição em sugerido e aprovado; bloqueia terminais", () => {
    expect(isMarketingPostEditable("sugerido")).toBe(true)
    expect(isMarketingPostEditable("aprovado")).toBe(true)
    expect(isMarketingPostEditable("rejeitado")).toBe(false)
    expect(isMarketingPostEditable("publicado")).toBe(false)
  })
})

describe("MARKETING_POST_ROLES — gate da aba (AC2)", () => {
  it("só admin e supervisor têm acesso", () => {
    expect([...MARKETING_POST_ROLES]).toEqual(["admin", "supervisor"])
    for (const role of ["broker", "gerente-comercial", "sdr", "obras", "imob"]) {
      expect((MARKETING_POST_ROLES as readonly string[]).includes(role)).toBe(false)
    }
  })
})

describe("validateMarketingPostInput", () => {
  const valid = {
    empreendimento_id: "5f0e6b1c-1111-4222-8333-444455556666",
    canal: "instagram",
    copy: "Post de teste",
    arte_url: "https://www.canva.com/design/abc",
    scheduled_for: "2026-08-01",
  }

  it("aceita corpo completo válido (partial=false)", () => {
    const r = validateMarketingPostInput(valid, { partial: false })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.canal).toBe("instagram")
      expect(r.value.scheduled_for).toBe("2026-08-01")
    }
  })

  it("exige canal e copy quando partial=false", () => {
    expect(validateMarketingPostInput({ copy: "x" }, { partial: false }).ok).toBe(false)
    expect(validateMarketingPostInput({ canal: "facebook" }, { partial: false }).ok).toBe(false)
  })

  it("aceita empreendimento_id null (post institucional) e normaliza vazio", () => {
    const r = validateMarketingPostInput(
      { ...valid, empreendimento_id: "" },
      { partial: false }
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.empreendimento_id).toBeNull()
  })

  it("rejeita canal inválido e data malformada", () => {
    expect(
      validateMarketingPostInput({ ...valid, canal: "stories" }, { partial: false }).ok
    ).toBe(false)
    expect(
      validateMarketingPostInput({ ...valid, scheduled_for: "01/08/2026" }, { partial: false }).ok
    ).toBe(false)
  })

  it("partial=true valida só os campos presentes", () => {
    const r = validateMarketingPostInput({ copy: "Nova copy" }, { partial: true })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toEqual({ copy: "Nova copy" })
    }
    expect(validateMarketingPostInput({ copy: "  " }, { partial: true }).ok).toBe(false)
  })

  it("rejeita corpo não-objeto", () => {
    expect(validateMarketingPostInput(null, { partial: false }).ok).toBe(false)
    expect(validateMarketingPostInput("x", { partial: true }).ok).toBe(false)
  })
})
