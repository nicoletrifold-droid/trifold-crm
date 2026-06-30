import "server-only"

import { STAGE_IDS, normalizePhoneBR } from "@trifold/shared"
import { createAdminClient } from "@web/lib/supabase/admin"
import { notifyBroker, notifyImobiliaria } from "./notify-broker"
import { getOrgSchedule, isOpenAtNow } from "./business-time"

export type DistributionStatus =
  | "distributed"
  | "sem_corretor_disponivel"
  | "fora_horario"
  | "roleta_inativa"
  | "sem_config"

export interface DistributionResult {
  status: DistributionStatus
  brokerId?: string
  brokerUserId?: string
}

interface RoletaConfig {
  is_active: boolean
  business_days: number[]
  business_hour_start: string
  business_hour_end: string
  weekend_hour_start: string | null
  weekend_hour_end: string | null
  timezone: string
  notify_push: boolean
  notify_email: boolean
  notify_whatsapp: boolean
  priorizar_lead_ativo: boolean
  max_leads_per_day: number
  notify_user_on_distribution: string | null
  notify_user_on_fora_horario: string | null
}

export async function distributeLeadToNextBroker(
  leadId: string,
  orgId: string
): Promise<DistributionResult> {
  const admin = createAdminClient()

  // 1. Fetch roleta config
  const { data: config } = await admin
    .from("roleta_config")
    .select(
      "is_active, business_days, business_hour_start, business_hour_end, " +
      "weekend_hour_start, weekend_hour_end, timezone, " +
      "notify_push, notify_email, notify_whatsapp, " +
      "priorizar_lead_ativo, max_leads_per_day, " +
      "notify_user_on_distribution, notify_user_on_fora_horario"
    )
    .eq("org_id", orgId)
    .maybeSingle()

  if (!config) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId, lead_id: leadId, status: "sem_config", skipped_brokers: [],
    })
    return { status: "sem_config" }
  }

  const cfg = config as unknown as RoletaConfig
  // Story 75-58: horário vem do motor único (agenda por dia, roleta_schedule).
  const { week: schedule, timezone: scheduleTz } = await getOrgSchedule(orgId, admin)

  // 2. Fetch lead — must belong to this org
  const { data: lead } = await admin
    .from("leads")
    .select("property_interest_id, name, phone, assigned_broker_id")
    .eq("id", leadId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!lead) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId, lead_id: leadId, status: "sem_corretor_disponivel", skipped_brokers: [],
    })
    return { status: "sem_corretor_disponivel" }
  }

  // Guard: lead já foi atribuído por execução concorrente — não redistribuir
  if (lead.assigned_broker_id !== null) {
    return { status: "sem_corretor_disponivel" }
  }

  // 3. Priorizar lead ativo — bypass da fila para manter continuidade de atendimento.
  //    Se o mesmo telefone já tem um corretor atribuído em outro lead ativo,
  //    rotear para ele independente de horário ou posição na roleta.
  if (cfg.priorizar_lead_ativo && lead.phone) {
    // Story 75-10: casa pelo telefone normalizado (fallback ao cru se inválido).
    const normalizedLeadPhone = normalizePhoneBR(lead.phone as string)
    const priorBase = admin
      .from("leads")
      .select("assigned_broker_id")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .not("assigned_broker_id", "is", null)
      .neq("id", leadId)
    const { data: existingLead } = await (
      normalizedLeadPhone
        ? priorBase.eq("phone_normalized", normalizedLeadPhone)
        : priorBase.eq("phone", lead.phone as string)
    )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingLead?.assigned_broker_id) {
      const assignedUserId = existingLead.assigned_broker_id as string

      const { data: brokerRow } = await admin
        .from("brokers")
        .select("id, users!inner(name, email, phone)")
        .eq("user_id", assignedUserId)
        .eq("org_id", orgId)
        .maybeSingle()

      if (brokerRow) {
        const u = Array.isArray(brokerRow.users) ? brokerRow.users[0] : brokerRow.users
        const brokerInfo = {
          userId: assignedUserId,
          name: (u as { name?: string })?.name ?? "",
          email: (u as { email?: string })?.email ?? "",
          phone: (u as { phone?: string | null })?.phone ?? null,
        }

        const { data: claimed } = await admin.from("leads").update({
          assigned_broker_id: assignedUserId,
          stage_id: STAGE_IDS.novo,
        }).eq("id", leadId).is("assigned_broker_id", null).select("id").maybeSingle()

        if (!claimed) return { status: "sem_corretor_disponivel" }

        const notifyResult = await notifyBroker({
          orgId,
          broker: brokerInfo,
          lead: { id: leadId, name: lead.name ?? null, phone: (lead.phone as string) ?? "" },
          config: { notify_push: cfg.notify_push, notify_email: cfg.notify_email, notify_whatsapp: cfg.notify_whatsapp },
        })

        await admin.from("lead_distribution_log").insert({
          org_id: orgId,
          lead_id: leadId,
          broker_id: brokerRow.id as string,
          status: "distributed",
          skipped_brokers: [],
          notified_push: notifyResult.push,
          notified_email: notifyResult.email,
          notified_whatsapp: notifyResult.whatsapp,
        })

        if (cfg.notify_user_on_distribution) {
          void notifyImobiliaria({
            orgId,
            userId: cfg.notify_user_on_distribution,
            title: "Lead distribuído (prioridade)",
            messageBody: `Lead ${lead.name ?? lead.phone} foi enviado para ${brokerInfo.name} (atendimento contínuo).`,
            lead: { id: leadId, name: lead.name ?? null, phone: (lead.phone as string | null) ?? null },
            brokerName: brokerInfo.name,
          }).catch((e) => console.error("[roleta] imob notify error:", e))
        }

        return { status: "distributed", brokerId: brokerRow.id as string, brokerUserId: assignedUserId }
      }
    }
  }

  // 4. Verificações da roleta normal
  if (!cfg.is_active) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId, lead_id: leadId, status: "roleta_inativa", skipped_brokers: [],
    })
    return { status: "roleta_inativa" }
  }

  if (!isOpenAtNow(new Date(), schedule, scheduleTz)) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId, lead_id: leadId, status: "fora_horario", skipped_brokers: [],
    })

    if (cfg.notify_user_on_fora_horario) {
      void notifyImobiliaria({
        orgId,
        userId: cfg.notify_user_on_fora_horario,
        title: "Lead fora do horário da roleta",
        messageBody: `Lead ${lead.name ?? lead.phone} entrou fora do horário da roleta e não foi distribuído.`,
        lead: { id: leadId, name: lead.name ?? null, phone: (lead.phone as string | null) ?? null },
      }).catch((e) => console.error("[roleta] imob notify error:", e))
    }

    return { status: "fora_horario" }
  }

  const propertyId = lead.property_interest_id ?? null

  // 5. Atomic pick-and-advance via Postgres RPC (advisory lock serializa por org)
  const { data: picked, error: rpcError } = await admin.rpc("roleta_pick_and_advance", {
    p_org_id: orgId,
    p_lead_id: leadId,
    p_property_id: propertyId,
    p_max_leads_per_day: cfg.max_leads_per_day,
  })

  if (rpcError) {
    console.error("[roleta] RPC error:", rpcError)
    await admin.from("lead_distribution_log").insert({
      org_id: orgId, lead_id: leadId, status: "sem_corretor_disponivel", skipped_brokers: [],
    })
    return { status: "sem_corretor_disponivel" }
  }

  let result = Array.isArray(picked) ? picked[0] : null

  // Story 75-44 (AC4): empreendimento identificado mas nenhum corretor habilitado
  // disponível → cai pro pool geral (2ª passada sem filtro de property). Cada chamada
  // da RPC é sua própria transação/advisory lock; após a 1ª passada vazia o lead
  // segue sem corretor, então a 2ª pode atribuir normalmente.
  if (!result && propertyId) {
    const { data: pickedAny, error: retryError } = await admin.rpc("roleta_pick_and_advance", {
      p_org_id: orgId,
      p_lead_id: leadId,
      p_property_id: null,
      p_max_leads_per_day: cfg.max_leads_per_day,
    })
    if (retryError) {
      console.error("[roleta] RPC error (fallback pool geral):", retryError)
    } else {
      result = Array.isArray(pickedAny) ? pickedAny[0] : null
    }
  }

  if (!result) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId, lead_id: leadId, status: "sem_corretor_disponivel", skipped_brokers: [],
    })
    return { status: "sem_corretor_disponivel" }
  }

  const brokerId     = result.broker_id as string
  const brokerUserId = result.broker_user_id as string
  const brokerName   = (result.broker_name as string) ?? ""
  const brokerEmail  = (result.broker_email as string) ?? ""
  const brokerPhone  = (result.broker_phone as string | null) ?? null

  // 6. Notify broker
  const notifyResult = await notifyBroker({
    orgId,
    broker: { userId: brokerUserId, name: brokerName, email: brokerEmail, phone: brokerPhone },
    lead: { id: leadId, name: lead.name ?? null, phone: (lead.phone as string) ?? "" },
    config: { notify_push: cfg.notify_push, notify_email: cfg.notify_email, notify_whatsapp: cfg.notify_whatsapp },
  })

  // 7. Log distribution
  await admin.from("lead_distribution_log").insert({
    org_id: orgId,
    lead_id: leadId,
    broker_id: brokerId,
    status: "distributed",
    skipped_brokers: [],
    notified_push: notifyResult.push,
    notified_email: notifyResult.email,
    notified_whatsapp: notifyResult.whatsapp,
  })

  // 8. Mover lead para "Aguardando atendimento" ao ser atribuído via roleta
  await admin.from("leads").update({ stage_id: STAGE_IDS.novo }).eq("id", leadId)

  // 9. Notificar imobiliária sobre distribuição
  if (cfg.notify_user_on_distribution) {
    void notifyImobiliaria({
      orgId,
      userId: cfg.notify_user_on_distribution,
      title: "Lead distribuído",
      messageBody: `Lead ${lead.name ?? lead.phone} foi enviado para o corretor ${brokerName}.`,
      lead: { id: leadId, name: lead.name ?? null, phone: (lead.phone as string | null) ?? null },
      brokerName,
    }).catch((e) => console.error("[roleta] imob notify error:", e))
  }

  return { status: "distributed", brokerId, brokerUserId }
}
