// Story 75-120 — Verificação e parsing dos webhooks da Clicksign.
// HMAC: header `Content-Hmac: sha256=<hex>`, HMAC-SHA256 do corpo RAW com o
// segredo definido ao criar o webhook no painel da Clicksign.
// Doc: https://developers.clicksign.com/docs/seguranca-de-webhooks

import { createHmac, timingSafeEqual } from "crypto"

/**
 * Valida a assinatura HMAC do webhook. `rawBody` deve ser o corpo exatamente
 * como recebido (string, sem re-serializar). Retorna true se bater.
 */
export function verifyClicksignHmac(
  rawBody: string,
  headerValue: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !headerValue) return false
  const received = headerValue.replace(/^sha256=/i, "").trim().toLowerCase()
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const a = Buffer.from(received, "hex")
  const b = Buffer.from(expected, "hex")
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

export type EnvelopeStatus =
  | "draft"
  | "running"
  | "signed"
  | "refused"
  | "canceled"
  | "closed"
  | "error"

/**
 * Mapeia o nome do evento Clicksign → status interno do envelope.
 * `close`/`auto_close`/`document_closed` = todos assinaram (finalizado).
 * `sign` = alguém assinou (na v1, 1 signatário, já consideramos assinado).
 * Retorna null para eventos que não mudam status (ex.: `add_signer`, `upload`).
 */
export function mapEventToStatus(event: string): EnvelopeStatus | null {
  switch (event) {
    case "sign":
      return "signed"
    case "close":
    case "auto_close":
    case "document_closed":
      return "closed"
    case "refusal":
      return "refused"
    case "cancel":
      return "canceled"
    case "deadline":
      return "canceled"
    default:
      return null
  }
}

/** Lê um caminho aninhado de um objeto desconhecido sem usar `any`. */
export function deepGet(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj
  for (const key of path) {
    if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key as string]
    } else {
      return undefined
    }
  }
  return cur
}

function firstString(obj: unknown, paths: (string | number)[][]): string | null {
  for (const p of paths) {
    const v = deepGet(obj, p)
    if (typeof v === "string" && v) return v
  }
  return null
}

/**
 * Extrai { event, documentKey, envelopeId } do payload do webhook.
 * Formato real (confirmado no sandbox — legado/v1): `{ event: { name }, document: { key } }`,
 * onde `document.key` casa com `signature_envelopes.clicksign_document_id`. Mantemos os
 * caminhos v2/JSON:API como fallback (`envelopeId`) caso a conta migre de formato.
 */
export function parseWebhook(body: unknown): {
  event: string | null
  documentKey: string | null
  envelopeId: string | null
} {
  if (!body || typeof body !== "object") return { event: null, documentKey: null, envelopeId: null }

  const event = firstString(body, [
    ["event", "name"],
    ["data", "attributes", "event", "name"],
    ["data", "attributes", "name"],
    ["data", "type"],
    ["type"],
  ])

  // v1 (formato real): identificador do documento em `document.key`.
  const documentKey = firstString(body, [
    ["document", "key"],
    ["data", "attributes", "document", "key"],
  ])

  // v2/JSON:API (fallback): id do envelope.
  const envelopeId =
    firstString(body, [
      ["event", "data", "envelope", "id"],
      ["data", "relationships", "envelope", "data", "id"],
      ["data", "attributes", "envelope", "id"],
      ["envelope", "id"],
    ]) ?? (deepGet(body, ["data", "type"]) === "envelopes" ? (firstString(body, [["data", "id"]])) : null)

  return { event, documentKey, envelopeId }
}
