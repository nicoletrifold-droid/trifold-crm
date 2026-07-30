// Story 75-236 — "Calor do Lead": percepção do corretor sobre a temperatura do
// lead. Espelha o enum `interest_level` do banco (cold|warm|hot, nullable);
// "none" é só do filtro = ainda sem percepção (NULL).
// Helper puro (padrão lib/leads/*) para o Server Component e o filtro client
// lerem a MESMA whitelist — valor fora dela nunca chega à query.

export const CALOR_VALUES = ["hot", "warm", "cold", "none"] as const
export type CalorValue = (typeof CALOR_VALUES)[number]

export const CALOR_LABELS: Record<CalorValue, string> = {
  hot: "🔥 Quente",
  warm: "Morno",
  cold: "Frio",
  none: "Não definido",
}

/** Devolve o valor só se estiver na whitelist; qualquer outra coisa → null. */
export function parseCalor(raw?: string | null): CalorValue | null {
  return CALOR_VALUES.includes(raw as CalorValue) ? (raw as CalorValue) : null
}
