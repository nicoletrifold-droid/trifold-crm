import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"

const SUPREMO_API_TOKEN = process.env.SUPREMO_API_TOKEN
const SUPREMO_BASE = "https://api.supremocrm.com.br/v1"
const STALE_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutos

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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getServerUser()
  const supabase = await createClient()

  if (!SUPREMO_API_TOKEN) {
    return NextResponse.json({ error: "SUPREMO_API_TOKEN not configured" }, { status: 503 })
  }

  // 1. Pega lead
  const { data: lead } = await supabase
    .from("leads")
    .select("id, supremo_id, supremo_history_synced_at")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single()

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  if (!lead.supremo_id) return NextResponse.json({ ok: true, skipped: "no_supremo_id" })

  // 2. Throttle: se foi sincronizado nos últimos 15 min, retorna cache
  if (lead.supremo_history_synced_at) {
    const lastSync = new Date(lead.supremo_history_synced_at).getTime()
    if (Date.now() - lastSync < STALE_THRESHOLD_MS) {
      return NextResponse.json({ ok: true, skipped: "fresh", lastSync: lead.supremo_history_synced_at })
    }
  }

  // 3. Fetch /historico
  const res = await fetch(`${SUPREMO_BASE}/leads/${lead.supremo_id}/historico`, {
    headers: { Authorization: `Bearer ${SUPREMO_API_TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)

  if (!res || !res.ok) {
    // Falha (rate limit, 404, etc.) — atualiza timestamp para não tentar de novo já
    if (res?.status === 429) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 })
    }
    return NextResponse.json({ ok: false, error: "fetch_failed", status: res?.status }, { status: 200 })
  }

  const json = await res.json() as { data?: SupremoHistoryItem[]; status?: string; message?: string }

  // Daily limit do Supremo retorna 200 com status=error
  if (json.status === "error") {
    return NextResponse.json({ ok: false, error: "supremo_daily_limit", message: json.message }, { status: 200 })
  }

  const history = json.data ?? []

  // 4. Map broker names
  const { data: users } = await supabase
    .from("users")
    .select("id, name")
    .eq("org_id", user.orgId)
    .eq("role", "broker")
  const brokerMap = new Map<string, string>()
  for (const u of users ?? []) brokerMap.set(u.name.toLowerCase().trim(), u.id)

  // 5. Delete antigos, insere frescos
  await supabase.from("activities").delete().eq("lead_id", id).eq("type", "supremo_contact")
  await supabase.from("lead_tasks").delete().eq("lead_id", id).eq("source", "supremo")

  const activitiesToInsert: Record<string, unknown>[] = []
  const tasksToInsert: Record<string, unknown>[] = []

  for (const item of history) {
    const brokerName = item.corretor?.nome?.trim()
    const brokerUserId = brokerName ? brokerMap.get(brokerName.toLowerCase().trim()) ?? null : null

    if (item.data && item.hora && item.observacao) {
      activitiesToInsert.push({
        org_id: user.orgId,
        lead_id: id,
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

    if (item.agendamento_retorno?.data && item.agendamento_retorno?.hora) {
      const dueTs = new Date(
        `${item.agendamento_retorno.data}T${item.agendamento_retorno.hora}:00-03:00`
      ).toISOString()
      const title = item.observacao
        ? item.observacao.length > 80 ? item.observacao.slice(0, 80) + "…" : item.observacao
        : `Retorno por ${item.acao ?? "contato"}`
      tasksToInsert.push({
        org_id: user.orgId,
        lead_id: id,
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
  }
  if (tasksToInsert.length > 0) {
    await supabase.from("lead_tasks").insert(tasksToInsert)
  }

  await supabase
    .from("leads")
    .update({ supremo_history_synced_at: new Date().toISOString() })
    .eq("id", id)

  return NextResponse.json({
    ok: true,
    activitiesAdded: activitiesToInsert.length,
    tasksAdded: tasksToInsert.length,
  })
}
