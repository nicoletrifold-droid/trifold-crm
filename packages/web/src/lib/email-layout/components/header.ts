import { emailTokens } from '../styles'

export function renderHeader(orgName: string): string {
  const c = emailTokens.colors
  const s = emailTokens.spacing
  const f = emailTokens.fonts

  return `<tr>
  <td style="background-color:${c.primary};padding:${s.lg} ${s.xl};">
    <span style="color:${c.text.inverse};font-size:${f.sizes.lg};font-weight:700;font-family:${f.base};">${orgName}</span>
  </td>
</tr>`
}
