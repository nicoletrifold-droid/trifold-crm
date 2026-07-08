import { NextRequest, NextResponse } from "next/server"
import { imobGuard } from "@web/lib/imob/guard"

// Etapa "Aguardando atendimento" (stage novo) — padrão de entrada.
const AGUARDANDO_STAGE_ID = "00000000-0000-0000-0001-000000000001"

// POST /api/imob/leads — cria um lead MANUAL do mundo IMOB (segmento='imob'). Story 75-99.
// Nunca entra na roleta/campanha (Fase 1 exclui segmento imob).
export async function POST(req: NextRequest) {
  const g = await imobGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as {
    name?: string; phone?: string; email?: string; property_interest_id?: string; observacao?: string
  } | null

  const phone = body?.phone?.trim()
  if (!phone) return NextResponse.json({ error: "Telefone é obrigatório" }, { status: 400 })

  const { data, error } = await admin
    .from("leads")
    .insert({
      org_id: appUser.org_id,
      segmento: "imob",
      name: body?.name?.trim() || null,
      phone,
      email: body?.email?.trim() || null,
      channel: "manual",
      stage_id: AGUARDANDO_STAGE_ID,
      property_interest_id: body?.property_interest_id || null,
      ai_summary: body?.observacao?.trim() || null,
      // Auto-atribui ao criador (perfil 'imob' não é admin/supervisor, então sem
      // responsável a RLS de `leads` o impediria de arrastar/editar o próprio lead).
      // O responsável pode ser trocado depois no seletor da aba Leads do IMOB.
      assigned_broker_id: appUser.id,
      is_active: true,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}
