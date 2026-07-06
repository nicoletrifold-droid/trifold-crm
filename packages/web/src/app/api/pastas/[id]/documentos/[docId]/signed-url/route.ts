import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { isPastaManager } from "@web/lib/pastas/roles"

// GET — signed URL (1h) para o gestor abrir o arquivo do bucket privado `pastas`.
// `?download=1` força o download (Content-Disposition attachment); sem o param, a
// URL abre inline no navegador (preview). Story 75-130.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!isPastaManager(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, docId } = await params

  // Confirma que o doc pertence a uma pasta da org do usuário (join via RLS org-scoped).
  const { data: doc } = await supabase
    .from("pasta_documentos")
    .select("id, storage_path, filename, pasta:pastas!inner(id, org_id)")
    .eq("id", docId)
    .eq("pasta_id", id)
    .maybeSingle()

  if (!doc?.storage_path) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
  }

  const wantsDownload = new URL(req.url).searchParams.get("download") === "1"
  const { data: signed, error } = await supabase.storage
    .from("pastas")
    .createSignedUrl(doc.storage_path, 3600, wantsDownload ? { download: doc.filename ?? true } : undefined)

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Erro ao gerar URL" }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
