// Story 75-92 — tipos + validação do cadastro de imobiliárias (compartilhado API + form).

export const IMOBILIARIA_STATUS = ["prospeccao", "ativo", "inativo"] as const
export type ImobiliariaStatus = (typeof IMOBILIARIA_STATUS)[number]

export const STATUS_LABELS: Record<ImobiliariaStatus, string> = {
  prospeccao: "Prospecção",
  ativo: "Ativo",
  inativo: "Inativo",
}

// Story 75-96 — tipo(s) de produto que a imobiliária trabalha (múltipla escolha).
export const TIPOS_PRODUTO = ["mcmv", "medio_padrao", "medio_alto_padrao", "alto_padrao"] as const
export type TipoProduto = (typeof TIPOS_PRODUTO)[number]

export const TIPO_PRODUTO_LABELS: Record<TipoProduto, string> = {
  mcmv: "MCMV",
  medio_padrao: "Médio Padrão",
  medio_alto_padrao: "Médio Alto Padrão",
  alto_padrao: "Alto Padrão",
}

// Story 75-97 / 75-108 — engajamento da imobiliária na venda dos produtos (definido pelo gestor).
// Agora é uma NOTA de 0 a 10 (null = não avaliado). Substitui o categórico alta/media/baixa.
export const ENGAJAMENTO_MIN = 0
export const ENGAJAMENTO_MAX = 10
export const ENGAJAMENTO_NOTAS = Array.from({ length: 11 }, (_, n) => n) // [0..10]

// Cor (dot + texto) por faixa da nota: 0–3 vermelho, 4–6 âmbar, 7–8 lima, 9–10 verde. Null = cinza.
export function engajamentoTone(nota: number | null | undefined): { dot: string; text: string } {
  if (nota == null) return { dot: "bg-stone-300 dark:bg-stone-600", text: "text-stone-500 dark:text-stone-400" }
  if (nota <= 3) return { dot: "bg-red-500", text: "text-red-700 dark:text-red-300" }
  if (nota <= 6) return { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" }
  if (nota <= 8) return { dot: "bg-lime-500", text: "text-lime-700 dark:text-lime-300" }
  return { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" }
}

export interface Imobiliaria {
  id: string
  nome: string
  razao_social: string | null
  cnpj: string | null
  creci_juridico: string | null
  telefone: string | null
  email: string | null
  cidade: string | null
  estado: string | null
  endereco: string | null
  num_corretores: number | null
  gerente_nome: string | null
  gerente_telefone: string | null
  gerente_email: string | null
  socio_nome: string | null
  socio_telefone: string | null
  socio_email: string | null
  tipos_produto: string[]
  engajamento: number | null
  contato_nome: string | null
  contato_telefone: string | null
  contato_email: string | null
  status: ImobiliariaStatus
  observacoes: string | null
  /** Story 81-4: token do link público de agendamento (NULL = revogado). */
  booking_token: string | null
  created_at: string
  updated_at: string
}

// Campos de texto livres (whitelist para sanitizar o body da API).
export const IMOBILIARIA_TEXT_FIELDS = [
  "nome", "razao_social", "cnpj", "creci_juridico", "telefone", "email", "cidade", "estado", "endereco",
  "gerente_nome", "gerente_telefone", "gerente_email",
  "socio_nome", "socio_telefone", "socio_email",
  "contato_nome", "contato_telefone", "contato_email", "observacoes",
] as const

/**
 * Valida + normaliza o payload da API. `partial:true` (PATCH) só valida os campos enviados.
 * Retorna só os campos permitidos (nunca org_id/id/created_by, que a API controla).
 */
export function validateImobiliaria(
  body: unknown,
  { partial = false }: { partial?: boolean } = {},
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Payload inválido" }
  const b = body as Record<string, unknown>
  const out: Record<string, unknown> = {}

  // nome — obrigatório na criação; se enviado, não pode ser vazio
  if (!partial || "nome" in b) {
    const nome = typeof b.nome === "string" ? b.nome.trim() : ""
    if (!nome) return { ok: false, error: "Nome da imobiliária é obrigatório" }
    out.nome = nome
  }

  for (const f of IMOBILIARIA_TEXT_FIELDS) {
    if (f === "nome") continue
    if (f in b) {
      const v = b[f]
      out[f] = typeof v === "string" && v.trim() ? v.trim() : null
    }
  }

  if ("num_corretores" in b) {
    const n = b.num_corretores
    if (n === null || n === "" || n === undefined) {
      out.num_corretores = null
    } else {
      const num = Number(n)
      if (!Number.isInteger(num) || num < 0) {
        return { ok: false, error: "Nº de corretores deve ser um inteiro ≥ 0" }
      }
      out.num_corretores = num
    }
  }

  if ("status" in b) {
    if (!IMOBILIARIA_STATUS.includes(b.status as ImobiliariaStatus)) {
      return { ok: false, error: "Status inválido" }
    }
    out.status = b.status
  }

  if ("tipos_produto" in b) {
    const raw = b.tipos_produto
    if (raw != null && !Array.isArray(raw)) {
      return { ok: false, error: "Tipos de produto inválidos" }
    }
    const valid = new Set<string>(TIPOS_PRODUTO)
    const arr = Array.isArray(raw) ? raw : []
    for (const t of arr) {
      if (typeof t !== "string" || !valid.has(t)) {
        return { ok: false, error: "Tipo de produto inválido" }
      }
    }
    out.tipos_produto = [...new Set(arr as string[])]
  }

  if ("engajamento" in b) {
    const e = b.engajamento
    if (e === null || e === "" || e === undefined) {
      out.engajamento = null
    } else if (typeof e === "number" && Number.isInteger(e) && e >= ENGAJAMENTO_MIN && e <= ENGAJAMENTO_MAX) {
      out.engajamento = e
    } else {
      return { ok: false, error: "Engajamento deve ser uma nota de 0 a 10" }
    }
  }

  return { ok: true, value: out }
}
