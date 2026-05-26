import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: aprovacoes, error } = await supabase
    .from("obra_upload_aprovacoes")
    .select(
      "id, tipo, storage_path, storage_bucket, metadata, status, enviado_por, motivo_rejeicao, created_at, reviewed_at, users!enviado_por(name)"
    )
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const itens = await Promise.all(
    (aprovacoes ?? []).map(async (item) => {
      const { data: signed } = await supabase.storage
        .from(item.storage_bucket)
        .createSignedUrl(item.storage_path, 3600)

      const userRecord = item.users as unknown as { name: string } | { name: string }[] | null
      const enviado_por_nome = Array.isArray(userRecord)
        ? (userRecord[0]?.name ?? "—")
        : (userRecord?.name ?? "—")

      return {
        ...item,
        signed_url: signed?.signedUrl ?? null,
        enviado_por_nome,
      }
    })
  )

  return NextResponse.json({ aprovacoes: itens })
}
