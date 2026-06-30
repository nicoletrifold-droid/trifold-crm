import { sendEmail } from "@web/lib/email"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendPushToUser } from "@web/lib/server/push-service"
import { logWhatsappSend } from "@web/lib/whatsapp/log-send"

// Story 75-66: janela de coalescing anti-flood por (obra, evento). Dentro dela, só a 1ª
// notificação do mesmo evento dispara envio (lote de fotos → 1 mensagem). Ajustável.
const COALESCE_WINDOW_SECONDS = 15 * 60

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

interface NotifPrefs {
  email_enabled: boolean
  whatsapp_enabled: boolean
  push_enabled: boolean
  notify_nova_foto: boolean
  notify_novo_documento: boolean
  notify_nova_mensagem: boolean
  notify_progresso: boolean
}

// Story 75-5: cliente que nunca salvou preferências não tem linha em
// `obra_notificacao_prefs`. Usamos estes defaults (espelham a UI e a API) para
// que e-mail e todos os eventos cheguem por padrão; WhatsApp/push seguem opt-in.
const DEFAULT_PREFS: NotifPrefs = {
  email_enabled: true,
  // WhatsApp ligado por padrão (Story 75-22): clientes sem linha de prefs recebem
  // WhatsApp além de e-mail. Depende de users.phone preenchido + whatsapp_config da org.
  whatsapp_enabled: true,
  push_enabled: false,
  notify_nova_foto: true,
  notify_novo_documento: true,
  notify_nova_mensagem: true,
  notify_progresso: true,
}

/**
 * Story 75-39 — Kill switch das notificações do portal do cliente.
 * Com `PORTAL_NOTIF_PAUSED=1` (ou `true`), `notifyClientes` não dispara NENHUM canal
 * (WhatsApp, e-mail, push). Usado durante o rollout de logins, quando nem todos os
 * clientes têm acesso ainda. Retomar = remover a variável no Vercel e redeployar.
 * Não afeta notificações de corretor/roleta nem o `whatsapp_config` compartilhado.
 */
export function portalNotificacoesPausadas(): boolean {
  const v = process.env.PORTAL_NOTIF_PAUSED
  return v === "1" || v === "true"
}

export async function notifyClientes(
  obraId: string,
  evento: EventoNotificacao,
  obraName: string
): Promise<void> {
  try {
    if (portalNotificacoesPausadas()) {
      console.log(
        "[notificacoes] portal pausado (PORTAL_NOTIF_PAUSED) — pulando envio",
        { obraId, evento }
      )
      return
    }

    const admin = createAdminClient()

    // Story 75-66: coalescing anti-flood. Só o 1º evento (obra, evento) dentro da janela dispara
    // envio; os demais (ex.: várias fotos no mesmo lote) são suprimidos — o cliente vê tudo no portal.
    // Fallback seguro: se a RPC falhar (ex.: ainda não aplicada), NÃO bloqueia — segue e envia.
    const { data: claimed, error: claimError } = await admin.rpc("claim_obra_notif", {
      p_obra_id: obraId,
      p_evento: evento,
      p_window_seconds: COALESCE_WINDOW_SECONDS,
    })
    if (!claimError && claimed !== true) {
      console.log(
        "[notificacoes] coalescido (janela anti-flood) — pulando envio",
        { obraId, evento }
      )
      return
    }
    if (claimError) {
      console.error("[notificacoes] claim_obra_notif falhou — enviando sem coalescing:", claimError)
    }

    // Buscar org_id da obra + clientes vinculados + distratados em paralelo.
    //
    // Story 20.9 (AC 7): clientes em distrato (todos os contratos "Cancelado" no
    // Sienge) NÃO podem receber notificações. O dado de distrato vive no lado CRM
    // (`clientes_obras_vinculos.distrato`), enquanto o disparo lê do lado portal
    // (`cliente_obras` → `users`). A ponte entre os dois é o `sienge_customer_id`:
    //
    //   cliente_obras.user_id → users.sienge_customer_id
    //        == clientes.sienge_customer_id == clientes_obras_vinculos.cliente_id→clientes
    //   (filtrado por obra_id + distrato = true)
    //
    // Coletamos os `sienge_customer_id` distratados nesta obra e, no loop de
    // disparo, pulamos qualquer portal user cujo `sienge_customer_id` esteja no
    // conjunto. É tolerante (LEFT-join lógico): user sem vínculo CRM ou com
    // `sienge_customer_id` nulo recebe normalmente.
    const [obraRes, vinculosRes, distratadosRes] = await Promise.all([
      admin.from("obras").select("org_id").eq("id", obraId).single(),
      admin.from("cliente_obras").select("user_id").eq("obra_id", obraId),
      admin
        .from("clientes_obras_vinculos")
        .select("cliente_id")
        .eq("obra_id", obraId)
        .eq("distrato", true),
    ])

    const orgId = obraRes.data?.org_id
    const vinculos = vinculosRes.data

    if (!vinculos?.length) return

    const userIds = vinculos.map((v) => v.user_id)

    // Conjunto de sienge_customer_id em distrato nesta obra (ver comentário acima).
    // 2 passos (evita embed com cardinalidade ambígua): cliente_id distratado →
    // sienge_customer_id em `clientes`. Só consulta `clientes` se houver distrato.
    const distratadoClienteIds = (
      (distratadosRes.data ?? []) as { cliente_id: string }[]
    ).map((r) => r.cliente_id)

    const distratadoSiengeIds = new Set<number>()
    if (distratadoClienteIds.length > 0) {
      const { data: clientesDist } = await admin
        .from("clientes")
        .select("sienge_customer_id")
        .in("id", distratadoClienteIds)
      for (const c of (clientesDist ?? []) as {
        sienge_customer_id: number | null
      }[]) {
        if (c.sienge_customer_id != null) distratadoSiengeIds.add(c.sienge_customer_id)
      }
    }

    // Story 75-5: considerar TODOS os vinculados; quem não tem linha de prefs
    // usa DEFAULT_PREFS (e-mail + eventos ligados por padrão).
    const [usersRes, prefsRes] = await Promise.all([
      admin
        .from("users")
        .select("id, name, email, phone, sienge_customer_id")
        .in("id", userIds),
      admin
        .from("obra_notificacao_prefs")
        .select(
          "user_id, email_enabled, whatsapp_enabled, push_enabled, notify_nova_foto, notify_novo_documento, notify_nova_mensagem, notify_progresso"
        )
        .in("user_id", userIds),
    ])

    const prefsMap = new Map(
      ((prefsRes.data as (NotifPrefs & { user_id: string })[]) ?? []).map((p) => [
        p.user_id,
        p,
      ])
    )

    const prefKey = EVENTO_PREF_KEY[evento] as keyof NotifPrefs
    const descricao = EVENTO_LABEL[evento]
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trifold.com.br"
    const link = `${appUrl}/cliente/${obraId}`

    for (const user of usersRes.data ?? []) {
      // Story 20.9 (AC 7): pula clientes em distrato nesta obra (todos os
      // contratos "Cancelado"). Bloqueia os 3 canais (email, WhatsApp, push) por
      // estar antes de qualquer envio.
      const sid = (user as { sienge_customer_id?: number | null })
        .sienge_customer_id
      if (sid != null && distratadoSiengeIds.has(sid)) continue

      const pref = prefsMap.get(user.id) ?? DEFAULT_PREFS
      if (!pref[prefKey]) continue

      if (pref.email_enabled && user.email) {
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
        sendWhatsApp(admin, orgId, user.phone, user.name, obraName, descricao, obraId).catch(
          (err) => console.error("[notificacoes] WhatsApp skip:", err)
        )
      }

      if (pref.push_enabled) {
        sendPushToUser(admin, user.id, {
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

// ── Notificação de NOVO BOLETO (Story 75-76) ────────────────────────────
// Diferente de notifyClientes (fan-out por obra): o boleto é endereçado a UM
// cliente específico (o dono do título no Sienge). Disparo direto, sem o
// coalescing por obra — a idempotência é garantida no webhook (dedup por evento).

export interface NovoBoletoParams {
  orgId: string
  userId: string
  nome: string
  email: string | null
  phone: string | null
  obraId: string
  obraName: string
  /** Já formatado para exibição (ex.: "27/04/2026"). */
  vencimento: string
}

export async function notifyNovoBoleto(params: NovoBoletoParams): Promise<void> {
  const { orgId, userId, nome, email, phone, obraId, obraName, vencimento } = params
  try {
    if (portalNotificacoesPausadas()) {
      console.log("[notificacoes] portal pausado — pulando aviso de boleto", { obraId, userId })
      return
    }

    const admin = createAdminClient()

    // Canais respeitam as prefs do cliente (linha ausente → DEFAULT_PREFS).
    // Boleto não tem pref de evento dedicada — é financeiramente relevante e
    // sempre relevante; só os toggles de canal (email/whatsapp/push) se aplicam.
    const { data: prefRow } = await admin
      .from("obra_notificacao_prefs")
      .select("email_enabled, whatsapp_enabled, push_enabled")
      .eq("user_id", userId)
      .maybeSingle()
    const pref = (prefRow as Pick<NotifPrefs, "email_enabled" | "whatsapp_enabled" | "push_enabled"> | null) ?? DEFAULT_PREFS

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trifold.com.br"
    const link = `${appUrl}/cliente/boleto/${obraId}`

    if (pref.email_enabled && email) {
      sendEmail({
        to: email,
        subject: `Novo boleto da sua obra — ${obraName}`,
        html: buildBoletoEmailHtml({ nome, obraName, vencimento, link }),
      }).catch((err) => console.error("[notificacoes] boleto email error:", err))
    }

    if (pref.whatsapp_enabled && phone) {
      sendBoletoWhatsApp(admin, orgId, phone, nome, obraName, vencimento, obraId).catch(
        (err) => console.error("[notificacoes] boleto WhatsApp skip:", err)
      )
    }

    if (pref.push_enabled) {
      sendPushToUser(admin, userId, {
        title: "Novo boleto disponível",
        body: `${obraName} — vencimento ${vencimento}`,
        url: link,
      }).catch((err) => console.error("[notificacoes] boleto push error:", err))
    }
  } catch (err) {
    console.error("[notificacoes] notifyNovoBoleto error:", err)
  }
}

// Template HSM aprovado `novo_boleto_cliente` (pt_BR): body {{1}}=nome, {{2}}=obra,
// {{3}}=vencimento; botão URL dinâmica base https://crm.trifold.eng.br/cliente/boleto/{{1}}
// (param = obra_id). Verificado APPROVED via Graph API (Story 75-76).
async function sendBoletoWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  phone: string,
  nome: string,
  obraName: string,
  vencimento: string,
  obraId: string
): Promise<void> {
  const { data: config } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .single()

  if (!config?.phone_number_id || !config?.access_token) {
    throw new Error("whatsapp_config não encontrada para org")
  }

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
      type: "template",
      template: {
        name: "novo_boleto_cliente",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: nome },
              { type: "text", text: obraName },
              { type: "text", text: vencimento },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: obraId }],
          },
        ],
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    void logWhatsappSend(admin, { orgId, template: "novo_boleto_cliente", category: "utility", recipientType: "cliente", toPhone: phone, status: "failed", error: `${res.status} ${errText.slice(0, 300)}` })
    throw new Error(`WhatsApp API error: ${res.status} ${errText}`)
  }
  const json = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null
  void logWhatsappSend(admin, { orgId, template: "novo_boleto_cliente", category: "utility", recipientType: "cliente", toPhone: phone, status: "sent", wamId: json?.messages?.[0]?.id ?? null })
}

function buildBoletoEmailHtml(params: {
  nome: string
  obraName: string
  vencimento: string
  link: string
}): string {
  const { nome, obraName, vencimento, link } = params
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f5f5f5; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background: #0F0F0F; padding: 24px; text-align: center;">
      <span style="color: #F27A5E; font-size: 22px; font-weight: bold; letter-spacing: 2px;">TRIFOLD</span>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #333; font-size: 16px; margin: 0 0 12px;">Olá, <strong>${nome}</strong>!</p>
      <p style="color: #555; font-size: 15px; margin: 0 0 8px;">Um novo boleto da sua obra <strong>${obraName}</strong> está disponível.</p>
      <p style="color: #F27A5E; font-size: 15px; font-weight: 600; margin: 0 0 32px;">Vencimento: ${vencimento}</p>
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${link}"
           style="background: #F27A5E; color: #fff; padding: 12px 28px; border-radius: 6px;
                  text-decoration: none; font-weight: 600; font-size: 15px;">
          Ver boleto no Portal
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

async function sendWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  phone: string,
  nome: string,
  obraName: string,
  descricao: string,
  obraId: string
): Promise<void> {
  const { data: config } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .single()

  if (!config?.phone_number_id || !config?.access_token) {
    throw new Error("whatsapp_config não encontrada para org")
  }

  const url = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`

  // Notificação proativa (fora da janela de 24h) → exige template HSM aprovado.
  // Template `atualizacao_obra_cliente` (pt_BR): body {{1}}=nome, {{2}}=obra, {{3}}=descrição.
  // Story 75-67: botão de URL dinâmica — param substitui {{1}} na URL (base
  // https://crm.trifold.eng.br/cliente/{{1}}). Só com template APROVADO como dinâmico
  // (param em template estático = erro 132018).
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "atualizacao_obra_cliente",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: nome },
              { type: "text", text: obraName },
              { type: "text", text: descricao },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: obraId }],
          },
        ],
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    void logWhatsappSend(admin, { orgId, template: "atualizacao_obra_cliente", category: "utility", recipientType: "cliente", toPhone: phone, status: "failed", error: `${res.status} ${errText.slice(0, 300)}` })
    throw new Error(`WhatsApp API error: ${res.status} ${errText}`)
  }
  const json = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null
  void logWhatsappSend(admin, { orgId, template: "atualizacao_obra_cliente", category: "utility", recipientType: "cliente", toPhone: phone, status: "sent", wamId: json?.messages?.[0]?.id ?? null })
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
