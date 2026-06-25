import { describe, it, expect } from "vitest"
import {
  computeProvenance,
  formatProvenanceBlock,
  STALENESS_THRESHOLD_HOURS,
  type ProvenanceQueryResult,
} from "../context-builder"

const HOUR = 60 * 60 * 1000
const NOW = new Date("2026-06-22T12:00:00.000Z")
const TODAY = "2026-06-22"

// Helper: monta um ProvenanceQueryResult com defaults preenchidos.
function input(overrides: Partial<ProvenanceQueryResult> = {}): ProvenanceQueryResult {
  return {
    maxSyncedAt: null,
    lastAccountSync: null,
    syncLog: null,
    ...overrides,
  }
}

describe("computeProvenance", () => {
  it("synced_at disponível e sync recente → bloco com dados, sem stale/erro", () => {
    const b = computeProvenance(
      input({
        maxSyncedAt: "2026-06-21T09:00:00.000Z",
        lastAccountSync: "2026-06-21T09:05:00.000Z",
        syncLog: { status: "success", finished_at: new Date(NOW.getTime() - 2 * HOUR).toISOString() },
      }),
      NOW,
    )
    expect(b.maxSyncedAt).toBe("2026-06-21T09:00:00.000Z")
    expect(b.hasSyncLog).toBe(true)
    expect(b.isStale).toBe(false)
    expect(b.isError).toBe(false)
    expect(b.lastSyncStatus).toBe("success")
  })

  it("maxSyncedAt NULL (sem dados na janela) → campo permanece null", () => {
    const b = computeProvenance(input({ maxSyncedAt: null }), NOW)
    expect(b.maxSyncedAt).toBeNull()
  })

  it("meta_sync_log vazio (null) → hasSyncLog false, sem stale/erro inventado", () => {
    const b = computeProvenance(input({ syncLog: null }), NOW)
    expect(b.hasSyncLog).toBe(false)
    expect(b.isStale).toBe(false)
    expect(b.isError).toBe(false)
    expect(b.lastSyncStatus).toBeNull()
    expect(b.lastSyncFinishedAt).toBeNull()
  })

  it("status = 'error' → isError true", () => {
    const b = computeProvenance(
      input({ syncLog: { status: "error", finished_at: new Date(NOW.getTime() - 1 * HOUR).toISOString(), error_message: "timeout" } }),
      NOW,
    )
    expect(b.isError).toBe(true)
    expect(b.lastSyncStatus).toBe("error")
  })

  it("finished_at com mais de 36h → isStale true", () => {
    const b = computeProvenance(
      input({ syncLog: { status: "success", finished_at: new Date(NOW.getTime() - (STALENESS_THRESHOLD_HOURS + 4) * HOUR).toISOString() } }),
      NOW,
    )
    expect(b.isStale).toBe(true)
  })

  it("finished_at com menos de 36h → isStale false", () => {
    const b = computeProvenance(
      input({ syncLog: { status: "success", finished_at: new Date(NOW.getTime() - (STALENESS_THRESHOLD_HOURS - 4) * HOUR).toISOString() } }),
      NOW,
    )
    expect(b.isStale).toBe(false)
  })

  it("finished_at null (ciclo running, sem término) → não marca stale sem evidência", () => {
    const b = computeProvenance(
      input({ syncLog: { status: "running", finished_at: null } }),
      NOW,
    )
    expect(b.isStale).toBe(false)
    expect(b.isError).toBe(false)
  })
})

describe("formatProvenanceBlock", () => {
  it("dado fresco → inclui data de coleta formatada (BR) e 'Dados defasados: não'", () => {
    const b = computeProvenance(
      input({
        // 2026-06-20T15:00Z == 12:00 (BRT) do dia 20/06/2026 — independe de DST
        maxSyncedAt: "2026-06-20T15:00:00.000Z",
        syncLog: { status: "success", finished_at: new Date(NOW.getTime() - 2 * HOUR).toISOString() },
      }),
      NOW,
    )
    const text = formatProvenanceBlock(b, TODAY)
    expect(text).toContain("[PROVENIÊNCIA DOS DADOS META ADS]")
    expect(text).toContain("Dados coletados da Meta API em: 20/06/2026")
    expect(text).toContain("Dados defasados (>36h): não")
    expect(text).toContain(`Data de montagem deste contexto: ${TODAY}`)
  })

  it("maxSyncedAt null → 'indisponível' (nunca inventa data)", () => {
    const b = computeProvenance(input({ maxSyncedAt: null }), NOW)
    const text = formatProvenanceBlock(b, TODAY)
    expect(text).toContain("Dados coletados da Meta API em: indisponível")
  })

  it("meta_sync_log vazio → 'Último ciclo de sincronização: recência indisponível'", () => {
    const b = computeProvenance(input({ syncLog: null }), NOW)
    const text = formatProvenanceBlock(b, TODAY)
    expect(text).toContain("Último ciclo de sincronização: recência indisponível")
  })

  it("status error → linha de atenção de ERRO presente", () => {
    const b = computeProvenance(
      input({ syncLog: { status: "error", finished_at: new Date(NOW.getTime() - 1 * HOUR).toISOString() } }),
      NOW,
    )
    const text = formatProvenanceBlock(b, TODAY)
    expect(text).toContain("terminou com ERRO")
  })

  it("dado defasado >36h → 'Dados defasados (>36h): sim'", () => {
    const b = computeProvenance(
      input({ syncLog: { status: "success", finished_at: new Date(NOW.getTime() - 40 * HOUR).toISOString() } }),
      NOW,
    )
    const text = formatProvenanceBlock(b, TODAY)
    expect(text).toContain("Dados defasados (>36h): sim")
  })
})

// ─── Story 76-4: proveniência no contexto de campanha específica ───────────────
// computeProvenance é a MESMA função pura usada pelo bloco de campanha; estes casos
// cobrem o input que `buildCampaignContext` monta (maxSyncedAt da campanha) sem
// precisar de mock de Supabase (a lógica de staleness/erro não muda por contexto).
describe("computeProvenance — contexto de campanha (Story 76-4)", () => {
  it("campanha com synced_at na janela → maxSyncedAt reflete a data DAQUELA campanha", () => {
    const b = computeProvenance(
      input({
        maxSyncedAt: "2026-06-20T15:00:00.000Z", // synced_at específico da campanha
        lastAccountSync: "2026-06-21T09:00:00.000Z",
        syncLog: { status: "success", finished_at: new Date(NOW.getTime() - 3 * HOUR).toISOString() },
      }),
      NOW,
    )
    expect(b.maxSyncedAt).toBe("2026-06-20T15:00:00.000Z")
    expect(b.isStale).toBe(false)
    const text = formatProvenanceBlock(b, TODAY)
    expect(text).toContain("[PROVENIÊNCIA DOS DADOS META ADS]")
    expect(text).toContain("Dados coletados da Meta API em: 20/06/2026")
  })

  it("campanha SEM synced_at na janela (nova/pausada) → 'indisponível' e isStale=false (AC5/NFR-OBS-1)", () => {
    // P1 da campanha retorna null (sem registros na janela) → maxSyncedAt null.
    // P3 (sync da org) pode existir e estar recente → não inventa data da campanha.
    const b = computeProvenance(
      input({
        maxSyncedAt: null,
        syncLog: { status: "success", finished_at: new Date(NOW.getTime() - 2 * HOUR).toISOString() },
      }),
      NOW,
    )
    expect(b.maxSyncedAt).toBeNull()
    expect(b.isStale).toBe(false)
    const text = formatProvenanceBlock(b, TODAY)
    expect(text).toContain("Dados coletados da Meta API em: indisponível")
  })

  it("staleness da campanha deriva do ciclo de sync da org (P3), coerente com o global (AC8)", () => {
    const b = computeProvenance(
      input({
        maxSyncedAt: "2026-06-19T12:00:00.000Z",
        syncLog: { status: "error", finished_at: new Date(NOW.getTime() - 48 * HOUR).toISOString(), error_message: "graph api 500" },
      }),
      NOW,
    )
    expect(b.isError).toBe(true)
    expect(b.isStale).toBe(true)
  })
})
