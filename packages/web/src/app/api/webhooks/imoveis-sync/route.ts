import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { createHmac, timingSafeEqual } from "crypto"

const WEBHOOK_SECRET = process.env.IMOVEIS_SYNC_WEBHOOK_SECRET

type UnitStatus = "available" | "reserved" | "sold" | "unavailable"

// Accepts both Portuguese and English status values
const STATUS_MAP: Record<string, UnitStatus> = {
  disponivel: "available",
  disponível: "available",
  available: "available",
  reservado: "reserved",
  reservada: "reserved",
  reserved: "reserved",
  vendido: "sold",
  vendida: "sold",
  sold: "sold",
  indisponivel: "unavailable",
  indisponível: "unavailable",
  unavailable: "unavailable",
}

interface WebhookPayload {
  event: string
  timestamp: string
  data: {
    unit_code: string
    property_slug: string
    status: string
    changed_at?: string
  }
}

function verifySignature(rawBody: string, signatureHeader: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.error("[imoveis-sync] IMOVEIS_SYNC_WEBHOOK_SECRET not configured")
    return false
  }
  const expected = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex")}`
  try {
    const expectedBuf = Buffer.from(expected)
    const receivedBuf = Buffer.from(signatureHeader)
    if (expectedBuf.length !== receivedBuf.length) return false
    return timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-signature-256") ?? ""
  const signatureValid = verifySignature(rawBody, signature)

  let payload: WebhookPayload | null = null
  try {
    payload = JSON.parse(rawBody)
  } catch {
    // logged below as invalid_json
  }

  const supabase = createAdminClient()

  // Persistir todo request em webhook_logs antes de qualquer early return;
  // falha no log nunca quebra o processamento do webhook
  let logId: string | null = null
  try {
    const { data: logEntry } = await supabase
      .from("webhook_logs")
      .insert({
        source: "imoveis_sync",
        event_type: typeof payload?.event === "string" ? payload.event : null,
        payload: payload ?? { raw: rawBody.slice(0, 10_000) },
        signature_valid: signatureValid,
        processed: false,
      })
      .select("id")
      .single()
    logId = logEntry?.id ?? null
  } catch {
    // fail-safe
  }

  const updateLog = async (fields: Record<string, unknown>) => {
    if (!logId) return
    try {
      await supabase.from("webhook_logs").update(fields).eq("id", logId)
    } catch {
      // fail-safe
    }
  }

  if (!signatureValid) {
    await updateLog({ processing_error: "invalid_signature" })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!payload) {
    await updateLog({ processing_error: "invalid_json" })
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Acknowledge non-status events gracefully (future-proof)
  if (payload.event !== "unit.status_changed") {
    await updateLog({ processed: true })
    return NextResponse.json({ received: true, event: payload.event })
  }

  const { unit_code, property_slug, status } = payload.data ?? {}

  if (!unit_code || !property_slug || !status) {
    await updateLog({ processing_error: "missing_fields" })
    return NextResponse.json(
      { error: "Missing required fields: unit_code, property_slug, status" },
      { status: 422 }
    )
  }

  const mappedStatus = STATUS_MAP[status.toLowerCase().trim()]
  if (!mappedStatus) {
    await updateLog({ processing_error: `unrecognized_status: ${status}` })
    return NextResponse.json(
      { error: `Unrecognized status value: "${status}". Accepted: disponivel, reservado, vendido, indisponivel` },
      { status: 422 }
    )
  }

  // Find property by slug
  const { data: property, error: propError } = await supabase
    .from("properties")
    .select("id, org_id, name")
    .eq("slug", property_slug)
    .eq("is_active", true)
    .single()

  if (propError || !property) {
    await updateLog({ processing_error: `property_not_found: ${property_slug}` })
    return NextResponse.json(
      { error: `Property not found with slug: "${property_slug}"` },
      { status: 404 }
    )
  }

  // Update unit status
  const { data: updatedUnit, error: unitError } = await supabase
    .from("units")
    .update({
      status: mappedStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("property_id", property.id)
    .eq("identifier", unit_code)
    .eq("is_active", true)
    .select("id, identifier")
    .single()

  if (unitError || !updatedUnit) {
    await updateLog({
      org_id: property.org_id,
      processing_error: `unit_not_found: ${unit_code}`,
    })
    return NextResponse.json(
      { error: `Unit not found: "${unit_code}" in property "${property_slug}"` },
      { status: 404 }
    )
  }

  // Recalculate and update available_units count on the property
  const { count } = await supabase
    .from("units")
    .select("*", { count: "exact", head: true })
    .eq("property_id", property.id)
    .eq("status", "available")
    .eq("is_active", true)

  if (count !== null) {
    await supabase
      .from("properties")
      .update({ available_units: count })
      .eq("id", property.id)
  }

  await updateLog({ org_id: property.org_id, processed: true })

  return NextResponse.json({
    received: true,
    property: property_slug,
    unit: unit_code,
    status: mappedStatus,
    available_units: count ?? undefined,
  })
}
