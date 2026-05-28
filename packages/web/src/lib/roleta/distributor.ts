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

  const dayOfWeek = tzDate.getDay() // 0=sun
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

  // 2. Fetch lead's property interest
  const { data: lead } = await admin
    .from("leads")
    .select("property_interest_id, name, phone")
    .eq("id", leadId)
    .single()

  const propertyId = lead?.property_interest_id ?? null

  // 3. Fetch eligible brokers in queue order
  // Must: is_active in fila + broker.is_available + has broker_assignment for the property (if lead has one)
  const { data: queueEntries } = await admin
    .from("roleta_fila")
    .select("id, position, broker_id, brokers!inner(id, user_id, max_leads, is_available, users!inner(id, name, email, phone))")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("position", { ascending: true })

  if (!queueEntries?.length) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId,
      lead_id: leadId,
      status: "sem_corretor_disponivel",
      skipped_brokers: [],
    })
    return { status: "sem_corretor_disponivel" }
  }

  // Build set of brokers that cover this property
  let eligibleBrokerIds: Set<string> | null = null
  if (propertyId) {
    const { data: assignments } = await admin
      .from("broker_assignments")
      .select("broker_id")
      .eq("property_id", propertyId)

    eligibleBrokerIds = new Set((assignments ?? []).map((a) => a.broker_id))
  }

  // 4. Walk queue to find next eligible broker
  const skipped: { broker_id: string; reason: string }[] = []
  let selected: {
    queueId: string
    brokerId: string
    userId: string
    userName: string
    userEmail: string
    userPhone: string | null
    position: number
  } | null = null

  for (const entry of queueEntries) {
    const broker = Array.isArray(entry.brokers) ? entry.brokers[0] : entry.brokers
    if (!broker) continue

    const brokerId = broker.id as string

    // Property filter
    if (eligibleBrokerIds && !eligibleBrokerIds.has(brokerId)) {
      skipped.push({ broker_id: brokerId, reason: "sem_assignment_propriedade" })
      continue
    }

    if (!(broker.is_available as boolean)) {
      skipped.push({ broker_id: brokerId, reason: "indisponivel" })
      continue
    }

    // Count active leads for this broker
    const user = Array.isArray(broker.users) ? broker.users[0] : broker.users
    const userId = user?.id as string

    const { count } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_broker_id", userId)
      .eq("is_active", true)

    const activeLeads = count ?? 0
    const maxLeads = (broker.max_leads as number) ?? 50

    if (activeLeads >= maxLeads) {
      skipped.push({ broker_id: brokerId, reason: `max_leads_atingido(${activeLeads}/${maxLeads})` })
      continue
    }

    selected = {
      queueId: entry.id as string,
      brokerId,
      userId,
      userName: (user?.name as string) ?? "",
      userEmail: (user?.email as string) ?? "",
      userPhone: (user?.phone as string | null) ?? null,
      position: entry.position as number,
    }
    break
  }

  if (!selected) {
    await admin.from("lead_distribution_log").insert({
      org_id: orgId,
      lead_id: leadId,
      status: "sem_corretor_disponivel",
      skipped_brokers: skipped,
    })
    return { status: "sem_corretor_disponivel" }
  }

  // 5. Assign lead to broker
  await admin
    .from("leads")
    .update({ assigned_broker_id: selected.userId })
    .eq("id", leadId)

  // 6. Advance queue position (rotate: this broker goes to end)
  const maxPosition = Math.max(...queueEntries.map((e) => e.position as number))
  await admin
    .from("roleta_fila")
    .update({ position: maxPosition + 1 })
    .eq("id", selected.queueId)

  // Re-normalize positions to avoid unbounded growth (shift all down by min)
  // We do this lazily: only when max > 1000 to avoid frequent writes
  if (maxPosition > 1000) {
    const { data: allEntries } = await admin
      .from("roleta_fila")
      .select("id, position")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("position", { ascending: true })

    if (allEntries?.length) {
      const minPos = (allEntries[0]?.position as number) ?? 0
      for (const e of allEntries) {
        await admin
          .from("roleta_fila")
          .update({ position: (e.position as number) - minPos })
          .eq("id", e.id)
      }
    }
  }

  // 7. Notify broker
  const notifyResult = await notifyBroker({
    orgId,
    broker: {
      userId: selected.userId,
      name: selected.userName,
      email: selected.userEmail,
      phone: selected.userPhone,
    },
    lead: {
      id: leadId,
      name: lead?.name ?? null,
      phone: lead?.phone ?? "",
    },
    config: {
      notify_push: config.notify_push as boolean,
      notify_email: config.notify_email as boolean,
      notify_whatsapp: config.notify_whatsapp as boolean,
    },
  })

  // 8. Log distribution
  await admin.from("lead_distribution_log").insert({
    org_id: orgId,
    lead_id: leadId,
    broker_id: selected.brokerId,
    status: "distributed",
    skipped_brokers: skipped,
    notified_push: notifyResult.push,
    notified_email: notifyResult.email,
    notified_whatsapp: notifyResult.whatsapp,
  })

  return {
    status: "distributed",
    brokerId: selected.brokerId,
    brokerUserId: selected.userId,
  }
}
