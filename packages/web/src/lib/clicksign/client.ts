// Story 75-120 — Cliente da API Clicksign 3.0 (Envelope).
// Documentação: https://developers.clicksign.com/reference/comece-agora
// Autenticação por Access Token (header Authorization). Formato JSON:API
// (Content-Type: application/vnd.api+json).
//
// Ambiente é definido 100% por env var — o MESMO código serve sandbox e produção,
// só troca CLICKSIGN_API_BASE_URL + CLICKSIGN_API_TOKEN no deploy:
//   sandbox  → https://sandbox.clicksign.com/api/v3
//   produção → https://app.clicksign.com/api/v3

const JSON_API = "application/vnd.api+json"

function baseUrl(): string {
  return (
    process.env.CLICKSIGN_API_BASE_URL ?? "https://sandbox.clicksign.com/api/v3"
  ).replace(/\/$/, "")
}

function token(): string {
  const t = process.env.CLICKSIGN_API_TOKEN
  if (!t) throw new Error("CLICKSIGN_API_TOKEN não configurado")
  return t
}

async function call<T = unknown>(
  method: string,
  path: string,
  payload?: unknown
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      Authorization: token(),
      "Content-Type": JSON_API,
      Accept: JSON_API,
    },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const detail =
      json?.errors?.[0]?.detail ?? json?.errors?.[0]?.title ?? res.statusText
    throw new Error(`Clicksign ${method} ${path} → ${res.status}: ${detail}`)
  }
  return json as T
}

type IdResponse = { data: { id: string; attributes?: Record<string, unknown> } }

export async function createEnvelope(name: string): Promise<string> {
  const r = await call<IdResponse>("POST", "/envelopes", {
    data: { type: "envelopes", attributes: { name } },
  })
  return r.data.id
}

export async function addDocument(
  envelopeId: string,
  filename: string,
  contentBase64DataUri: string
): Promise<string> {
  const r = await call<IdResponse>("POST", `/envelopes/${envelopeId}/documents`, {
    data: {
      type: "documents",
      attributes: { filename, content_base64: contentBase64DataUri },
    },
  })
  return r.data.id
}

export async function addSigner(
  envelopeId: string,
  attrs: { name: string; email?: string; phone_number?: string }
): Promise<string> {
  const r = await call<IdResponse>("POST", `/envelopes/${envelopeId}/signers`, {
    data: { type: "signers", attributes: attrs },
  })
  return r.data.id
}

function requirementPayload(
  documentId: string,
  signerId: string,
  attributes: Record<string, string>
) {
  return {
    data: {
      type: "requirements",
      attributes,
      relationships: {
        document: { data: { type: "documents", id: documentId } },
        signer: { data: { type: "signers", id: signerId } },
      },
    },
  }
}

/**
 * Cria os dois requisitos de um signatário: papel (assinar) + autenticação.
 * authMethod: "email" | "sms" | "whatsapp" | "icp_brasil" ...
 */
export async function addRequirements(
  envelopeId: string,
  documentId: string,
  signerId: string,
  authMethod: string
): Promise<void> {
  await call("POST", `/envelopes/${envelopeId}/requirements`, requirementPayload(documentId, signerId, { action: "agree", role: "sign" }))
  await call("POST", `/envelopes/${envelopeId}/requirements`, requirementPayload(documentId, signerId, { action: "provide_evidence", auth: authMethod }))
}

export async function activateEnvelope(envelopeId: string): Promise<void> {
  await call("PATCH", `/envelopes/${envelopeId}`, {
    data: { id: envelopeId, type: "envelopes", attributes: { status: "running" } },
  })
}

export async function notifyEnvelope(envelopeId: string): Promise<void> {
  await call("POST", `/envelopes/${envelopeId}/notifications`, {
    data: { type: "notifications", attributes: {} },
  })
}

/** Detalhe do envelope (usado pelo webhook p/ resolver status/documento assinado). */
export async function getEnvelope(envelopeId: string): Promise<Record<string, unknown>> {
  return call("GET", `/envelopes/${envelopeId}`)
}

/** Lista documentos do envelope (para achar a URL do PDF finalizado). */
export async function getEnvelopeDocuments(envelopeId: string): Promise<{ data: Array<{ id: string; attributes?: Record<string, unknown> }> }> {
  return call("GET", `/envelopes/${envelopeId}/documents`)
}

export interface SendForSignatureInput {
  envelopeName: string
  filename: string
  contentBase64DataUri: string
  signer: { name: string; email?: string; phone?: string }
  authMethod: string
}

export interface SendForSignatureResult {
  envelopeId: string
  documentId: string
  signerId: string
}

/**
 * Orquestra a sequência completa: cria envelope → anexa doc → adiciona
 * signatário → cria requisitos → ativa → notifica. Retorna os ids da Clicksign.
 * Validado ponta-a-ponta no sandbox (Story 75-120).
 */
export async function sendDocumentForSignature(
  input: SendForSignatureInput
): Promise<SendForSignatureResult> {
  const envelopeId = await createEnvelope(input.envelopeName)
  const documentId = await addDocument(envelopeId, input.filename, input.contentBase64DataUri)
  const signerId = await addSigner(envelopeId, {
    name: input.signer.name,
    ...(input.signer.email ? { email: input.signer.email } : {}),
    ...(input.signer.phone ? { phone_number: input.signer.phone } : {}),
  })
  await addRequirements(envelopeId, documentId, signerId, input.authMethod)
  await activateEnvelope(envelopeId)
  await notifyEnvelope(envelopeId)
  return { envelopeId, documentId, signerId }
}
