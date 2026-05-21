import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEvent } from "@web/lib/logger"

export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const SUPREMO_API_TOKEN = process.env.SUPREMO_API_TOKEN
const SUPREMO_ORG_ID = process.env.SUPREMO_ORG_ID
const SUPREMO_BASE = "https://api.supremocrm.com.br/v1"

// Quantos leads processar por execução
const BATCH_SIZE = 100
// Pausa entre requisições à API Supremo (rate limit)
const REQUEST_DELAY_MS = 400

interface SupremoHistoryItem {
  acao?: string
  observacao?: string
  data?: string
  hora?: string
  agendamento_retorno?: { data: string; hora: string; quem_retorna?: string }
  corretor?: { id: number; nome: string }
  id_situacao?: number
  situacao?: string
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchHistory(supremoId: number, retries = 3): Promise<SupremoHistoryItem[]> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${SUPREMO_BASE}/leads/${supremoId}/historico`, {
        headers: { Authorization: `Bearer ${SUPREMO_API_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status === 429) {
        if (i < retries) { await sleep(3000 * (i + 1)); continue }
        return []
      }
      if (res.status === 404) return []
      if (!res.ok) return []
      const data = await res.json() as { data?: SupremoHistoryItem[] }
      return data.data ?? []
    } catch {
      if (i === retries) return []
      await sleep(2000)
    }
  }
  return []
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

  const supabase = createAdminClient()
  const startedAt = Date.now()

  // 1. Selecionar próximos N leads com supremo_id, ordenados por history_synced_at ASC NULLS FIRST
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, supremo_id, supremo_history_synced_at")
    .eq("org_id", SUPREMO_ORG_ID)
    .not("supremo_id", "is", null)
    .order("supremo_history_synced_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE)

  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 })

  // 2. Pre-carregar broker name → user_id map
  const { data: users } = await supabase
    .from("users")
    .select("id, name")
    .eq("org_id", SUPREMO_ORG_ID)
    .eq("role", "broker")
  const brokerMap = new Map<string, string>()
  for (const u of users ?? []) brokerMap.set(u.name.toLowerCase().trim(), u.id)

  let processed = 0, activitiesNew = 0, tasksNew = 0, empty = 0

  // 3. Para cada lead: deletar dados antigos do Supremo + inserir frescos
  for (const lead of leads ?? []) {
    if (!lead.supremo_id) continue

    const history = await fetchHistory(lead.supremo_id)

    if (history.length === 0) {
      empty++
    } else {
      // Limpa supremo_contact activities e supremo tasks deste lead
      await supabase.from("activities").delete().eq("lead_id", lead.id).eq("type", "supremo_contact")
      await supabase.from("lead_tasks").delete().eq("lead_id", lead.id).eq("source", "supremo")

      const activitiesToInsert: Record<string, unknown>[] = []
      const tasksToInsert: Record<string, unknown>[] = []

      for (const item of history) {
        const brokerName = item.corretor?.nome?.trim()
        const brokerUserId = brokerName ? (brokerMap.get(brokerName.toLowerCase().trim()) ?? null) : null

        // Past action
        if (item.data && item.hora && item.observacao) {
          activitiesToInsert.push({
            org_id: SUPREMO_ORG_ID,
            lead_id: lead.id,
            user_id: brokerUserId,
            type: "supremo_contact",
            description: item.observacao,
            metadata: {
              acao: item.acao,
              situacao: item.situacao,
              id_situacao: item.id_situacao,
              corretor: item.corretor,
            },
            created_at: new Date(`${item.data}T${item.hora}:00-03:00`).toISOString(),
          })
        }

        // Future scheduled task
        if (item.agendamento_retorno?.data && item.agendamento_retorno?.hora) {
          const dueTs = new Date(
            `${item.agendamento_retorno.data}T${item.agendamento_retorno.hora}:00-03:00`
          ).toISOString()
          const title = item.observacao
            ? (item.observacao.length > 80 ? item.observacao.slice(0, 80) + "…" : item.observacao)
            : `Retorno por ${item.acao ?? "contato"}`
          tasksToInsert.push({
            org_id: SUPREMO_ORG_ID,
            lead_id: lead.id,
            assigned_to: brokerUserId,
            title,
            action_type: item.acao && ["ligacao", "whatsapp", "email", "visita"].includes(item.acao) ? item.acao : "outro",
            due_at: dueTs,
            source: "supremo",
            supremo_lead_id: lead.supremo_id,
          })
        }
      }

      if (activitiesToInsert.length > 0) {
        await supabase.from("activities").insert(activitiesToInsert)
        activitiesNew += activitiesToInsert.length
      }
      if (tasksToInsert.length > 0) {
        await supabase.from("lead_tasks").insert(tasksToInsert)
        tasksNew += tasksToInsert.length
      }
    }

    await supabase.from("leads").update({ supremo_history_synced_at: new Date().toISOString() }).eq("id", lead.id)
    processed++

    if (Date.now() - startedAt > 270_000) break // safety: deixa 30s de margem do maxDuration
    await sleep(REQUEST_DELAY_MS)
  }

  logEvent({
    level: "info",
    category: "cron",
    event_type: "SUPREMO_HISTORY_SYNC",
    message: `Processed ${processed} leads`,
    metadata: { processed, activitiesNew, tasksNew, empty },
    org_id: SUPREMO_ORG_ID,
    source: "api/cron/supremo-history-sync",
  })

  return NextResponse.json({ processed, activitiesNew, tasksNew, empty, durationMs: Date.now() - startedAt })
}
