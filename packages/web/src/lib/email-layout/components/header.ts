import { emailTokens } from '../styles'
import { isMarcaTrifold } from '../header-brand'

// URL absoluta de produção — e-mails não carregam assets relativos.
// PNG (branco, transparente, 675x72) servido pelo domínio de produção.
const TRIFOLD_LOGO_URL = 'https://crm.trifold.eng.br/logo-trifold-email.png'

export function renderHeader(input: { orgName: string; orgId?: string | null }): string {
  const { orgName, orgId } = input
  const c = emailTokens.colors
  const s = emailTokens.spacing
  const f = emailTokens.fonts

  // O logo já contém o wordmark "TRIFOLD"; usamos a imagem SÓ para a Trifold real e mantemos
  // texto para todas as outras orgs. Story 900-67: a decisão é por `org_id` (identidade), não
  // mais por regex sobre o nome — `"Trifold Sandbox"` casava `/trifold/i` e levava a marca de
  // outro. `orgName` sobrevive apenas como o TEXTO do branch não-Trifold.
  const isTrifold = isMarcaTrifold(orgId)

  const brand = isTrifold
    ? `<img src="${TRIFOLD_LOGO_URL}" alt="Trifold" width="263" height="28" style="height:28px;width:263px;display:block;border:0;outline:none;text-decoration:none;">`
    : `<span style="color:${c.text.inverse};font-size:${f.sizes.lg};font-weight:700;font-family:${f.base};">${orgName}</span>`

  return `<tr>
  <td style="background-color:${c.primary};padding:${s.lg} ${s.xl};">
    ${brand}
  </td>
</tr>`
}
