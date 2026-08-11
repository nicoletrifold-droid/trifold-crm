// Story 75-294 — direção de arte por CHIPS + regras puras do pedido de tráfego
// pago. Sem imports server-side de propósito: o modal lista os chips DESTE
// mapa e o servidor compõe o prompt DESTE mapa — fonte única, nunca duplicar
// ([[feedback-consultar-fonte-nao-duplicar-constante]]).

// ============================================================================
// Destino e objetivo
// ============================================================================

export const POST_DESTINOS = ["organico", "pago"] as const
export type PostDestino = (typeof POST_DESTINOS)[number]

export const AD_OBJETIVOS = ["leads", "visita", "reconhecimento"] as const
export type AdObjetivo = (typeof AD_OBJETIVOS)[number]

export const AD_OBJETIVO_LABELS: Record<AdObjetivo, string> = {
  leads: "Leads",
  visita: "Agendar visita",
  reconhecimento: "Reconhecimento",
}

/** Instrução por objetivo — vai ao Sonnet compor a copy do anúncio. */
export const AD_OBJETIVO_INSTRUCAO: Record<AdObjetivo, string> = {
  leads: "objetivo LEADS: CTA de formulário/contato ('Saiba mais', 'Quero saber valores'), foco em despertar interesse e capturar o contato.",
  visita: "objetivo AGENDAR VISITA: CTA direto de visita ('Agende sua visita'), foco em levar ao decorado/plantão.",
  reconhecimento: "objetivo RECONHECIMENTO: sem CTA duro; foco em marca, autoridade e lembrança. Headline institucional.",
}

// ============================================================================
// Proporções do Meta (mesmos literais de ArteAspectRatio em arte-logo.ts —
// redeclarados aqui porque arte-logo puxa código server-side de composição)
// ============================================================================

export const AD_RATIOS = ["1:1", "4:5", "9:16"] as const
export type AdRatio = (typeof AD_RATIOS)[number]

export const AD_RATIO_LABELS: Record<AdRatio, string> = {
  "1:1": "1:1 · Feed",
  "4:5": "4:5 · Feed vertical",
  "9:16": "9:16 · Story/Reels",
}

/** Ratios efetivos de um pedido: pago = as marcadas (default todas); orgânico = null (formato manda). */
export function ratiosDoPedido(destino: PostDestino, proporcoes?: string[] | null): AdRatio[] | null {
  if (destino !== "pago") return null
  const validas = (proporcoes ?? []).filter((r): r is AdRatio => AD_RATIOS.includes(r as AdRatio))
  return validas.length > 0 ? [...new Set(validas)] : [...AD_RATIOS]
}

// ============================================================================
// Chips de direção de arte
// ============================================================================

export interface DirecaoChip {
  key: string
  label: string
  /** Fragmento que entra na direção visual (verbatim, como o humano digitaria) */
  fragmento: string
  /** Chip que depende de foto real de fachada no Kit (jurídico: IA não inventa fachada) */
  precisaFachada?: boolean
}

export interface DirecaoChipGroup {
  key: string
  label: string
  chips: DirecaoChip[]
}

export const DIRECAO_CHIP_GROUPS: DirecaoChipGroup[] = [
  {
    key: "cenario",
    label: "Cenário",
    chips: [
      { key: "fachada_real", label: "Fachada real 📷", fragmento: "usar a foto real da fachada do Kit como base da cena", precisaFachada: true },
      { key: "por_do_sol", label: "Pôr do sol", fragmento: "pôr do sol atrás do prédio, céu quente" },
      { key: "urbano_noite", label: "Urbano noite", fragmento: "cena urbana à noite, prédio iluminado, luzes da cidade" },
      { key: "interior_decorado", label: "Interior decorado", fragmento: "interior do apartamento decorado, ambiente aconchegante" },
      { key: "minimalista", label: "Minimalista", fragmento: "fundo minimalista, composição limpa com bastante respiro" },
    ],
  },
  {
    key: "luz",
    label: "Luz",
    chips: [
      { key: "manha", label: "Manhã", fragmento: "luz de manhã, tons claros e frescos" },
      { key: "golden_hour", label: "Golden hour", fragmento: "golden hour, luz dourada e quente" },
      { key: "noite", label: "Noite", fragmento: "iluminação noturna, com área luminosa de destaque" },
    ],
  },
  {
    key: "estilo",
    label: "Estilo",
    chips: [
      { key: "foto_real", label: "Foto real", fragmento: "estética de fotografia real, sem cara de render" },
      { key: "lifestyle", label: "Lifestyle", fragmento: "estética lifestyle, cotidiano aspiracional" },
      { key: "render", label: "Render", fragmento: "estética de render arquitetônico de alto padrão" },
    ],
  },
  {
    key: "pessoas",
    label: "Pessoas",
    chips: [
      { key: "sem", label: "Sem", fragmento: "sem pessoas na cena" },
      { key: "com", label: "Com", fragmento: "com pessoas na cena, naturais e desfocadas do produto" },
    ],
  },
]

const CHIP_BY_GROUP_AND_KEY = new Map(
  DIRECAO_CHIP_GROUPS.flatMap((g) => g.chips.map((c) => [`${g.key}:${c.key}`, c] as const))
)

/**
 * Compõe a direção visual final: fragmentos dos chips escolhidos (na ordem dos
 * grupos) + detalhes livres do humano. Chips desconhecidos são ignorados
 * (payload adulterado não injeta texto arbitrário via chip — só via o campo
 * livre, que sempre foi do humano).
 */
export function composeDirecao(chips: Record<string, string> | null | undefined, detalhes: string | null | undefined): string {
  const fragmentos: string[] = []
  if (chips) {
    for (const g of DIRECAO_CHIP_GROUPS) {
      const escolhido = chips[g.key]
      if (!escolhido) continue
      const chip = CHIP_BY_GROUP_AND_KEY.get(`${g.key}:${escolhido}`)
      if (chip) fragmentos.push(chip.fragmento)
    }
  }
  const livre = detalhes?.trim()
  if (livre) fragmentos.push(livre)
  return fragmentos.join("; ")
}

/** true quando o valor de chips é válido (objeto raso de strings ou ausente). */
export function chipsValidos(raw: unknown): raw is Record<string, string> | null | undefined {
  if (raw == null) return true
  if (typeof raw !== "object" || Array.isArray(raw)) return false
  return Object.values(raw as Record<string, unknown>).every((v) => typeof v === "string")
}

// ============================================================================
// Copy de anúncio — limites do Meta Ads
// ============================================================================

export const AD_PRIMARY_MAX = 125
export const AD_HEADLINE_MAX = 27

/**
 * Garante o teto SEM cortar palavra no meio: acima do limite, corta na última
 * fronteira de palavra que caiba com a reticência ("…"). Decisão da AC5:
 * regenerar só por estouro seria caro; truncamento explícito e documentado.
 */
export function enforceAdLimit(text: string | null | undefined, max: number): string | null {
  const t = text?.trim()
  if (!t) return null
  if (t.length <= max) return t
  const slice = t.slice(0, max - 1)
  const lastSpace = slice.lastIndexOf(" ")
  const base = lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice
  return `${base.trimEnd()}…`
}
