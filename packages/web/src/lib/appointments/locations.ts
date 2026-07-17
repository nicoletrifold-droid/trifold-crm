// Story 81-4 — fonte única dos LOCAIS agendáveis da agenda (só DECORADOS desde a
// 81-2). Usada pelo modal interno e pelo link público de imobiliárias. IDs são os
// properties seed da org (mesmos valores que viviam hardcoded no modal).

export const PROPERTY_MAP: Record<string, { id: string; name: string } | null> = {
  "Decorado Vind": {
    id: "00000000-0000-0000-0004-000000000001",
    name: "Vind Residence",
  },
  "Decorado Yarden": {
    id: "00000000-0000-0000-0004-000000000002",
    name: "Yarden",
  },
}

export const LOCATIONS = Object.keys(PROPERTY_MAP)

export function isBookableLocation(location: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROPERTY_MAP, location)
}
