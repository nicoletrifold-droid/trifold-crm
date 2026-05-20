import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEvent } from "@web/lib/logger"
import { STAGE_IDS } from "@trifold/shared"

export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const SUPREMO_API_TOKEN = process.env.SUPREMO_API_TOKEN
const SUPREMO_ORG_ID = process.env.SUPREMO_ORG_ID
const SUPREMO_BASE = "https://api.supremocrm.com.br/v1"

// Supremo etapa → Trifold stage_id
const ETAPA_TO_STAGE: Record<string, string> = {
  "3": STAGE_IDS.novo,
  "4": STAGE_IDS.fechou,
  "5": STAGE_IDS.perdido,
}

// Supremo nome_origem → lead_source enum
const SOURCE_MAP: Record<string, string> = {
  "facebook patrocinado": "meta_ads",
  "facebook": "meta_ads",
  "meta ads": "meta_ads",
  "instagram": "meta_ads",
  "instagram patrocinado": "meta_ads",
  "whatsapp": "whatsapp_organic",
  "whatsapp orgânico": "whatsapp_organic",
  "whatsapp click": "whatsapp_click_to_ad",
  "site": "website",
  "website": "website",
  "portal": "website",
  "indicação": "referral",
  "indicacao": "referral",
  "telegram": "telegram",
  "walk-in": "walk_in",
  "presencial": "walk_in",
  "balcão": "walk_in",
  "balcao": "walk_in",
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 11) return digits
  if (digits.length === 13 && digits.startsWith("55")) return digits.slice(2)
  if (digits.length === 10) return digits.slice(0, 2) + "9" + digits.slice(2)
  if (digits.length === 12 && digits.startsWith("55")) return digits.slice(2, 4) + "9" + digits.slice(4)
  if (digits.length === 9) return "44" + digits
  if (digits.length === 8) return "449" + digits
  return null
}

function mapSource(origin: string | null): string {
  if (!origin) return "other"
  return SOURCE_MAP[origin.toLowerCase().trim()] ?? "other"
}

interface SupremoLead {
  id: number
  nome_pessoa: string | null
  ddi_pessoa: string | null
  telefone_pessoa: string
  email_pessoa: string | null
  nome_origem: string | null
  nome_campanha: string | null
  etapa: string
  interesses: string | null
}

interface SupremoPage {
  data: SupremoLead[]
  total: number
  totalPaginas: number
}

async function fetchPage(page: number): Promise<SupremoPage> {
  const res = await fetch(`${SUPREMO_BASE}/leads?pagina=${page}`, {
    headers: { Authorization: `Bearer ${SUPREMO_API_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Supremo API ${res.status} on page ${page}`)
  return res.json()
}

async function fetchAllPages(totalPages: number): Promise<SupremoLead[]> {
  const leads: SupremoLead[] = []
  const BATCH = 5
  for (let i = 1; i <= totalPages; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, totalPages - i + 1) }, (_, j) => i + j)
    const results = await Promise.all(batch.map(fetchPage))
    for (const r of results) leads.push(...r.data)
  }
  return leads
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!SUPREMO_API_TOKEN || !SUPREMO_ORG_ID) {
    return NextResponse.json({ error: "SUPREMO_API_TOKEN or SUPREMO_ORG_ID not set" }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("mode") ?? "incremental"
  const startedAt = new Date().toISOString()
  const supabase = createAdminClient()

  let created = 0
  let updated = 0
  let skipped = 0
  let pagesFetched = 0
  let syncError: string | null = null

  try {
    // Determine which pages to fetch
    const firstPage = await fetchPage(1)
    pagesFetched++
    const totalPages = firstPage.totalPaginas

    let supremoLeads: SupremoLead[]
    if (mode === "full") {
      // Fetch remaining pages in parallel batches
      const remaining = totalPages > 1 ? await fetchAllPages(totalPages) : []
      pagesFetched += totalPages - 1
      supremoLeads = [...firstPage.data, ...remaining]
    } else {
      // Incremental: fetch first 5 pages (100 newest leads)
      const pages = Math.min(5, totalPages)
      if (pages > 1) {
        const rest = await fetchAllPages(pages)
        pagesFetched += pages - 1
        supremoLeads = [...firstPage.data, ...rest]
      } else {
        supremoLeads = firstPage.data
      }
    }

    // Load all existing org leads into memory for efficient lookup
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("id, phone, supremo_id, name, stage_id")
      .eq("org_id", SUPREMO_ORG_ID)

    type LeadRef = { id: string; supremo_id: number | null; stage_id: string | null; name: string | null }
    const bySupremoId = new Map<number, LeadRef>()
    const byPhone = new Map<string, LeadRef>()
    for (const l of existingLeads ?? []) {
      if (l.supremo_id) bySupremoId.set(l.supremo_id, l)
      byPhone.set(l.phone, l)
    }

    const toInsert: object[] = []
    const now = new Date().toISOString()

    for (const lead of supremoLeads) {
      try {
        const phone = normalizePhone(lead.telefone_pessoa)
        if (!phone) { skipped++; continue }

        const stageId = ETAPA_TO_STAGE[lead.etapa] ?? STAGE_IDS.novo
        const existing = bySupremoId.get(lead.id) ?? byPhone.get(phone) ?? null

        if (existing) {
          // Skip if stage and supremo_id are already up to date
          if (existing.supremo_id === lead.id && existing.stage_id === stageId) {
            skipped++
            continue
          }
          await supabase
            .from("leads")
            .update({
              supremo_id: lead.id,
              stage_id: stageId,
              supremo_synced_at: now,
              ...(!existing.name && lead.nome_pessoa ? { name: lead.nome_pessoa } : {}),
            })
            .eq("id", existing.id)
          // Update local maps so duplicates in this batch don't re-update
          bySupremoId.set(lead.id, { ...existing, supremo_id: lead.id, stage_id: stageId })
          updated++
        } else {
          toInsert.push({
            org_id: SUPREMO_ORG_ID,
            name: lead.nome_pessoa ?? null,
            phone,
            email: lead.email_pessoa?.toLowerCase().trim() ?? null,
            channel: "whatsapp",
            stage_id: stageId,
            source: mapSource(lead.nome_origem),
            utm_campaign: lead.nome_campanha ?? null,
            ai_summary: lead.interesses ?? null,
            is_active: lead.etapa !== "5",
            supremo_id: lead.id,
            supremo_synced_at: now,
          })
          // Add to map so we don't double-insert if same phone appears twice in the batch
          byPhone.set(phone, { id: "pending", supremo_id: lead.id, stage_id: stageId, name: lead.nome_pessoa ?? null })
        }
      } catch (leadErr) {
        skipped++
        logEvent({
          level: "error",
          category: "cron",
          event_type: "SUPREMO_SYNC_LEAD_ERROR",
          message: `Error processing supremo lead ${lead.id}`,
          metadata: { error: leadErr instanceof Error ? leadErr.message : "Unknown", supremoId: lead.id },
          org_id: SUPREMO_ORG_ID,
          source: "api/cron/supremo-sync",
        })
      }
    }

    // Batch insert new leads in chunks of 50
    const CHUNK = 50
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error: insertErr } = await supabase
        .from("leads")
        .insert(toInsert.slice(i, i + CHUNK))
      if (insertErr) {
        logEvent({
          level: "error",
          category: "cron",
          event_type: "SUPREMO_SYNC_INSERT_ERROR",
          message: insertErr.message,
          org_id: SUPREMO_ORG_ID,
          source: "api/cron/supremo-sync",
        })
        skipped += Math.min(CHUNK, toInsert.length - i)
      } else {
        created += Math.min(CHUNK, toInsert.length - i)
      }
    }
  } catch (err) {
    syncError = err instanceof Error ? err.message : "Unknown error"
    logEvent({
      level: "error",
      category: "cron",
      event_type: "SUPREMO_SYNC_ERROR",
      message: syncError,
      org_id: SUPREMO_ORG_ID ?? "unknown",
      source: "api/cron/supremo-sync",
    })
  }

  await supabase.from("supremo_sync_log").insert({
    org_id: SUPREMO_ORG_ID,
    mode,
    leads_created: created,
    leads_updated: updated,
    leads_skipped: skipped,
    pages_fetched: pagesFetched,
    error: syncError,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  })

  return NextResponse.json({ mode, created, updated, skipped, pages_fetched: pagesFetched, error: syncError })
}
