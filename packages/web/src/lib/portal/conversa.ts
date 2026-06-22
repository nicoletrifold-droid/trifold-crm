import "server-only"

import type { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { sendPushToUser } from "@web/lib/server/push-service"

type Admin = ReturnType<typeof createAdminClient>

/**
 * Story 75-16 — Garante a conversa do portal (obra_conversas) para (obra, cliente).
 * Se ainda não existe, cria atribuída ao ATENDENTE PADRÃO da org
 * (organizations.portal_atendente_padrao_id). Se já existe, reabre (status='aberta')
 * e toca o updated_at. Roda com admin client (cliente não tem RLS p/ obra_conversas).
 *
 * Retorna o id da conversa (ou null se falhar — nunca lança, p/ não quebrar o envio).
 */
export async function ensureConversaAtribuida(
  admin: Admin,
  args: { obraId: string; orgId: string; clienteId: string }
): Promise<string | null> {
  const { obraId, orgId, clienteId } = args
  try {
    const { data: existing } = await admin
      .from("obra_conversas")
      .select("id")
      .eq("obra_id", obraId)
      .eq("cliente_id", clienteId)
      .maybeSingle()

    if (existing) {
      await admin
        .from("obra_conversas")
        .update({ status: "aberta", updated_at: new Date().toISOString() })
        .eq("id", existing.id)
      return existing.id
    }

    const { data: org } = await admin
      .from("organizations")
      .select("portal_atendente_padrao_id")
      .eq("id", orgId)
      .maybeSingle()

    const { data: created } = await admin
      .from("obra_conversas")
      .insert({
        obra_id: obraId,
        org_id: orgId,
        cliente_id: clienteId,
        assigned_to: org?.portal_atendente_padrao_id ?? null,
        status: "aberta",
      })
      .select("id")
      .single()

    return created?.id ?? null
  } catch (err) {
    console.error("[portal/conversa] ensureConversaAtribuida error:", err)
    return null
  }
}

/**
 * Story 75-18 (Fase 3) — Avisa a EQUIPE quando o cliente manda mensagem no portal.
 * Push + e-mail ao atendente responsável; push aos participantes. Fire-and-forget;
 * nunca lança. Não notifica se a conversa não tem atendente nem participantes.
 */
export async function notifyEquipeNovaMensagem(
  admin: Admin,
  args: { conversaId: string | null; obraNome: string; clienteNome: string; trecho: string }
): Promise<void> {
  const { conversaId, obraNome, clienteNome, trecho } = args
  if (!conversaId) return
  try {
    const { data: conversa } = await admin
      .from("obra_conversas")
      .select("assigned_to")
      .eq("id", conversaId)
      .maybeSingle()
    const { data: parts } = await admin
      .from("obra_conversas_participants")
      .select("user_id")
      .eq("conversa_id", conversaId)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"
    const url = `${appUrl}/dashboard/mensagens`
    const title = `Nova mensagem de ${clienteNome}`
    const body = `${obraNome}: ${trecho.slice(0, 120)}`

    const assignedId = conversa?.assigned_to ?? null
    const participantIds = (parts ?? []).map((p) => p.user_id).filter((id) => id !== assignedId)

    // Push a todos (atendente + participantes)
    const pushTargets = [assignedId, ...participantIds].filter(Boolean) as string[]
    await Promise.allSettled(
      pushTargets.map((uid) =>
        sendPushToUser(admin, uid, { title, body, url }).catch(() => {})
      )
    )

    // E-mail apenas ao atendente responsável (evita spam a todos)
    if (assignedId) {
      const { data: atendente } = await admin
        .from("users")
        .select("name, email")
        .eq("id", assignedId)
        .maybeSingle()
      if (atendente?.email) {
        await sendEmail({
          to: atendente.email,
          subject: title,
          html: `<p>Olá ${atendente.name ?? ""},</p>
                 <p>${clienteNome} enviou uma mensagem na obra <strong>${obraNome}</strong>:</p>
                 <blockquote>${trecho.slice(0, 300)}</blockquote>
                 <p><a href="${url}">Abrir a central de atendimento</a></p>`,
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error("[portal/conversa] notifyEquipeNovaMensagem error:", err)
  }
}
