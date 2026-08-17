import { describe, expect, it } from 'vitest'
import {
  buildCapiUserData,
  buildFormEvent,
  buildVisitouEvent,
  FORM_CAPI_EVENTS,
} from './capi-payload'
import { sha256Hex } from './capi-hashing'

/**
 * Story 86-9 — contratos que sustentam a nota de correspondência (EMQ).
 *
 * Estes testes existem para travar decisões que, se revertidas por engano numa
 * refatoração futura, degradariam o EMQ em silêncio: nenhum erro apareceria, os
 * eventos continuariam chegando, e só semanas depois o painel do Meta mostraria
 * a nota caindo.
 */

describe('external_id — costura o funil inteiro (AC2)', () => {
  it('junta leadId e visitor_id, com o leadId primeiro', () => {
    const userData = buildCapiUserData({
      leadId: 'lead-abc',
      externalIds: ['visitor-xyz'],
    })

    expect(userData.external_id).toEqual([
      sha256Hex('lead-abc'),
      sha256Hex('visitor-xyz'),
    ])
  })

  it('aceita só o visitor_id — eventos de topo de funil não têm lead ainda', () => {
    const userData = buildCapiUserData({ externalIds: ['visitor-xyz'] })
    expect(userData.external_id).toEqual([sha256Hex('visitor-xyz')])
  })

  it('remove duplicatas em vez de mandar o mesmo hash duas vezes', () => {
    const userData = buildCapiUserData({ leadId: 'mesmo', externalIds: ['mesmo'] })
    expect(userData.external_id).toHaveLength(1)
  })

  it('omite external_id quando não há identificador nenhum', () => {
    const userData = buildCapiUserData({})
    expect(userData.external_id).toBeUndefined()
  })

  it('não regride o contrato do evento "Visitou" (86-3/86-4)', () => {
    const userData = buildCapiUserData({ leadId: 'lead-1' })
    expect(userData.external_id).toEqual([sha256Hex('lead-1')])
  })
})

describe('st — UF hasheada, cidade jamais (AC7)', () => {
  it('normaliza para 2 letras minúsculas antes de hashear', () => {
    expect(buildCapiUserData({ leadId: 'l', state: 'PR' }).st).toEqual([sha256Hex('pr')])
    expect(buildCapiUserData({ leadId: 'l', state: ' sp ' }).st).toEqual([sha256Hex('sp')])
  })

  it('omite st quando não há UF', () => {
    expect(buildCapiUserData({ leadId: 'l' }).st).toBeUndefined()
    expect(buildCapiUserData({ leadId: 'l', state: '' }).st).toBeUndefined()
  })
})

describe('AC9 — o que é hasheado e o que nunca pode ser', () => {
  const userData = buildCapiUserData({
    leadId: 'lead-1',
    name: 'Maria Souza',
    email: 'Maria@Exemplo.COM ',
    phone: '(44) 99734-4650',
    state: 'PR',
    fbc: 'fb.1.1700000000000.abc123',
    fbp: 'fb.1.1700000000000.9876543210',
    clientIp: '187.1.2.3',
    clientUserAgent: 'Mozilla/5.0 (iPhone)',
  })

  it('hasheia toda a PII (64 hex chars, nada legível)', () => {
    for (const campo of [userData.em, userData.ph, userData.fn, userData.ln, userData.st]) {
      expect(campo?.[0]).toMatch(/^[a-f0-9]{64}$/)
    }
    expect(JSON.stringify(userData)).not.toContain('Maria')
    expect(JSON.stringify(userData)).not.toContain('exemplo.com')
    expect(JSON.stringify(userData)).not.toContain('99734')
  })

  it('mantém fbc/fbp/IP/UA em TEXTO PURO — hashear quebra a correspondência', () => {
    expect(userData.fbc).toBe('fb.1.1700000000000.abc123')
    expect(userData.fbp).toBe('fb.1.1700000000000.9876543210')
    expect(userData.client_ip_address).toBe('187.1.2.3')
    expect(userData.client_user_agent).toBe('Mozilla/5.0 (iPhone)')
  })

  it('normaliza antes de hashear (email em minúsculas, telefone E.164 sem +)', () => {
    expect(userData.em).toEqual([sha256Hex('maria@exemplo.com')])
    expect(userData.ph).toEqual([sha256Hex('5544997344650')])
  })
})

describe('buildFormEvent — atribuição web (AC6)', () => {
  const evento = buildFormEvent({
    eventName: FORM_CAPI_EVENTS.COMPLETE_REGISTRATION,
    eventId: 'uuid-do-browser',
    eventTime: 1_700_000_000,
    userData: buildCapiUserData({ leadId: 'lead-1' }),
    eventSourceUrl: 'https://crm.trifold.eng.br/formulario/abc',
    contentName: 'Investimento Maringá — Agosto',
    value: 87,
  })

  it('usa action_source website e carrega a URL da página', () => {
    // `website` + event_source_url é o que permite ao Meta ligar o evento à
    // sessão do browser. Com `system_generated` (o caso do "Visitou") ele não liga.
    expect(evento.action_source).toBe('website')
    expect(evento.event_source_url).toBe('https://crm.trifold.eng.br/formulario/abc')
  })

  it('reusa o event_id do browser — é o que deduplica os dois disparos', () => {
    expect(evento.event_id).toBe('uuid-do-browser')
  })

  it('leva o score em value e segmenta por content_category', () => {
    expect(evento.custom_data.value).toBe(87)
    expect(evento.custom_data.currency).toBe('BRL')
    expect(evento.custom_data.content_category).toBe('form_qualificacao')
    expect(evento.custom_data.content_name).toBe('Investimento Maringá — Agosto')
  })

  it('não inventa valor quando o score não foi calculado', () => {
    const semScore = buildFormEvent({
      eventName: FORM_CAPI_EVENTS.VIEW_CONTENT,
      eventId: 'e1',
      eventTime: 1,
      userData: {},
      eventSourceUrl: 'https://x/y',
      contentName: 'F',
    })
    expect(semScore.custom_data.value).toBe(0)
  })

  it('não altera o evento "Visitou", que segue system_generated', () => {
    const visitou = buildVisitouEvent({
      eventId: 'visit_1',
      eventTime: 1,
      userData: buildCapiUserData({ leadId: 'lead-1' }),
    })
    expect(visitou.action_source).toBe('system_generated')
    expect(visitou.event_name).toBe('Schedule')
    expect(visitou.event_source_url).toBeUndefined()
  })
})
