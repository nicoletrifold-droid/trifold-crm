import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  normalizePhoneForCapi,
  normalizeName,
  sha256Hex,
} from './capi-hashing'

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Test@Example.COM  ')).toBe('test@example.com')
  })

  it('is a no-op for already-normalized input', () => {
    expect(normalizeEmail('user@domain.com')).toBe('user@domain.com')
  })
})

describe('normalizePhoneForCapi', () => {
  it('normalizes an 11-digit (DDD + 9 + 8) number to 55-prefixed digits only', () => {
    // 11 digits without 55 → prefixed with 55 → 13 digits
    expect(normalizePhoneForCapi('11987654321')).toBe('5511987654321')
  })

  it('normalizes a 10-digit legacy number (DDD + 8) inserting the 9th digit via trunk-prefix branch', () => {
    // 12 digits starting with 0 → strip 0 → 11 → prefixed with 55
    expect(normalizePhoneForCapi('04499968944')).toBe('5544999968944')
  })

  it('keeps a canonical 13-digit 55-prefixed number as-is (digits only, no +)', () => {
    expect(normalizePhoneForCapi('+55 (44) 99968-9446')).toBe('5544999689446')
  })

  it('inserts the 9th digit for a 12-digit 55-prefixed legacy number', () => {
    expect(normalizePhoneForCapi('554499689446')).toBe('5544999689446')
  })

  it('returns null for an invalid (too short) phone', () => {
    expect(normalizePhoneForCapi('123')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizePhoneForCapi('')).toBeNull()
  })

  it('never returns a value containing a "+" sign', () => {
    const result = normalizePhoneForCapi('+5544999689446')
    expect(result).not.toBeNull()
    expect(result).not.toContain('+')
  })
})

describe('normalizeName', () => {
  it('trims and lowercases', () => {
    expect(normalizeName('  João  ')).toBe('joão')
  })

  it('does not transliterate accents (documented decision)', () => {
    expect(normalizeName('José')).toBe('josé')
  })
})

describe('sha256Hex', () => {
  it('matches the Meta-published reference hash for "test@example.com"', () => {
    // Reference vector documented by Meta CAPI docs.
    expect(sha256Hex('test@example.com')).toBe(
      '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
    )
  })

  it('matches the well-known SHA-256 of the empty string', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('produces a 64-char lowercase hex string', () => {
    const hash = sha256Hex('anything')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(sha256Hex('same-input')).toBe(sha256Hex('same-input'))
  })
})
