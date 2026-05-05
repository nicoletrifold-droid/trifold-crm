/**
 * Normalize a Brazilian phone number to canonical E.164 format with the
 * mandatory mobile 9th digit (Anatel res. 575/2011).
 *
 * Canonical format: `5544999689446` (13 digits — country code 55 + DDD + 9 + 8 digits)
 *
 * Normalization rules:
 *   - Strip all non-digit characters (spaces, hyphens, parentheses, `+`)
 *   - Empty / whitespace-only / null / undefined input → `null`
 *   - Less than 10 digits after cleanup → `null`
 *   - 11 digits without `55` prefix → prefix with `55` (becomes 13 digits)
 *   - 12 digits starting with `55` (legacy without 9th digit) → insert `9`
 *     after position 4 (`55DD` + `9` + last 8 digits)
 *   - 13 digits starting with `55` → already canonical, return as-is
 *   - 13 digits NOT starting with `55` → non-BR international, return as-is
 *   - 10 digits (local without DDI/DDD) → return as-is (improbable)
 *
 * @param raw The raw phone string from any external source (Meta webhook, form, etc.)
 * @returns The canonical phone string, or `null` if the input is invalid.
 */
export function normalizePhoneBR(
  raw: string | null | undefined
): string | null {
  // Reject null, undefined, non-string and empty/whitespace-only inputs
  if (raw === null || raw === undefined) return null
  if (typeof raw !== "string") return null
  if (raw.trim().length === 0) return null

  // Strip all non-digit characters
  const digits = raw.replace(/\D/g, "")

  // Less than 10 digits → invalid
  if (digits.length < 10) return null

  // 11 digits without `55` prefix → prefix with `55`
  if (digits.length === 11 && !digits.startsWith("55")) {
    return "55" + digits
  }

  // 12 digits starting with `55` → insert `9` after position 4
  if (digits.length === 12 && digits.startsWith("55")) {
    return digits.slice(0, 4) + "9" + digits.slice(4)
  }

  // 13+ digits or 10 digits (local) or international non-BR → return as-is
  return digits
}
