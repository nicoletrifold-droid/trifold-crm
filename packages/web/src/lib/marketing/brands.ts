// Story 75-229 — Kit de Marcas da aba "Agente": regras puras das marcas.
// Sem imports server-side de propósito — testável em unidade (padrão posts.ts).

// SELECT compartilhado das rotas (route files não podem exportar consts extras).
export const BRAND_SELECT =
  "id, org_id, nome, tipo, property_id, cores, fontes, voz_da_marca, diretrizes, is_active, created_at, updated_at, properties:property_id(name), assets:marketing_brand_assets(id, tipo, label, file_path, file_url, file_name, file_size, created_at)"

export const MARKETING_BRAND_TIPOS = ["institucional", "empreendimento"] as const
export type MarketingBrandTipo = (typeof MARKETING_BRAND_TIPOS)[number]

// Story 75-234 — 'fonte' entrou junto do upload de .ttf/.otf (mig 199).
export const MARKETING_BRAND_ASSET_TIPOS = ["logo", "foto", "elemento", "fonte"] as const
export type MarketingBrandAssetTipo = (typeof MARKETING_BRAND_ASSET_TIPOS)[number]

/** Extensões aceitas por tipo de arquivo (validadas na rota /assets/sign). */
export const BRAND_ASSET_EXTENSIONS: Record<MarketingBrandAssetTipo, string[]> = {
  logo: ["png", "jpg", "jpeg", "webp", "svg"],
  foto: ["png", "jpg", "jpeg", "webp", "svg"],
  elemento: ["png", "jpg", "jpeg", "webp", "svg"],
  fonte: ["ttf", "otf", "woff", "woff2"],
}

// Story 75-230 — estrutura do Brand Hub: cor com papel, fonte por papel.
export interface BrandCor {
  hex: string
  nome: string | null
}

export interface BrandFonte {
  papel: string
  nome: string
  /** Story 75-234 — arquivo da fonte em marketing_brand_assets (tipo='fonte'). */
  asset_id?: string | null
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

/**
 * Normaliza "fontes": array de {papel, nome, asset_id}; descarta linhas
 * totalmente vazias. Story 75-234: a linha vale com SÓ o arquivo (asset_id) —
 * nome só é exigido quando não há arquivo anexado.
 */
function parseFontes(raw: unknown): { ok: true; value: BrandFonte[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return { ok: false, error: "fontes deve ser uma lista de {papel, nome}" }
  const out: BrandFonte[] = []
  for (const f of raw) {
    if (typeof f !== "object" || f === null) return { ok: false, error: "fontes deve conter objetos {papel, nome}" }
    const rec = f as Record<string, unknown>
    const papel = typeof rec.papel === "string" ? rec.papel.trim() : ""
    const nome = typeof rec.nome === "string" ? rec.nome.trim() : ""
    let assetId: string | null = null
    if (typeof rec.asset_id === "string" && rec.asset_id.trim()) {
      const v = rec.asset_id.trim()
      if (!UUID_RE.test(v)) return { ok: false, error: "asset_id da fonte inválido" }
      assetId = v
    }
    if (!papel && !nome && !assetId) continue
    if (!nome && !assetId) {
      return { ok: false, error: `preencha o nome da fonte "${papel}" ou anexe o arquivo (.ttf/.otf)` }
    }
    out.push({ papel: papel || "Geral", nome, asset_id: assetId })
  }
  return { ok: true, value: out }
}

/** ids de arquivo referenciados pelas fontes (para checagem de posse na rota). */
export function fonteAssetIds(fontes: BrandFonte[]): string[] {
  return [...new Set(fontes.map((f) => f.asset_id).filter((id): id is string => !!id))]
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

/** Extensão do arquivo em minúsculas, sem ponto ("" se não houver). */
export function fileExtension(fileName: string): string {
  return fileName.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toLowerCase() ?? ""
}

/**
 * Story 75-234 — o bucket passou a aceitar application/octet-stream (fontes
 * chegam sem mime confiável), então a extensão vira a barreira de verdade:
 * imagem só aceita extensão de imagem; fonte só .ttf/.otf/.woff/.woff2.
 */
export function isAllowedBrandAssetFile(
  tipo: MarketingBrandAssetTipo,
  fileName: string
): boolean {
  return BRAND_ASSET_EXTENSIONS[tipo].includes(fileExtension(fileName))
}
