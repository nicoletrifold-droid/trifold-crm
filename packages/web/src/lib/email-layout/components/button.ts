import { emailTokens } from '../styles'

export function renderButton(text: string, url: string): string {
  const c = emailTokens.colors
  const r = emailTokens.borderRadius

  return `<a href="${url}" style="display:inline-block;background-color:${c.accent};color:${c.text.inverse};text-decoration:none;padding:12px 24px;border-radius:${r.button};font-weight:600;font-family:${emailTokens.fonts.base};font-size:${emailTokens.fonts.sizes.base};">${text}</a>`
}
