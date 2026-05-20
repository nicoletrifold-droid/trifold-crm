export interface CalendlyEvent {
  uri: string
  name: string
  start_time: string
  end_time: string
  status: "active" | "canceled"
}

export interface CalendlyInvitee {
  name: string
  email: string
}

function extractUuid(uri: string): string {
  return uri.split("/").pop() ?? uri
}

export async function fetchScheduledEvents(
  pat: string,
  userUri: string,
  minStartTime: string,
  maxStartTime: string
): Promise<CalendlyEvent[]> {
  const events: CalendlyEvent[] = []
  let pageToken: string | null = null

  do {
    const url = new URL("https://api.calendly.com/scheduled_events")
    url.searchParams.set("user", userUri)
    url.searchParams.set("min_start_time", minStartTime)
    url.searchParams.set("max_start_time", maxStartTime)
    url.searchParams.set("count", "100")
    if (pageToken) url.searchParams.set("page_token", pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${pat}` },
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      throw new Error(`Calendly API error ${res.status}: ${await res.text()}`)
    }

    const data = (await res.json()) as {
      collection: CalendlyEvent[]
      pagination: { next_page_token: string | null }
    }

    events.push(...data.collection)
    pageToken = data.pagination.next_page_token
  } while (pageToken)

  return events
}

export async function fetchEventInvitees(
  pat: string,
  eventUri: string
): Promise<CalendlyInvitee[]> {
  const uuid = extractUuid(eventUri)
  const res = await fetch(
    `https://api.calendly.com/scheduled_events/${uuid}/invitees`,
    {
      headers: { Authorization: `Bearer ${pat}` },
      signal: AbortSignal.timeout(30000),
    }
  )

  if (!res.ok) {
    throw new Error(
      `Calendly invitees API error ${res.status}: ${await res.text()}`
    )
  }

  const data = (await res.json()) as { collection: CalendlyInvitee[] }
  return data.collection
}
