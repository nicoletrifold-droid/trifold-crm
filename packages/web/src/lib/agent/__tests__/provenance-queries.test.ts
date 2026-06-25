import { describe, it, expect } from "vitest"
import { provenanceQueryBuilders, buildGlobalContext, buildCampaignContext } from "../context-builder"

// ─── Mock leve do Supabase client ─────────────────────────────────────────────
// Grava table/select/eq/gte/lte de cada query builder criado. Os 4 selects
// principais de buildGlobalContext são "awaited" diretamente (builder é thenable
// resolvendo { data: [] }); as 3 queries de proveniência terminam em maybeSingle()
// (Promise real → { data: null }). Espelha o uso real sem tocar a rede.

interface RecordedQuery {
  table: string
  select: string | null
  eqs: Array<[string, unknown]>
  gte: [string, unknown] | null
  lte: [string, unknown] | null
}

interface MockBuilder {
  select(cols: string): MockBuilder
  eq(col: string, val: unknown): MockBuilder
  gte(col: string, val: unknown): MockBuilder
  lte(col: string, val: unknown): MockBuilder
  in(col: string, vals: unknown[]): MockBuilder
  or(filter: string): MockBuilder
  order(col: string, opts?: unknown): MockBuilder
  limit(n: number): MockBuilder
  maybeSingle(): Promise<{ data: unknown; error: null }>
  then(onF: (r: { data: unknown[]; error: null }) => unknown): Promise<unknown>
}

/**
 * @param tableData   linhas retornadas por queries "awaited" (terminam em `.then`)
 * @param singleData  linhas retornadas por queries `.maybeSingle()`, por tabela.
 *                    A P1 de proveniência também usa `.maybeSingle()`; quando uma
 *                    tabela aparece tanto em P1 quanto em outra query single, o
 *                    valor é o mesmo — os testes que precisam diferenciar usam
 *                    `recorded` (filtros), não o retorno.
 */
function makeSupabaseMock(
  tableData: Record<string, unknown[]> = {},
  singleData: Record<string, unknown> = {},
) {
  const recorded: RecordedQuery[] = []
  const client = {
    from(table: string): MockBuilder {
      const rec: RecordedQuery = { table, select: null, eqs: [], gte: null, lte: null }
      recorded.push(rec)
      const builder: MockBuilder = {
        select(cols) { rec.select = cols; return builder },
        eq(col, val) { rec.eqs.push([col, val]); return builder },
        gte(col, val) { rec.gte = [col, val]; return builder },
        lte(col, val) { rec.lte = [col, val]; return builder },
        in() { return builder },
        or() { return builder },
        order() { return builder },
        limit() { return builder },
        maybeSingle() { return Promise.resolve({ data: singleData[table] ?? null, error: null }) },
        then(onF) { return Promise.resolve({ data: tableData[table] ?? [], error: null as null }).then(onF) },
      }
      return builder
    },
  }
  // Cast para o tipo do 1º parâmetro do helper sem depender de @supabase/supabase-js.
  return { client: client as unknown as Parameters<typeof provenanceQueryBuilders>[0], recorded }
}

const PROV_TABLES = ["meta_insights_daily", "meta_ad_accounts", "meta_sync_log"] as const

// ─── TEST-001 (76.1) — org_id scoping ─────────────────────────────────────────
describe("provenanceQueryBuilders — org_id scoping (TEST-001 / AC6)", () => {
  it("aplica .eq('org_id', orgId) nas 3 queries de proveniência", async () => {
    const { client, recorded } = makeSupabaseMock()
    await Promise.all(
      provenanceQueryBuilders(client, "org-abc", { startDate: "2026-06-01", endDate: "2026-06-23" }),
    )
    for (const table of PROV_TABLES) {
      const rec = recorded.find((r) => r.table === table)
      expect(rec, `query para ${table} não foi criada`).toBeTruthy()
      expect(rec!.eqs).toContainEqual(["org_id", "org-abc"])
    }
  })

  it("não vaza outro org_id — usa exatamente o orgId informado", async () => {
    const { client, recorded } = makeSupabaseMock()
    await Promise.all(
      provenanceQueryBuilders(client, "org-XYZ", { startDate: "2026-06-01", endDate: "2026-06-23" }),
    )
    const orgIdValues = recorded
      .flatMap((r) => r.eqs)
      .filter(([col]) => col === "org_id")
      .map(([, val]) => val)
    expect(orgIdValues).toHaveLength(3)
    expect(new Set(orgIdValues)).toEqual(new Set(["org-XYZ"]))
  })
})

// ─── TEST-002 (76.1) — casamento de janela ────────────────────────────────────
describe("provenanceQueryBuilders — janela na P1 (TEST-002 / AC2)", () => {
  it("aplica startDate/endDate como gte/lte de 'date' na P1 (MAX synced_at)", async () => {
    const { client, recorded } = makeSupabaseMock()
    await Promise.all(
      provenanceQueryBuilders(client, "org-abc", { startDate: "2026-05-01", endDate: "2026-05-15" }),
    )
    const p1 = recorded.find((r) => r.table === "meta_insights_daily")!
    expect(p1.gte).toEqual(["date", "2026-05-01"])
    expect(p1.lte).toEqual(["date", "2026-05-15"])
  })
})

describe("buildGlobalContext — contrato de casamento de janela (TEST-002 / AC2)", () => {
  it("a query de insights e a P1 de proveniência usam a MESMA janela", async () => {
    const { client, recorded } = makeSupabaseMock()
    const window = { startDate: "2026-04-01", endDate: "2026-04-30", label: "abril" }
    // orgId único para evitar hit no cache in-memory (key global:orgId:start:end).
    await buildGlobalContext(client, "org-window-contract", window)

    const insightsQ = recorded.find(
      (r) => r.table === "meta_insights_daily" && r.select?.includes("spend"),
    )
    const provQ = recorded.find(
      (r) => r.table === "meta_insights_daily" && r.select === "synced_at",
    )

    expect(insightsQ, "query de insights não encontrada").toBeTruthy()
    expect(provQ, "query P1 de proveniência não encontrada").toBeTruthy()
    expect(insightsQ!.gte).toEqual(["date", "2026-04-01"])
    expect(insightsQ!.lte).toEqual(["date", "2026-04-30"])
    // Contrato central: P1 herda EXATAMENTE a janela da query de insights.
    expect(provQ!.gte).toEqual(insightsQ!.gte)
    expect(provQ!.lte).toEqual(insightsQ!.lte)
  })

  it("todas as queries de buildGlobalContext filtram por org_id (AC6)", async () => {
    const { client, recorded } = makeSupabaseMock()
    await buildGlobalContext(client, "org-scope-contract", {
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    })
    for (const r of recorded) {
      expect(r.eqs, `query para ${r.table} sem filtro de org_id`).toContainEqual([
        "org_id",
        "org-scope-contract",
      ])
    }
  })
})

// ─── Story 76-4 — proveniência por campanha (entity_id) ───────────────────────
describe("provenanceQueryBuilders — filtro por entity_id (Story 76-4, AC4/AC7)", () => {
  it("com entityId → P1 aplica .eq('entity_id', entityId); P2/P3 NÃO", async () => {
    const { client, recorded } = makeSupabaseMock()
    await Promise.all(
      provenanceQueryBuilders(client, "org-abc", { startDate: "2026-06-01", endDate: "2026-06-30" }, "camp-123"),
    )
    const p1 = recorded.find((r) => r.table === "meta_insights_daily")!
    const p2 = recorded.find((r) => r.table === "meta_ad_accounts")!
    const p3 = recorded.find((r) => r.table === "meta_sync_log")!
    expect(p1.eqs).toContainEqual(["entity_id", "camp-123"])
    expect(p1.eqs).toContainEqual(["level", "campaign"])
    // P2/P3 são a nível de org — nunca filtram por entity_id
    expect(p2.eqs.map(([c]) => c)).not.toContain("entity_id")
    expect(p3.eqs.map(([c]) => c)).not.toContain("entity_id")
  })

  it("sem entityId (caso global) → P1 NÃO filtra por entity_id (backward-compat 76-1)", async () => {
    const { client, recorded } = makeSupabaseMock()
    await Promise.all(
      provenanceQueryBuilders(client, "org-abc", { startDate: "2026-06-01", endDate: "2026-06-30" }),
    )
    const p1 = recorded.find((r) => r.table === "meta_insights_daily")!
    expect(p1.eqs.map(([c]) => c)).not.toContain("entity_id")
    expect(p1.eqs).toContainEqual(["level", "campaign"])
  })
})

describe("buildCampaignContext — bloco de proveniência da campanha (Story 76-4)", () => {
  const CAMPAIGN_ROW = {
    name: "Lançamento Vind",
    status: "ACTIVE",
    objective: "LEAD_GENERATION",
    daily_budget: 5000,
    start_time: "2026-05-01",
  }

  it("injeta o bloco [PROVENIÊNCIA...] no header da campanha (AC3)", async () => {
    const { client } = makeSupabaseMock({}, { meta_campaigns: CAMPAIGN_ROW })
    const text = await buildCampaignContext(client, "org-prov-1", "camp-AC3")
    expect(text).toContain('CONTEXTO CAMPANHA: "Lançamento Vind"')
    expect(text).toContain("[PROVENIÊNCIA DOS DADOS META ADS]")
    // bloco vem ANTES da linha de Status (logo após o header, AC3)
    expect(text.indexOf("[PROVENIÊNCIA")).toBeLessThan(text.indexOf("Status:"))
  })

  it("P1 da proveniência usa a janela 30d da campanha E entity_id = metaCampaignId (AC4/AC7)", async () => {
    const today = new Date().toISOString().split("T")[0]!
    const date30dAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]! })()
    const { client, recorded } = makeSupabaseMock({}, { meta_campaigns: CAMPAIGN_ROW })
    await buildCampaignContext(client, "org-prov-2", "camp-window")

    // P1 de proveniência = a query de meta_insights_daily com select "synced_at"
    const provP1 = recorded.find(
      (r) => r.table === "meta_insights_daily" && r.select === "synced_at",
    )!
    expect(provP1, "P1 de proveniência não encontrada").toBeTruthy()
    expect(provP1.eqs).toContainEqual(["org_id", "org-prov-2"])
    expect(provP1.eqs).toContainEqual(["entity_id", "camp-window"])
    expect(provP1.gte).toEqual(["date", date30dAgo])
    expect(provP1.lte).toEqual(["date", today])
  })

  it("sem synced_at na janela → 'indisponível', sem inventar data (AC5)", async () => {
    // singleData não define synced_at p/ meta_insights_daily → P1 retorna null.
    const { client } = makeSupabaseMock({}, { meta_campaigns: CAMPAIGN_ROW })
    const text = await buildCampaignContext(client, "org-prov-3", "camp-empty")
    expect(text).toContain("Dados coletados da Meta API em: indisponível")
    expect(text).toContain("Dados defasados (>36h): não")
  })

  it("isolamento multi-tenant: todas as queries filtram pelo org_id informado (AC7)", async () => {
    const { client, recorded } = makeSupabaseMock({}, { meta_campaigns: CAMPAIGN_ROW })
    await buildCampaignContext(client, "org-tenant-iso", "camp-iso")
    for (const r of recorded) {
      expect(r.eqs, `query para ${r.table} sem filtro de org_id`).toContainEqual([
        "org_id",
        "org-tenant-iso",
      ])
    }
  })
})
