import { emailTokens } from '../styles'

export function renderFooter(unsubscribeUrl?: string): string {
  const c = emailTokens.colors
  const s = emailTokens.spacing
  const f = emailTokens.fonts

  const unsubscribeLink = unsubscribeUrl
    ? ` | <a href="${unsubscribeUrl}" style="color:${c.text.secondary};text-decoration:underline;">Descadastrar</a>`
    : ''

  return `<tr>
  <td style="background-color:${c.muted};padding:${s.md} ${s.xl};border-top:1px solid ${c.border};">
    <p style="color:${c.text.secondary};font-size:${f.sizes.sm};margin:0;text-align:center;font-family:${f.base};">
      © ${new Date().getFullYear()} Trifold | contato@trifold.com.br${unsubscribeLink}
    </p>
  </td>
</tr>`
}
