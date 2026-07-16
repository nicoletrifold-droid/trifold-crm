/**
 * Property identification flow.
 * Matches user messages against known property keywords to identify
 * which property the lead is interested in.
 */

interface Property {
  id: string
  name: string
  slug: string
}

const PROPERTY_KEYWORDS: Record<string, string[]> = {
  vind: ["vind", "67m2", "67 m2", "67m²", "67 m²"],
  yarden: [
    "yarden",
    "83m2",
    "83 m2",
    "83m²",
    "83 m²",
    "gleba itororo",
    "gleba itoroó",
    "churrasqueira",
    "rooftop",
  ],
}

/**
 * Checks a user message for property mentions and returns the matching property ID.
 *
 * @param message - The user's message text
 * @param collectedData - Current collected data (checked for existing property_interest)
 * @param properties - Available properties to match against
 * @returns The matched property ID or null if no match found
 */
function norm(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/** Keywords de um empreendimento (hardcoded se houver, sen\u00e3o derivadas do slug/nome). */
function propertyKeywords(property: Property): string[] {
  const slug = property.slug.toLowerCase()
  const autoKeywords = [
    slug,
    slug.replace(/-/g, " "),
    property.name.toLowerCase(),
    // Palavras do nome (min 4 chars) para evitar falsos positivos.
    ...property.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 4 && !["residence", "residencial", "empreendimento"].includes(w)),
  ]
  return PROPERTY_KEYWORDS[slug] ?? autoKeywords
}

/** True se o texto (j\u00e1 normalizado) cita alguma keyword do empreendimento. */
function textMatchesProperty(normalizedText: string, property: Property): boolean {
  for (const keyword of propertyKeywords(property)) {
    const nk = norm(keyword)
    if (nk && normalizedText.includes(nk)) return true
  }
  return false
}

export function identifyProperty(
  message: string,
  collectedData: Record<string, unknown>,
  properties: Array<Property>
): string | null {
  const normalizedMessage = norm(message)

  for (const property of properties) {
    if (textMatchesProperty(normalizedMessage, property)) return property.id
  }

  // Fall back to existing property interest if no new match
  if (typeof collectedData.property_interest === "string") {
    const interest = collectedData.property_interest.toLowerCase()
    for (const property of properties) {
      if (
        property.slug.toLowerCase() === interest ||
        property.name.toLowerCase() === interest
      ) {
        return property.id
      }
    }
  }

  return null
}

/**
 * Story 75-158 \u2014 Como identifyProperty, mas retorna o id S\u00d3 quando exatamente UM
 * empreendimento casa no texto (sem fallback de collectedData). Retorna `null`
 * quando nenhum OU 2+ casam \u2014 para NUNCA adivinhar entre empreendimentos ao
 * persistir `leads.property_interest_id`. Aceita texto amplo (contexto da conversa).
 */
export function identifyPropertyUnique(
  text: string,
  properties: Array<Property>
): string | null {
  const normalized = norm(text)
  if (!normalized.trim()) return null

  const matched = new Set<string>()
  for (const property of properties) {
    if (textMatchesProperty(normalized, property)) matched.add(property.id)
  }
  return matched.size === 1 ? [...matched][0]! : null
}
