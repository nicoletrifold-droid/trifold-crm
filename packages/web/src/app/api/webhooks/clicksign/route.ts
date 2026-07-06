import { NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { verifyClicksignHmac, parseWebhook, mapEventToStatus, deepGet } from "@web/lib/clicksign/webhook"

// Story 75-120/133 — Webhook da Clicksign. Recebe eventos de assinatura, valida HMAC
// (Content-Hmac: sha256=...), atualiza o status em signature_envelopes e, quando o
// documento finaliza, baixa o PDF assinado (do próprio payload) para o bucket privado
// `pastas`. Usa admin client (sem sessão). Idempotente. Sempre responde 200 em evento
// válido para a Clicksign não reenviar; 401 só quando o HMAC não confere.
//
// Formato real (sandbox, legado/v1): `{ event: { name }, document: { key, downloads } }`.
// `document.key` casa com signature_envelopes.clicksign_document_id.

// Procura a URL do PDF assinado no objeto `document` do payload da Clicksign.
function findSignedUrl(docAttrs: Record<string, unknown> | undefined): string | null {
  if (!docAttrs) return null
  const candidates = [
    deepGet(docAttrs, ["downloads", "signed_file_url"]),
    deepGet(docAttrs, ["downloads", "original_file_url"]),
    deepGet(docAttrs, ["signed_file_url"]),
    deepGet(docAttrs, ["url"]),
  ]
  return (candidates.find((u) => typeof u === "string" && u.startsWith("http")) as string) ?? null
}

// Baixa o PDF assinado direto da URL do payload (S3 presigned, expira ~5min) e sobe
// pro bucket privado. Retorna o storage_path em sucesso, null caso contrário.
async function downloadSignedPdf(
  admin: ReturnType<typeof createAdminClient>,
  signedUrl: string,
  storagePath: string
): Promise<string | null> {
  try {
    const res = await fetch(signedUrl)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const { error } = await admin.storage
      .from("pastas")
      .upload(storagePath, buf, { contentType: "application/pdf", upsert: true })
    return error ? null : storagePath
  } catch (e) {
    console.error("[clicksign] erro ao baixar PDF assinado", storagePath, e)
    return null
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text()

  const hmacHeader = req.headers.get("content-hmac") ?? req.headers.get("Content-Hmac")

  if (!verifyClicksignHmac(rawBody, hmacHeader, process.env.CLICKSIGN_WEBHOOK_HMAC_SECRET)) {
    return NextResponse.json({ error: "HMAC inválido" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const { event, documentKey, envelopeId } = parseWebhook(payload)

  if (!event || (!documentKey && !envelopeId)) {
    return NextResponse.json({ ok: true, ignored: "sem event/id" })
  }

  const admin = createAdminClient()
  // Casa pelo document.key (formato real); fallback por envelope id (v2).
  let query = admin
    .from("signature_envelopes")
    .select("id, status, signed_storage_path")
  query = documentKey
    ? query.eq("clicksign_document_id", documentKey)
    : query.eq("clicksign_envelope_id", envelopeId as string)
  const { data: row } = await query.maybeSingle()

  if (!row) {
    return NextResponse.json({ ok: true, ignored: "documento desconhecido" })
  }

  const newStatus = mapEventToStatus(event)
  const update: Record<string, unknown> = { last_event: event, updated_at: new Date().toISOString() }
  if (newStatus) update.status = newStatus

  // Finalizado → baixa o PDF assinado do payload uma única vez (idempotente).
  if ((newStatus === "closed" || newStatus === "signed") && !row.signed_storage_path) {
    const signedUrl = findSignedUrl(deepGet(payload, ["document"]) as Record<string, unknown> | undefined)
    if (signedUrl) {
      const signedPath = await downloadSignedPdf(admin, signedUrl, `assinados/${row.id}.pdf`)
      if (signedPath) update.signed_storage_path = signedPath
    }
  }

  await admin.from("signature_envelopes").update(update).eq("id", row.id)

  return NextResponse.json({ ok: true })
}
