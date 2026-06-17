#!/usr/bin/env node
/**
 * Corrige leads que entraram via resposta de WhatsApp de campanha
 * sem nome (mostrando só o número no pipeline).
 *
 * O que faz:
 *   1. Busca leads sem nome com canal "whatsapp"
 *   2. Para cada um, tenta os formatos de telefone com e sem "9" em campaign_entries
 *   3. Se encontrar: atualiza name, source e utm_campaign
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dsopqkqjkmhytudaaolv.supabase.co"
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_KEY) {
  console.error("Erro: defina SUPABASE_SERVICE_ROLE_KEY no ambiente antes de rodar este script.")
  process.exit(1)
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
}

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`GET ${res.status}: ${await res.text()}`)
  return res.json()
}

async function patch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`)
}

/**
 * Retorna os possíveis formatos do telefone para busca em campaign_entries.
 * WhatsApp envia sem o "9" (ex: 4488200854), mas o CSV pode ter com "9" (44988200854).
 */
function phoneCandidates(phone) {
  if (!phone) return []
  const digits = phone.replace(/\D/g, "")

  // Remove prefixo 55 do país
  const local =
    digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits

  const candidates = new Set([local])

  // DDD + 8 dígitos (10 total) → tenta também com "9" após DDD → 11 dígitos
  if (local.length === 10) {
    candidates.add(local.slice(0, 2) + "9" + local.slice(2))
  }

  // DDD + 9 + 8 dígitos (11 total) → tenta também sem o "9" → 10 dígitos
  if (local.length === 11 && local[2] === "9") {
    candidates.add(local.slice(0, 2) + local.slice(3))
  }

  return [...candidates]
}

async function main() {
  console.log("Buscando leads sem nome com canal whatsapp...\n")

  const leads = await get(
    "leads?select=id,phone,name&channel=eq.whatsapp&name=is.null&limit=500"
  )

  console.log(`Encontrados: ${leads.length} leads sem nome\n`)

  let updated = 0
  let notFound = 0

  for (const lead of leads) {
    const candidates = phoneCandidates(lead.phone)
    if (!candidates.length) {
      notFound++
      continue
    }

    // Tenta cada formato até encontrar na tabela de cadastros da campanha
    let entry = null
    for (const candidate of candidates) {
      const rows = await get(
        `campaign_entries?select=name,campaigns(name)&phone=eq.${candidate}&limit=1&order=created_at.desc`
      )
      if (rows[0]?.name) {
        entry = rows[0]
        break
      }
    }

    if (!entry) {
      notFound++
      continue
    }

    const campaignName = entry.campaigns?.name ?? null

    await patch(`leads?id=eq.${lead.id}`, {
      name: entry.name,
      utm_campaign: campaignName,
    })

    console.log(
      `✓ ${lead.phone} → "${entry.name}" | campanha: ${campaignName ?? "—"}`
    )
    updated++
  }

  console.log(`\nConcluído: ${updated} atualizados, ${notFound} sem correspondência.`)
}

main().catch((err) => {
  console.error("Erro:", err.message)
  process.exit(1)
})
