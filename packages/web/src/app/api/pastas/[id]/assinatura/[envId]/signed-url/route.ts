import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { isPastaManager } from "@web/lib/pastas/roles"

// Story 75-120 — GET: signed URL (1h) para o PDF ASSINADO de um envelope
// (bucket privado `pastas`, path salvo pelo webhook em signed_storage_path).
// `?download=1` força o download (Content-Disposition attachment) com nome amigável
// derivado do documento; sem o param, abre inline (preview). Story 75-131.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; envId: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!isPastaManager(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, envId } = await params

  const { data: env } = await supabase
    .from("signature_envelopes")
    .select("id, signed_storage_path, pasta_documentos(label)")
    .eq("id", envId)
    .eq("pasta_id", id)
    .maybeSingle()

  if (!env?.signed_storage_path) {
    return NextResponse.json({ error: "PDF assinado ainda não disponível" }, { status: 404 })
  }

  // Join to-one pode vir como objeto ou array no supabase-js — normaliza.
  const docRow = Array.isArray(env.pasta_documentos) ? env.pasta_documentos[0] : env.pasta_documentos
  const label = (docRow as { label?: string } | null)?.label
  const downloadName = label ? `${label} - assinado.pdf` : "Documento assinado.pdf"
  const wantsDownload = new URL(req.url).searchParams.get("download") === "1"

  // Bucket privado só acessível via service role (autorização já checada via RLS acima).
  const admin = createAdminClient()
  const { data: signed, error } = await admin.storage
    .from("pastas")
    .createSignedUrl(env.signed_storage_path, 3600, wantsDownload ? { download: downloadName } : undefined)

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Erro ao gerar URL" }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
