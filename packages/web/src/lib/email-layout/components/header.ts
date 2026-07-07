import { emailTokens } from '../styles'

// URL absoluta de produção — e-mails não carregam assets relativos.
// PNG (branco, transparente, 675x72) servido pelo domínio de produção.
const TRIFOLD_LOGO_URL = 'https://crm.trifold.eng.br/logo-trifold-email.png'

export function renderHeader(orgName: string): string {
  const c = emailTokens.colors
  const s = emailTokens.spacing
  const f = emailTokens.fonts

  // O logo já contém o wordmark "TRIFOLD"; usamos a imagem para a Trifold
  // (ou quando orgName não é informado) e mantemos texto para outras orgs.
  const isTrifold = !orgName || /trifold/i.test(orgName)

  const brand = isTrifold
    ? `<img src="${TRIFOLD_LOGO_URL}" alt="Trifold" width="263" height="28" style="height:28px;width:263px;display:block;border:0;outline:none;text-decoration:none;">`
    : `<span style="color:${c.text.inverse};font-size:${f.sizes.lg};font-weight:700;font-family:${f.base};">${orgName}</span>`

  return `<tr>
  <td style="background-color:${c.primary};padding:${s.lg} ${s.xl};">
    ${brand}
  </td>
</tr>`
}
