import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 75-45 — Relatório diário de leads (últimas 24h) para o diretor, via
 * WhatsApp. As 6 strings abaixo alimentam o template HSM `relatorio_diario_leads`
 * (pt_BR), nesta ordem. Regras da Meta: parâmetro de template NÃO pode ter quebra
 * de linha/tab/4+ espaços — por isso canais e corretores usam separador " · ".
 */
export interface DailyReportVars {
  data: string // {{1}} ex.: "24/06/2026"
  total: string // {{2}} ex.: "20"
  canais: string // {{3}} ex.: "WhatsApp 12 · Meta Ads 7 · Site 1"
  corretores: string // {{4}} ex.: "Robson 8→8 · Odair 3→2"
  distribuidos: string // {{5}} ex.: "15 de 20"
  tempo: string // {{6}} ex.: "14 min (mín 3 · máx 1h12)"
}

const CHANNEL_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  whatsapp: "WhatsApp",
  website: "Site",
  telegram: "Telegram",
  landing_page: "Landing Page",
  referral: "Indicação",
  other: "Outros",
}

export function channelLabel(canal: string): string {
  if (CHANNEL_LABELS[canal]) return CHANNEL_LABELS[canal]
  if (!canal) return "Desconhecido"
  return canal.charAt(0).toUpperCase() + canal.slice(1)
}

export function formatChannels(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return "—"
  return entries.map(([c, n]) => `${channelLabel(c)} ${n}`).join(" · ")
}

export function firstName(name: string): string {
  const trimmed = (name ?? "").trim()
  return trimmed.split(/\s+/)[0] || "?"
}

export function formatBrokers(
  rows: Array<{ name: string; distribuidos: number; atenderam: number }>
): string {
  if (rows.length === 0) return "Nenhum lead distribuído"
  return rows
    .slice()
    .sort((a, b) => b.distribuidos - a.distribuidos)
    .map((r) => `${firstName(r.name)} ${r.distribuidos}→${r.atenderam}`)
    .join(" · ")
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, "0")}`
}

export function formatTempo(durationsMin: number[]): string {
  if (durationsMin.length === 0) return "começando a medir a partir de hoje"
  const avg = durationsMin.reduce((a, b) => a + b, 0) / durationsMin.length
  const min = Math.min(...durationsMin)
  const max = Math.max(...durationsMin)
  return `${formatDuration(avg)} (mín ${formatDuration(min)} · máx ${formatDuration(max)})`
}

export function formatDateBR(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d)
}

/**
 * Monta as variáveis do relatório para a janela das últimas 24h (até `now`).
 * `now` é injetável para testes. Tudo agregado em JS (volume diário é pequeno).
 */
export async function buildDailyLeadsReport(
  admin: SupabaseClient,
  orgId: string,
  now: Date = new Date()
): Promise<DailyReportVars> {
  const sinceIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // Estágio "Aguardando atendimento"
  const { data: novoStage } = await admin
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", "novo")
    .maybeSingle()
  const novoId = (novoStage?.id as string | undefined) ?? null

  // (1)(2)(3) Leads criados na janela + por canal
  const { data: leads } = await admin
    .from("leads")
    .select("channel, source")
    .eq("org_id", orgId)
    .gte("created_at", sinceIso)
  const leadRows = (leads ?? []) as Array<{ channel: string | null; source: string | null }>
  const total = leadRows.length
  const canalCounts: Record<string, number> = {}
  for (const l of leadRows) {
    const canal = l.channel ?? l.source ?? "desconhecido"
    canalCounts[canal] = (canalCounts[canal] ?? 0) + 1
  }

  // (6) Tempo de atendimento: leads atendidos (carimbados) na janela
  const { data: attended } = await admin
    .from("leads")
    .select("created_at, primeiro_atendimento_em")
    .eq("org_id", orgId)
    .gte("primeiro_atendimento_em", sinceIso)
  const durations = ((attended ?? []) as Array<{ created_at: string; primeiro_atendimento_em: string }>)
    .map(
      (a) =>
        (new Date(a.primeiro_atendimento_em).getTime() - new Date(a.created_at).getTime()) / 60000
    )
    .filter((d) => Number.isFinite(d) && d >= 0)

  // (4)(5) Distribuídos por corretor na janela + quantos saíram de "novo"
  const { data: dist } = await admin
    .from("lead_distribution_log")
    .select("lead_id, broker_id")
    .eq("org_id", orgId)
    .eq("status", "distributed")
    .gte("created_at", sinceIso)
  const distRows = (dist ?? []) as Array<{ lead_id: string; broker_id: string }>
  const totalDistribuidos = distRows.length

  let brokerRows: Array<{ name: string; distribuidos: number; atenderam: number }> = []
  if (distRows.length > 0) {
    const brokerIds = [...new Set(distRows.map((d) => d.broker_id))]
    const leadIds = [...new Set(distRows.map((d) => d.lead_id))]

    const { data: brokers } = await admin
      .from("brokers")
      .select("id, users!inner(name)")
      .in("id", brokerIds)
    const brokerName: Record<string, string> = {}
    for (const b of (brokers ?? []) as Array<{ id: string; users: { name: string } | { name: string }[] }>) {
      const u = Array.isArray(b.users) ? b.users[0] : b.users
      brokerName[b.id] = u?.name ?? "?"
    }

    const { data: distLeads } = await admin.from("leads").select("id, stage_id").in("id", leadIds)
    const leadStage: Record<string, string | null> = {}
    for (const l of (distLeads ?? []) as Array<{ id: string; stage_id: string | null }>) {
      leadStage[l.id] = l.stage_id
    }

    const byBroker: Record<string, { distribuidos: number; atenderam: number }> = {}
    for (const d of distRows) {
      const agg = (byBroker[d.broker_id] ??= { distribuidos: 0, atenderam: 0 })
      agg.distribuidos++
      const stage = leadStage[d.lead_id]
      if (stage && stage !== novoId) agg.atenderam++
    }
    brokerRows = Object.entries(byBroker).map(([id, v]) => ({ name: brokerName[id] ?? "?", ...v }))
  }

  return {
    data: formatDateBR(now),
    total: String(total),
    canais: formatChannels(canalCounts),
    corretores: formatBrokers(brokerRows),
    distribuidos: `${totalDistribuidos} de ${total}`,
    tempo: formatTempo(durations),
  }
}
