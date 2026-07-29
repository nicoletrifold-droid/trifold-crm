// Story 75-229 — Kit de Marcas da aba "Agente": regras puras das marcas.
// Sem imports server-side de propósito — testável em unidade (padrão posts.ts).

// SELECT compartilhado das rotas (route files não podem exportar consts extras).
export const BRAND_SELECT =
  "id, org_id, nome, tipo, property_id, cores, fontes, voz_da_marca, diretrizes, is_active, created_at, updated_at, properties:property_id(name), assets:marketing_brand_assets(id, tipo, label, file_path, file_url, file_name, file_size, created_at)"

export const MARKETING_BRAND_TIPOS = ["institucional", "empreendimento"] as const
export type MarketingBrandTipo = (typeof MARKETING_BRAND_TIPOS)[number]

export const MARKETING_BRAND_ASSET_TIPOS = ["logo", "foto", "elemento"] as const
export type MarketingBrandAssetTipo = (typeof MARKETING_BRAND_ASSET_TIPOS)[number]

// Story 75-230 — estrutura do Brand Hub: cor com papel, fonte por papel.
export interface BrandCor {
  hex: string
  nome: string | null
}

export interface BrandFonte {
  papel: string
  nome: string
}

export interface MarketingBrandInput {
  nome: string
  tipo: MarketingBrandTipo
  property_id: string | null
  cores: BrandCor[]
  fontes: BrandFonte[]
  voz_da_marca: string | null
  diretrizes: string | null
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_RE = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i

/**
 * Normaliza "cores": array de {hex, nome} (v2); aceita também strings hex puras
 * (formato v1 — vira {hex, nome: null}). Descarta vazios; valida hex.
 */
function parseCores(raw: unknown): { ok: true; value: BrandCor[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return { ok: false, error: "cores deve ser uma lista" }
  const out: BrandCor[] = []
  for (const c of raw) {
    let hex: unknown
    let nome: unknown = null
    if (typeof c === "string") {
      hex = c
    } else if (typeof c === "object" && c !== null) {
      hex = (c as Record<string, unknown>).hex
      nome = (c as Record<string, unknown>).nome ?? null
    } else {
      return { ok: false, error: "cores deve conter objetos {hex, nome}" }
    }
    if (typeof hex !== "string") return { ok: false, error: "cor sem hex" }
    const v = hex.trim()
    if (!v) continue
    if (!HEX_RE.test(v)) return { ok: false, error: `cor inválida: "${v}" (use hex, ex.: #E8856A)` }
    const nomeStr = typeof nome === "string" ? nome.trim() || null : null
    out.push({ hex: v.toUpperCase(), nome: nomeStr })
  }
  return { ok: true, value: out }
}

/** Normaliza "fontes": array de {papel, nome}; descarta linhas totalmente vazias. */
function parseFontes(raw: unknown): { ok: true; value: BrandFonte[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return { ok: false, error: "fontes deve ser uma lista de {papel, nome}" }
  const out: BrandFonte[] = []
  for (const f of raw) {
    if (typeof f !== "object" || f === null) return { ok: false, error: "fontes deve conter objetos {papel, nome}" }
    const papel = typeof (f as Record<string, unknown>).papel === "string" ? ((f as Record<string, unknown>).papel as string).trim() : ""
    const nome = typeof (f as Record<string, unknown>).nome === "string" ? ((f as Record<string, unknown>).nome as string).trim() : ""
    if (!papel && !nome) continue
    if (!nome) return { ok: false, error: `fonte do papel "${papel}" sem nome` }
    out.push({ papel: papel || "Geral", nome })
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

  if (!partial || b.fontes !== undefined) {
    const fontes = parseFontes(b.fontes)
    if (!fontes.ok) return fontes
    out.fontes = fontes.value
  }

  for (const field of ["voz_da_marca", "diretrizes"] as const) {
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
