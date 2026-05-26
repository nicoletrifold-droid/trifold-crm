/**
 * AI appointment detection flow.
 * Detects appointment intent from user messages and extracts
 * date/time information when available.
 */

const APPOINTMENT_KEYWORDS = [
  "agendar",
  "visitar",
  "visita",
  "conhecer o decorado",
  "horario",
  "horário",
  "disponivel",
  "disponível",
] as const

const DAY_KEYWORDS = [
  "segunda",
  "terca",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "sábado",
  "amanha",
  "amanhã",
  "semana que vem",
] as const

const DATE_PATTERN = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/

const TIME_PATTERN = /(\d{1,2})[h:](\d{2})?\s*(?:h(?:oras)?)?/i
const TIME_SIMPLE_PATTERN = /(?:às|as|para as)\s+(\d{1,2})\s*(?:h(?:oras)?)?/i

interface AppointmentDetection {
  detected: boolean
  date?: string
  time?: string
  raw?: string
}

/**
 * Detects whether a message contains appointment scheduling intent
 * and extracts date/time information when present.
 */
export function detectAppointmentIntent(
  message: string,
  collectedData: Record<string, unknown>
): AppointmentDetection {
  const lower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const lowerOriginal = message.toLowerCase()

  // Check for appointment keywords
  const hasKeyword = APPOINTMENT_KEYWORDS.some((kw) => {
    const normalized = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    return lower.includes(normalized)
  })

  // Check for day keywords
  const hasDayKeyword = DAY_KEYWORDS.some((kw) => {
    const normalized = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    return lower.includes(normalized)
  })

  // Check for date pattern
  const dateMatch = message.match(DATE_PATTERN)

  // Consider visit_availability from collected data as supporting signal
  const hasVisitAvailability = collectedData.visit_availability === true

  const detected = hasKeyword || hasDayKeyword || !!dateMatch || hasVisitAvailability

  if (!detected) {
    return { detected: false }
  }

  const result: AppointmentDetection = {
    detected: true,
    raw: message.trim(),
  }

  // Extract date
  if (dateMatch) {
    const day = dateMatch[1]!.padStart(2, "0")
    const month = dateMatch[2]!.padStart(2, "0")
    const year = dateMatch[3]
      ? dateMatch[3].length === 2
        ? `20${dateMatch[3]}`
        : dateMatch[3]
      : new Date().getFullYear().toString()
    result.date = `${year}-${month}-${day}`
  } else {
    // Try to extract day keyword as date hint
    for (const dayKw of DAY_KEYWORDS) {
      const normalized = dayKw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      if (lower.includes(normalized)) {
        result.date = dayKw
        break
      }
    }
  }

  // Extract time
  const timeMatch = message.match(TIME_PATTERN)
  const timeSimpleMatch = message.match(TIME_SIMPLE_PATTERN)

  if (timeMatch) {
    const hours = timeMatch[1]!.padStart(2, "0")
    const minutes = (timeMatch[2] || "00").padStart(2, "0")
    result.time = `${hours}:${minutes}`
  } else if (timeSimpleMatch) {
    const hours = timeSimpleMatch[1]!.padStart(2, "0")
    result.time = `${hours}:00`
  }

  return result
}
