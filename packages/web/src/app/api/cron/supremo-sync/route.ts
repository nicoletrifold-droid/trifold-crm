import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEvent } from "@web/lib/logger"
import { STAGE_IDS } from "@trifold/shared"

export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const SUPREMO_API_TOKEN = process.env.SUPREMO_API_TOKEN
const SUPREMO_ORG_ID = process.env.SUPREMO_ORG_ID
const SUPREMO_BASE = "https://api.supremocrm.com.br/v1"

// Estágios que só existem no trifold ou são protegidos — nunca sobrescrever via sync
const PROTECTED_STAGE_IDS = new Set<string>([
  STAGE_IDS.acao_muffato,   // campanha pontual, não gerenciada pelo Supremo
  STAGE_IDS.visita_agendada,// coluna exclusiva trifold
  STAGE_IDS.negociando,     // coluna exclusiva trifold
])

// Mapeamento por id_situacao (IDs específicos da conta Trifold no Supremo)
const SITUACAO_ID_TO_STAGE: Record<number, string> = {
  11031: STAGE_IDS.novo,             // AGUARDANDO ATENDIMENTO
  10496: STAGE_IDS.em_qualificacao,  // 1º CONTATO
  11493: STAGE_IDS.qualificado,      // AGENDAMENTO
  11477: STAGE_IDS.no_show,          // ATENDIMENTO
  10260: STAGE_IDS.visitou,          // VISITA
  10261: STAGE_IDS.proposta,         // PROPOSTA
  10263: STAGE_IDS.fechou,           // FECHAMENTO
  10688: STAGE_IDS.represamento,     // REPRESAMENTO
  10262: "95327bd7-3e88-4038-aa16-250a74ab085c",  // NÃO QUALIFICADO
}

// Mapeamento por nome de situação (fallback p/ situações sem ID mapeado, ex: IMPORTAR CRM)
const SITUACAO_NOME_TO_STAGE: Record<string, string> = {
  "aguardando atendimento": STAGE_IDS.novo,
  "1º contato":             STAGE_IDS.em_qualificacao,
  "1o contato":             STAGE_IDS.em_qualificacao,
  "atendimento":            STAGE_IDS.no_show,
  "agendamento":            STAGE_IDS.qualificado,
  "visita":                 STAGE_IDS.visitou,
  "não qualificado":        "95327bd7-3e88-4038-aa16-250a74ab085c",
  "nao qualificado":        "95327bd7-3e88-4038-aa16-250a74ab085c",
  "proposta":               STAGE_IDS.proposta,
  "fechamento":             STAGE_IDS.fechou,
  "represamento":           STAGE_IDS.represamento,
  "importar crm":           STAGE_IDS.importar_crm,
}

// Preenchido dinamicamente no início de cada run via GET /leads/situacoes
const dynamicSituacaoMap = new Map<number, string>()

async function fetchSituacoes(): Promise<void> {
  try {
    const res = await fetch(`${SUPREMO_BASE}/leads/situacoes`, {
      headers: { Authorization: `Bearer ${SUPREMO_API_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return
    const data: Array<{ id: number; nome: string }> = await res.json()
    for (const s of data) {
      const staticStage = SITUACAO_ID_TO_STAGE[s.id] ?? null
      if (staticStage) {
        // já mapeado estático
        dynamicSituacaoMap.set(s.id, staticStage)
      } else {
        const nomeKey = s.nome.toLowerCase().trim()
        const stageId = SITUACAO_NOME_TO_STAGE[nomeKey] ?? null
        if (stageId) dynamicSituacaoMap.set(s.id, stageId)
      }
    }
  } catch {
    // não bloqueia o sync se falhar — cai no mapeamento estático
  }
}

function mapToStageId(etapa: string, idSituacao: number | null): string {
  if (idSituacao) {
    const dynamic = dynamicSituacaoMap.get(idSituacao)
    if (dynamic) return dynamic
    const static_ = SITUACAO_ID_TO_STAGE[idSituacao]
    if (static_) return static_
  }
  if (etapa === "4") return STAGE_IDS.fechou
  if (etapa === "5") return STAGE_IDS.perdido
  return STAGE_IDS.importar_crm // default: cai em Importar CRM em vez de Aguardando
}

// Supremo nome_origem → lead_source enum
const SOURCE_MAP: Record<string, string> = {
  "facebook patrocinado": "meta_ads",
  "facebook": "meta_ads",
  "meta ads": "meta_ads",
  "instagram": "meta_ads",
  "instagram patrocinado": "meta_ads",
  "whatsapp": "whatsapp_organic",
  "whatsapp orgânico": "whatsapp_organic",
  "whatsapp click": "whatsapp_click_to_ad",
  "site": "website",
  "website": "website",
  "portal": "website",
  "indicação": "referral",
  "indicacao": "referral",
  "telegram": "telegram",
  "walk-in": "walk_in",
  "presencial": "walk_in",
  "balcão": "walk_in",
  "balcao": "walk_in",
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 11) return digits
  if (digits.length === 13 && digits.startsWith("55")) return digits.slice(2)
  if (digits.length === 10) return digits.slice(0, 2) + "9" + digits.slice(2)
  if (digits.length === 12 && digits.startsWith("55")) return digits.slice(2, 4) + "9" + digits.slice(4)
  if (digits.length === 9) return "44" + digits
  if (digits.length === 8) return "449" + digits
  return null
}

function mapSource(origin: string | null): string {
  if (!origin) return "other"
  return SOURCE_MAP[origin.toLowerCase().trim()] ?? "other"
}

// Mapeia utm_campaign para property_interest_id baseado em palavras-chave
const PROPERTY_VIND = "00000000-0000-0000-0004-000000000001"
const PROPERTY_YARDEN = "00000000-0000-0000-0004-000000000002"
function mapProperty(campaign: string | null): string | null {
  if (!campaign) return null
  const upper = campaign.toUpperCase()
  if (upper.includes("VIND")) return PROPERTY_VIND
  if (upper.includes("YARDEN")) return PROPERTY_YARDEN
  return null
}

interface SupremoLead {
  id: number
  nome_pessoa: string | null
  ddi_pessoa: string | null
  telefone_pessoa: string
  email_pessoa: string | null
  nome_origem: string | null
  nome_campanha: string | null
  etapa: string
  id_situacao: number | null
  interesses: string | null
  data_captura: string | null
  data_ultima_interacao: string | null
}

interface SupremoPage {
  data: SupremoLead[]
  total: number
  totalPaginas: number
}

async function fetchPage(page: number, retries = 3): Promise<SupremoPage> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${SUPREMO_BASE}/leads?pagina=${page}`, {
      headers: { Authorization: `Bearer ${SUPREMO_API_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 429) {
      // Falha rápida — não retentar 429 dentro do mesmo run para evitar sobreposição de crons
      throw new Error(`Supremo API 429 on page ${page}`)
    }
    if (!res.ok) throw new Error(`Supremo API ${res.status} on page ${page}`)
    return res.json()
  }
  throw new Error(`fetchPage failed page ${page}`)
}

async function fetchAllPages(fromPage: number, totalPages: number): Promise<SupremoLead[]> {
  const leads: SupremoLead[] = []
  for (let i = fromPage; i <= totalPages; i++) {
    const result = await fetchPage(i)
    leads.push(...result.data)
    if (i < totalPages) await new Promise(r => setTimeout(r, 1_200))
  }
  return leads
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!SUPREMO_API_TOKEN || !SUPREMO_ORG_ID) {
    return NextResponse.json({ error: "SUPREMO_API_TOKEN or SUPREMO_ORG_ID not set" }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("mode") ?? "incremental"
  // Suporte a range manual: ?from_page=41&to_page=80
  const fromPageParam = parseInt(searchParams.get("from_page") ?? "1", 10)
  const toPageParam = searchParams.get("to_page") ? parseInt(searchParams.get("to_page")!, 10) : null
  const startedAt = new Date().toISOString()
  const supabase = createAdminClient()

  let created = 0
  let updated = 0
  let skipped = 0
  let pagesFetched = 0
  let syncError: string | null = null

  try {
    // Buscar situações dinamicamente para completar o mapeamento (ex: IMPORTAR CRM)
    await fetchSituacoes()

    // Determine which pages to fetch
    const firstPage = await fetchPage(1)
    pagesFetched++
    const totalPages = firstPage.totalPaginas

    let supremoLeads: SupremoLead[]
    if (mode === "full" || toPageParam) {
      // Range mode: processa from_page até to_page (máx 40 págs por chamada para evitar timeout)
      const from = Math.max(1, fromPageParam)
      const to = Math.min(toPageParam ?? totalPages, totalPages)
      if (from === 1) {
        const rest = to > 1 ? await fetchAllPages(2, to) : []
        pagesFetched += to - 1
        supremoLeads = [...firstPage.data, ...rest]
      } else {
        supremoLeads = await fetchAllPages(from, to)
        pagesFetched += to - from + 1
      }
    } else {
      // Incremental: fetch first 15 pages (300 newest leads) — cron roda a cada 1 min
      const pages = Math.min(15, totalPages)
      if (pages > 1) {
        const rest = await fetchAllPages(2, pages)
        pagesFetched += pages - 1
        supremoLeads = [...firstPage.data, ...rest]
      } else {
        supremoLeads = firstPage.data
      }
    }

    // Load all existing org leads into memory for efficient lookup
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("id, phone, supremo_id, name, stage_id")
      .eq("org_id", SUPREMO_ORG_ID)

    type LeadRef = { id: string; supremo_id: number | null; stage_id: string | null; name: string | null }
    const bySupremoId = new Map<number, LeadRef>()
    const byPhone = new Map<string, LeadRef>()
    for (const l of existingLeads ?? []) {
      if (l.supremo_id) bySupremoId.set(l.supremo_id, l)
      byPhone.set(l.phone, l)
    }

    const toInsert: object[] = []
    const now = new Date().toISOString()

    for (const lead of supremoLeads) {
      try {
        const phone = normalizePhone(lead.telefone_pessoa)
        if (!phone) { skipped++; continue }

        const stageId = mapToStageId(lead.etapa, lead.id_situacao ?? null)
        const existing = bySupremoId.get(lead.id) ?? byPhone.get(phone) ?? null

        if (existing) {
          // Não sobrescrever leads em colunas protegidas (Ação Muffato, Visita Agendada, Negociando)
          if (existing.stage_id && PROTECTED_STAGE_IDS.has(existing.stage_id)) {
            skipped++
            continue
          }
          // Skip se nada mudou
          if (existing.supremo_id === lead.id && existing.stage_id === stageId) {
            skipped++
            continue
          }
          await supabase
            .from("leads")
            .update({
              supremo_id: lead.id,
              stage_id: stageId,
              supremo_synced_at: now,
              ...(!existing.name && lead.nome_pessoa ? { name: lead.nome_pessoa } : {}),
            })
            .eq("id", existing.id)
          // Update local maps so duplicates in this batch don't re-update
          bySupremoId.set(lead.id, { ...existing, supremo_id: lead.id, stage_id: stageId })
          updated++
        } else {
          toInsert.push({
            org_id: SUPREMO_ORG_ID,
            name: lead.nome_pessoa ?? null,
            phone,
            email: lead.email_pessoa?.toLowerCase().trim() ?? null,
            channel: "whatsapp",
            stage_id: stageId,
            source: mapSource(lead.nome_origem),
            utm_source: lead.nome_origem ?? null, // preserva nome original (ex: "Instagram Patrocinado")
            utm_campaign: lead.nome_campanha ?? null,
            property_interest_id: mapProperty(lead.nome_campanha),
            ai_summary: lead.interesses ?? null,
            is_active: true,
            supremo_id: lead.id,
            supremo_synced_at: now,
            ...(lead.data_captura ? { created_at: new Date(lead.data_captura).toISOString() } : {}),
            ...(lead.data_ultima_interacao ? { updated_at: new Date(lead.data_ultima_interacao).toISOString() } : {}),
          })
          // Add to map so we don't double-insert if same phone appears twice in the batch
          byPhone.set(phone, { id: "pending", supremo_id: lead.id, stage_id: stageId, name: lead.nome_pessoa ?? null })
        }
      } catch (leadErr) {
        skipped++
        logEvent({
          level: "error",
          category: "cron",
          event_type: "SUPREMO_SYNC_LEAD_ERROR",
          message: `Error processing supremo lead ${lead.id}`,
          metadata: { error: leadErr instanceof Error ? leadErr.message : "Unknown", supremoId: lead.id },
          org_id: SUPREMO_ORG_ID,
          source: "api/cron/supremo-sync",
        })
      }
    }

    // Batch insert new leads in chunks of 50
    const CHUNK = 50
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error: insertErr } = await supabase
        .from("leads")
        .insert(toInsert.slice(i, i + CHUNK))
      if (insertErr) {
        logEvent({
          level: "error",
          category: "cron",
          event_type: "SUPREMO_SYNC_INSERT_ERROR",
          message: insertErr.message,
          org_id: SUPREMO_ORG_ID,
          source: "api/cron/supremo-sync",
        })
        skipped += Math.min(CHUNK, toInsert.length - i)
      } else {
        created += Math.min(CHUNK, toInsert.length - i)
      }
    }
  } catch (err) {
    syncError = err instanceof Error ? err.message : "Unknown error"
    logEvent({
      level: "error",
      category: "cron",
      event_type: "SUPREMO_SYNC_ERROR",
      message: syncError,
      org_id: SUPREMO_ORG_ID ?? "unknown",
      source: "api/cron/supremo-sync",
    })
  }

  await supabase.from("supremo_sync_log").insert({
    org_id: SUPREMO_ORG_ID,
    mode,
    leads_created: created,
    leads_updated: updated,
    leads_skipped: skipped,
    pages_fetched: pagesFetched,
    error: syncError,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  })

  return NextResponse.json({ mode, created, updated, skipped, pages_fetched: pagesFetched, error: syncError })
}
