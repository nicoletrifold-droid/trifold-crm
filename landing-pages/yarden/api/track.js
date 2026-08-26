// Proxy serverless — repassa os eventos de TOPO de funil (`ViewContent`,
// `InitiateCheckout`) da landing para o CRM, mantendo o token secreto fora do
// browser. Story 86-11 (AC5, AC7) · Story 86-12 (AC8).
//
// Par de `lead.js`: aquele leva o lead + `Lead`/`CompleteRegistration`; este leva
// os eventos que acontecem ANTES de existir um lead. Os helpers de CORS e
// sanitização são repetidos aqui de propósito — este projeto Vercel não tem
// bundler nem dependências declaradas, e um `require` entre funções acrescentaria
// risco de deploy (publicação é manual, sem CI) para economizar ~30 linhas.
//
// Diferente de `lead.js`, este arquivo NÃO tem campo `page`: a rota `/track` do
// CRM não grava nada (é telemetria de marketing), então não há nada para rotular
// além do `landing` que segmenta os eventos no Meta.
const CRM_TRACK_URL =
  process.env.CRM_TRACK_URL || "https://crm.trifold.eng.br/api/webhooks/landing-page/track"

const ALLOWED_ORIGINS = [
  "https://yarden.vercel.app",
  "https://trifold.eng.br",
  "https://www.trifold.eng.br",
]

/**
 * Slug da landing para os eventos CAPI (Story 86-12 AC5/AC8).
 *
 * Constante DESTE arquivo, nunca lida do corpo — ver a justificativa em
 * `lead.js`. O corpo desta rota já É o bloco de tracking, então o campo vai na
 * raiz do payload (e não dentro de `payload.tracking`, como no `lead.js`).
 */
const LANDING_SLUG = "yarden"

const MAX_FIELD_LENGTH = 300
const MAX_UA_LENGTH = 512

// Allowlist: só o que o browser tem de fato para contar. `event_name` e
// `event_id` são validados no CRM contra a lista fixa de eventos aceitos —
// `Lead` e `CompleteRegistration` NÃO passam por aqui, eles só nascem quando o
// servidor confirma que o lead existe. `landing` também não entra: é constante
// deste arquivo, não dado do browser.
const TRACK_FIELDS = [
  "event_name",
  "event_id",
  "visitor_id",
  "fbc",
  "fbp",
  "fbclid",
  "page_url",
]

function resolveCorsOrigin(req) {
  const origin = req.headers.origin || ""
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
}

function sanitizeField(value, maxLength) {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLength || MAX_FIELD_LENGTH)
}

/** IP e User-Agent reais do visitante — ver a justificativa em `lead.js`. */
function sinaisDoVisitante(req) {
  const fwd = req.headers["x-forwarded-for"]
  const primeiro = typeof fwd === "string" ? fwd.split(",")[0] : Array.isArray(fwd) ? fwd[0] : ""
  return {
    client_ip: sanitizeField(primeiro, 64) || sanitizeField(req.headers["x-real-ip"], 64),
    client_ua: sanitizeField(req.headers["user-agent"], MAX_UA_LENGTH),
  }
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
    console.error("[track-proxy] LANDING_PAGE_WEBHOOK_SECRET não configurado")
    return res.status(503).json({ error: "Not configured" })
  }

  const rawBody = req.body && typeof req.body === "object" ? req.body : {}

  const payload = {}
  for (const campo of TRACK_FIELDS) {
    const valor = sanitizeField(rawBody[campo], campo === "page_url" ? 512 : MAX_FIELD_LENGTH)
    if (valor) payload[campo] = valor
  }

  if (!payload.event_name || !payload.event_id) {
    return res.status(400).json({ error: "Missing required fields" })
  }

  // Sempre do header, nunca do corpo: o browser não dita seu próprio IP/UA.
  const visitante = sinaisDoVisitante(req)
  if (visitante.client_ip) payload.client_ip = visitante.client_ip
  if (visitante.client_ua) payload.client_ua = visitante.client_ua

  // Sempre da constante, nunca do corpo — sobrescreve o que o browser mandar.
  payload.landing = LANDING_SLUG

  try {
    const upstream = await fetch(`${CRM_TRACK_URL}?token=${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!upstream.ok) {
      console.error("[track-proxy] upstream respondeu", upstream.status)
      return res.status(502).json({ error: "Upstream error" })
    }

    return res.status(200).json({ status: "ok" })
  } catch (err) {
    // Só a mensagem — nunca o corpo, que carrega os sinais de atribuição (AC10).
    console.error("[track-proxy] erro:", err && err.message ? err.message : err)
    return res.status(500).json({ error: "Internal error" })
  }
}
