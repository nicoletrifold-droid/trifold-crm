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

export interface Imobiliaria {
  id: string
  nome: string
  razao_social: string | null
  cnpj: string | null
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
  contato_nome: string | null
  contato_telefone: string | null
  contato_email: string | null
  status: ImobiliariaStatus
  observacoes: string | null
  created_at: string
  updated_at: string
}

// Campos de texto livres (whitelist para sanitizar o body da API).
export const IMOBILIARIA_TEXT_FIELDS = [
  "nome", "razao_social", "cnpj", "telefone", "email", "cidade", "estado", "endereco",
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

  return { ok: true, value: out }
}
