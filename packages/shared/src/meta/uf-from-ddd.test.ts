import { describe, expect, it } from 'vitest'
import { ufFromDDD } from './uf-from-ddd'
import { buildCapiUserData } from './capi-payload'

describe('ufFromDDD', () => {
  it('deriva a UF do telefone canônico de normalizePhoneBR', () => {
    expect(ufFromDDD('5544997344650')).toBe('PR')
    expect(ufFromDDD('5511999999999')).toBe('SP')
    expect(ufFromDDD('5521999999999')).toBe('RJ')
    expect(ufFromDDD('5571999999999')).toBe('BA')
  })

  it('aceita telefone com máscara (lê só os dígitos)', () => {
    expect(ufFromDDD('+55 (44) 99734-4650')).toBe('PR')
  })

  it('aceita o formato legado de 12 dígitos (sem o 9º dígito)', () => {
    expect(ufFromDDD('554433334444')).toBe('PR')
  })

  it('devolve null para DDD inexistente no plano da Anatel', () => {
    for (const ddd of ['20', '23', '26', '30', '39', '52', '59', '78', '90']) {
      expect(ufFromDDD(`55${ddd}999999999`)).toBeNull()
    }
  })

  it('devolve null quando não há DDI 55 — não dá para saber se são DDD ou número estrangeiro', () => {
    expect(ufFromDDD('44997344650')).toBeNull()
    expect(ufFromDDD('1234567890')).toBeNull()
  })

  it('devolve null para entrada vazia, nula ou de comprimento inválido', () => {
    expect(ufFromDDD(null)).toBeNull()
    expect(ufFromDDD(undefined)).toBeNull()
    expect(ufFromDDD('')).toBeNull()
    expect(ufFromDDD('55')).toBeNull()
    expect(ufFromDDD('55449973446501234')).toBeNull()
  })

  it('cobre todas as 27 UFs — nenhuma unidade federativa fica sem DDD mapeado', () => {
    const ufs = new Set<string>()
    for (let ddd = 11; ddd <= 99; ddd++) {
      const uf = ufFromDDD(`55${ddd}999999999`)
      if (uf) ufs.add(uf)
    }
    expect(ufs.size).toBe(27)
  })
})

describe('AC7 — cidade nunca é inferida', () => {
  it('buildCapiUserData não emite `ct` mesmo com telefone e UF presentes', () => {
    const userData = buildCapiUserData({
      leadId: 'lead-1',
      name: 'Maria Souza',
      phone: '5544997344650',
      state: 'PR',
    })

    // `st` entra (o DDD determina a UF); `ct` NÃO — o DDD 44 cobre dezenas de
    // municípios, e uma cidade errada derruba o EMQ em vez de subir.
    expect(userData.st).toBeDefined()
    expect(userData).not.toHaveProperty('ct')
  })
})
