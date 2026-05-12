import { sendEmail } from "@web/lib/email"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendPushToUser } from "@web/lib/server/push-service"

export type EventoNotificacao =
  | "nova_foto"
  | "novo_documento"
  | "nova_mensagem"
  | "progresso"

const EVENTO_LABEL: Record<EventoNotificacao, string> = {
  nova_foto: "Nova foto adicionada à sua obra",
  novo_documento: "Novo documento disponível",
  nova_mensagem: "Nova mensagem da equipe Trifold",
  progresso: "Progresso da obra atualizado",
}

const EVENTO_PREF_KEY: Record<EventoNotificacao, string> = {
  nova_foto: "notify_nova_foto",
  novo_documento: "notify_novo_documento",
  nova_mensagem: "notify_nova_mensagem",
  progresso: "notify_progresso",
}

const EVENTO_URL_PATH: Record<EventoNotificacao, string> = {
  nova_foto: "/fotos",
  novo_documento: "/documentos",
  nova_mensagem: "/mensagens",
  progresso: "",
}

interface ObraNotificacaoPrefs {
  user_id: string
  email_enabled: boolean
  whatsapp_enabled: boolean
  push_enabled: boolean
  notify_nova_foto: boolean
  notify_novo_documento: boolean
  notify_nova_mensagem: boolean
  notify_progresso: boolean
  users:
    | { name: string; email: string; phone: string | null }
    | { name: string; email: string; phone: string | null }[]
    | null
}

export async function notifyClientes(
  obraId: string,
  evento: EventoNotificacao,
  obraName: string
): Promise<void> {
  try {
    const admin = createAdminClient()

    // Buscar org_id da obra + clientes vinculados em paralelo
    const [obraRes, vinculosRes] = await Promise.all([
      admin.from("obras").select("org_id").eq("id", obraId).single(),
      admin.from("cliente_obras").select("user_id").eq("obra_id", obraId),
    ])

    const orgId = obraRes.data?.org_id
    const vinculos = vinculosRes.data

    if (!vinculos?.length) return

    const userIds = vinculos.map((v) => v.user_id)

    const { data: prefs } = await admin
      .from("obra_notificacao_prefs")
      .select(
        "user_id, email_enabled, whatsapp_enabled, push_enabled, notify_nova_foto, notify_novo_documento, notify_nova_mensagem, notify_progresso, users(name, email, phone)"
      )
      .in("user_id", userIds)

    const prefKey = EVENTO_PREF_KEY[evento] as keyof ObraNotificacaoPrefs
    const descricao = EVENTO_LABEL[evento]
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trifold.com.br"
    const link = `${appUrl}/cliente/${obraId}`

    for (const pref of (prefs as ObraNotificacaoPrefs[]) ?? []) {
      if (!pref[prefKey]) continue

      const user = Array.isArray(pref.users) ? pref.users[0] : pref.users
      if (!user) continue

      if (pref.email_enabled) {
        sendEmail({
          to: user.email,
          subject: `Atualização na sua obra — ${obraName}`,
          html: buildEmailHtml({
            nome: user.name,
            obraName,
            descricao,
            link,
          }),
        }).catch((err) =>
          console.error("[notificacoes] email error:", err)
        )
      }

      if (pref.whatsapp_enabled && user.phone && orgId) {
        sendWhatsApp(admin, orgId, user.phone, user.name, obraName, descricao, link).catch(
          (err) => console.error("[notificacoes] WhatsApp skip:", err)
        )
      }

      if (pref.push_enabled) {
        sendPushToUser(admin, pref.user_id, {
          title: descricao,
          body: `Atualização em ${obraName}`,
          url: `${appUrl}/cliente/${obraId}${EVENTO_URL_PATH[evento]}`,
        }).catch((err) => console.error("[notificacoes] push error:", err))
      }
    }
  } catch (err) {
    console.error("[notificacoes] notifyClientes error:", err)
  }
}

async function sendWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  phone: string,
  nome: string,
  obraName: string,
  descricao: string,
  link: string
): Promise<void> {
  const { data: config } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .single()

  if (!config?.phone_number_id || !config?.access_token) {
    throw new Error("whatsapp_config não encontrada para org")
  }

  const body = `Olá ${nome}! Há uma atualização na sua obra ${obraName}: ${descricao}. Acesse o portal: ${link}`
  const url = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`WhatsApp API error: ${res.status} ${errText}`)
  }
}

function buildEmailHtml(params: {
  nome: string
  obraName: string
  descricao: string
  link: string
}): string {
  const { nome, obraName, descricao, link } = params
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f5f5f5; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background: #0F0F0F; padding: 24px; text-align: center;">
      <span style="color: #F27A5E; font-size: 22px; font-weight: bold; letter-spacing: 2px;">TRIFOLD</span>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #333; font-size: 16px; margin: 0 0 12px;">Olá, <strong>${nome}</strong>!</p>
      <p style="color: #555; font-size: 15px; margin: 0 0 8px;">Há uma novidade na sua obra <strong>${obraName}</strong>:</p>
      <p style="color: #F27A5E; font-size: 15px; font-weight: 600; margin: 0 0 32px;">${descricao}</p>
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${link}"
           style="background: #F27A5E; color: #fff; padding: 12px 28px; border-radius: 6px;
                  text-decoration: none; font-weight: 600; font-size: 15px;">
          Ver no Portal
        </a>
      </div>
      <p style="color: #999; font-size: 12px; margin: 0;">
        Para ajustar suas notificações, acesse as configurações no portal.<br>
        Você recebeu este email pois é cliente Trifold.
      </p>
    </div>
  </div>
</body>
</html>`
}
