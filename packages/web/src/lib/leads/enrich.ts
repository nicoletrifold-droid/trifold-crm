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

// ── Story 75-181 — Perfil do lead p/ marketing ────────────────────────────────
// Profissões comuns no Brasil (alfabético). CONVENÇÃO: `leads.profissao` guarda o
// RÓTULO legível (ou o texto digitado via "Outra") — export de marketing sem de-para.
export const PROFISSAO_SUGESTOES = [
  "Administrador(a)",
  "Advogado(a)",
  "Agricultor(a) / Produtor(a) rural",
  "Aposentado(a)",
  "Arquiteto(a)",
  "Autônomo(a)",
  "Bancário(a)",
  "Comerciante",
  "Contador(a)",
  "Corretor(a) de imóveis",
  "Dentista",
  "Do lar",
  "Empresário(a)",
  "Enfermeiro(a)",
  "Engenheiro(a)",
  "Estudante",
  "Farmacêutico(a)",
  "Fisioterapeuta",
  "Funcionário(a) público(a)",
  "Médico(a)",
  "Militar / Policial",
  "Motorista",
  "Nutricionista",
  "Professor(a)",
  "Profissional de beleza / estética",
  "Profissional de saúde (outros)",
  "Profissional de TI",
  "Psicólogo(a)",
  "Representante comercial",
  "Trabalhador(a) da construção civil",
  "Vendedor(a)",
  "Veterinário(a)",
] as const

// Faixas ancoradas no MCMV (Faixas 1–4) + topo — úteis p/ enquadrar financiamento.
export const RENDA_FAMILIAR_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "ate_2850", label: "Até R$ 2.850" },
  { value: "2850_4700", label: "R$ 2.850 – R$ 4.700" },
  { value: "4700_8000", label: "R$ 4.700 – R$ 8.000" },
  { value: "8000_12000", label: "R$ 8.000 – R$ 12.000" },
  { value: "12000_20000", label: "R$ 12.000 – R$ 20.000" },
  { value: "acima_20000", label: "Acima de R$ 20.000" },
] as const

export const FILHOS_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "nenhum", label: "Nenhum" },
  { value: "1", label: "1 filho(a)" },
  { value: "2", label: "2 filhos(as)" },
  { value: "3_mais", label: "3 ou mais" },
] as const

export const ESTADO_CIVIL_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado_uniao", label: "Casado(a) / União estável" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
] as const

export const FAIXA_ETARIA_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "18_24", label: "18 a 24 anos" },
  { value: "25_34", label: "25 a 34 anos" },
  { value: "35_44", label: "35 a 44 anos" },
  { value: "45_54", label: "45 a 54 anos" },
  { value: "55_64", label: "55 a 64 anos" },
  { value: "65_mais", label: "65 anos ou mais" },
] as const

export const SITUACAO_MORADIA_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "aluguel", label: "Mora de aluguel" },
  { value: "propria", label: "Imóvel próprio" },
  { value: "com_familia", label: "Mora com família" },
] as const

export const TEM_PET_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
] as const

export const RENDA_FAMILIAR_LABELS: Record<string, string> = Object.fromEntries(
  RENDA_FAMILIAR_OPTIONS.filter(o => o.value).map(o => [o.value, o.label])
)
export const FILHOS_LABELS: Record<string, string> = Object.fromEntries(
  FILHOS_OPTIONS.filter(o => o.value).map(o => [o.value, o.label])
)
export const ESTADO_CIVIL_LABELS: Record<string, string> = Object.fromEntries(
  ESTADO_CIVIL_OPTIONS.filter(o => o.value).map(o => [o.value, o.label])
)
export const FAIXA_ETARIA_LABELS: Record<string, string> = Object.fromEntries(
  FAIXA_ETARIA_OPTIONS.filter(o => o.value).map(o => [o.value, o.label])
)
export const SITUACAO_MORADIA_LABELS: Record<string, string> = Object.fromEntries(
  SITUACAO_MORADIA_OPTIONS.filter(o => o.value).map(o => [o.value, o.label])
)
export const TEM_PET_LABELS: Record<string, string> = Object.fromEntries(
  TEM_PET_OPTIONS.filter(o => o.value).map(o => [o.value, o.label])
)

export const FINALIDADE_LABELS: Record<string, string> = {
  moradia: "Moradia própria", investimento: "Investimento", ambos: "Ambos",
}
export const PRAZO_COMPRA_LABELS: Record<string, string> = {
  imediato: "Imediato", ate_3m: "Até 3 meses", "3_6m": "3 a 6 meses", mais_6m: "Mais de 6 meses",
}
export const FORMA_PAGAMENTO_LABELS: Record<string, string> = {
  financiamento: "Financiamento", a_vista: "À vista", fgts: "FGTS", consorcio: "Consórcio",
}
