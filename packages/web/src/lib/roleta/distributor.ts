import "server-only"

import { createAdminClient } from "@web/lib/supabase/admin"
import { notifyBroker } from "./notify-broker"

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
  timezone: string
  notify_push: boolean
  notify_email: boolean
  notify_whatsapp: boolean
}

function isWithinBusinessHours(config: RoletaConfig): boolean {
  const now = new Date()
  const locale = now.toLocaleString("en-US", { timeZone: config.timezone })
  const tzDate = new Date(locale)

  const dayOfWeek = tzDate.getDay()
  if (!config.business_days.includes(dayOfWeek)) return false

  const [startH, startM] = config.business_hour_start.split(":").map(Number)
  const [endH, endM] = config.business_hour_end.split(":").map(Number)
  const current = tzDate.getHours() * 60 + tzDate.getMinutes()
  const start = (startH ?? 8) * 60 + (startM ?? 0)
  const end = (endH ?? 18) * 60 + (endM ?? 0)

  return current >= start && current < end
}

export async function distributeLeadToNextBroker(
  leadId: string,
  orgId: string
): Promise<DistributionResult> {
  const admin = createAdminClient()

  // 1. Fetch roleta config
  const { data: config } = await admin
    .from("roleta_config")
    .select("is_active, business_days, business_hour_start, business_hour_end, timezone, notify_push, notify_email, notify_whatsapp")
    .eq("org_id", orgId)
    .maybeSingle()

  if (!config) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId,
      lead_id: leadId,
      status: "sem_config",
      skipped_brokers: [],
    })
    return { status: "sem_config" }
  }

  if (!config.is_active) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId,
      lead_id: leadId,
      status: "roleta_inativa",
      skipped_brokers: [],
    })
    return { status: "roleta_inativa" }
  }

  if (!isWithinBusinessHours(config as RoletaConfig)) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId,
      lead_id: leadId,
      status: "fora_horario",
      skipped_brokers: [],
    })
    return { status: "fora_horario" }
  }

  // 2. Fetch lead — must belong to this org
  const { data: lead } = await admin
    .from("leads")
    .select("property_interest_id, name, phone")
    .eq("id", leadId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!lead) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId,
      lead_id: leadId,
      status: "sem_corretor_disponivel",
      skipped_brokers: [],
    })
    return { status: "sem_corretor_disponivel" }
  }

  const propertyId = lead.property_interest_id ?? null

  // 3. Atomic pick-and-advance via Postgres RPC (advisory lock serializes per org)
  const { data: picked, error: rpcError } = await admin.rpc("roleta_pick_and_advance", {
    p_org_id: orgId,
    p_lead_id: leadId,
    p_property_id: propertyId,
  })

  if (rpcError) {
    console.error("[roleta] RPC error:", rpcError)
    await admin.from("lead_distribution_log").insert({
      org_id: orgId,
      lead_id: leadId,
      status: "sem_corretor_disponivel",
      skipped_brokers: [],
    })
    return { status: "sem_corretor_disponivel" }
  }

  // RPC returns empty array when no eligible broker found
  const result = Array.isArray(picked) ? picked[0] : null

  if (!result) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId,
      lead_id: leadId,
      status: "sem_corretor_disponivel",
      skipped_brokers: [],
    })
    return { status: "sem_corretor_disponivel" }
  }

  const brokerId = result.broker_id as string
  const brokerUserId = result.broker_user_id as string
  const brokerName = (result.broker_name as string) ?? ""
  const brokerEmail = (result.broker_email as string) ?? ""
  const brokerPhone = (result.broker_phone as string | null) ?? null

  // 4. Notify broker
  const notifyResult = await notifyBroker({
    orgId,
    broker: { userId: brokerUserId, name: brokerName, email: brokerEmail, phone: brokerPhone },
    lead: { id: leadId, name: lead.name ?? null, phone: lead.phone ?? "" },
    config: {
      notify_push: config.notify_push as boolean,
      notify_email: config.notify_email as boolean,
      notify_whatsapp: config.notify_whatsapp as boolean,
    },
  })

  // 5. Log distribution
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

  return { status: "distributed", brokerId, brokerUserId }
}
