// Tipos + constantes + validação da entidade Lançamento (Story Lançamentos-02).
// Sem código server-only aqui para poder importar em Client Components (labels/tones/cores).

export const LANCAMENTO_STATUS = [
  "planejamento",
  "lancamento",
  "venda",
  "concluido",
  "pausado",
] as const
export type LancamentoStatus = (typeof LANCAMENTO_STATUS)[number]

export const STATUS_LABELS: Record<LancamentoStatus, string> = {
  planejamento: "Em planejamento",
  lancamento: "Em lançamento",
  venda: "Em venda",
  concluido: "Concluído",
  pausado: "Pausado",
}

// Pares de tom (claro/dark) para o badge de status — mesma linguagem visual do módulo IMOB.
export const STATUS_TONE: Record<LancamentoStatus, string> = {
  planejamento: "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300",
  lancamento: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  venda: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  concluido: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  pausado: "bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400",
}

// Paleta de "cor de identidade" do lançamento (chave → hex). Toque de UX aprovado no mockup.
export const LANCAMENTO_CORES = [
  "coral",
  "sky",
  "violet",
  "amber",
  "teal",
  "emerald",
  "rose",
  "stone",
] as const
export type LancamentoCor = (typeof LANCAMENTO_CORES)[number]

export const COR_HEX: Record<string, string> = {
  coral: "#E8856A",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  teal: "#14b8a6",
  emerald: "#10b981",
  rose: "#f43f5e",
  stone: "#a8a29e",
}

export interface Lancamento {
  id: string
  org_id: string
  nome: string
  property_interest_id: string | null
  status: LancamentoStatus
  cor: string
  created_by: string | null
  created_at: string
  updated_at: string
  // join opcional (nome do empreendimento) resolvido na página
  empreendimento_nome?: string | null
}

type ValidateResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * Valida o payload de criação/edição de um Lançamento.
 * `partial: true` (PATCH) só valida os campos presentes.
 */
export function validateLancamento(
  raw: unknown,
  opts: { partial: boolean }
): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Payload inválido" }
  const b = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if (!opts.partial || "nome" in b) {
    const nome = typeof b.nome === "string" ? b.nome.trim() : ""
    if (!nome) return { ok: false, error: "Nome do lançamento é obrigatório" }
    out.nome = nome
  }
  if (!opts.partial || "status" in b) {
    const status = b.status
    if (status != null && !LANCAMENTO_STATUS.includes(status as LancamentoStatus)) {
      return { ok: false, error: "Status inválido" }
    }
    if (status != null) out.status = status
  }
  if (!opts.partial || "cor" in b) {
    const cor = b.cor
    if (cor != null && typeof cor === "string" && cor in COR_HEX) out.cor = cor
  }
  if ("property_interest_id" in b) {
    const pid = b.property_interest_id
    out.property_interest_id = pid === "" || pid == null ? null : String(pid)
  }

  return { ok: true, value: out }
}
