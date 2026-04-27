/**
 * One-shot backfill: recupera leads históricos da Meta Lead Forms API.
 * Usage: npx tsx scripts/meta-backfill-leads.ts --form-id=xxx --from=2026-01-01 [--to=2026-04-24] [--dry-run] [--org-id=xxx]
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"
import { metaFetch, MetaOAuthException } from "../packages/shared/src/meta/client"
import type { MetaPagedResponse, MetaLeadRecord } from "../packages/shared/src/meta/types"

// ─── Env ──────────────────────────────────────────────────────────────────────

const envPath = resolve(__dirname, "../packages/web/.env.local")
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match && !process.env[match[1].trim()]) {
    process.env[match[1].trim()] = match[2].trim()
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const supabase = createClient(
  supabaseUrl!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const META_TOKEN = process.env.META_PAGE_ACCESS_TOKEN ?? ""

// ─── CLI args ─────────────────────────────────────────────────────────────────

function getArg(name: string): string | null {
  const prefix = `--${name}=`
  const arg = process.argv.find((a) => a.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

const formId = getArg("form-id")
const fromArg = getArg("from")
const toArg = getArg("to")
const orgIdArg = getArg("org-id")
const dryRun = hasFlag("dry-run")

if (!formId) {
  console.error("Erro: --form-id é obrigatório")
  process.exit(1)
}
if (!fromArg) {
  console.error("Erro: --from é obrigatório (formato YYYY-MM-DD)")
  process.exit(1)
}

const fromDate = new Date(fromArg + "T00:00:00Z")
const toDate = toArg ? new Date(toArg + "T23:59:59Z") : new Date()

if (isNaN(fromDate.getTime())) {
  console.error("Erro: --from inválido, use YYYY-MM-DD")
  process.exit(1)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveOrgId(): Promise<string | null> {
  if (orgIdArg) return orgIdArg

  const { data: fromMeta } = await supabase
    .from("meta_ad_accounts")
    .select("org_id")
    .eq("status", "active")
    .limit(1)
    .single()

  if (fromMeta?.org_id) return fromMeta.org_id

  const { data: fromWa } = await supabase
    .from("whatsapp_config")
    .select("org_id")
    .eq("status", "active")
    .limit(1)
    .single()

  return fromWa?.org_id ?? null
}

async function getDefaultStageId(orgId: string): Promise<string> {
  const { data } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .single()

  if (data?.id) return data.id

  const { data: first } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .order("position", { ascending: true })
    .limit(1)
    .single()

  return first?.id ?? "00000000-0000-0000-0001-000000000001"
}

function buildChunks(from: Date, to: Date): Array<[Date, Date]> {
  const chunks: Array<[Date, Date]> = []
  let cursor = new Date(from)
  while (cursor < to) {
    const end = new Date(Math.min(cursor.getTime() + 7 * 86400000, to.getTime()))
    chunks.push([new Date(cursor), end])
    cursor = end
  }
  return chunks
}

function getField(
  fieldData: Array<{ name: string; values: string[] }>,
  name: string
): string | null {
  const field = fieldData.find(
    (f) =>
      f.name.toLowerCase() === name.toLowerCase() ||
      f.name.toLowerCase().includes(name.toLowerCase())
  )
  return field?.values?.[0] ?? null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const stats = {
  chunks: 0,
  fetched: 0,
  created: 0,
  skipped: 0,
  errors: 0,
}

// ─── Core ─────────────────────────────────────────────────────────────────────

async function fetchChunk(
  since: number,
  until: number
): Promise<MetaLeadRecord[]> {
  const records: MetaLeadRecord[] = []
  let cursor: string | undefined

  while (true) {
    const params: Record<string, string> = {
      fields: "id,field_data,created_time,ad_id,adgroup_id,campaign_id",
      since: String(since),
      until: String(until),
      limit: "100",
    }
    if (cursor) params.after = cursor

    const page = await metaFetch<MetaPagedResponse<MetaLeadRecord>>(
      `${formId}/leads`,
      META_TOKEN,
      { params }
    )

    records.push(...(page.data ?? []))

    if (!page.paging?.next) break
    cursor = page.paging.cursors?.after
    if (!cursor) break
  }

  return records
}

async function processLead(
  lead: MetaLeadRecord,
  orgId: string,
  stageId: string
): Promise<"created" | "skipped" | "error"> {
  try {
    // AC3: dedup por leadgen_id
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("metadata->>leadgen_id", lead.id)
      .maybeSingle()

    if (existing) return "skipped"

    const name =
      getField(lead.field_data, "full_name") ?? getField(lead.field_data, "name")
    const email = getField(lead.field_data, "email")
    const phone =
      getField(lead.field_data, "phone_number") ?? getField(lead.field_data, "phone")

    const metadata = {
      leadgen_id: lead.id,
      form_id: formId,
      ad_id: lead.ad_id ?? null,
      ad_group_id: lead.adgroup_id ?? null,
      campaign_id: lead.campaign_id ?? null,
      field_data: lead.field_data,
      backfill: true,
    }

    if (dryRun) {
      console.log(`[DRY-RUN] Criaria lead: name=${name ?? "?"} email=${email ?? "?"} phone=${phone ?? "?"} leadgen_id=${lead.id}`)
      return "created"
    }

    const { data: newLead, error: insertErr } = await supabase
      .from("leads")
      .insert({
        org_id: orgId,
        name: name ?? null,
        email: email ?? null,
        phone: phone ?? null,
        channel: "meta_ads",
        source: "meta_ads",
        stage_id: stageId,
        utm_source: "meta_ads",
        metadata,
      })
      .select("id")
      .single()

    if (insertErr || !newLead?.id) {
      console.error(`[ERROR] leadgen_id=${lead.id} — ${insertErr?.message ?? "insert failed"}`)
      return "error"
    }

    await supabase.from("activities").insert({
      org_id: orgId,
      lead_id: newLead.id,
      type: "lead_created",
      description: "Lead importado via backfill Meta Ads",
      metadata: {
        source: "meta_ads",
        leadgen_id: lead.id,
        form_id: formId,
        backfill: true,
      },
    })

    return "created"
  } catch (err) {
    console.error(`[ERROR] leadgen_id=${lead.id} — ${err instanceof Error ? err.message : String(err)}`)
    return "error"
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (dryRun) console.log("[DRY-RUN] Modo simulação — nenhuma gravação será feita\n")

  const orgId = await resolveOrgId()
  if (!orgId) {
    console.error("Erro: nenhuma org ativa encontrada (meta_ad_accounts ou whatsapp_config)")
    process.exit(1)
  }

  console.log(`Org ID: ${orgId}`)
  console.log(`Form ID: ${formId}`)
  console.log(`Período: ${fromDate.toISOString().split("T")[0]} → ${toDate.toISOString().split("T")[0]}\n`)

  const stageId = await getDefaultStageId(orgId)
  const chunks = buildChunks(fromDate, toDate)

  for (let i = 0; i < chunks.length; i++) {
    const [start, end] = chunks[i]
    const sinceUnix = Math.floor(start.getTime() / 1000)
    const untilUnix = Math.floor(end.getTime() / 1000)
    const label = `${start.toISOString().split("T")[0]}→${end.toISOString().split("T")[0]}`

    let fetched = 0
    let created = 0
    let skipped = 0
    let errors = 0

    try {
      const leads = await fetchChunk(sinceUnix, untilUnix)
      fetched = leads.length
      stats.fetched += fetched

      for (const lead of leads) {
        const result = await processLead(lead, orgId, stageId)
        if (result === "created") { created++; stats.created++ }
        else if (result === "skipped") { skipped++; stats.skipped++ }
        else { errors++; stats.errors++ }
      }
    } catch (err) {
      if (err instanceof MetaOAuthException) {
        console.error(`[FATAL] OAuth inválido — abortando: ${err.message}`)
        process.exit(1)
      }
      console.error(`[ERROR] Chunk ${label} falhou: ${err instanceof Error ? err.message : String(err)}`)
      errors++
      stats.errors++
    }

    console.log(`[CHUNK ${label}] fetched=${fetched}, created=${created}, skipped=${skipped}, errors=${errors}`)
    stats.chunks++

    // pausa entre chunks (não entre páginas)
    if (i < chunks.length - 1) await sleep(5000)
  }

  console.log(`
✅ Backfill concluído
Chunks processados: ${stats.chunks}
Total fetched:  ${stats.fetched}
Criados:        ${stats.created}
Skipped:        ${stats.skipped}
Erros:          ${stats.errors}`)
}

main().catch((err) => {
  console.error("Erro fatal:", err)
  process.exit(1)
})
