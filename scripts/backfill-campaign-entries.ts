/**
 * Backfill: compara respostas do Google Forms com campaign_entries no banco.
 * Insere as respostas faltantes SEM enviar email/WhatsApp (late submissions).
 *
 * Uso:
 *   npx tsx scripts/backfill-campaign-entries.ts            # modo dry-run (só lista)
 *   npx tsx scripts/backfill-campaign-entries.ts --insert   # insere as faltantes
 */

import { createClient } from "@supabase/supabase-js"
import { google } from "googleapis"
import { readFileSync } from "fs"
import { resolve } from "path"

// Carrega env de packages/web/.env.local
const envPath = resolve(__dirname, "../packages/web/.env.local")
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match && !process.env[match[1].trim()]) {
    process.env[match[1].trim()] = match[2].trim()
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const DRY_RUN = !process.argv.includes("--insert")
const CAMPAIGN_ID = "076f6b63-8957-4580-b291-9b5e352e9d19"

interface OAuthTokens {
  access_token: string
  refresh_token: string
  expiry_date: number
  token_type: string
  scope: string
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 11) return digits
  if (digits.length === 13 && digits.startsWith("55")) return digits.slice(2)
  if (digits.length === 10) return digits.slice(0, 2) + "9" + digits.slice(2)
  if (digits.length === 12 && digits.startsWith("55"))
    return digits.slice(2, 4) + "9" + digits.slice(4)
  if (digits.length === 9) return "44" + digits
  if (digits.length === 8) return "449" + digits
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFields(response: any, fieldMapping: Record<string, { target: string; label: string }>) {
  let name = ""
  let phone = ""
  let email = ""
  const custom_data: Record<string, string> = {}
  const skipReasons: string[] = []

  for (const [questionId, mapping] of Object.entries(fieldMapping)) {
    const answer = response.answers?.[questionId]?.textAnswers?.answers?.[0]?.value
    if (!answer) continue

    if (mapping.target === "name") name = answer
    else if (mapping.target === "phone") {
      const normalized = normalizePhone(answer)
      if (!normalized) {
        skipReasons.push(`phone normalization failed: "${answer}"`)
        return { fields: null, skipReasons }
      }
      phone = normalized
    } else if (mapping.target === "email") {
      email = answer.toLowerCase().trim()
    } else if (mapping.target.startsWith("custom:")) {
      const key = mapping.target.replace("custom:", "")
      custom_data[key] = answer
    }
  }

  if (!name) skipReasons.push("name is empty")
  if (!phone) skipReasons.push("phone is empty")
  if (!email) skipReasons.push("email is empty")

  if (skipReasons.length > 0) return { fields: null, skipReasons }
  return { fields: { name, phone, email, custom_data }, skipReasons: [] }
}

async function main() {
  console.log(`\n=== Backfill Campaign Entries ===`)
  console.log(`Modo: ${DRY_RUN ? "DRY RUN (somente diagnóstico)" : "INSERT (inserindo faltantes)"}`)
  console.log(`Campaign ID: ${CAMPAIGN_ID}\n`)

  // 1. Busca campanha e tokens OAuth
  const { data: campaign, error: campaignErr } = await supabase
    .from("campaigns")
    .select("id, org_id, name, google_form_id, field_mapping, last_polled_at, last_response_at")
    .eq("id", CAMPAIGN_ID)
    .single()

  if (campaignErr || !campaign) {
    console.error("Campanha não encontrada:", campaignErr?.message)
    process.exit(1)
  }

  console.log(`Campanha: ${campaign.name}`)
  console.log(`Form ID: ${campaign.google_form_id}`)
  console.log(`last_polled_at: ${campaign.last_polled_at}`)
  console.log(`last_response_at: ${campaign.last_response_at}\n`)

  const { data: org } = await supabase
    .from("organizations")
    .select("google_oauth_tokens")
    .eq("id", campaign.org_id)
    .single()

  const tokens = org?.google_oauth_tokens as OAuthTokens | null
  if (!tokens?.refresh_token) {
    console.error("Tokens OAuth não encontrados para a org")
    process.exit(1)
  }

  // 2. Refresh token se necessário
  let activeTokens = tokens
  if (tokens.expiry_date <= Date.now() + 60_000) {
    console.log("Renovando access token...")
    const authClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    authClient.setCredentials({ refresh_token: tokens.refresh_token })
    const { credentials } = await authClient.refreshAccessToken()
    activeTokens = {
      ...tokens,
      access_token: credentials.access_token ?? tokens.access_token,
      expiry_date: credentials.expiry_date ?? tokens.expiry_date,
    }
    console.log("Token renovado.\n")
  }

  // 3. Busca TODAS as respostas do Forms (sem filtro)
  const authClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  authClient.setCredentials({
    access_token: activeTokens.access_token,
    refresh_token: activeTokens.refresh_token,
    expiry_date: activeTokens.expiry_date,
  })
  const forms = google.forms({ version: "v1", auth: authClient })

  console.log("Buscando todas as respostas do Google Forms...")
  const allResponses: unknown[] = []
  let nextPageToken: string | undefined = undefined

  do {
    const res = await forms.forms.responses.list({
      formId: campaign.google_form_id,
      pageSize: 5000,
      ...(nextPageToken ? { pageToken: nextPageToken } : {}),
    })
    const page = res.data.responses ?? []
    allResponses.push(...page)
    nextPageToken = res.data.nextPageToken ?? undefined
  } while (nextPageToken)

  console.log(`Total de respostas no Google Forms: ${allResponses.length}`)

  // 4. Busca todos os google_response_ids já existentes no banco
  const { data: existingEntries } = await supabase
    .from("campaign_entries")
    .select("google_response_id, phone")
    .eq("campaign_id", CAMPAIGN_ID)

  const existingResponseIds = new Set(
    (existingEntries ?? []).map((e) => e.google_response_id).filter(Boolean)
  )
  const existingPhones = new Set(
    (existingEntries ?? []).map((e) => e.phone).filter(Boolean)
  )

  console.log(`Entradas já no banco: ${existingResponseIds.size}`)

  // 5. Identifica respostas faltantes
  const missing: typeof allResponses = []
  const skippedByField: { responseId: string; submittedAt: string; reasons: string[] }[] = []
  const skippedDuplicatePhone: { responseId: string; phone: string; submittedAt: string }[] = []

  for (const response of allResponses) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = response as any
    const responseId = r.responseId

    if (existingResponseIds.has(responseId)) continue

    const submittedAt = r.lastSubmittedTime ?? r.createTime ?? "?"

    const { fields, skipReasons } = extractFields(r, campaign.field_mapping)
    if (!fields) {
      skippedByField.push({ responseId, submittedAt, reasons: skipReasons })
      continue
    }

    if (existingPhones.has(fields.phone)) {
      skippedDuplicatePhone.push({ responseId, phone: fields.phone, submittedAt })
      continue
    }

    missing.push(response)
  }

  console.log(`\n--- Resultado ---`)
  console.log(`Já existentes no banco: ${existingResponseIds.size}`)
  console.log(`Faltantes (a inserir): ${missing.length}`)
  console.log(`Ignorados por campo inválido: ${skippedByField.length}`)
  console.log(`Ignorados por telefone duplicado: ${skippedDuplicatePhone.length}`)
  console.log(`Total: ${allResponses.length}`)

  if (skippedByField.length > 0) {
    console.log(`\n--- Respostas ignoradas por campo inválido ---`)
    for (const s of skippedByField) {
      console.log(`  ${s.submittedAt} | ${s.responseId.slice(0, 20)}... | ${s.reasons.join(", ")}`)
    }
  }

  if (skippedDuplicatePhone.length > 0) {
    console.log(`\n--- Respostas ignoradas por telefone duplicado ---`)
    for (const s of skippedDuplicatePhone) {
      console.log(`  ${s.submittedAt} | tel: ${s.phone} | ${s.responseId.slice(0, 20)}...`)
    }
  }

  if (missing.length === 0) {
    console.log(`\n✓ Nenhuma resposta faltante encontrada. Sistema está em dia.`)
    return
  }

  // Mostra prévia das faltantes
  console.log(`\n--- Respostas faltantes ---`)
  for (const response of missing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = response as any
    const submittedAt = r.lastSubmittedTime ?? r.createTime ?? "?"
    const { fields } = extractFields(r, campaign.field_mapping)
    console.log(`  ${submittedAt} | ${fields?.name ?? "?"} | ${fields?.phone ?? "?"} | ${fields?.email ?? "?"}`)
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN: nada foi inserido. Rode com --insert para inserir.`)
    return
  }

  // 6. Insere as faltantes
  console.log(`\nInserindo ${missing.length} entradas faltantes...`)
  const STAGE_ID_NOVO = "00000000-0000-0000-0001-000000000001"

  let inserted = 0
  let errors = 0

  for (const response of missing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = response as any
    const responseId = r.responseId
    const { fields } = extractFields(r, campaign.field_mapping)
    if (!fields) continue

    try {
      // Find or create lead
      let leadId: string | null = null
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id, name, email")
        .eq("phone", fields.phone)
        .eq("org_id", campaign.org_id)
        .maybeSingle()

      if (existingLead) {
        leadId = existingLead.id
        const updates: Record<string, string> = {}
        if (!existingLead.name && fields.name) updates.name = fields.name
        if (!existingLead.email && fields.email) updates.email = fields.email
        if (Object.keys(updates).length > 0) {
          await supabase.from("leads").update(updates).eq("id", leadId)
        }
      } else {
        const { data: newLead } = await supabase
          .from("leads")
          .insert({
            org_id: campaign.org_id,
            name: fields.name,
            phone: fields.phone,
            email: fields.email,
            channel: "google_forms",
            source: "google_forms",
            stage_id: STAGE_ID_NOVO,
            utm_source: campaign.slug ?? "acao-muffato",
            utm_campaign: campaign.name,
            is_active: true,
          })
          .select("id")
          .single()
        leadId = newLead?.id ?? null
      }

      await supabase.from("campaign_entries").insert({
        org_id: campaign.org_id,
        campaign_id: CAMPAIGN_ID,
        lead_id: leadId,
        name: fields.name,
        phone: fields.phone,
        email: fields.email,
        custom_data: fields.custom_data,
        google_response_id: responseId,
        raw_payload: r,
      })

      existingPhones.add(fields.phone)
      inserted++
      console.log(`  ✓ ${fields.name} (${fields.phone})`)
    } catch (err) {
      errors++
      console.error(`  ✗ Erro em ${responseId}:`, err instanceof Error ? err.message : err)
    }
  }

  console.log(`\n=== Concluído ===`)
  console.log(`Inseridas: ${inserted}`)
  console.log(`Erros: ${errors}`)
}

main().catch((err) => {
  console.error("Erro fatal:", err)
  process.exit(1)
})
