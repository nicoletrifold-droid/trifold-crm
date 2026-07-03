import { NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { verifyClicksignHmac, parseWebhook, mapEventToStatus, deepGet } from "@web/lib/clicksign/webhook"
import { getEnvelopeDocuments } from "@web/lib/clicksign/client"

// Story 75-120 — Webhook da Clicksign. Recebe eventos de assinatura, valida HMAC
// (Content-Hmac: sha256=...), atualiza o status em signature_envelopes e, quando o
// envelope finaliza, baixa o PDF assinado para o bucket privado `pastas`.
// Usa admin client (sem sessão). Idempotente. Sempre responde 200 em evento válido
// para a Clicksign não reenviar; 401 só quando o HMAC não confere.

// Procura uma URL de download do documento assinado no payload da Clicksign.
// O formato exato é confirmado no 1º evento real do sandbox — tentamos campos
// conhecidos e logamos o resto.
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

async function downloadSignedPdf(
  admin: ReturnType<typeof createAdminClient>,
  envelopeId: string,
  storagePath: string
): Promise<string | null> {
  try {
    const docs = await getEnvelopeDocuments(envelopeId)
    for (const d of docs.data ?? []) {
      const url = findSignedUrl(d.attributes)
      if (!url) continue
      const res = await fetch(url)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      const { error } = await admin.storage
        .from("pastas")
        .upload(storagePath, buf, { contentType: "application/pdf", upsert: true })
      if (!error) return storagePath
    }
    console.warn("[clicksign] PDF assinado não encontrado no payload", envelopeId)
    return null
  } catch (e) {
    console.error("[clicksign] erro ao baixar PDF assinado", envelopeId, e)
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

  const { event, envelopeId } = parseWebhook(payload)
  // Log estruturado do 1º contato para ajustarmos o parser ao formato real.
  console.log("[clicksign] webhook", JSON.stringify({ event, envelopeId }))

  if (!event || !envelopeId) {
    return NextResponse.json({ ok: true, ignored: "sem event/envelopeId" })
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from("signature_envelopes")
    .select("id, status, signed_storage_path")
    .eq("clicksign_envelope_id", envelopeId)
    .maybeSingle()

  if (!row) {
    return NextResponse.json({ ok: true, ignored: "envelope desconhecido" })
  }

  const newStatus = mapEventToStatus(event)
  const update: Record<string, unknown> = { last_event: event, updated_at: new Date().toISOString() }
  if (newStatus) update.status = newStatus

  // Envelope finalizado → baixa o PDF assinado uma única vez (idempotente).
  if ((newStatus === "closed" || newStatus === "signed") && !row.signed_storage_path) {
    const signedPath = await downloadSignedPdf(admin, envelopeId, `assinados/${envelopeId}.pdf`)
    if (signedPath) update.signed_storage_path = signedPath
  }

  await admin.from("signature_envelopes").update(update).eq("id", row.id)

  return NextResponse.json({ ok: true })
}
