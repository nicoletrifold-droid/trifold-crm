// Proxy serverless — recebe o lead do formulário da landing e repassa para o
// webhook de leads do trifold-crm, mantendo o token secreto fora do browser.
//
// Story 86-12 (AC8) — clone do proxy do Vind Residence com TRÊS mudanças, e só
// estas: `ALLOWED_ORIGINS` (origem do projeto Vercel `yarden`), `page: "yarden"`
// e `landing: "yarden"` no bloco `tracking`. As URLs do CRM são as mesmas — é o
// mesmo CRM.
const CRM_WEBHOOK_URL =
  process.env.CRM_WEBHOOK_URL || "https://crm.trifold.eng.br/api/webhooks/landing-page"

// Origens autorizadas a chamar este proxy. Ao trocar de empreendimento ou
// promover para o domínio final, adicione a nova origem aqui.
const ALLOWED_ORIGINS = [
  "https://yarden.vercel.app",
  "https://trifold.eng.br",
  "https://www.trifold.eng.br",
]

/**
 * Nome da landing gravado no CRM (Story 86-12 AC8).
 *
 * ⚠️ NÃO é campo de tracking Meta. O CRM o achata em `fields.page` e o persiste
 * em `webhook_logs.payload.page`, `leads.metadata.landing_page`,
 * `leads.metadata.page` e na descrição da activity ("Lead criado via landing
 * page: …"). Um clone que esquecesse de trocar este literal rotularia todo lead
 * do Yarden como Vind Residence no próprio CRM — e nenhum teste de CAPI pegaria.
 */
const PAGE_NAME = "yarden"

/**
 * Slug da landing para os eventos CAPI (Story 86-12 AC5/AC8).
 *
 * Constante DESTE arquivo, nunca lida do corpo: a fonte confiável é o proxy, do
 * mesmo jeito que `client_ip`/`client_ua`. Se viesse do browser, qualquer
 * chamador poderia gravar eventos sob a categoria de outro empreendimento. O CRM
 * ainda valida contra o `Record` fixo em `resolveLandingConfig`.
 */
const LANDING_SLUG = "yarden"

const MAX_FIELD_LENGTH = 300
// User-Agent real passa dos 300 chars com folga; cortar transformaria o UA numa
// string que não casa com nada no Meta. Os demais campos de tracking são curtos.
const MAX_UA_LENGTH = 512

/**
 * Teto próprio para a chamada ao CRM.
 *
 * Sem ele, um CRM que aceite a conexão e não responda (deploy no meio, pool de
 * conexões esgotado, Supabase lento) segura esta função até o `maxDuration` da
 * Vercel matá-la — e aí o browser recebe o erro genérico da plataforma, não o
 * 504 tratado daqui, com o `fail()` do formulário reabilitando o botão.
 *
 * 8s e não 10s de propósito: este projeto não tem `vercel.json`, então vale o
 * `maxDuration` default da plataforma (10s). Um teto igual ao da infra nunca
 * dispararia primeiro — o número TEM de ficar abaixo, com folga para serializar
 * a resposta. Os módulos CAPI do CRM usam 10s (`AbortSignal.timeout(10_000)` em
 * `packages/web/src/lib/meta/`), mas lá quem impõe o limite externo é outro.
 */
const CRM_TIMEOUT_MS = 8000

// Story 86-11 (AC7) — o único bloco extra que este proxy repassa ao CRM. Tudo
// que não estiver aqui é descartado: o proxy não é um encaminhador cego de corpo
// arbitrário. `client_ip`/`client_ua`/`landing` NÃO entram — o browser não os
// dita, eles são preenchidos abaixo (headers que só este proxy enxerga, e a
// constante `LANDING_SLUG`).
const TRACKING_FIELDS = [
  "event_id",
  "complete_registration_event_id",
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

/**
 * IP e User-Agent REAIS do visitante.
 *
 * Este proxy é o único ponto da cadeia que os enxerga: o browser chama esta
 * função diretamente, enquanto o CRM é chamado servidor-a-servidor daqui e só
 * veria o IP do datacenter da Vercel. Por isso os dois viajam no CORPO, e o CRM
 * dá precedência ao corpo sobre os próprios headers (Story 86-11 AC7).
 */
function sinaisDoVisitante(req) {
  const fwd = req.headers["x-forwarded-for"]
  const primeiro = typeof fwd === "string" ? fwd.split(",")[0] : Array.isArray(fwd) ? fwd[0] : ""
  return {
    client_ip: sanitizeField(primeiro, 64) || sanitizeField(req.headers["x-real-ip"], 64),
    client_ua: sanitizeField(req.headers["user-agent"], MAX_UA_LENGTH),
  }
}

/**
 * Monta o bloco `tracking` do payload.
 *
 * Nunca é `null` nesta landing: `landing` é sempre anexado, para que o CRM saiba
 * de qual empreendimento o lead veio mesmo quando o browser não mandou nada de
 * tracking (ad-blocker). Sem `event_id`, o CRM segue não disparando evento
 * algum — o bloco existir não fabrica conversão (86-11 AC10).
 */
function montarTracking(req, rawBody) {
  const recebido =
    rawBody.tracking && typeof rawBody.tracking === "object" && !Array.isArray(rawBody.tracking)
      ? rawBody.tracking
      : {}

  const tracking = {}
  for (const campo of TRACKING_FIELDS) {
    const valor = sanitizeField(recebido[campo], campo === "page_url" ? 512 : MAX_FIELD_LENGTH)
    if (valor) tracking[campo] = valor
  }

  const visitante = sinaisDoVisitante(req)
  if (visitante.client_ip) tracking.client_ip = visitante.client_ip
  if (visitante.client_ua) tracking.client_ua = visitante.client_ua

  // Por último, de propósito: sobrescreve qualquer `landing` que o browser tenha
  // tentado ditar (ele não está em TRACKING_FIELDS, mas a atribuição explícita
  // deixa a garantia visível no lugar onde ela importa).
  tracking.landing = LANDING_SLUG

  return tracking
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
  //
  // `tracked: false` no corpo (Story 86-11) diz ao browser para NÃO disparar
  // `Lead`/`CompleteRegistration` no Pixel: sem contraparte de servidor, o
  // evento sairia sem deduplicação e poluiria o dataset. O status HTTP continua
  // 200, indistinguível de um envio real — é o status que o bot observa.
  if (sanitizeField(rawBody.empresa)) {
    console.warn("[lead-proxy] honeypot acionado — descartado silenciosamente")
    return res.status(200).json({ status: "ok", tracked: false })
  }

  const nome = sanitizeField(rawBody.nome)
  const whatsapp = sanitizeField(rawBody.whatsapp)
  const email = sanitizeField(rawBody.email)

  if (!nome && !whatsapp && !email) {
    return res.status(400).json({ error: "Missing required fields" })
  }

  // `expirou` em vez de checar `err.name === "AbortError"`: o nome do erro de
  // abort varia entre versões de Node/undici, e um abort vindo de outro lugar
  // seria confundido com timeout. A flag é a única fonte que sabe o motivo.
  const controller = new AbortController()
  let expirou = false
  const timer = setTimeout(() => {
    expirou = true
    controller.abort()
  }, CRM_TIMEOUT_MS)

  try {
    const payload = { nome, whatsapp, email, page: PAGE_NAME }
    // Diferença deliberada do proxy do Vind Residence (que faz
    // `if (tracking) payload.tracking = tracking`): aqui `montarTracking` sempre
    // devolve pelo menos `{ landing }`, então o `if` seria código morto.
    payload.tracking = montarTracking(req, rawBody)

    // Token no header `Authorization`, nunca em `?token=`: query string é
    // gravada em texto puro nos logs de plataforma/proxy (Vercel, CDN,
    // observabilidade), o que vazaria o LANDING_PAGE_WEBHOOK_SECRET para quem
    // tiver acesso a log. O CRM aceita as duas formas (Bearer tem precedência
    // sobre `?token=`), então a troca é unilateral — nada muda do outro lado.
    const upstream = await fetch(CRM_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!upstream.ok) {
      console.error("[lead-proxy] upstream respondeu", upstream.status)
      return res.status(502).json({ error: "Upstream error" })
    }

    return res.status(200).json({ status: "ok", tracked: true })
  } catch (err) {
    // 504 e não 500: o CRM não respondeu a tempo, não houve erro deste proxy. O
    // `if(!r.ok)` do formulário trata os dois igual (mostra o erro, reabilita o
    // botão e NÃO dispara Lead/CompleteRegistration no Pixel — sem contraparte
    // de servidor, o evento sairia sem deduplicação), mas o status honesto é o
    // que aparece no log da Vercel para quem for investigar.
    if (expirou) {
      console.error("[lead-proxy] CRM não respondeu em", CRM_TIMEOUT_MS, "ms — abortado")
      return res.status(504).json({ error: "Upstream timeout" })
    }
    // Só a mensagem do erro — nunca o corpo da requisição, que carrega PII e os
    // sinais de atribuição em texto puro (AC10).
    console.error("[lead-proxy] erro:", err && err.message ? err.message : err)
    return res.status(500).json({ error: "Internal error" })
  } finally {
    // Sem isto, o caminho de SUCESSO deixa um timer de 8s armado: a função
    // serverless não encerra enquanto ele não disparar (ou é cobrada por esse
    // tempo, em runtime que reaproveita o processo).
    clearTimeout(timer)
  }
}
