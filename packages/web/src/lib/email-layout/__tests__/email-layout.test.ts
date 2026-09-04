import { describe, it, expect } from 'vitest'
import { renderBaseLayout, renderButton } from '../index'
import { trifoldOrgId } from '@web/lib/tenancy/trifold-org'

/** A URL do logo que só a Trifold real pode receber (Story 900-67). */
const LOGO_TRIFOLD = 'https://crm.trifold.eng.br/logo-trifold-email.png'

describe('renderBaseLayout', () => {
  it('returns HTML starting with <!DOCTYPE html>', () => {
    const html = renderBaseLayout('<p>Hello</p>')
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i)
  })

  it('contains the content passed', () => {
    const content = '<p>Test content for email</p>'
    const html = renderBaseLayout(content)
    expect(html).toContain(content)
  })

  it('contains footer with copyright text', () => {
    const html = renderBaseLayout('<p>Body</p>')
    expect(html).toContain('Trifold')
    expect(html).toContain('contato@trifold.com.br')
  })

  it('injects previewText with display:none when provided', () => {
    const html = renderBaseLayout('<p>Body</p>', { previewText: 'Preview 123' })
    expect(html).toContain('Preview 123')
    expect(html).toContain('display:none')
  })

  it('renders without previewText block when not provided', () => {
    const html = renderBaseLayout('<p>Body</p>')
    expect(html).not.toContain('display:none')
  })

  it('uses orgName option in header', () => {
    const html = renderBaseLayout('<p>Body</p>', { orgName: 'MinhaEmpresa' })
    expect(html).toContain('>MinhaEmpresa</span>')
  })

  // Story 900-67 (AC10) — este `it` MUDOU DE SENTIDO, não foi apagado. Ele era o carrasco do
  // defeito: afirmava que, sem `orgName`, o cabeçalho "cai para a Trifold". Cair para a marca do
  // primeiro cliente quando não se sabe de quem é o e-mail é justamente o que a story corrige.
  // A asserção antiga (`toContain('Trifold')`) também não alcançava o que dizia medir: a palavra
  // "Trifold" aparece no rodapé e no texto do span, então ela ficava verde nos DOIS branches.
  it('does NOT fall back to the Trifold logo when no orgId is provided', () => {
    const html = renderBaseLayout('<p>Body</p>')
    expect(html).not.toContain(LOGO_TRIFOLD)
    expect(html).not.toContain('<img')
  })

  it('does NOT fall back to the Trifold logo for another org id', () => {
    const html = renderBaseLayout('<p>Body</p>', {
      orgName: 'Trifold Sandbox',
      orgId: '11111111-2222-3333-4444-555555555555',
    })
    expect(html).not.toContain(LOGO_TRIFOLD)
    expect(html).toContain('>Trifold Sandbox</span>')
  })

  it('renders the Trifold logo for the Trifold org id', () => {
    const html = renderBaseLayout('<p>Body</p>', { orgName: 'Trifold', orgId: trifoldOrgId() })
    expect(html).toContain(`<img src="${LOGO_TRIFOLD}" alt="Trifold"`)
  })

  it('includes unsubscribe link when unsubscribeUrl is provided', () => {
    const url = 'https://example.com/unsubscribe'
    const html = renderBaseLayout('<p>Body</p>', { unsubscribeUrl: url })
    expect(html).toContain(url)
    expect(html).toContain('Descadastrar')
  })

  it('renders footer without unsubscribe link when url is not provided', () => {
    const html = renderBaseLayout('<p>Body</p>')
    expect(html).not.toContain('Descadastrar')
  })
})

describe('renderButton', () => {
  it('returns an anchor element', () => {
    const html = renderButton('Clique aqui', 'https://example.com')
    expect(html).toMatch(/^<a /)
  })

  it('contains the correct href URL', () => {
    const url = 'https://example.com/action'
    const html = renderButton('Click', url)
    expect(html).toContain(`href="${url}"`)
  })

  it('contains the button text', () => {
    const html = renderButton('Ver imóvel', 'https://example.com')
    expect(html).toContain('Ver imóvel')
  })

  it('uses accent color for background', () => {
    const html = renderButton('CTA', 'https://example.com')
    expect(html).toContain('#F27A5E')
  })
})
