import { createSign } from "crypto"

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID

function isConfigured(): boolean {
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
  attendeeEmail?: string
}

export async function createCalendarEvent(
  opts: CreateCalendarEventOptions
): Promise<string | null> {
  if (!isConfigured()) return null

  try {
    const accessToken = await getAccessToken()

    const event: Record<string, unknown> = {
      summary: opts.title,
      description: opts.description ?? "",
      start: { dateTime: opts.startAt.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: opts.endAt.toISOString(), timeZone: "America/Sao_Paulo" },
    }

    if (opts.attendeeEmail) {
      event.attendees = [{ email: opts.attendeeEmail }]
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
