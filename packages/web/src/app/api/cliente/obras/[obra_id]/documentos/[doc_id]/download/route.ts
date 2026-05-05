import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string; doc_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase } = auth

  const { obra_id, doc_id } = await params

  // RLS garante que o cliente só acessa documentos de obras vinculadas a ele
  const { data: documento } = await supabase
    .from("obra_documentos")
    .select("id, storage_path, name")
    .eq("id", doc_id)
    .eq("obra_id", obra_id)
    .single()

  if (!documento) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { data, error } = await supabase.storage
    .from("obra-docs")
    .createSignedUrl(documento.storage_path, 60)

  if (error || !data) {
    return NextResponse.json(
      { error: "Falha ao gerar link de download" },
      { status: 500 }
    )
  }

  return NextResponse.json({ url: data.signedUrl })
}
