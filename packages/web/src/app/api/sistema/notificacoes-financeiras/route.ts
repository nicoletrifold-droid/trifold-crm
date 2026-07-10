import { NextRequest, NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"

/**
 * Extrato de Notificações Financeiras (boleto: emissão/vencimento/atraso) por
 * cliente e empreendimento. Lê `financial_notification_log`. Admin/supervisor.
 */
export async function GET(request: NextRequest) {
  const user = await getServerUser()
  if (user.role !== "admin" && user.role !== "supervisor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const obraId = sp.get("obra_id")
  const tipo = sp.get("tipo")
  const canal = sp.get("canal")
  const from = sp.get("from") // ISO date
  const to = sp.get("to")

  const admin = createAdminClient()
  let query = admin
    .from("financial_notification_log")
    .select("id, created_at, tipo, canal, status, vencimento, obra_id, detail, cliente:users(name), obra:obras(name)")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(1000)

  if (obraId) query = query.eq("obra_id", obraId)
  if (tipo) query = query.eq("tipo", tipo)
  if (canal) query = query.eq("canal", canal)
  if (from) query = query.gte("created_at", from)
  if (to) query = query.lt("created_at", to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((r) => {
    const cli = r.cliente as { name?: string } | { name?: string }[] | null
    const obr = r.obra as { name?: string } | { name?: string }[] | null
    return {
      id: r.id,
      created_at: r.created_at,
      tipo: r.tipo,
      canal: r.canal,
      status: r.status,
      vencimento: r.vencimento,
      obra_id: r.obra_id,
      cliente_nome: (Array.isArray(cli) ? cli[0]?.name : cli?.name) ?? "—",
      obra_nome: (Array.isArray(obr) ? obr[0]?.name : obr?.name) ?? "Sem empreendimento",
    }
  })

  return NextResponse.json({ data: rows })
}
