import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { sendPushToUser } from "@web/lib/server/push-service"

/**
 * Story 76-2 — Notifica a(s) gerente(s) de relacionamento (Samara) quando um cliente
 * da base responde no WhatsApp e a conversa é encaminhada para o módulo Chat.
 * Push + e-mail, best-effort (nunca quebra o fluxo do webhook).
 */
const RELATIONSHIP_ROLES = ["gerente-relacionamento"]

export async function notifyRelationshipManagers(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  params: { clienteNome: string | null; obraNome: string | null }
): Promise<void> {
  const { data: users } = await admin
    .from("users")
    .select("id, email")
    .eq("org_id", orgId)
    .in("role", RELATIONSHIP_ROLES)
    .eq("is_active", true)

  if (!users?.length) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"
  const url = `${appUrl}/dashboard/chat`
  const nome = params.clienteNome ?? "Cliente"
  const obra = params.obraNome ? ` (${params.obraNome})` : ""
  const title = "Novo contato de cliente"
  const body = `${nome}${obra} respondeu no WhatsApp e foi encaminhado para você.`

  for (const u of users as Array<{ id: string; email: string | null }>) {
    void sendPushToUser(admin, u.id, { title, body, url }).catch((e) =>
      console.error("[relacionamento] push error:", e)
    )
    if (u.email) {
      void sendEmail({
        to: u.email,
        subject: title,
        html: `<p>${body}</p><p><a href="${url}">Abrir o Chat de Relacionamento</a></p>`,
      }).catch((e) => console.error("[relacionamento] email error:", e))
    }
  }
}
