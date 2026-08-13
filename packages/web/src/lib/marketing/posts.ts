// Story 75-219 — Aba "Agente" (marketing): regras puras dos posts da fila de
// aprovação. Sem imports server-side de propósito — testável em unidade.

// Story 75-301 (Perfis de Acesso 2.0): o gate da aba deixou de ser lista de
// roles e virou a capability `marketing.gerenciar` (lib/capabilities.ts) — o
// seed dela espelha os 3 roles que a antiga MARKETING_POST_ROLES listava
// (admin/supervisor/social-media, Story 75-233). Gate real: marketingGuard.

export const MARKETING_POST_STATUSES = ["sugerido", "aprovado", "rejeitado", "publicado"] as const
export type MarketingPostStatus = (typeof MARKETING_POST_STATUSES)[number]

export const MARKETING_POST_CANAIS = ["instagram", "facebook"] as const
export type MarketingPostCanal = (typeof MARKETING_POST_CANAIS)[number]

// Story 75-239 — formato do post (espelha o CHECK da mig 203). Fonte única
// CLIENT-SAFE: a UI e as rotas leem daqui (o flow em @trifold/ai tem cópia
// própria de propósito — importar de lá arrastaria o SDK do Anthropic pro
// bundle client). Formato novo = mig + aqui + marketing-post-request.ts.
/**
 * Story 75-255 — SELECT único do post. Estava DUPLICADO em 5 arquivos, e é assim
 * que uma coluna nova (aqui `artes`) fica esquecida em um deles.
 */
export const MARKETING_POST_SELECT =
  "id, org_id, empreendimento_id, canal, formato, pedido, copy, roteiro, arte_url, artes, scheduled_for, status, justificativa, origem, destino, objetivo, ad_primary_text, ad_headline, created_by, created_at, updated_at, properties:empreendimento_id(name)"

export const MARKETING_POST_FORMATOS = ["estatico", "reel", "story", "carrossel"] as const
export type MarketingPostFormato = (typeof MARKETING_POST_FORMATOS)[number]

export const FORMATO_LABELS: Record<MarketingPostFormato, string> = {
  estatico: "Post estático",
  reel: "Reel",
  story: "Story",
  carrossel: "Carrossel",
}

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

/** Editar copy/roteiro/formato/arte_url/scheduled_for é permitido em sugerido e aprovado. */
export function isMarketingPostEditable(status: string): boolean {
  return status === "sugerido" || status === "aprovado"
}

export interface MarketingPostInput {
  empreendimento_id: string | null
  canal: MarketingPostCanal
  formato: MarketingPostFormato | null
  copy: string
  roteiro: string | null
  arte_url: string | null
  /** Story 75-255 — artes do post, uma por tela. arte_url espelha a de ordem 1. */
  artes: Array<{
    ordem: number
    url: string
    descricao?: string | null
    cta?: string | null
    /** Story 75-256 — texto composto na faixa; persistido p/ o Refazer recompor igual */
    titulo?: string | null
    subtitulo?: string | null
    /** Story 75-294 — proporção da peça de tráfego pago; ausente = arte legado */
    ratio?: "9:16" | "4:5" | "1:1" | null
  }> | null
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

  // Story 75-239 — formato/roteiro editáveis (o Editar da fila corrige roteiro de reel).
  if (b.formato !== undefined) {
    if (b.formato === null || b.formato === "") {
      out.formato = null
    } else if (MARKETING_POST_FORMATOS.includes(b.formato as MarketingPostFormato)) {
      out.formato = b.formato as MarketingPostFormato
    } else {
      return { ok: false, error: "formato deve ser estatico, reel, story ou carrossel" }
    }
  }

  if (b.roteiro !== undefined) {
    if (b.roteiro === null || b.roteiro === "") {
      out.roteiro = null
    } else if (typeof b.roteiro === "string" && b.roteiro.length <= 20_000) {
      out.roteiro = b.roteiro.trim()
    } else {
      return { ok: false, error: "roteiro inválido" }
    }
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
    // 🔴 Story 75-255 — edição MANUAL da arte (colar link do Canva) tem de mexer
    // em `artes` também, senão os dois divergem: o preview leria 2 telas antigas
    // e ignoraria o link que o humano acabou de colar. Override humano zera a
    // lista e passa a valer como a peça única — coerente com "o humano manda".
    if (b.arte_url === null || b.arte_url === "") {
      out.arte_url = null
      out.artes = []
    } else if (typeof b.arte_url === "string" && b.arte_url.trim().length <= 2000) {
      out.arte_url = b.arte_url.trim()
      out.artes = [{ ordem: 1, url: b.arte_url.trim() }]
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
