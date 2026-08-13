import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("roleta_config")
    .select("*")
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ config: data })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  if (await requireCapability(appUser, "roleta.configurar")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  // Story 75-74: o HORÁRIO é definido EXCLUSIVAMENTE pela agenda por dia
  // (roleta_schedule, via PATCH /api/roleta/schedule) — fonte única. Os campos
  // legados de horário (business_hour_*/weekend_hour_*/business_days) NÃO são mais
  // editáveis aqui, pra não criar divergência com a agenda. (O painel ainda envia
  // o config inteiro; estes campos são simplesmente ignorados.)
  const allowed = [
    "is_active",
    "timezone",
    "notify_push",
    "notify_email",
    "notify_whatsapp",
    "priorizar_lead_ativo",
    "max_leads_per_day",
    "notify_user_on_distribution",
    "notify_user_on_fora_horario",
    // Story 75-78: tempos de SLA editáveis pela tela da Roleta (self-service).
    "sla_alertas_enabled",
    "sla_alerta_corretor_min",
    "sla_alerta_gestor_min",
  ] as const

  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = (body as Record<string, unknown>)[key]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Story 75-78: validação dos tempos de SLA — inteiros > 0 e corretor < gestor
  // (o alerta ao corretor tem que vir ANTES da escalada ao gestor). Como o painel
  // envia o config inteiro, normalmente ambos vêm no patch; se vier só um, buscamos
  // o outro no config atual para a comparação.
  const touchesSla =
    "sla_alerta_corretor_min" in patch || "sla_alerta_gestor_min" in patch
  if (touchesSla) {
    const isPosInt = (v: unknown): v is number =>
      typeof v === "number" && Number.isInteger(v) && v > 0

    let { data: current } = await admin
      .from("roleta_config")
      .select("sla_alerta_corretor_min, sla_alerta_gestor_min")
      .eq("org_id", appUser.org_id)
      .maybeSingle()
    current = current ?? { sla_alerta_corretor_min: 30, sla_alerta_gestor_min: 60 }

    const corretor =
      "sla_alerta_corretor_min" in patch
        ? patch.sla_alerta_corretor_min
        : current.sla_alerta_corretor_min
    const gestor =
      "sla_alerta_gestor_min" in patch
        ? patch.sla_alerta_gestor_min
        : current.sla_alerta_gestor_min

    if (!isPosInt(corretor) || !isPosInt(gestor)) {
      return NextResponse.json(
        { error: "Tempos de SLA devem ser inteiros maiores que zero (minutos)." },
        { status: 400 }
      )
    }
    if (corretor >= gestor) {
      return NextResponse.json(
        { error: "O alerta ao corretor deve ser menor que a escalada ao gestor." },
        { status: 400 }
      )
    }
  }
  const { data, error } = await admin
    .from("roleta_config")
    .upsert(
      { org_id: appUser.org_id, ...patch },
      { onConflict: "org_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Story 75-59: a agenda por dia (roleta_schedule) é editada direto pela tela
  // via PATCH /api/roleta/schedule — este endpoint NÃO mais deriva/sobrescreve a
  // agenda (senão salvar uma config qualquer apagaria os horários por dia).

  return NextResponse.json({ config: data })
}
