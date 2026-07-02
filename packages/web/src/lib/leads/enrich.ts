// Story 75-112 — opções + labels dos campos de enriquecimento do lead.
// Sem server-only (usado nos formulários client). Os `value` batem com os CHECK da migration 154.

export const FINALIDADE_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "moradia", label: "Moradia própria" },
  { value: "investimento", label: "Investimento" },
  { value: "ambos", label: "Ambos" },
] as const

export const PRAZO_COMPRA_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "imediato", label: "Imediato" },
  { value: "ate_3m", label: "Até 3 meses" },
  { value: "3_6m", label: "3 a 6 meses" },
  { value: "mais_6m", label: "Mais de 6 meses" },
] as const

export const FORMA_PAGAMENTO_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "financiamento", label: "Financiamento" },
  { value: "a_vista", label: "À vista" },
  { value: "fgts", label: "FGTS" },
  { value: "consorcio", label: "Consórcio" },
] as const

export const FINALIDADE_LABELS: Record<string, string> = {
  moradia: "Moradia própria", investimento: "Investimento", ambos: "Ambos",
}
export const PRAZO_COMPRA_LABELS: Record<string, string> = {
  imediato: "Imediato", ate_3m: "Até 3 meses", "3_6m": "3 a 6 meses", mais_6m: "Mais de 6 meses",
}
export const FORMA_PAGAMENTO_LABELS: Record<string, string> = {
  financiamento: "Financiamento", a_vista: "À vista", fgts: "FGTS", consorcio: "Consórcio",
}
