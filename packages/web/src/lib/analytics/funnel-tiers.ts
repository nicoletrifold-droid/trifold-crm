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
  slugsAlvo: readonly string[],
  nomeAlvo: string,
  fallbackColor: string
): FunnelTierEntry {
  const bySlug = stages.find((s) => s.slug && slugsAlvo.includes(norm(s.slug)))
  const byName = bySlug ?? stages.find((s) => norm(s.name) === norm(nomeAlvo))
  return {
    label: byName?.name ?? nomeAlvo,
    count: byName?.count ?? 0,
    color: byName?.color || fallbackColor,
  }
}

// Story 75-320 (pedido do Marcos, 13/08): nível do líquido PROPORCIONAL ao
// volume do andar — "se temos 31 no topo a base zero deveria estar quase
// zerada". Escala √ ("mesmo que não tão fiel"): 4/31 ainda rende um nível
// visível, e piso de 10% garante que andar zerado nunca fica sem cor.
const NIVEL_MIN = 0.1
const NIVEL_MAX = 0.88 // teto: deixa a crista da onda dentro do andar

export function liquidFillFraction(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return NIVEL_MIN
  const ratio = Math.min(1, count / maxCount)
  return NIVEL_MIN + (NIVEL_MAX - NIVEL_MIN) * Math.sqrt(ratio)
}

/**
 * Story 75-323 — os slugs REAIS das etapas em prod não são os nomes delas. A etapa
 * chamada "Atendimento" tem slug `no-show` e a "Fechamento" tem slug `fechou`
 * (herança da nomenclatura antiga do pipeline). Os alvos originais eram
 * `atendimento` e `fechamento`, que não casam com nada — os dois andares só
 * funcionavam pelo fallback de NOME, e renomear a etapa em Configurações →
 * Pipeline zeraria o funil em silêncio. Agora cada andar aceita a lista de slugs
 * que já significam aquilo, e o nome segue como último recurso.
 */
export function pickFunnelTiers(stages: FunnelStageInput[]): FunnelTiers {
  return {
    atendimento: pick(stages, ["atendimento", "no-show"], "Atendimento", "#e0526e"),
    visitaAgendada: pick(stages, ["visita-agendada"], "Visita Agendada", "#7c5cd6"),
    visitou: pick(stages, ["visitou"], "Visitou", "#38a3c4"),
    proposta: pick(stages, ["proposta"], "Proposta", "#76a84e"),
    fechamento: pick(stages, ["fechamento", "fechou"], "Fechamento", "#a855f7"),
  }
}
