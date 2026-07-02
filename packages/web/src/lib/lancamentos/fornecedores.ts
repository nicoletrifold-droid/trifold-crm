// Tipos + constantes + validação de Fornecedor (Story Lançamentos-06). Sem server-only.

export const FORNECEDOR_STATUS = ["ativo", "avaliacao", "inativo", "bloqueado"] as const
export type FornecedorStatus = (typeof FORNECEDOR_STATUS)[number]

export const STATUS_LABELS: Record<FornecedorStatus, string> = {
  ativo: "Ativo",
  avaliacao: "Em avaliação",
  inativo: "Inativo",
  bloqueado: "Bloqueado",
}

export const STATUS_TONE: Record<FornecedorStatus, string> = {
  ativo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  avaliacao: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  inativo: "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300",
  bloqueado: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
}

// Categorias sugeridas (chave → label + cor do pontinho). `categoria` é texto livre no banco,
// mas a UI oferece este conjunto; cor = significado (paleta consistente do módulo).
export const CATEGORIAS = [
  { key: "marketing", label: "Marketing", cor: "#E8856A" },
  { key: "construcao_civil", label: "Construção civil", cor: "#f59e0b" },
  { key: "fotografia_video", label: "Fotografia/Vídeo", cor: "#8b5cf6" },
  { key: "grafica", label: "Gráfica", cor: "#0ea5e9" },
  { key: "mobiliario", label: "Mobiliário/Decoração", cor: "#14b8a6" },
  { key: "juridico", label: "Jurídico", cor: "#a8a29e" },
  { key: "corretagem", label: "Corretagem", cor: "#10b981" },
  { key: "tecnologia", label: "Tecnologia", cor: "#f43f5e" },
  { key: "outro", label: "Outro", cor: "#78716c" },
] as const
export const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.key, c.label]))
export const CATEGORIA_COR: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.key, c.cor]))

export interface Fornecedor {
  id: string
  org_id: string
  nome: string
  razao_social: string | null
  cnpj: string | null
  categoria: string | null
  status: FornecedorStatus
  contato_nome: string | null
  telefone: string | null
  email: string | null
  cidade: string | null
  estado: string | null
  endereco: string | null
  site: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

const STR_FIELDS = [
  "nome", "razao_social", "cnpj", "categoria", "contato_nome",
  "telefone", "email", "cidade", "estado", "endereco", "site", "observacoes",
] as const

type ValidateResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string }

export function validateFornecedor(raw: unknown, opts: { partial: boolean }): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Payload inválido" }
  const b = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if (!opts.partial || "nome" in b) {
    const nome = typeof b.nome === "string" ? b.nome.trim() : ""
    if (!nome) return { ok: false, error: "Nome do fornecedor é obrigatório" }
    out.nome = nome
  }
  if (!opts.partial || "status" in b) {
    const status = b.status
    if (status != null && !FORNECEDOR_STATUS.includes(status as FornecedorStatus)) {
      return { ok: false, error: "Status inválido" }
    }
    if (status != null) out.status = status
  }
  for (const f of STR_FIELDS) {
    if (f === "nome") continue
    if (f in b) out[f] = typeof b[f] === "string" && (b[f] as string).trim() !== "" ? (b[f] as string).trim() : null
  }
  return { ok: true, value: out }
}
