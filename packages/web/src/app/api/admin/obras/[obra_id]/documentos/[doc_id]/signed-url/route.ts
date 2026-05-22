import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { getRequestIp, logAudit } from "@web/lib/audit"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

export async function GET(
  req: Request,
  { params }: { params: Promise<{ obra_id: string; doc_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, doc_id } = await params

  const { data: doc } = await supabase
    .from("obra_documentos")
    .select("id, name, filename, storage_path")
    .eq("id", doc_id)
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { data: signed, error } = await supabase.storage
    .from("obra-docs")
    .createSignedUrl(doc.storage_path, 3600)

  if (error || !signed?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Erro ao gerar URL" },
      { status: 500 }
    )
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "documento.view",
    entity_type: "documento",
    entity_id: doc.id,
    entity_name: doc.name,
    obra_id,
    metadata: { filename: doc.filename },
    ip_address: getRequestIp(req.headers),
  })

  return NextResponse.json({ url: signed.signedUrl })
}
