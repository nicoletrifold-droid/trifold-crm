import { createHash } from 'crypto'
import { normalizePhoneBR } from '../utils/phone'

/**
 * PII normalization + SHA-256 hashing helpers for the Meta Conversions API (CAPI).
 *
 * The Meta CAPI requires all PII fields (`em`, `ph`, `fn`, `ln`, `external_id`)
 * to be SHA-256 hashed (hex, lowercase) AFTER a deterministic normalization
 * step. Skipping or varying the normalization degrades match rates (EMQ), so
 * these helpers exist to make normalization consistent and testable in isolation.
 *
 * Reference: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 *
 * [Story 86-3]
 */

/**
 * Normalize an email for CAPI hashing: trim surrounding whitespace and lowercase.
 * Meta expects the email lowercased with no leading/trailing whitespace before
 * hashing.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Normalize a phone number for CAPI hashing.
 *
 * Reuses {@link normalizePhoneBR}, which already produces the Meta-required
 * E.164-without-`+` format (digits only, `55` country-code prefix, mandatory
 * mobile 9th digit) — e.g. `"5511987654321"`. We return its output verbatim,
 * or `null` when the input cannot be normalized (so the caller can omit `ph`).
 *
 * @returns the normalized digits-only phone, or `null` if invalid.
 */
export function normalizePhoneForCapi(phone: string): string | null {
  return normalizePhoneBR(phone)
}

/**
 * Normalize a name (first or last) for CAPI hashing: trim + lowercase.
 *
 * Meta recommends lowercase for `fn`/`ln`. Accent transliteration is NOT
 * documented as mandatory, so we intentionally do not strip accents (avoids
 * lossy, locale-specific transformations that could reduce match quality).
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * SHA-256 hash of `value` as a lowercase hex string (64 chars).
 * Uses the native Node `crypto` module — no new dependency.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
