import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import {
  sendVisitTemplate,
  waPhone,
  type VisitWaConfig,
} from "@web/lib/appointments/visit-whatsapp"

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Lembretes de visita por WhatsApp — Story 75-191 (reescreve o cron da 61-x).
 *
 * DUAS janelas por execução (cron a cada 30min):
 * - 24h antes → "amanhã às HH:MM"  (flag metadata.whatsapp_reminded_24h)
 * - 3h antes  → "hoje às HH:MM"    (flag metadata.whatsapp_reminded_3h;
 *   `whatsapp_reminded` legado conta como 3h já enviado)
 *
 * HORÁRIO IMPORTUNO (Story 75-192, pedido do Marcos): nenhum lembrete sai fora
 * de 08:00–20:00 BRT. As janelas têm limite inferior LARGO (catch-up): visita às
 * 09:00 teria lembrete de 3h às 06:00 — em vez de pular, ele sai às 08:00 (1h
 * antes). O flag por janela garante envio único mesmo com a janela larga.
 *
 * Destinatários por agendamento (todos via TEMPLATE aprovado — o texto livre
 * antigo NÃO entregava para quem estava com a janela de 24h do WhatsApp fechada,
 * caso de todo cliente que agendou pelo link da imobiliária):
 * - CLIENTE (lead.phone) → `lembrete_visita_cliente` + botão cancelar
 * - CORRETOR INTERNO (users!broker_id.phone) → `lembrete_visita_corretor`
 * - CORRETOR PARCEIRO (metadata.corretor_parceiro.telefone, link IMOB/81-5) →
 *   `lembrete_visita_corretor`
 *
 * Flag da janela é gravada se PELO MENOS UM envio saiu (mesma semântica do cron
 * antigo: evita re-spam do cliente quando só o corretor falhou). Envio com
 * template ainda PENDING na Meta falha → flag não grava → retry no próximo run.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[WHATSAPP-REMINDERS] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // Gate de horário: fora de 08:00–20:00 BRT o run inteiro é adiado (o catch-up
  // das janelas largas cobre quando o horário liberar).
  const brtHour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(now)
  )
  if (brtHour < 8 || brtHour >= 20) {
    return NextResponse.json({ sent: 0, skipped: 0, errors: 0, quietHours: true })
  }

  const windows = [
    {
      key: "3h" as const,
      flag: "whatsapp_reminded_3h",
      legacyFlags: ["whatsapp_reminded"],
      // Catch-up: de 30min a 3h15 antes — visita cujo "3h antes" caiu na
      // madrugada é lembrada no primeiro run após as 08:00.
      start: new Date(now.getTime() + 30 * 60 * 1000),
      end: new Date(now.getTime() + (3 * 60 + 15) * 60 * 1000),
      whenLabel: (hora: string) => `hoje às ${hora}`,
    },
    {
      key: "24h" as const,
      flag: "whatsapp_reminded_24h",
      legacyFlags: [],
      // Catch-up: de 20h a 24h15 antes — sempre cai em "amanhã" (visitas são em
      // horário comercial), mesmo quando o "24h antes" exato caiu fora do gate.
      start: new Date(now.getTime() + 20 * 60 * 60 * 1000),
      end: new Date(now.getTime() + (24 * 60 + 15) * 60 * 1000),
      whenLabel: (hora: string) => `amanhã às ${hora}`,
    },
  ]

  let sent = 0
  let skipped = 0
  let errors = 0

  for (const win of windows) {
    const { data: appointments } = await supabase
      .from("appointments")
      .select(
        `
        id,
        scheduled_at,
        location,
        metadata,
        org_id,
        cancel_token,
        lead:leads!lead_id(id, name, phone),
        broker:users!broker_id(id, name, phone),
        property:properties!property_id(id, name)
      `
      )
      .eq("status", "scheduled")
      .gte("scheduled_at", win.start.toISOString())
      .lte("scheduled_at", win.end.toISOString())

    for (const appointment of appointments ?? []) {
      try {
        const metadata = (appointment.metadata as Record<string, unknown>) ?? {}
        const alreadySent = [win.flag, ...win.legacyFlags].some(
          (f) => metadata[f] === true || metadata[f] === "true"
        )
        if (alreadySent) {
          skipped++
          continue
        }

        const lead = Array.isArray(appointment.lead) ? appointment.lead[0] : appointment.lead
        const broker = Array.isArray(appointment.broker) ? appointment.broker[0] : appointment.broker
        const property = Array.isArray(appointment.property)
          ? appointment.property[0]
          : appointment.property

        const { data: waConfig } = await supabase
          .from("whatsapp_config")
          .select("phone_number_id, access_token")
          .eq("org_id", appointment.org_id)
          .eq("status", "active")
          .maybeSingle()
        if (!waConfig) {
          skipped++
          continue
        }
        const config = waConfig as VisitWaConfig

        const hora = new Date(appointment.scheduled_at).toLocaleTimeString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
        })
        const whenLabel = win.whenLabel(hora)
        const propertyName =
          property?.name ??
          (appointment.location as string | null)?.replace(/^Decorado\s+/i, "") ??
          "Trifold"
        const leadName = lead?.name ?? "Cliente"

        // Destinatários: cliente + corretor interno + corretor parceiro (dedup).
        const sends: Array<Parameters<typeof sendVisitTemplate>[1]> = []
        const seenPhones = new Set<string>()

        const clientTo = waPhone(lead?.phone)
        if (clientTo) {
          seenPhones.add(clientTo)
          sends.push({
            to: clientTo,
            template: "lembrete_visita_cliente",
            bodyParams: [leadName, propertyName, whenLabel],
            cancelToken: (appointment.cancel_token as string | null) ?? null,
          })
        }

        const brokerTo = waPhone(broker?.phone)
        if (brokerTo && !seenPhones.has(brokerTo)) {
          seenPhones.add(brokerTo)
          sends.push({
            to: brokerTo,
            template: "lembrete_visita_corretor",
            bodyParams: [broker?.name ?? "Corretor", leadName, propertyName, whenLabel],
          })
        }

        const parceiro = metadata.corretor_parceiro as
          | { nome?: string | null; telefone?: string | null }
          | undefined
        const parceiroTo = waPhone(parceiro?.telefone)
        if (parceiroTo && !seenPhones.has(parceiroTo)) {
          seenPhones.add(parceiroTo)
          sends.push({
            to: parceiroTo,
            template: "lembrete_visita_corretor",
            bodyParams: [parceiro?.nome ?? "Corretor", leadName, propertyName, whenLabel],
          })
        }

        if (sends.length === 0) {
          skipped++
          continue
        }

        let appointmentSent = false
        for (const s of sends) {
          // Story 75-353 — passa o log: estes lembretes custam na Meta e não
          // registravam nada em `whatsapp_send_log` (zero linhas em 7 dias, com os
          // flags provando que saíram). `recipient_type` distingue lead de corretor.
          const r = await sendVisitTemplate(config, s, {
            admin: supabase,
            orgId: appointment.org_id as string,
            recipientType: s.template.endsWith("_cliente") ? "lead" : "corretor",
          })
          if (r.ok) {
            sent++
            appointmentSent = true
          } else {
            console.error(`[WHATSAPP-REMINDERS] ${win.key} appointment ${appointment.id}:`, r.error)
            errors++
          }
        }

        if (appointmentSent) {
          await supabase
            .from("appointments")
            .update({ metadata: { ...metadata, [win.flag]: true } })
            .eq("id", appointment.id)
        }
      } catch (err) {
        console.error(`[WHATSAPP-REMINDERS] Erro no appointment ${appointment.id}:`, err)
        errors++
      }
    }
  }

  return NextResponse.json({ sent, skipped, errors })
}
