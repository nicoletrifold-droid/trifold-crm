import { createSign } from "crypto"

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID

// Story 81-4 (2026-07-17) desligou o Google Calendar; **Story 75-275 (2026-08-05)
// RELIGOU**, por um motivo de negócio que o link público nunca cobriu: a equipe de
// apoio (copa) precisa VER as visitas para preparar café, e a agenda do CRM não é
// visível para quem não usa o CRM.
//
// Kill-switch segue em CONSTANTE (não env var — gotcha de env vazia do Vercel):
// para DESLIGAR de novo, troque para `true` e faça redeploy. Todos os pontos de
// criação/atualização/exclusão de evento (rotas web e Nicole, que recebe as funções
// injetadas) passam por este arquivo — nenhum outro ponto a mexer.
const GOOGLE_CALENDAR_DISABLED = false

function isConfigured(): boolean {
  if (GOOGLE_CALENDAR_DISABLED) return false
  return !!(GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY && GOOGLE_CALENDAR_ID)
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function makeJwt(): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64url(
    JSON.stringify({
      iss: GOOGLE_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  )
  const signingInput = `${header}.${payload}`
  const sign = createSign("RSA-SHA256")
  sign.update(signingInput)
  const signature = base64url(sign.sign(GOOGLE_PRIVATE_KEY!))
  return `${signingInput}.${signature}`
}

async function getAccessToken(): Promise<string> {
  const jwt = makeJwt()
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google OAuth error ${res.status}: ${text}`)
  }
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export interface CreateCalendarEventOptions {
  title: string
  description?: string
  startAt: Date
  endAt: Date
  /**
   * Story 75-275 — HOUSE e IMOB dividem o MESMO calendário (decisão do Marcos), então
   * a visita IMOB leva prefixo no título para a copa distinguir. O prefixo é aplicado
   * aqui, num só lugar: são 4 pontos de criação de appointment no sistema, e cada um
   * que montasse o próprio título seria um lugar a mais para esquecer a marcação.
   */
  team?: "house" | "imob" | null
}

/** Título como aparece no Google — visita IMOB marcada, HOUSE limpa. */
function eventSummary(title: string, team?: "house" | "imob" | null): string {
  return team === "imob" ? `[IMOB] ${title}` : title
}

/**
 * Story 75-275 — NÃO existe `attendeeEmail`, e isso é deliberado.
 *
 * O calendário é `housetrifold@gmail.com`, conta Gmail comum: sem Google Workspace não
 * há Domain-Wide Delegation, e **service account sem DWD não consegue convidar
 * ninguém** — o Google responde 403 e derruba a criação do evento INTEIRO, não só o
 * convite. Como esta função é fail-open, o efeito era um `null` silencioso: o
 * agendamento nascia sem espelho e ninguém ficava sabendo. É a suspeita mais forte para
 * a integração parecer instável antes de ser desligada em julho.
 *
 * Ou seja: adicionar convidado aqui não é "um recurso a mais", é quebrar o espelho.
 */
export async function createCalendarEvent(
  opts: CreateCalendarEventOptions
): Promise<string | null> {
  if (!isConfigured()) return null

  try {
    const accessToken = await getAccessToken()

    const event: Record<string, unknown> = {
      summary: eventSummary(opts.title, opts.team),
      description: opts.description ?? "",
      start: { dateTime: opts.startAt.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: opts.endAt.toISOString(), timeZone: "America/Sao_Paulo" },
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID!)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!res.ok) {
      const text = await res.text()
      console.error(`[google-calendar] createEvent error ${res.status}: ${text}`)
      return null
    }

    const data = (await res.json()) as { id: string }
    return data.id
  } catch (err) {
    console.error("[google-calendar] createCalendarEvent failed:", err)
    return null
  }
}

/**
 * Story 75-275 — MOVE um evento existente (remarcação).
 *
 * Existe porque a lacuna mais séria do espelho não era a criação: era remarcar. O PATCH
 * de appointments só apagava o evento quando o status virava `cancelled`, então arrastar
 * uma visita de 10h para 15h deixava o Google marcando 10h — **e a copa preparava café
 * na hora errada**, o que é pior do que não ter espelho nenhum.
 *
 * Usa `events.patch` em vez de delete+create de propósito: preserva o id do evento, então
 * quem já tinha aberto a visita no Google não perde a referência, e o `google_event_id`
 * guardado no banco continua valendo.
 *
 * Devolve `true` quando o Google confirmou. `false` inclui o caso 404/410 (evento não
 * existe mais lá — apagado à mão, por exemplo), que o chamador trata recriando.
 */
export async function updateCalendarEvent(
  googleEventId: string,
  opts: CreateCalendarEventOptions
): Promise<boolean> {
  if (!isConfigured()) return false

  try {
    const accessToken = await getAccessToken()

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID!)}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: eventSummary(opts.title, opts.team),
          description: opts.description ?? "",
          start: { dateTime: opts.startAt.toISOString(), timeZone: "America/Sao_Paulo" },
          end: { dateTime: opts.endAt.toISOString(), timeZone: "America/Sao_Paulo" },
        }),
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!res.ok) {
      const text = await res.text()
      console.error(`[google-calendar] updateEvent error ${res.status}: ${text}`)
      return false
    }
    return true
  } catch (err) {
    console.error("[google-calendar] updateCalendarEvent failed:", err)
    return false
  }
}

export async function deleteCalendarEvent(googleEventId: string): Promise<void> {
  if (!isConfigured()) return

  try {
    const accessToken = await getAccessToken()

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID!)}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const text = await res.text()
      console.error(`[google-calendar] deleteEvent error ${res.status}: ${text}`)
    }
  } catch (err) {
    console.error("[google-calendar] deleteCalendarEvent failed:", err)
  }
}
