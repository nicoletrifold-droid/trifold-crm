import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const dataComemorativaId = new URL(request.url).searchParams.get("data_comemorativa_id")
  if (!dataComemorativaId) {
    return NextResponse.json({ error: "data_comemorativa_id é obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("brindes_entregas")
    .select("destinatario_id, status, observacao_entrega, entregue_em, brinde_tipo_id, brindes_tipos(nome, tamanho, cor)")
    .eq("org_id", appUser.org_id)
    .eq("data_comemorativa_id", dataComemorativaId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const destinatario_id = typeof body.destinatario_id === "string" ? body.destinatario_id : ""
  const data_comemorativa_id =
    typeof body.data_comemorativa_id === "string" ? body.data_comemorativa_id : ""
  const status = typeof body.status === "string" ? body.status : "pendente"

  if (!destinatario_id) {
    return NextResponse.json({ error: "destinatario_id é obrigatório" }, { status: 400 })
  }
  if (!data_comemorativa_id) {
    return NextResponse.json({ error: "data_comemorativa_id é obrigatório" }, { status: 400 })
  }
  if (!["pendente", "entregue", "nao_encontrado"].includes(status)) {
    return NextResponse.json(
      { error: "status deve ser pendente, entregue ou nao_encontrado" },
      { status: 400 }
    )
  }

  const observacao_entrega =
    typeof body.observacao_entrega === "string" && body.observacao_entrega.trim()
      ? body.observacao_entrega.trim()
      : null

  let brinde_tipo_id: string | null = null
  if (typeof body.brinde_tipo_id === "string" && body.brinde_tipo_id.trim()) {
    const { data: tipo } = await supabase
      .from("brindes_tipos")
      .select("id")
      .eq("id", body.brinde_tipo_id.trim())
      .eq("org_id", appUser.org_id)
      .single()
    if (!tipo) {
      return NextResponse.json({ error: "Tipo de brinde não encontrado" }, { status: 400 })
    }
    brinde_tipo_id = tipo.id
  }

  const { data, error } = await supabase
    .from("brindes_entregas")
    .upsert(
      {
        org_id: appUser.org_id,
        destinatario_id,
        data_comemorativa_id,
        status,
        observacao_entrega,
        brinde_tipo_id,
        entregue_em: status === "entregue" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "destinatario_id,data_comemorativa_id" }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
