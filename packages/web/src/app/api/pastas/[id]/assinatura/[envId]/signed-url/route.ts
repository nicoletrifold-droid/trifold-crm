import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { isPastaManager } from "@web/lib/pastas/roles"

// Story 75-120 — GET: signed URL (1h) para baixar o PDF ASSINADO de um envelope
// (bucket privado `pastas`, path salvo pelo webhook em signed_storage_path).
export async function GET(
  _req: Request,
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
    .select("id, signed_storage_path")
    .eq("id", envId)
    .eq("pasta_id", id)
    .maybeSingle()

  if (!env?.signed_storage_path) {
    return NextResponse.json({ error: "PDF assinado ainda não disponível" }, { status: 404 })
  }

  // Bucket privado só acessível via service role (autorização já checada via RLS acima).
  const admin = createAdminClient()
  const { data: signed, error } = await admin.storage
    .from("pastas")
    .createSignedUrl(env.signed_storage_path, 3600)

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Erro ao gerar URL" }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
