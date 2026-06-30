import { describe, it, expect } from "vitest"
import { actionFromIdentify } from "./route-inbound"
import type { IdentifyClientResult, ClienteMatch } from "./identify-client"

const cliente: ClienteMatch = { cliente_id: "c1", nome: "Fulano", obras: [] }

describe("actionFromIdentify", () => {
  it("phone_match → route", () => {
    const r: IdentifyClientResult = { status: "phone_match", candidates: [cliente] }
    expect(actionFromIdentify(r)).toBe("route")
  })

  it("none → mark_checked (não re-checar)", () => {
    expect(actionFromIdentify({ status: "none", candidates: [] })).toBe("mark_checked")
  })

  it("name_match → skip (76-3 trata; não marca checked)", () => {
    expect(actionFromIdentify({ status: "name_match", candidates: [cliente] })).toBe("skip")
  })

  it("ambiguous → skip (76-3 trata)", () => {
    expect(actionFromIdentify({ status: "ambiguous", candidates: [cliente, cliente] })).toBe("skip")
  })
})
