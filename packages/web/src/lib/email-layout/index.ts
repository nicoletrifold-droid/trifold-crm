import { emailTokens } from './styles'
import { renderHeader } from './components/header'
import { renderFooter } from './components/footer'
import type { EmailLayoutOptions } from './types'

export { renderButton } from './components/button'
export { emailTokens } from './styles'
export type { EmailLayoutOptions } from './types'

export function renderBaseLayout(
  content: string,
  options: EmailLayoutOptions = {}
): string {
  const { orgName = 'Trifold', unsubscribeUrl, previewText } = options
  const c = emailTokens.colors
  const f = emailTokens.fonts
  const s = emailTokens.spacing

  const previewBlock = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${c.background};">${previewText}&nbsp;</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:${c.background};font-family:${f.base};">
  ${previewBlock}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.background};">
    <tr>
      <td align="center" style="padding:${s.lg} ${s.md};">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:${emailTokens.maxWidth};width:100%;background-color:${c.surface};border-radius:${emailTokens.borderRadius.card};overflow:hidden;">
          ${renderHeader(orgName)}
          <tr>
            <td style="padding:${s.xl};color:${c.text.primary};font-family:${f.base};font-size:${f.sizes.base};line-height:1.6;">
              ${content}
            </td>
          </tr>
          ${renderFooter(unsubscribeUrl)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
