/**
 * cleanup-duplicate-leads.ts — Story 21.1 (P0 bug)
 *
 * Merges duplicate leads in the `leads` table caused by inconsistent phone
 * normalization, BEFORE migration 021_phone_normalization_part2.sql promotes
 * `idx_leads_org_phone_normalized` to UNIQUE.
 *
 * Strategy:
 *   1. Group all leads by `(org_id, normalizePhoneBR(phone))`
 *   2. For each group with 2+ leads:
 *        - Keep the OLDEST (MIN(created_at))
 *        - Move all `conversations.lead_id` from duplicates → keeper
 *        - Delete the duplicates (`messages` follow conversations transparently
 *          because messages reference `conversation_id`, not `lead_id`)
 *   3. Print a structured report. Always. Both in dry-run and apply mode.
 *   4. Emit a `cleanup_leads_executed` system_event for audit.
 *
 * Safety rails:
 *   - DRY_RUN=true is the default. No mutations.
 *   - DRY_RUN=false ALONE is not enough. The CLI flag `--apply` must ALSO be
 *     present. This is intentional friction — two independent levers.
 *   - In NODE_ENV=production AND --apply: the script prints the full report
 *     first, then prompts for the literal string `I-UNDERSTAND-DELETE`. Any
 *     other input aborts with exit 1. Non-TTY stdin in production also aborts.
 *   - In NODE_ENV != production: --apply still required, but no interactive
 *     prompt.
 *
 * Usage examples:
 *   # Default dry-run — safe, just prints
 *   npx tsx scripts/cleanup-duplicate-leads.ts
 *
 *   # Staging apply (no interactive prompt)
 *   DRY_RUN=false npx tsx scripts/cleanup-duplicate-leads.ts --apply
 *
 *   # Production apply (will prompt for I-UNDERSTAND-DELETE)
 *   DRY_RUN=false NODE_ENV=production npx tsx scripts/cleanup-duplicate-leads.ts --apply
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "fs"
import { resolve } from "path"
import readline from "readline"
import { normalizePhoneBR } from "../packages/shared/src/utils/phone"

// ---------------------------------------------------------------------------
// Env loading (mirror pattern used by scripts/re-enrich-lead.ts)
// ---------------------------------------------------------------------------
const envPath = resolve(__dirname, "../packages/web/.env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim()
    }
  }
}

// ---------------------------------------------------------------------------
// Args & guards
// ---------------------------------------------------------------------------
const DRY_RUN = process.env.DRY_RUN !== "false"
const APPLY = process.argv.includes("--apply")
const IS_PROD = process.env.NODE_ENV === "production"

interface LeadRow {
  id: string
  org_id: string
  phone: string | null
  created_at: string
}

interface CleanupGroup {
  org_id: string
  normalized: string
  keeper: LeadRow
  duplicates: LeadRow[]
}

interface CleanupSummary {
  dry_run: boolean
  groups_processed: number
  leads_deleted: number
  leads_kept: number
  msgs_migrated: number
  conv_migrated: number
}

// ---------------------------------------------------------------------------
function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set " +
        "(via environment or packages/web/.env.local)."
    )
    process.exit(1)
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---------------------------------------------------------------------------
async function loadAllLeads(supabase: SupabaseClient): Promise<LeadRow[]> {
  // Pull every lead with non-null phone in pages of 1000.
  const all: LeadRow[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, org_id, phone, created_at")
      .not("phone", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      console.error("ERROR loading leads:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    all.push(...(data as LeadRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

// ---------------------------------------------------------------------------
function buildGroups(leads: LeadRow[]): CleanupGroup[] {
  const map = new Map<string, LeadRow[]>()
  for (const lead of leads) {
    const normalized = normalizePhoneBR(lead.phone)
    if (!normalized) continue // skip leads with un-normalizable phones
    const key = `${lead.org_id}::${normalized}`
    const arr = map.get(key) ?? []
    arr.push(lead)
    map.set(key, arr)
  }

  const groups: CleanupGroup[] = []
  for (const [key, arr] of map) {
    if (arr.length < 2) continue // not a duplicate group
    // Already sorted ASC by created_at thanks to the load query
    const sorted = [...arr].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const [keeper, ...duplicates] = sorted
    const [org_id, normalized] = key.split("::")
    groups.push({ org_id, normalized, keeper, duplicates })
  }
  return groups
}

// ---------------------------------------------------------------------------
function printReport(groups: CleanupGroup[]): void {
  console.log("")
  console.log("=".repeat(78))
  console.log("CLEANUP DUPLICATE LEADS — REPORT")
  console.log("=".repeat(78))
  console.log(
    `Mode:            ${DRY_RUN ? "DRY-RUN (no changes)" : "APPLY (will modify DB)"}`
  )
  console.log(`Apply flag:      ${APPLY ? "YES" : "NO"}`)
  console.log(`NODE_ENV:        ${process.env.NODE_ENV ?? "(unset)"}`)
  console.log(`Groups found:    ${groups.length}`)
  const totalDup = groups.reduce((acc, g) => acc + g.duplicates.length, 0)
  console.log(`Leads to delete: ${totalDup}`)
  console.log(`Leads to keep:   ${groups.length}`)
  console.log("-".repeat(78))

  for (const g of groups) {
    console.log("")
    console.log(`org_id=${g.org_id}  phone_normalized=${g.normalized}`)
    console.log(
      `  KEEP   ${g.keeper.id}  phone=${g.keeper.phone}  created_at=${g.keeper.created_at}`
    )
    for (const dup of g.duplicates) {
      console.log(
        `  DELETE ${dup.id}  phone=${dup.phone}  created_at=${dup.created_at}`
      )
    }
  }
  console.log("=".repeat(78))
  console.log("")
}

// ---------------------------------------------------------------------------
async function promptInteractiveConfirmation(): Promise<boolean> {
  // Abort if stdin is not a TTY in production — never proceed silently
  if (!process.stdin.isTTY) {
    console.error(
      "ERROR: stdin is not a TTY in production. Refusing to proceed without " +
        "interactive confirmation. Aborting."
    )
    return false
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolveFn) => {
    rl.question(
      "\nType I-UNDERSTAND-DELETE to proceed, anything else aborts: ",
      (answer) => {
        rl.close()
        resolveFn(answer.trim() === "I-UNDERSTAND-DELETE")
      }
    )
  })
}

// ---------------------------------------------------------------------------
async function executeMerge(
  supabase: SupabaseClient,
  groups: CleanupGroup[]
): Promise<{ msgs_migrated: number; conv_migrated: number; leads_deleted: number }> {
  let msgs_migrated = 0
  let conv_migrated = 0
  let leads_deleted = 0

  for (const g of groups) {
    const dupIds = g.duplicates.map((d) => d.id)

    // 1) Count conversations that will be migrated (and the messages under them)
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .in("lead_id", dupIds)

    if (convs && convs.length > 0) {
      const convIds = convs.map((c) => c.id)

      // Count messages BEFORE update for the audit log
      const { count: msgCount } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("conversation_id", convIds)

      msgs_migrated += msgCount ?? 0
      conv_migrated += convIds.length

      // 2) Move conversations to the keeper lead
      const { error: convErr } = await supabase
        .from("conversations")
        .update({ lead_id: g.keeper.id })
        .in("id", convIds)

      if (convErr) {
        console.error(
          `ERROR migrating conversations for group org=${g.org_id} phone=${g.normalized}: ${convErr.message}`
        )
        // Skip this group's lead deletion to avoid orphaning conversations
        continue
      }
    }

    // 3) Delete the duplicate leads
    const { error: delErr } = await supabase
      .from("leads")
      .delete()
      .in("id", dupIds)

    if (delErr) {
      console.error(
        `ERROR deleting duplicate leads for group org=${g.org_id} phone=${g.normalized}: ${delErr.message}`
      )
      continue
    }

    leads_deleted += dupIds.length
  }

  return { msgs_migrated, conv_migrated, leads_deleted }
}

// ---------------------------------------------------------------------------
async function logAuditEvent(
  supabase: SupabaseClient,
  summary: CleanupSummary
): Promise<void> {
  const { error } = await supabase.from("system_events").insert({
    org_id: null,
    level: "info",
    category: "system",
    event_type: "cleanup_leads_executed",
    message: `Cleanup duplicate leads (dry_run=${summary.dry_run}): ${summary.groups_processed} groups, ${summary.leads_deleted} deleted, ${summary.leads_kept} kept`,
    metadata: summary,
    source: "scripts/cleanup-duplicate-leads.ts",
  })

  if (error) {
    console.error("WARNING: failed to write system_events audit row:", error.message)
  } else {
    console.log("Audit row written to system_events.")
  }
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log(
    `cleanup-duplicate-leads.ts — Story 21.1 — DRY_RUN=${DRY_RUN} APPLY=${APPLY} NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}`
  )

  // Guard: DRY_RUN=false alone is not enough — --apply is required too
  if (!DRY_RUN && !APPLY) {
    console.error(
      "ERROR: DRY_RUN=false requires the --apply CLI flag. Both are mandatory.\n" +
        "Example: DRY_RUN=false npx tsx scripts/cleanup-duplicate-leads.ts --apply"
    )
    process.exit(1)
  }

  const supabase = getSupabase()

  console.log("Loading all leads with phone IS NOT NULL ...")
  const leads = await loadAllLeads(supabase)
  console.log(`Loaded ${leads.length} leads.`)

  const groups = buildGroups(leads)

  // ALWAYS print the full report — even in --apply mode, BEFORE confirmation
  printReport(groups)

  if (groups.length === 0) {
    console.log("No duplicate groups found. Nothing to do.")
    if (!DRY_RUN && APPLY) {
      // Even with no work, log an audit event so operators see the run
      await logAuditEvent(supabase, {
        dry_run: false,
        groups_processed: 0,
        leads_deleted: 0,
        leads_kept: 0,
        msgs_migrated: 0,
        conv_migrated: 0,
      })
    }
    return
  }

  // Production-only interactive confirmation
  if (!DRY_RUN && APPLY && IS_PROD) {
    const confirmed = await promptInteractiveConfirmation()
    if (!confirmed) {
      console.error("Aborted: confirmation token mismatch or non-TTY stdin.")
      process.exit(1)
    }
  }

  // Build the summary now (numbers are filled below if we mutate)
  const summary: CleanupSummary = {
    dry_run: DRY_RUN,
    groups_processed: groups.length,
    leads_deleted: 0,
    leads_kept: groups.length,
    msgs_migrated: 0,
    conv_migrated: 0,
  }

  if (DRY_RUN) {
    // In DRY_RUN we still produce a "what would happen" count by inspecting
    // current conversations/messages so operators see the impact.
    for (const g of groups) {
      const dupIds = g.duplicates.map((d) => d.id)
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .in("lead_id", dupIds)

      summary.conv_migrated += convs?.length ?? 0
      summary.leads_deleted += dupIds.length

      if (convs && convs.length > 0) {
        const { count: msgCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .in("conversation_id", convs.map((c) => c.id))
        summary.msgs_migrated += msgCount ?? 0
      }
    }

    console.log("DRY-RUN summary (would-be effects):")
    console.log(JSON.stringify(summary, null, 2))
    console.log(
      "\nNo changes were made. Re-run with `DRY_RUN=false ... --apply` to execute."
    )
    return
  }

  // APPLY MODE
  console.log("Applying merges and deletions...")
  const result = await executeMerge(supabase, groups)
  summary.leads_deleted = result.leads_deleted
  summary.msgs_migrated = result.msgs_migrated
  summary.conv_migrated = result.conv_migrated

  console.log("Apply summary:")
  console.log(JSON.stringify(summary, null, 2))

  await logAuditEvent(supabase, summary)
  console.log("Done.")
}

main().catch((err) => {
  console.error("FATAL:", err)
  process.exit(1)
})
