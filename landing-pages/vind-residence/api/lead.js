// Proxy serverless — recebe o lead do formulário da landing e repassa para o
// webhook de leads do trifold-crm, mantendo o token secreto fora do browser.
const CRM_WEBHOOK_URL =
  process.env.CRM_WEBHOOK_URL || "https://crm.trifold.eng.br/api/webhooks/landing-page"

// Origens autorizadas a chamar este proxy. Ao trocar de empreendimento ou
// promover para o domínio final, adicione a nova origem aqui.
const ALLOWED_ORIGINS = [
  "https://vind-residence-teste.vercel.app",
]

const MAX_FIELD_LENGTH = 300

function resolveCorsOrigin(req) {
  const origin = req.headers.origin || ""
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
}

function sanitizeField(value) {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, MAX_FIELD_LENGTH)
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", resolveCorsOrigin(req))
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.setHeader("Vary", "Origin")

  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const secret = (process.env.LANDING_PAGE_WEBHOOK_SECRET || "").trim()
  if (!secret) {
    console.error("[lead-proxy] LANDING_PAGE_WEBHOOK_SECRET não configurado")
    return res.status(503).json({ error: "Not configured" })
  }

  const rawBody = req.body && typeof req.body === "object" ? req.body : {}

  // Honeypot: campo invisível no formulário. Bots que preenchem tudo caem aqui;
  // usuários reais nunca veem esse campo. Responde 200 "ok" sem repassar ao CRM,
  // para não sinalizar ao bot que foi identificado.
  if (sanitizeField(rawBody.empresa)) {
    console.warn("[lead-proxy] honeypot acionado — descartado silenciosamente")
    return res.status(200).json({ status: "ok" })
  }

  const nome = sanitizeField(rawBody.nome)
  const whatsapp = sanitizeField(rawBody.whatsapp)
  const email = sanitizeField(rawBody.email)

  if (!nome && !whatsapp && !email) {
    return res.status(400).json({ error: "Missing required fields" })
  }

  try {
    const payload = { nome, whatsapp, email, page: "vind-residence" }

    const upstream = await fetch(`${CRM_WEBHOOK_URL}?token=${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!upstream.ok) {
      console.error("[lead-proxy] upstream respondeu", upstream.status)
      return res.status(502).json({ error: "Upstream error" })
    }

    return res.status(200).json({ status: "ok" })
  } catch (err) {
    console.error("[lead-proxy] erro:", err)
    return res.status(500).json({ error: "Internal error" })
  }
}
