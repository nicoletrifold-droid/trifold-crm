import { requireAuth } from "@web/lib/api-auth"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase } = auth
  const { obra_id } = await params

  // RLS automatically limits results to obras linked to the authenticated cliente
  const { data: obra } = await supabase
    .from("obras")
    .select(
      "id, name, description, progress_pct, status, expected_delivery_date, current_phase_id"
    )
    .eq("id", obra_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!obra) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const [fasesRes, fotosRes, mensagensRes] = await Promise.all([
    supabase
      .from("obra_fases")
      .select("id, name, status, progress_pct, order_index, start_date, end_date")
      .eq("obra_id", obra_id)
      .order("order_index"),
    supabase
      .from("obra_fotos")
      .select("id, storage_path, caption, taken_at, fase_id")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("obra_mensagens")
      .select("id, content, created_at, sender_type")
      .eq("obra_id", obra_id)
      .eq("sender_type", "equipe")
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  return Response.json({
    obra,
    fases: fasesRes.data ?? [],
    fotos: fotosRes.data ?? [],
    mensagens: mensagensRes.data ?? [],
  })
}
