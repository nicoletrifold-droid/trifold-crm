// Story 75-219 — Aba "Agente" (marketing): regras puras dos posts da fila de
// aprovação. Sem imports server-side de propósito — testável em unidade.

// Story 75-233: social-media = operadora do marketing — mesmo poder dentro da aba Lídia.
export const MARKETING_POST_ROLES = ["admin", "supervisor", "social-media"] as const

export const MARKETING_POST_STATUSES = ["sugerido", "aprovado", "rejeitado", "publicado"] as const
export type MarketingPostStatus = (typeof MARKETING_POST_STATUSES)[number]

export const MARKETING_POST_CANAIS = ["instagram", "facebook"] as const
export type MarketingPostCanal = (typeof MARKETING_POST_CANAIS)[number]

/**
 * Transições válidas de status (AC4/AC7):
 *   sugerido → aprovado | rejeitado
 *   aprovado → publicado
 *   rejeitado e publicado são TERMINAIS (rejeitado não é DELETE — fica consultável).
 */
const VALID_TRANSITIONS: Record<MarketingPostStatus, MarketingPostStatus[]> = {
  sugerido: ["aprovado", "rejeitado"],
  aprovado: ["publicado"],
  rejeitado: [],
  publicado: [],
}

export function canTransitionMarketingPost(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from as MarketingPostStatus]
  if (!allowed) return false
  return allowed.includes(to as MarketingPostStatus)
}

/** Editar copy/arte_url/scheduled_for é permitido em sugerido e aprovado. */
export function isMarketingPostEditable(status: string): boolean {
  return status === "sugerido" || status === "aprovado"
}

export interface MarketingPostInput {
  empreendimento_id: string | null
  canal: MarketingPostCanal
  copy: string
  arte_url: string | null
  scheduled_for: string | null
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Valida o corpo do cadastro manual (POST, partial=false) e da edição
 * (PATCH, partial=true — só os campos presentes são validados/devolvidos).
 */
export function validateMarketingPostInput(
  body: unknown,
  { partial }: { partial: boolean }
): ValidationResult<Partial<MarketingPostInput>> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Corpo da requisição inválido" }
  }
  const b = body as Record<string, unknown>
  const out: Partial<MarketingPostInput> = {}

  if (!partial || b.canal !== undefined) {
    if (b.canal !== "instagram" && b.canal !== "facebook") {
      return { ok: false, error: "canal deve ser 'instagram' ou 'facebook'" }
    }
    out.canal = b.canal
  }

  if (!partial || b.copy !== undefined) {
    if (typeof b.copy !== "string" || b.copy.trim().length === 0) {
      return { ok: false, error: "copy é obrigatória" }
    }
    out.copy = b.copy.trim()
  }

  if (b.empreendimento_id !== undefined) {
    if (b.empreendimento_id === null || b.empreendimento_id === "") {
      out.empreendimento_id = null
    } else if (typeof b.empreendimento_id === "string" && UUID_RE.test(b.empreendimento_id)) {
      out.empreendimento_id = b.empreendimento_id
    } else {
      return { ok: false, error: "empreendimento_id inválido" }
    }
  }

  if (b.arte_url !== undefined) {
    if (b.arte_url === null || b.arte_url === "") {
      out.arte_url = null
    } else if (typeof b.arte_url === "string" && b.arte_url.trim().length <= 2000) {
      out.arte_url = b.arte_url.trim()
    } else {
      return { ok: false, error: "arte_url inválida" }
    }
  }

  if (b.scheduled_for !== undefined) {
    if (b.scheduled_for === null || b.scheduled_for === "") {
      out.scheduled_for = null
    } else if (typeof b.scheduled_for === "string" && DATE_RE.test(b.scheduled_for)) {
      out.scheduled_for = b.scheduled_for
    } else {
      return { ok: false, error: "scheduled_for deve ser uma data YYYY-MM-DD" }
    }
  }

  return { ok: true, value: out }
}
