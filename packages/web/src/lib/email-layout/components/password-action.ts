import { renderBaseLayout } from "../index"
import { renderButton } from "./button"
import { emailTokens } from "../styles"

/**
 * Template branded reutilizável para e-mails de ação de senha (Story 75-139, AC6).
 *
 * Unifica os blocos de HTML inline quase-idênticos usados hoje em
 * `api/users/[id]/reset-password/route.ts`, `api/brokers/route.ts` (x2) e nos 2
 * novos call-sites desta story (login self-service + reset do cliente do portal).
 *
 * @param mode "reset" — redefinição de senha de conta existente;
 *             "create" — primeiro acesso (cadastro de nova conta).
 * @returns `{ subject, html }` prontos para `sendEmail(...)`.
 */
export function renderPasswordActionEmail(params: {
  userName: string
  actionLink: string
  siteUrl: string
  mode: "reset" | "create"
}): { subject: string; html: string } {
  const { userName, actionLink, siteUrl, mode } = params
  const isReset = mode === "reset"

  const subject = isReset
    ? "Redefina sua senha — Trifold CRM"
    : "Crie sua senha — Trifold CRM"
  const intro = isReset
    ? "solicitou a redefinição da sua senha no sistema da <strong>Trifold</strong>"
    : "foi cadastrado no sistema da <strong>Trifold</strong>"
  const instruction = isReset
    ? "criar uma nova senha de acesso"
    : "criar sua senha de acesso"
  const cta = isReset ? "Redefinir minha senha" : "Criar minha senha"

  const html = renderBaseLayout(
    `
    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#111827;">Olá, ${userName}!</p>
    <p style="margin:0 0 24px;color:#6b7280;">
      Você ${intro}. Clique no botão abaixo para ${instruction}.
    </p>
    ${renderButton(cta, actionLink)}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
      Após ${isReset ? "redefinir" : "criar"} sua senha, acesse o sistema em:<br>
      <a href="${siteUrl}" style="color:${emailTokens.colors.accent};text-decoration:none;font-weight:600;">${siteUrl.replace("https://", "")}</a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
      Este link expira em 24 horas. Se você não esperava este e-mail, pode ignorá-lo.
    </p>
    `,
    {
      orgName: "Trifold CRM",
      previewText: `${userName}, ${isReset ? "redefina" : "crie"} sua senha de acesso ao Trifold CRM`,
    }
  )

  return { subject, html }
}
