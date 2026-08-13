// Story 75-318 — Funil de Conversão em 4 andares (pedido do Marcos, 13/08):
// Atendimento → Visita (Agendada + Visitou no MESMO andar, cores distintas) →
// Proposta → Fechamento. Decisão PURA (testável): mapeia as etapas do funil do
// período para os andares pelo SLUG (fallback por nome normalizado).

export interface FunnelStageInput {
  name: string
  slug?: string | null
  color?: string | null
  count: number
}

export interface FunnelTierEntry {
  label: string
  count: number
  color: string
}

export interface FunnelTiers {
  atendimento: FunnelTierEntry
  visitaAgendada: FunnelTierEntry
  visitou: FunnelTierEntry
  proposta: FunnelTierEntry
  fechamento: FunnelTierEntry
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()

function pick(
  stages: FunnelStageInput[],
  slugAlvo: string,
  nomeAlvo: string,
  fallbackColor: string
): FunnelTierEntry {
  const bySlug = stages.find((s) => s.slug && norm(s.slug) === slugAlvo)
  const byName = bySlug ?? stages.find((s) => norm(s.name) === norm(nomeAlvo))
  return {
    label: byName?.name ?? nomeAlvo,
    count: byName?.count ?? 0,
    color: byName?.color || fallbackColor,
  }
}

export function pickFunnelTiers(stages: FunnelStageInput[]): FunnelTiers {
  return {
    atendimento: pick(stages, "atendimento", "Atendimento", "#e0526e"),
    visitaAgendada: pick(stages, "visita-agendada", "Visita Agendada", "#7c5cd6"),
    visitou: pick(stages, "visitou", "Visitou", "#38a3c4"),
    proposta: pick(stages, "proposta", "Proposta", "#76a84e"),
    fechamento: pick(stages, "fechamento", "Fechamento", "#a855f7"),
  }
}
