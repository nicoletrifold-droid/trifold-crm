import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canManagePastas } from "@web/lib/pastas/roles"
import { sendDocumentForSignature } from "@web/lib/clicksign/client"

// Story 75-120 — POST: envia um documento da pasta para assinatura via Clicksign.
// Gate: gestor de pastas. O documento precisa já estar anexado (situacao != pendente).

function mimeFromFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "pdf":
      return "application/pdf"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    default:
      return "application/pdf"
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!(await canManagePastas(appUser.id, appUser.org_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, docId } = await params
  const body = (await req.json().catch(() => ({}))) as {
    signer_name?: string
    signer_email?: string
    signer_phone?: string
    auth_method?: string
  }

  const signerName = (body.signer_name ?? "").trim()
  const signerEmail = (body.signer_email ?? "").trim()
  const signerPhone = (body.signer_phone ?? "").trim()
  const authMethod = (body.auth_method ?? "email").trim()

  if (!signerName) {
    return NextResponse.json({ error: "Informe o nome do signatário" }, { status: 400 })
  }
  if (!signerEmail && !signerPhone) {
    return NextResponse.json({ error: "Informe e-mail ou telefone do signatário" }, { status: 400 })
  }

  // Documento + pasta (RLS org-scoped garante que é da org do usuário).
  const { data: doc } = await supabase
    .from("pasta_documentos")
    .select("id, label, filename, storage_path, situacao, pasta:pastas!inner(id, nome, org_id, empreendimento)")
    .eq("id", docId)
    .eq("pasta_id", id)
    .maybeSingle()

  if (!doc?.storage_path) {
    return NextResponse.json({ error: "Documento não encontrado ou ainda não anexado" }, { status: 404 })
  }
  const pasta = (doc as unknown as { pasta: { id: string; nome: string; org_id: string; empreendimento: string | null } }).pasta

  // Baixa o arquivo do bucket privado (só acessível via service role) e converte
  // para data URI base64. A autorização já foi checada acima via RLS (query do doc).
  const admin = createAdminClient()
  const { data: file, error: dlErr } = await admin.storage.from("pastas").download(doc.storage_path)
  if (dlErr || !file) {
    return NextResponse.json({ error: "Falha ao ler o arquivo do documento" }, { status: 500 })
  }
  const filename = (doc.filename as string | null) ?? `${doc.label}.pdf`
  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64")
  const dataUri = `data:${mimeFromFilename(filename)};base64,${b64}`

  const envelopeName = `${pasta.nome} — ${doc.label}`

  try {
    const result = await sendDocumentForSignature({
      envelopeName,
      filename,
      contentBase64DataUri: dataUri,
      signer: { name: signerName, email: signerEmail || undefined, phone: signerPhone || undefined },
      authMethod,
    })

    const { error: insErr } = await supabase.from("signature_envelopes").insert({
      org_id: pasta.org_id,
      pasta_id: pasta.id,
      pasta_documento_id: doc.id,
      provider: "clicksign",
      clicksign_envelope_id: result.envelopeId,
      clicksign_document_id: result.documentId,
      clicksign_signer_id: result.signerId,
      signer_name: signerName,
      signer_email: signerEmail || null,
      signer_phone: signerPhone || null,
      auth_method: authMethod,
      status: "running",
      created_by: appUser.id,
    })
    if (insErr) {
      // Envelope foi criado na Clicksign mas não registramos — logar para reconciliar.
      console.error("[clicksign] envelope criado mas insert falhou", result.envelopeId, insErr)
      return NextResponse.json({ error: "Envelope criado, mas falha ao registrar. Contate o suporte." }, { status: 500 })
    }

    return NextResponse.json({ ok: true, envelope_id: result.envelopeId })
  } catch (e) {
    console.error("[clicksign] falha ao enviar para assinatura", e)
    return NextResponse.json({ error: (e as Error).message ?? "Falha ao enviar para assinatura" }, { status: 502 })
  }
}
