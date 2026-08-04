import {
  normalizeEmail,
  normalizeName,
  normalizePhoneForCapi,
  sha256Hex,
} from './capi-hashing'

/**
 * Meta Conversions API (CAPI) payload builders.
 *
 * Pure functions that construct the `user_data` and event payloads sent to the
 * Meta CAPI `/events` endpoint. No network I/O here — the HTTP send lives in
 * `capi-client.ts`. Keeping these pure makes the AC5 guarantee (no raw PII in
 * the payload except the explicitly-allowed fields) trivially testable.
 *
 * [Story 86-3]
 */

/**
 * The `user_data` object of a CAPI event.
 *
 * Hashed fields (`em`, `ph`, `fn`, `ln`, `external_id`) are arrays of SHA-256
 * hex strings — Meta accepts multiple values per field. The remaining fields
 * (`fbc`, `fbp`, `client_ip_address`, `client_user_agent`) are Meta-defined
 * matching signals that MUST be sent in PLAIN TEXT — hashing them breaks matching.
 */
export interface CapiUserData {
  /** SHA-256(email) */
  em?: string[]
  /** SHA-256(phone, E.164 without `+`) */
  ph?: string[]
  /** SHA-256(first name) */
  fn?: string[]
  /** SHA-256(last name) */
  ln?: string[]
  /** SHA-256(leadId) — always present */
  external_id: string[]
  /** Facebook click id cookie (`_fbc`) — PLAIN TEXT, never hashed */
  fbc?: string
  /** Facebook browser id cookie (`_fbp`) — PLAIN TEXT, never hashed */
  fbp?: string
  /** Client IP — PLAIN TEXT, never hashed */
  client_ip_address?: string
  /** Client User-Agent — PLAIN TEXT, never hashed */
  client_user_agent?: string
}

export interface CapiCustomData {
  content_name: string
  currency: string
  value: number
}

export interface CapiEvent {
  event_name: string
  event_time: number
  event_id: string
  action_source: string
  user_data: CapiUserData
  custom_data: CapiCustomData
}

export interface BuildCapiUserDataInput {
  /** Full name; split into first (`fn`) / last (`ln`) on the first space. */
  name?: string
  email?: string
  phone?: string
  /** Lead id — always hashed into `external_id`. Required. */
  leadId: string
  fbc?: string
  fbp?: string
  clientIp?: string
  clientUserAgent?: string
}

/**
 * Build the CAPI `user_data` object from raw lead attributes.
 *
 * - `em` / `ph` / `fn` / `ln` are normalized then SHA-256 hashed; each key is
 *   omitted when its source value is absent/empty (or, for phone, when
 *   normalization fails).
 * - Name splitting is intentionally simple: first whitespace-delimited token is
 *   the first name (`fn`), the remainder is the last name (`ln`). A single-token
 *   name yields only `fn`. This is a deliberate heuristic, not a name-parsing
 *   library.
 * - `external_id` is ALWAYS present (`leadId` always exists) — it is the single
 *   highest-impact match key per the tracking audit.
 * - `fbc`, `fbp`, `client_ip_address`, `client_user_agent` pass through in PLAIN
 *   TEXT and are omitted when absent — NEVER hashed (AC5, hard Meta rule).
 */
export function buildCapiUserData(input: BuildCapiUserDataInput): CapiUserData {
  const userData: CapiUserData = {
    external_id: [sha256Hex(input.leadId)],
  }

  if (input.email && input.email.trim().length > 0) {
    userData.em = [sha256Hex(normalizeEmail(input.email))]
  }

  if (input.phone && input.phone.trim().length > 0) {
    const normalizedPhone = normalizePhoneForCapi(input.phone)
    if (normalizedPhone) {
      userData.ph = [sha256Hex(normalizedPhone)]
    }
  }

  if (input.name && input.name.trim().length > 0) {
    const parts = input.name.trim().split(/\s+/)
    // `input.name.trim()` is non-empty here (guarded above), so `split` always
    // yields at least one non-empty token — `first` is guaranteed present.
    const first = parts[0] ?? ''
    const last = parts.slice(1).join(' ')

    if (first.length > 0) {
      userData.fn = [sha256Hex(normalizeName(first))]
    }
    if (last.length > 0) {
      userData.ln = [sha256Hex(normalizeName(last))]
    }
  }

  // Plain-text signals — NEVER hashed. Omit when absent.
  if (input.fbc) userData.fbc = input.fbc
  if (input.fbp) userData.fbp = input.fbp
  if (input.clientIp) userData.client_ip_address = input.clientIp
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent

  return userData
}

export interface BuildVisitouEventInput {
  /** Deterministic dedup id (e.g. `visit_<leadId>`). */
  eventId: string
  /** Unix epoch seconds when the event occurred. */
  eventTime: number
  userData: CapiUserData
  /** Business value of the event. Defaults to `0` — do not invent a lead value. */
  value?: number
}

/**
 * Build the "Visitou" event payload.
 *
 * Maps to the Meta standard event `Schedule` with `action_source:
 * "system_generated"` (the event is emitted 100% by backend automation — DB
 * trigger + cron — never by a direct browser interaction). `custom_data`
 * carries the human-readable label `"Visitou"` and a `BRL` value (default `0`).
 */
export function buildVisitouEvent(input: BuildVisitouEventInput): CapiEvent {
  return {
    event_name: 'Schedule',
    event_time: input.eventTime,
    event_id: input.eventId,
    action_source: 'system_generated',
    user_data: input.userData,
    custom_data: {
      content_name: 'Visitou',
      currency: 'BRL',
      value: input.value ?? 0,
    },
  }
}
