// Story 75-229 — Kit de Marcas da aba "Agente": regras puras das marcas.
// Sem imports server-side de propósito — testável em unidade (padrão posts.ts).

// SELECT compartilhado das rotas (route files não podem exportar consts extras).
export const BRAND_SELECT =
  "id, org_id, nome, tipo, property_id, cores, fontes, voz_da_marca, diretrizes, is_active, created_at, updated_at, properties:property_id(name), assets:marketing_brand_assets(id, tipo, label, file_path, file_url, file_name, file_size, created_at)"

export const MARKETING_BRAND_TIPOS = ["institucional", "empreendimento"] as const
export type MarketingBrandTipo = (typeof MARKETING_BRAND_TIPOS)[number]

export const MARKETING_BRAND_ASSET_TIPOS = ["logo", "foto", "elemento"] as const
export type MarketingBrandAssetTipo = (typeof MARKETING_BRAND_ASSET_TIPOS)[number]

export interface MarketingBrandInput {
  nome: string
  tipo: MarketingBrandTipo
  property_id: string | null
  cores: string[]
  fontes: string | null
  voz_da_marca: string | null
  diretrizes: string | null
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_RE = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i

/** Normaliza "cores": aceita array de strings hex; descarta vazios; valida formato. */
function parseCores(raw: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return { ok: false, error: "cores deve ser uma lista de hex" }
  const out: string[] = []
  for (const c of raw) {
    if (typeof c !== "string") return { ok: false, error: "cores deve conter apenas strings" }
    const v = c.trim()
    if (!v) continue
    if (!HEX_RE.test(v)) return { ok: false, error: `cor inválida: "${v}" (use hex, ex.: #E8856A)` }
    out.push(v.toUpperCase())
  }
  return { ok: true, value: out }
}

function optionalText(raw: unknown, field: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (typeof raw !== "string") return { ok: false, error: `${field} deve ser texto` }
  return { ok: true, value: raw.trim() || null }
}

/**
 * Valida o corpo do cadastro (POST, partial=false) e da edição (PATCH,
 * partial=true — só os campos presentes são validados/devolvidos).
 * Regra de consistência tipo×property é validada quando AMBOS os campos
 * estão no resultado (sempre no POST; no PATCH cabe à rota completar com o
 * estado atual antes de decidir — ver validateBrandConsistency).
 */
export function validateMarketingBrandInput(
  body: unknown,
  { partial }: { partial: boolean }
): ValidationResult<Partial<MarketingBrandInput>> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Corpo da requisição inválido" }
  }
  const b = body as Record<string, unknown>
  const out: Partial<MarketingBrandInput> = {}

  if (!partial || b.nome !== undefined) {
    if (typeof b.nome !== "string" || b.nome.trim().length === 0) {
      return { ok: false, error: "nome é obrigatório" }
    }
    out.nome = b.nome.trim()
  }

  if (!partial || b.tipo !== undefined) {
    if (!MARKETING_BRAND_TIPOS.includes(b.tipo as MarketingBrandTipo)) {
      return { ok: false, error: "tipo deve ser 'institucional' ou 'empreendimento'" }
    }
    out.tipo = b.tipo as MarketingBrandTipo
  }

  if (b.property_id !== undefined) {
    if (b.property_id === null || b.property_id === "") {
      out.property_id = null
    } else if (typeof b.property_id === "string" && UUID_RE.test(b.property_id)) {
      out.property_id = b.property_id
    } else {
      return { ok: false, error: "property_id inválido" }
    }
  } else if (!partial) {
    out.property_id = null
  }

  if (!partial || b.cores !== undefined) {
    const cores = parseCores(b.cores)
    if (!cores.ok) return cores
    out.cores = cores.value
  }

  for (const field of ["fontes", "voz_da_marca", "diretrizes"] as const) {
    if (!partial || b[field] !== undefined) {
      const r = optionalText(b[field], field)
      if (!r.ok) return r
      out[field] = r.value
    }
  }

  return { ok: true, value: out }
}

/** Marca de empreendimento precisa apontar para um empreendimento. */
export function validateBrandConsistency(tipo: string, propertyId: string | null): string | null {
  if (tipo === "empreendimento" && !propertyId) {
    return "Marca de empreendimento precisa de um empreendimento vinculado"
  }
  if (tipo === "institucional" && propertyId) {
    return "Marca institucional não deve ter empreendimento vinculado"
  }
  return null
}

export function isValidBrandAssetTipo(tipo: unknown): tipo is MarketingBrandAssetTipo {
  return MARKETING_BRAND_ASSET_TIPOS.includes(tipo as MarketingBrandAssetTipo)
}
