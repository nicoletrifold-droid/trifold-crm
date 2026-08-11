// Tipos + constantes + validação do módulo FVS (Story 75-293). Sem server-only —
// importável em Client Components. FONTE ÚNICA dos rótulos/tipos do módulo.

// ============================================================================
// Constantes
// ============================================================================

export const LOCAL_TIPOS = ["apartamento", "hall", "area_comum"] as const
export type LocalTipo = (typeof LOCAL_TIPOS)[number]
export const LOCAL_TIPO_LABELS: Record<LocalTipo, string> = {
  apartamento: "Apartamento",
  hall: "Hall",
  area_comum: "Área comum",
}

export const ITEM_TIPOS = ["botao", "medida"] as const
export type ItemTipo = (typeof ITEM_TIPOS)[number]
export const ITEM_TIPO_LABELS: Record<ItemTipo, string> = {
  botao: "Botão (conforme / não conforme / não se aplica)",
  medida: "Medida com tolerância",
}

// Parametriza a definição pendente nº 3 do Jonathan (foto por item ou por ficha).
export const FOTO_CONFIGS = ["por_ficha", "por_item", "apenas_reprova"] as const
export type FotoConfig = (typeof FOTO_CONFIGS)[number]
export const FOTO_CONFIG_LABELS: Record<FotoConfig, string> = {
  por_ficha: "Por ficha — fotos do serviço como um todo",
  por_item: "Por item — cada item exige foto",
  apenas_reprova: "Só onde reprova ou tem ressalva",
}

export const EQUIPE_TIPOS = ["interna", "empreiteiro"] as const
export type EquipeTipo = (typeof EQUIPE_TIPOS)[number]
export const EQUIPE_TIPO_LABELS: Record<EquipeTipo, string> = {
  interna: "Equipe própria",
  empreiteiro: "Empreiteiro",
}

// ============================================================================
// Tipos das linhas do banco
// ============================================================================

export interface FvsLocal {
  id: string
  org_id: string
  obra_id: string
  nome: string
  tipo: LocalTipo
  torre: string | null
  pavimento: number | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface FvsServico {
  id: string
  org_id: string
  nome: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface FvsFichaModeloItem {
  id: string
  org_id: string
  ficha_modelo_id: string
  ordem: number
  descricao: string
  tipo: ItemTipo
  unidade: string | null
  tolerancia: string | null
  created_at: string
}

export interface FvsFichaModelo {
  id: string
  org_id: string
  servico_id: string
  titulo: string
  ativa: boolean
  foto_config: FotoConfig
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FvsEquipe {
  id: string
  org_id: string
  nome: string
  tipo: EquipeTipo
  ativo: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// Validação (mesmo contrato de validateFornecedor — Lançamentos-06)
// ============================================================================

type ValidateResult<T = Record<string, unknown>> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export function validateLocal(raw: unknown, opts: { partial: boolean }): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Payload inválido" }
  const b = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if (!opts.partial || "nome" in b) {
    const nome = typeof b.nome === "string" ? b.nome.trim() : ""
    if (!nome) return { ok: false, error: "Nome do local é obrigatório" }
    out.nome = nome
  }
  if (!opts.partial || "tipo" in b) {
    if (b.tipo != null && !LOCAL_TIPOS.includes(b.tipo as LocalTipo)) {
      return { ok: false, error: "Tipo de local inválido" }
    }
    if (b.tipo != null) out.tipo = b.tipo
  }
  if ("torre" in b) out.torre = typeof b.torre === "string" && b.torre.trim() !== "" ? b.torre.trim() : null
  if ("pavimento" in b) {
    if (b.pavimento != null && (!Number.isInteger(b.pavimento))) {
      return { ok: false, error: "Pavimento deve ser um número inteiro" }
    }
    out.pavimento = b.pavimento ?? null
  }
  if ("ativo" in b && typeof b.ativo === "boolean") out.ativo = b.ativo
  return { ok: true, value: out }
}

export function validateServico(raw: unknown, opts: { partial: boolean }): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Payload inválido" }
  const b = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if (!opts.partial || "nome" in b) {
    const nome = typeof b.nome === "string" ? b.nome.trim() : ""
    if (!nome) return { ok: false, error: "Nome do serviço é obrigatório" }
    out.nome = nome
  }
  if ("ativo" in b && typeof b.ativo === "boolean") out.ativo = b.ativo
  return { ok: true, value: out }
}

export function validateEquipe(raw: unknown, opts: { partial: boolean }): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Payload inválido" }
  const b = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if (!opts.partial || "nome" in b) {
    const nome = typeof b.nome === "string" ? b.nome.trim() : ""
    if (!nome) return { ok: false, error: "Nome da equipe é obrigatório" }
    out.nome = nome
  }
  if (!opts.partial || "tipo" in b) {
    if (b.tipo != null && !EQUIPE_TIPOS.includes(b.tipo as EquipeTipo)) {
      return { ok: false, error: "Tipo de equipe inválido" }
    }
    if (b.tipo != null) out.tipo = b.tipo
  }
  if ("ativo" in b && typeof b.ativo === "boolean") out.ativo = b.ativo
  return { ok: true, value: out }
}

// ----------------------------------------------------------------------------
// Ficha-modelo: valida o cabeçalho + a lista de itens de uma vez.
// Itens voltam normalizados com `ordem` = posição no array (a UI manda na ordem
// em que quer; o banco guarda o índice — sem buracos, sem duplicata).
// ----------------------------------------------------------------------------

export interface FichaModeloItemInput {
  descricao: string
  tipo: ItemTipo
  unidade: string | null
  tolerancia: string | null
  ordem: number
}

export function validateFichaItens(raw: unknown): ValidateResult<FichaModeloItemInput[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "A ficha precisa de pelo menos 1 item" }
  }
  const itens: FichaModeloItemInput[] = []
  for (const [i, it] of raw.entries()) {
    if (!it || typeof it !== "object") return { ok: false, error: `Item ${i + 1} inválido` }
    const b = it as Record<string, unknown>
    const descricao = typeof b.descricao === "string" ? b.descricao.trim() : ""
    if (!descricao) return { ok: false, error: `Item ${i + 1}: descrição é obrigatória` }
    const tipo = (b.tipo ?? "botao") as ItemTipo
    if (!ITEM_TIPOS.includes(tipo)) return { ok: false, error: `Item ${i + 1}: tipo inválido` }
    const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)
    itens.push({
      descricao,
      tipo,
      // unidade/tolerância só fazem sentido em medida — em botão são descartadas
      unidade: tipo === "medida" ? str(b.unidade) : null,
      tolerancia: tipo === "medida" ? str(b.tolerancia) : null,
      ordem: i,
    })
  }
  return { ok: true, value: itens }
}

export function validateFichaModelo(
  raw: unknown,
  opts: { partial: boolean }
): ValidateResult<{ header: Record<string, unknown>; itens: FichaModeloItemInput[] | null }> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Payload inválido" }
  const b = raw as Record<string, unknown>
  const header: Record<string, unknown> = {}

  if (!opts.partial || "titulo" in b) {
    const titulo = typeof b.titulo === "string" ? b.titulo.trim() : ""
    if (!titulo) return { ok: false, error: "Título da ficha é obrigatório" }
    header.titulo = titulo
  }
  if (!opts.partial || "foto_config" in b) {
    const fc = b.foto_config ?? "por_ficha"
    if (!FOTO_CONFIGS.includes(fc as FotoConfig)) {
      return { ok: false, error: "Configuração de foto inválida" }
    }
    header.foto_config = fc
  }
  if ("ativa" in b && typeof b.ativa === "boolean") header.ativa = b.ativa

  let itens: FichaModeloItemInput[] | null = null
  if (!opts.partial || "itens" in b) {
    const parsed = validateFichaItens(b.itens)
    if (!parsed.ok) return parsed
    itens = parsed.value
  }
  return { ok: true, value: { header, itens } }
}

// ============================================================================
// Criação em lote de locais — a lista do Vind chega em planilha (~60 locais).
// Uma linha por local; pavimento opcional após ";" ou TAB (colar direto da
// planilha funciona). Ex.:  "Apto 1401; 14"  ·  "Hall 3º pavimento	3"
// ============================================================================

export interface LoteParseResult {
  locais: { nome: string; pavimento: number | null }[]
  duplicados: string[]
  invalidos: string[]
}

export function parseLocaisLote(text: string): LoteParseResult {
  const locais: { nome: string; pavimento: number | null }[] = []
  const duplicados: string[] = []
  const invalidos: string[] = []
  const vistos = new Set<string>()

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue
    const [nomeRaw, pavRaw] = line.split(/[;\t]/, 2).map((s) => s?.trim() ?? "")
    if (!nomeRaw) continue
    const key = nomeRaw.toLowerCase()
    if (vistos.has(key)) {
      duplicados.push(nomeRaw)
      continue
    }
    let pavimento: number | null = null
    if (pavRaw) {
      const n = Number(pavRaw)
      if (!Number.isInteger(n)) {
        invalidos.push(rawLine.trim())
        continue
      }
      pavimento = n
    }
    vistos.add(key)
    locais.push({ nome: nomeRaw, pavimento })
  }
  return { locais, duplicados, invalidos }
}
