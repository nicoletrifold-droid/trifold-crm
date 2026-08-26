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
  /**
   * SHA-256 de cada identificador estável do usuário. O Meta aceita vários e
   * casa por qualquer um deles — a Story 86-9 envia `visitor_id` (browser) e
   * `leadId` (CRM) juntos, para ligar os eventos anteriores ao nascimento do
   * lead aos posteriores. Omitido quando não há nenhum identificador.
   */
  external_id?: string[]
  /**
   * SHA-256(UF em minúsculas, 2 letras). Derivada do DDD do telefone.
   * NÃO existe um `ct` correspondente — ver `uf-from-ddd.ts` e Story 86-9 AC7.
   */
  st?: string[]
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
  /** Segmenta a origem do evento nas Custom Conversions (ex.: `form_qualificacao`). */
  content_category?: string
}

export interface CapiEvent {
  event_name: string
  event_time: number
  event_id: string
  action_source: string
  user_data: CapiUserData
  custom_data: CapiCustomData
  /**
   * URL da página onde o evento ocorreu. Obrigatória de fato para eventos com
   * `action_source: 'website'` — sem ela o Meta não consegue atribuir o evento
   * à sessão do browser. Ausente nos eventos `system_generated`.
   */
  event_source_url?: string
}

export interface BuildCapiUserDataInput {
  /** Full name; split into first (`fn`) / last (`ln`) on the first space. */
  name?: string
  email?: string
  phone?: string
  /**
   * Lead id — hashed into `external_id`. Opcional desde a Story 86-9: os
   * eventos do topo do funil (`ViewContent`, `InitiateCheckout`) acontecem
   * antes de o lead existir.
   */
  leadId?: string
  /**
   * Identificadores adicionais para `external_id` (ex.: o `visitor_id` do
   * browser). Hasheados junto com o `leadId`; duplicatas são removidas.
   */
  externalIds?: string[]
  /**
   * UF de 2 letras (ex.: `'PR'`), derivada do DDD via `ufFromDDD`. Hasheada em
   * `st`. A cidade (`ct`) NÃO é derivável do DDD e nunca é enviada — Story 86-9 AC7.
   */
  state?: string
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
  const userData: CapiUserData = {}

  // `leadId` primeiro (é o id do CRM, o mesmo que o evento "Visitou" usa), depois
  // os demais. Dedup preserva a ordem — o Meta casa por qualquer um dos valores.
  const ids = [...new Set([input.leadId, ...(input.externalIds ?? [])].filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0,
  ))]
  if (ids.length > 0) {
    userData.external_id = ids.map((id) => sha256Hex(id))
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

  // UF (`st`): 2 letras minúsculas, per spec Meta. Sem `ct` — ver AC7.
  if (input.state && input.state.trim().length > 0) {
    userData.st = [sha256Hex(input.state.trim().toLowerCase().slice(0, 2))]
  }

  // Plain-text signals — NEVER hashed. Omit when absent.
  if (input.fbc) userData.fbc = input.fbc
  if (input.fbp) userData.fbp = input.fbp
  if (input.clientIp) userData.client_ip_address = input.clientIp
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent

  return userData
}

/**
 * Eventos do funil do formulário de qualificação (Story 86-9).
 *
 * São todos eventos PADRÃO do Meta — reconhecidos nativamente, com melhor
 * delivery e elegíveis a Custom Conversion (mesma razão que levou o "Visitou" a
 * ser um `Schedule`, decisão travada do Epic 86).
 */
export const FORM_CAPI_EVENTS = {
  /** Abriu o formulário. */
  VIEW_CONTENT: 'ViewContent',
  /** Confirmou a primeira resposta — engajou. */
  INITIATE_CHECKOUT: 'InitiateCheckout',
  /** Nome + telefone válidos: o lead nasceu. */
  LEAD: 'Lead',
  /** Enviou o formulário completo, com aceite LGPD. */
  COMPLETE_REGISTRATION: 'CompleteRegistration',
} as const

export type FormCapiEventName =
  (typeof FORM_CAPI_EVENTS)[keyof typeof FORM_CAPI_EVENTS]

export interface BuildFormEventInput {
  eventName: FormCapiEventName
  /** UUID gerado NO BROWSER e reaproveitado aqui — é o que deduplica os dois envios. */
  eventId: string
  /** Unix epoch em SEGUNDOS. */
  eventTime: number
  userData: CapiUserData
  /** URL real da página do formulário. Sem ela o Meta não atribui à sessão. */
  eventSourceUrl: string
  /** Nome do formulário, para leitura humana no Events Manager. */
  contentName: string
  /** Score de qualificação, quando já calculado (`CompleteRegistration`). */
  value?: number
  /**
   * Segmenta a origem do evento nas Custom Conversions.
   *
   * Default `'form_qualificacao'` (Story 86-9, o único chamador até então). A
   * landing do Vind Residence usa `'landing_vind_residence'` (Story 86-11) para
   * que as duas origens possam ser separadas no Events Manager sem depender do
   * `content_name`, que é texto livre editável pelo corretor.
   */
  contentCategory?: string
}

/** Origem padrão dos eventos de funil — preservada para o chamador da 86-9. */
export const DEFAULT_FORM_CONTENT_CATEGORY = 'form_qualificacao'

/**
 * Monta um evento do funil do formulário.
 *
 * `action_source: 'website'` (ao contrário do "Visitou", que é
 * `system_generated`): estes eventos nascem de uma interação real no browser, e
 * é essa combinação — `website` + `event_source_url` + `fbp`/`fbc`/IP/UA — que o
 * Meta usa para casar o evento com o clique no anúncio.
 */
export function buildFormEvent(input: BuildFormEventInput): CapiEvent {
  return {
    event_name: input.eventName,
    event_time: input.eventTime,
    event_id: input.eventId,
    action_source: 'website',
    event_source_url: input.eventSourceUrl,
    user_data: input.userData,
    custom_data: {
      content_name: input.contentName,
      content_category: input.contentCategory ?? DEFAULT_FORM_CONTENT_CATEGORY,
      currency: 'BRL',
      value: input.value ?? 0,
    },
  }
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
