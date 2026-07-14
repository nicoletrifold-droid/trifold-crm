import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { previousCommercialDayRangeForOrg } from "@web/lib/metrics/commercial-day"
import { getOrgSchedule, businessMinutesBetweenSchedule } from "@web/lib/roleta/business-time"

/**
 * Story 75-45 / 75-154 — Relatório diário de leads (dia comercial anterior) para o
 * diretor, via WhatsApp. As 7 strings abaixo alimentam o template HSM
 * `relatorio_diario_leads_v2` (pt_BR), nesta ordem. Regras da Meta: parâmetro de
 * template NÃO pode ter quebra de linha/tab/4+ espaços — por isso canais,
 * corretores e distribuídos usam separador " · ".
 */
// Story 75-154 — template Meta `relatorio_diario_leads_v2` (7 params). O número do
// topo agora é só o funil (entrada real); cadastros manuais do corretor saem numa
// linha própria e não inflam o "recebidos".
export interface DailyReportVars {
  data: string // {{1}} ex.: "24/06/2026"
  entrada: string // {{2}} leads de entrada (funil) ex.: "15"
  canais: string // {{3}} canais SÓ do funil ex.: "Meta Ads 9 · WhatsApp 6"
  manuais: string // {{4}} cadastros manuais de corretor ex.: "23"
  corretores: string // {{5}} ex.: "Robson 8→8 · Odair 3→2"
  distribuidos: string // {{6}} ex.: "14 de 15 do funil · 18 envios no total (4 redistribuições: bolsão 4 · roleta 0)"
  tempo: string // {{7}} ex.: "14 min (mín 3 · máx 1h12)"
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

/**
 * Story 75-154 — um lead conta como ENTRADA (funil) se tiver QUALQUER sinal de
 * origem real: `metadata` de campanha (Meta Ads/CTWA), OU `ai_summary` (a Nicole
 * atuou), OU ≥1 mensagem, OU distribuição na roleta. Sem nenhum sinal → é cadastro
 * manual do corretor (lançado direto no CRM, às vezes com channel="whatsapp"
 * enganoso). Puro/exportado para teste.
 */
export function isLeadFunil(
  lead: { metadata: unknown; ai_summary: string | null },
  hasMessage: boolean,
  hasDistribution: boolean
): boolean {
  const hasCampaignMeta =
    !!lead.metadata &&
    typeof lead.metadata === "object" &&
    Object.keys(lead.metadata as Record<string, unknown>).length > 0
  return hasCampaignMeta || !!lead.ai_summary || hasMessage || hasDistribution
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

/**
 * Agrega distribuições por corretor contando LEADS ÚNICOS (não eventos):
 * se o mesmo lead foi (re)distribuído ao mesmo corretor mais de uma vez, conta 1.
 * `atenderam` = dos leads distintos do corretor, quantos já saíram de "novo"
 * (stage atual != novoId). Story 75-45-c — antes contava por evento, inflando
 * quem recebeu redistribuição. Puro/exportado para teste.
 */
export function aggregateBrokerRows(
  distRows: Array<{ lead_id: string; broker_id: string }>,
  leadStage: Record<string, string | null>,
  novoId: string | null,
  brokerName: Record<string, string>
): Array<{ name: string; distribuidos: number; atenderam: number }> {
  const seenByBroker: Record<string, Set<string>> = {}
  const byBroker: Record<string, { distribuidos: number; atenderam: number }> = {}
  for (const d of distRows) {
    const seen = (seenByBroker[d.broker_id] ??= new Set())
    if (seen.has(d.lead_id)) continue // mesmo lead já contado para este corretor
    seen.add(d.lead_id)
    const agg = (byBroker[d.broker_id] ??= { distribuidos: 0, atenderam: 0 })
    agg.distribuidos++
    const stage = leadStage[d.lead_id]
    if (stage && stage !== novoId) agg.atenderam++
  }
  return Object.entries(byBroker).map(([id, v]) => ({ name: brokerName[id] ?? "?", ...v }))
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

/**
 * Formata a linha "Distribuídos" ({{6}}) medindo a cobertura do FUNIL (quantos dos
 * leads de entrada foram distribuídos) e, quando há eventos além disso, o total de
 * envios e as redistribuições — agora com a ORIGEM (bolsão × roleta). Story 75-154.
 *
 * - `funil`          = leads de entrada na janela (denominador; ver isLeadFunil)
 * - `coberturaUnica` = dos leads de entrada, quantos tiveram ao menos 1 distribuição
 * - `totalEventos`   = eventos de distribuição na janela (inclui redistribuições)
 * - `leadsUnicos`    = leads distintos distribuídos na janela (inclui carryover de dias anteriores)
 * - `redistribBolsao`= puxadas do bolsão na janela (activity `bolsao_pull`); cada uma
 *                      é um evento `distributed` extra → uma redistribuição de bolsão
 *
 * Uma linha só, sem quebra/tab (regra de parâmetro de template da Meta).
 */
export function formatDistribuidos(params: {
  funil: number
  coberturaUnica: number
  totalEventos: number
  leadsUnicos: number
  redistribBolsao: number
}): string {
  const { funil, coberturaUnica, totalEventos, leadsUnicos, redistribBolsao } = params
  const redistrib = Math.max(0, totalEventos - leadsUnicos)
  const base = `${coberturaUnica} de ${funil} do funil`
  // Sem eventos extras (tudo 1:1 com o funil) → só a cobertura.
  if (totalEventos <= coberturaUnica) return base
  const envios = `${totalEventos} envio${totalEventos === 1 ? "" : "s"} no total`
  let red = ""
  if (redistrib > 0) {
    // Guard carryover: bolsão nunca passa do total de redistribuições; roleta = resto.
    const bolsao = Math.min(Math.max(0, redistribBolsao), redistrib)
    const roleta = redistrib - bolsao
    const plural = redistrib === 1 ? "redistribuição" : "redistribuições"
    red = ` (${redistrib} ${plural}: bolsão ${bolsao} · roleta ${roleta})`
  }
  return `${base} · ${envios}${red}`
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
  // Janela = DIA COMERCIAL anterior COMPLETO (Story 75-57). O cron roda 07:59 BRT
  // (antes da abertura), então reporta o último dia comercial já fechado
  // [fechamento de anteontem, fechamento de ontem). Antes: janela rolante de 24h.
  const { from, to } = await previousCommercialDayRangeForOrg(orgId, admin, now)
  const sinceIso = from.toISOString()
  const untilIso = to.toISOString()
  // Data exibida = o dia comercial reportado (não a data de envio).
  const reportedDay = new Date(to.getTime() - 1)

  // Estágio "Aguardando atendimento"
  const { data: novoStage } = await admin
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", "novo")
    .maybeSingle()
  const novoId = (novoStage?.id as string | undefined) ?? null

  // (1) Leads criados na janela (bruto) + sinais para classificar entrada × manual
  const { data: leads } = await admin
    .from("leads")
    .select("id, channel, source, metadata, ai_summary")
    .eq("org_id", orgId)
    .eq("segmento", "principal") // Story 75-98: relatório do mundo principal, sem IMOB
    .eq("is_active", true)
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso)
  const leadRows = (leads ?? []) as Array<{
    id: string
    channel: string | null
    source: string | null
    metadata: unknown
    ai_summary: string | null
  }>
  const total = leadRows.length
  const recebidosIds = new Set(leadRows.map((l) => l.id))

  // Distribuições da janela (usadas na classificação e nas linhas de distribuídos).
  const { data: dist } = await admin
    .from("lead_distribution_log")
    .select("lead_id, broker_id")
    .eq("org_id", orgId)
    .eq("status", "distributed")
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso)
  const distRows = (dist ?? []) as Array<{ lead_id: string; broker_id: string }>
  const totalDistribuidos = distRows.length
  const distinctDistributedIds = new Set(distRows.map((d) => d.lead_id))

  // Leads com ao menos 1 mensagem (sinal de conversa real, não cadastro à mão).
  const { data: msgRows } =
    recebidosIds.size > 0
      ? await admin.from("messages").select("lead_id").in("lead_id", [...recebidosIds])
      : { data: [] }
  const withMsg = new Set((msgRows ?? []).map((m) => (m as { lead_id: string }).lead_id))

  // (2)(4) Classificação: ENTRADA (funil) × cadastro manual do corretor.
  const funilIds = new Set<string>()
  for (const l of leadRows) {
    if (isLeadFunil(l, withMsg.has(l.id), distinctDistributedIds.has(l.id))) funilIds.add(l.id)
  }
  const entrada = funilIds.size
  const manuais = total - entrada

  // (3) Por canal — SÓ os leads do funil (não os cadastros manuais).
  const canalCounts: Record<string, number> = {}
  for (const l of leadRows) {
    if (!funilIds.has(l.id)) continue
    const canal = l.channel ?? l.source ?? "desconhecido"
    canalCounts[canal] = (canalCounts[canal] ?? 0) + 1
  }

  // Cobertura (dos leads de entrada, quantos distribuídos) + únicos (inclui carryover).
  const coberturaUnica = [...recebidosIds].filter((id) => distinctDistributedIds.has(id)).length
  const leadsUnicosDistribuidos = distinctDistributedIds.size

  // Redistribuições de BOLSÃO = puxadas do bolsão na janela (activity `bolsao_pull`);
  // a RPC pegar_lead_bolsao grava um `distributed` extra a cada puxada (mig 164).
  const { count: bolsaoPulls } = await admin
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("type", "bolsao_pull")
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso)
  const redistribBolsao = bolsaoPulls ?? 0

  // (6) Tempo de atendimento (Story 75-46): da DISTRIBUIÇÃO (corretor recebeu o
  // lead) até o atendimento (saiu de "Aguardando atendimento" = primeiro_atendimento_em).
  // Justo com o corretor — NÃO conta a espera da roleta. Considera leads atendidos
  // na janela; lead sem distribuição registrada (ex.: atribuição manual) fica de fora.
  const { data: attended } = await admin
    .from("leads")
    .select("id, primeiro_atendimento_em")
    .eq("org_id", orgId)
    .eq("segmento", "principal") // Story 75-98: relatório do mundo principal, sem IMOB
    .gte("primeiro_atendimento_em", sinceIso)
    .lt("primeiro_atendimento_em", untilIso)
  const attendedRows = (attended ?? []) as Array<{ id: string; primeiro_atendimento_em: string }>

  // Story 75-60: tempo de atendimento em HORÁRIO COMERCIAL (mesma agenda/fonte do SLA e da tela).
  const { week: schedule, timezone: scheduleTz } = await getOrgSchedule(orgId, admin)
  const durations: number[] = []
  if (attendedRows.length > 0) {
    const { data: distLog } = await admin
      .from("lead_distribution_log")
      .select("lead_id, created_at")
      .eq("org_id", orgId)
      .eq("status", "distributed")
      .in(
        "lead_id",
        attendedRows.map((a) => a.id)
      )
    const distByLead: Record<string, number[]> = {}
    for (const d of (distLog ?? []) as Array<{ lead_id: string; created_at: string }>) {
      ;(distByLead[d.lead_id] ??= []).push(new Date(d.created_at).getTime())
    }
    for (const a of attendedRows) {
      const atendido = new Date(a.primeiro_atendimento_em).getTime()
      // distribuição correspondente = a mais recente ANTES do atendimento
      const dists = (distByLead[a.id] ?? []).filter((t) => t <= atendido)
      if (dists.length === 0) continue // sem distribuição registrada → fora da média
      const min = businessMinutesBetweenSchedule(new Date(Math.max(...dists)), new Date(atendido), schedule, scheduleTz)
      if (Number.isFinite(min) && min >= 0) durations.push(min)
    }
  }

  // (5) Distribuídos por corretor na janela + quantos saíram de "novo".
  // (distRows / distinctDistributedIds / cobertura já computados acima.)
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

    brokerRows = aggregateBrokerRows(distRows, leadStage, novoId, brokerName)
  }

  return {
    data: formatDateBR(reportedDay),
    entrada: String(entrada),
    canais: formatChannels(canalCounts),
    manuais: String(manuais),
    corretores: formatBrokers(brokerRows),
    distribuidos: formatDistribuidos({
      funil: entrada,
      coberturaUnica,
      totalEventos: totalDistribuidos,
      leadsUnicos: leadsUnicosDistribuidos,
      redistribBolsao,
    }),
    tempo: formatTempo(durations),
  }
}
