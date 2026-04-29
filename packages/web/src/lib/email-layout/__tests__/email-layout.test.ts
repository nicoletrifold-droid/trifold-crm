import { describe, it, expect } from 'vitest'
import { renderBaseLayout, renderButton } from '../index'

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
    expect(html).toContain('MinhaEmpresa')
  })

  it('falls back to Trifold when orgName is not provided', () => {
    const html = renderBaseLayout('<p>Body</p>')
    expect(html).toContain('Trifold')
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
    expect(html).toContain('#4f46e5')
  })
})
