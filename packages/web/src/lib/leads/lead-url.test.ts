import { describe, expect, it } from "vitest"

import { leadDeepLink } from "./lead-url"

// Story 75-226 — deep link do lead segue o app do dono (SDR usa /dashboard).
describe("leadDeepLink", () => {
  const APP = "https://crm.trifold.eng.br"

  it("corretor → /broker/leads/{id}", () => {
    expect(leadDeepLink(APP, "broker", "lead-1")).toBe(`${APP}/broker/leads/lead-1`)
  })

  it("sdr → /dashboard/leads/{id}", () => {
    expect(leadDeepLink(APP, "sdr", "lead-1")).toBe(`${APP}/dashboard/leads/lead-1`)
  })

  it("fail-open: role desconhecido/ausente mantém a URL de corretor", () => {
    expect(leadDeepLink(APP, null, "lead-1")).toBe(`${APP}/broker/leads/lead-1`)
    expect(leadDeepLink(APP, undefined, "lead-1")).toBe(`${APP}/broker/leads/lead-1`)
    expect(leadDeepLink(APP, "gerente-comercial", "lead-1")).toBe(`${APP}/broker/leads/lead-1`)
  })
})
