import { NextRequest, NextResponse } from "next/server"
import { imobGuard } from "@web/lib/imob/guard"

// POST /api/imob/leads/[id]/assign — define/troca o RESPONSÁVEL de um lead do IMOB.
//
// Por que via admin client (e não a RLS): o modelo do IMOB é "por atribuição" — o
// responsável (+ admin/supervisor) enxerga e mexe no lead via RLS. Mas para ATRIBUIR um lead
// ainda sem responsável, um usuário de perfil 'imob' não passaria na RLS de UPDATE
// (is_admin_or_supervisor OR assigned_broker_id = self) — ovo-e-galinha. O gate imobGuard
// (canAccess "imob") é a fronteira de segurança; qualquer usuário interno pode ser o
// responsável, mesmo não sendo corretor.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const g = await imobGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { broker_id?: string | null } | null
  const brokerId = body?.broker_id?.trim() || null

  // O lead precisa existir, ser do mundo IMOB e da mesma org (impede tocar no funil principal).
  const { data: lead } = await admin
    .from("leads")
    .select("id, segmento")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .maybeSingle()

  if (!lead || (lead as { segmento: string }).segmento !== "imob") {
    return NextResponse.json({ error: "Lead IMOB não encontrado" }, { status: 404 })
  }

  // Valida o responsável (qualquer usuário interno ativo da org, exceto cliente).
  let brokerName: string | null = null
  if (brokerId) {
    const { data: u } = await admin
      .from("users")
      .select("id, name, role, is_active")
      .eq("id", brokerId)
      .eq("org_id", appUser.org_id)
      .maybeSingle()
    const user = u as { id: string; name: string | null; role: string; is_active: boolean } | null
    if (!user || !user.is_active || user.role === "cliente") {
      return NextResponse.json({ error: "Usuário inválido para responsável" }, { status: 400 })
    }
    brokerName = user.name
  }

  const { error } = await admin
    .from("leads")
    .update({ assigned_broker_id: brokerId })
    .eq("id", id)
    .eq("org_id", appUser.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: id,
    user_id: appUser.id,
    type: "broker_assigned",
    description: brokerId
      ? `Responsável ${brokerName} atribuído ao lead (IMOB)`
      : "Responsável removido do lead (IMOB)",
    metadata: { broker_id: brokerId, broker_name: brokerName, assigned_by: appUser.id },
  })

  return NextResponse.json({ ok: true, broker_id: brokerId, broker_name: brokerName })
}
