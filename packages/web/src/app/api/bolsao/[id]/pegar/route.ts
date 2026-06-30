import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

// Story 75-81 (Epic 64) — corretor puxa um lead do bolsão. A atomicidade e as
// regras (teto + empreendimento) ficam na RPC pegar_lead_bolsao (SECURITY DEFINER).
// O dono é SEMPRE o usuário autenticado (derivado da sessão, nunca do body).

const STATUS_MAP: Record<string, { http: number; message: string }> = {
  ok: { http: 200, message: "Lead atribuído a você." },
  gone: { http: 409, message: "Esse lead já foi atendido por outro corretor." },
  teto: { http: 422, message: "Você atingiu seu limite de leads ativos." },
  empreendimento: { http: 422, message: "Você não está habilitado no empreendimento desse lead." },
  sem_corretor: { http: 403, message: "Apenas corretores disponíveis podem pegar leads do bolsão." },
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("pegar_lead_bolsao", {
    p_lead_id: id,
    p_broker_user_id: appUser.id,
  })

  if (error) {
    console.error("[bolsao/pegar] rpc error:", error)
    return NextResponse.json({ error: "Falha ao pegar o lead." }, { status: 500 })
  }

  const status = String(data)
  const mapped = STATUS_MAP[status] ?? { http: 500, message: "Erro inesperado." }
  return NextResponse.json({ status, message: mapped.message }, { status: mapped.http })
}
