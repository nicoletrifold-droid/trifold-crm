import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canManagePastas } from "@web/lib/pastas/roles"
import { fillTermo, type TermoData } from "@web/lib/pastas/termo/fill"

// Story 75-127 (Etapa 3) — POST: recebe o TermoData revisado, gera o Termo de
// Intenção preenchido (PDF-modelo YARDEN) e anexa na própria pasta como documento
// (slug `termo_intencao`), pronto para "Enviar p/ assinatura". Substitui o Termo
// anterior se já existir.
export const runtime = "nodejs"
export const maxDuration = 60

const SLUG = "termo_intencao"
const LABEL = "Termo de Intenção"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth
  if (!(await canManagePastas(appUser.id, appUser.org_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const data = (await req.json().catch(() => ({}))) as TermoData

  const { data: pasta } = await supabase
    .from("pastas")
    .select("id, org_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!pasta) {
    return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 })
  }

  let bytes: Uint8Array
  try {
    bytes = await fillTermo(data)
  } catch (e) {
    console.error("[termo/gerar] falha ao preencher o PDF", e)
    return NextResponse.json({ error: "Falha ao gerar o Termo" }, { status: 500 })
  }

  const admin = createAdminClient()
  const storagePath = `${id}/${SLUG}-${Date.now()}.pdf`
  const { error: upErr } = await admin.storage
    .from("pastas")
    .upload(storagePath, Buffer.from(bytes), { contentType: "application/pdf", upsert: true })
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  // Já existe um Termo nesta pasta? Substitui (remove o arquivo antigo + atualiza a linha).
  const { data: existing } = await supabase
    .from("pasta_documentos")
    .select("id, storage_path")
    .eq("pasta_id", id)
    .eq("slug", SLUG)
    .maybeSingle()

  const rowFields = {
    storage_path: storagePath,
    filename: "Termo de Intenção.pdf",
    file_size_bytes: bytes.length,
    uploaded_at: new Date().toISOString(),
    situacao: "entregue" as const,
  }

  if (existing) {
    if (existing.storage_path && existing.storage_path !== storagePath) {
      await admin.storage.from("pastas").remove([existing.storage_path])
    }
    const { error } = await supabase.from("pasta_documentos").update(rowFields).eq("id", existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, docId: existing.id })
  }

  const { data: inserted, error } = await supabase
    .from("pasta_documentos")
    .insert({
      pasta_id: id,
      slug: SLUG,
      label: LABEL,
      titular: "interessado",
      required: false,
      ordem: 900,
      ...rowFields,
    })
    .select("id")
    .single()
  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Falha ao anexar o Termo" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, docId: inserted.id })
}
