/**
 * Story 75-224 — Testes do webhook imoveis-sync (log persistido em webhook_logs).
 *
 * Cobre: assinatura inválida (401 + log com signature_valid=false), evento
 * ignorado (200 + processed=true), sucesso (processed=true + org_id) e
 * fail-safe (falha no insert do log não quebra o processamento).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHmac } from "crypto"

vi.hoisted(() => {
  process.env.IMOVEIS_SYNC_WEBHOOK_SECRET = "test-secret"
})

vi.mock("server-only", () => ({}))

// Estado configurável do banco mockado.
let logInserts: Record<string, unknown>[] = []
let logUpdates: { id: unknown; fields: Record<string, unknown> }[] = []
let logInsertFails = false
let propertyRow: Record<string, unknown> | null = { id: "prop-1", org_id: "org-1", name: "VIND Residence" }
let unitRow: Record<string, unknown> | null = { id: "unit-1", identifier: "301" }
let unitUpdates: Record<string, unknown>[] = []

function makeBuilder(table: string) {
  const state: { op: string | null; fields: Record<string, unknown> | null; eqs: [string, unknown][] } = {
    op: null,
    fields: null,
    eqs: [],
  }
  const builder: Record<string, unknown> = {
    insert: (fields: Record<string, unknown>) => {
      state.op = "insert"
      state.fields = fields
      return builder
    },
    update: (fields: Record<string, unknown>) => {
      state.op = "update"
      state.fields = fields
      return builder
    },
    select: () => builder,
    eq: (col: string, val: unknown) => {
      state.eqs.push([col, val])
      return builder
    },
    single: async () => {
      if (table === "webhook_logs" && state.op === "insert") {
        if (logInsertFails) throw new Error("db down")
        logInserts.push(state.fields!)
        return { data: { id: "log-1" }, error: null }
      }
      if (table === "properties") {
        return { data: propertyRow, error: propertyRow ? null : { message: "not found" } }
      }
      if (table === "units" && state.op === "update") {
        if (unitRow) unitUpdates.push(state.fields!)
        return { data: unitRow, error: unitRow ? null : { message: "not found" } }
      }
      return { data: null, error: null }
    },
    // updates de webhook_logs/properties e a contagem de units são awaited direto → thenable
    then: (resolve: (v: unknown) => void) => {
      if (table === "webhook_logs" && state.op === "update") {
        logUpdates.push({ id: state.eqs.find(([c]) => c === "id")?.[1], fields: state.fields! })
        return resolve({ data: null, error: null })
      }
      if (table === "units" && state.op === null) {
        return resolve({ count: 5, data: null, error: null })
      }
      return resolve({ data: null, error: null })
    },
  }
  return builder
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))

import { NextRequest } from "next/server"
import { POST } from "./route"

function sign(body: string): string {
  return `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`
}

function makeReq(body: string, signature?: string): NextRequest {
  return new NextRequest("https://crm.trifold.eng.br/api/webhooks/imoveis-sync", {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature-256": signature ?? sign(body) },
    body,
  })
}

const validPayload = {
  event: "unit.status_changed",
  timestamp: "2026-07-28T12:00:00Z",
  data: { unit_code: "301", property_slug: "vind-residence", status: "vendido" },
}

beforeEach(() => {
  logInserts = []
  logUpdates = []
  logInsertFails = false
  unitUpdates = []
  propertyRow = { id: "prop-1", org_id: "org-1", name: "VIND Residence" }
  unitRow = { id: "unit-1", identifier: "301" }
})

describe("POST /api/webhooks/imoveis-sync — log persistido", () => {
  it("assinatura inválida: 401, loga com signature_valid=false e processing_error", async () => {
    const body = JSON.stringify(validPayload)
    const res = await POST(makeReq(body, "sha256=deadbeef"))

    expect(res.status).toBe(401)
    expect(logInserts).toHaveLength(1)
    expect(logInserts[0]).toMatchObject({
      source: "imoveis_sync",
      event_type: "unit.status_changed",
      signature_valid: false,
      processed: false,
    })
    expect(logUpdates).toHaveLength(1)
    expect(logUpdates[0]?.fields).toMatchObject({ processing_error: "invalid_signature" })
    expect(unitUpdates).toHaveLength(0)
  })

  it("evento diferente de unit.status_changed: 200 e log processed=true (evento visível)", async () => {
    const body = JSON.stringify({ event: "tabela.publicada", data: {} })
    const res = await POST(makeReq(body))

    expect(res.status).toBe(200)
    expect(logInserts[0]).toMatchObject({ source: "imoveis_sync", event_type: "tabela.publicada", signature_valid: true })
    expect(logUpdates[0]?.fields).toMatchObject({ processed: true })
    expect(unitUpdates).toHaveLength(0)
  })

  it("sucesso: atualiza unidade e marca log processed=true com org_id do empreendimento", async () => {
    const body = JSON.stringify(validPayload)
    const res = await POST(makeReq(body))

    expect(res.status).toBe(200)
    expect(unitUpdates).toHaveLength(1)
    expect(unitUpdates[0]).toMatchObject({ status: "sold" })
    expect(logUpdates[0]?.fields).toMatchObject({ processed: true, org_id: "org-1" })
  })

  it("property não encontrada: 404 e processing_error property_not_found", async () => {
    propertyRow = null
    const body = JSON.stringify(validPayload)
    const res = await POST(makeReq(body))

    expect(res.status).toBe(404)
    expect(logUpdates[0]?.fields).toMatchObject({ processing_error: "property_not_found: vind-residence" })
  })

  it("fail-safe: falha no insert do log não impede o processamento do webhook", async () => {
    logInsertFails = true
    const body = JSON.stringify(validPayload)
    const res = await POST(makeReq(body))

    expect(res.status).toBe(200)
    expect(unitUpdates).toHaveLength(1)
    expect(logUpdates).toHaveLength(0)
  })
})
