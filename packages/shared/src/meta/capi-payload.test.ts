import { describe, it, expect } from 'vitest'
import { buildCapiUserData, buildVisitouEvent } from './capi-payload'
import {
  normalizeEmail,
  normalizeName,
  normalizePhoneForCapi,
  sha256Hex,
} from './capi-hashing'

const HEX64 = /^[0-9a-f]{64}$/

describe('buildCapiUserData', () => {
  it('always includes external_id as SHA-256(leadId)', () => {
    const ud = buildCapiUserData({ leadId: 'lead-123' })
    expect(ud.external_id).toEqual([sha256Hex('lead-123')])
    expect(ud.external_id[0]).toMatch(HEX64)
  })

  it('hashes email into em after normalization', () => {
    const ud = buildCapiUserData({ leadId: 'l1', email: '  User@Example.COM ' })
    expect(ud.em).toEqual([sha256Hex(normalizeEmail('  User@Example.COM '))])
    expect(ud.em?.[0]).toMatch(HEX64)
  })

  it('omits em when email is absent or empty', () => {
    expect(buildCapiUserData({ leadId: 'l1' }).em).toBeUndefined()
    expect(buildCapiUserData({ leadId: 'l1', email: '   ' }).em).toBeUndefined()
  })

  it('hashes normalized phone into ph', () => {
    const ud = buildCapiUserData({ leadId: 'l1', phone: '11987654321' })
    const normalized = normalizePhoneForCapi('11987654321')!
    expect(ud.ph).toEqual([sha256Hex(normalized)])
  })

  it('omits ph when phone normalization fails', () => {
    const ud = buildCapiUserData({ leadId: 'l1', phone: '123' })
    expect(ud.ph).toBeUndefined()
  })

  it('omits ph when phone is absent', () => {
    expect(buildCapiUserData({ leadId: 'l1' }).ph).toBeUndefined()
  })

  it('splits name into fn (first token) and ln (rest), both hashed', () => {
    const ud = buildCapiUserData({ leadId: 'l1', name: 'Ana Maria Souza' })
    expect(ud.fn).toEqual([sha256Hex(normalizeName('Ana'))])
    expect(ud.ln).toEqual([sha256Hex(normalizeName('Maria Souza'))])
  })

  it('sets only fn for a single-token name (no ln)', () => {
    const ud = buildCapiUserData({ leadId: 'l1', name: 'Madonna' })
    expect(ud.fn).toEqual([sha256Hex(normalizeName('Madonna'))])
    expect(ud.ln).toBeUndefined()
  })

  it('omits fn/ln when name is absent or empty', () => {
    const ud = buildCapiUserData({ leadId: 'l1', name: '  ' })
    expect(ud.fn).toBeUndefined()
    expect(ud.ln).toBeUndefined()
  })

  it('passes fbc, fbp, client_ip_address, client_user_agent through in PLAIN TEXT', () => {
    const ud = buildCapiUserData({
      leadId: 'l1',
      fbc: 'fb.1.1234.abcd',
      fbp: 'fb.1.5678.efgh',
      clientIp: '203.0.113.5',
      clientUserAgent: 'Mozilla/5.0',
    })
    expect(ud.fbc).toBe('fb.1.1234.abcd')
    expect(ud.fbp).toBe('fb.1.5678.efgh')
    expect(ud.client_ip_address).toBe('203.0.113.5')
    expect(ud.client_user_agent).toBe('Mozilla/5.0')
  })

  it('omits fbc/fbp/ip/ua when absent', () => {
    const ud = buildCapiUserData({ leadId: 'l1' })
    expect(ud.fbc).toBeUndefined()
    expect(ud.fbp).toBeUndefined()
    expect(ud.client_ip_address).toBeUndefined()
    expect(ud.client_user_agent).toBeUndefined()
  })

  // AC5 — the critical guarantee.
  it('AC5: never leaks raw PII — em/ph/fn/ln/external_id are always SHA-256 hashes, never the source value', () => {
    const email = 'jane.doe@example.com'
    const phone = '11987654321'
    const name = 'Jane Doe'
    const leadId = 'lead-xyz'

    const ud = buildCapiUserData({ leadId, email, phone, name })

    const hashedFields = [
      ...(ud.em ?? []),
      ...(ud.ph ?? []),
      ...(ud.fn ?? []),
      ...(ud.ln ?? []),
      ...ud.external_id,
    ]

    // Every hashed field is a 64-char hex string...
    for (const value of hashedFields) {
      expect(value).toMatch(HEX64)
    }

    // ...and NONE of them contain any raw PII substring.
    const rawValues = [
      email,
      normalizeEmail(email),
      phone,
      normalizePhoneForCapi(phone)!,
      'jane',
      'doe',
      leadId,
    ]
    const serialized = JSON.stringify(hashedFields)
    for (const raw of rawValues) {
      expect(serialized).not.toContain(raw)
    }
  })

  it('AC5: fbc/fbp/ip/ua are the ONLY user_data keys allowed in plain text', () => {
    const ud = buildCapiUserData({
      leadId: 'l1',
      email: 'a@b.com',
      phone: '11987654321',
      name: 'Ana Souza',
      fbc: 'fbc-val',
      fbp: 'fbp-val',
      clientIp: '1.2.3.4',
      clientUserAgent: 'UA',
    })

    const plainTextAllowed = new Set([
      'fbc',
      'fbp',
      'client_ip_address',
      'client_user_agent',
    ])
    const hashedKeys = new Set(['em', 'ph', 'fn', 'ln', 'external_id'])

    for (const [key, value] of Object.entries(ud)) {
      if (plainTextAllowed.has(key)) continue
      // Every other present key must be a hashed array.
      expect(hashedKeys.has(key)).toBe(true)
      for (const v of value as string[]) {
        expect(v).toMatch(HEX64)
      }
    }
  })
})

describe('buildVisitouEvent', () => {
  const baseUserData = buildCapiUserData({ leadId: 'lead-1' })

  it('produces the Schedule/system_generated shape with Visitou custom_data', () => {
    const event = buildVisitouEvent({
      eventId: 'visit_lead-1',
      eventTime: 1700000000,
      userData: baseUserData,
    })

    expect(event).toEqual({
      event_name: 'Schedule',
      event_time: 1700000000,
      event_id: 'visit_lead-1',
      action_source: 'system_generated',
      user_data: baseUserData,
      custom_data: {
        content_name: 'Visitou',
        currency: 'BRL',
        value: 0,
      },
    })
  })

  it('defaults value to 0 when not provided', () => {
    const event = buildVisitouEvent({
      eventId: 'visit_lead-1',
      eventTime: 1700000000,
      userData: baseUserData,
    })
    expect(event.custom_data.value).toBe(0)
  })

  it('uses the provided value when given', () => {
    const event = buildVisitouEvent({
      eventId: 'visit_lead-1',
      eventTime: 1700000000,
      userData: baseUserData,
      value: 250,
    })
    expect(event.custom_data.value).toBe(250)
  })
})
