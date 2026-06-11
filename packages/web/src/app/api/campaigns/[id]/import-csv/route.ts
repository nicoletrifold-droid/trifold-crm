import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

function detectDelimiter(headerLine: string): string {
  const semicolons = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  return semicolons >= commas ? ";" : ","
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

const NAME_HEADERS = ["nome", "name", "participante", "cliente", "participantes"]
const PHONE_HEADERS = ["whatsapp", "telefone", "phone", "celular", "fone", "tel", "contato", "número", "numero"]
const EMAIL_HEADERS = ["email", "e-mail", "emails", "correio"]

function mapHeader(h: string): "name" | "phone" | "email" | `custom:${string}` {
  const lower = h.toLowerCase().trim()
  if (NAME_HEADERS.some((k) => lower.includes(k))) return "name"
  if (PHONE_HEADERS.some((k) => lower.includes(k))) return "phone"
  if (EMAIL_HEADERS.some((k) => lower.includes(k))) return "email"
  return `custom:${h}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { id } = await params

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 })
  }

  let text: string
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Arquivo CSV não enviado" }, { status: 400 })
    }
    text = await (file as File).text()
  } catch {
    return NextResponse.json({ error: "Erro ao ler arquivo" }, { status: 400 })
  }

  text = text.replace(/^﻿/, "")
  const lines = text.split(/\r?\n/).filter((l) => l.trim())

  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV vazio ou sem dados" }, { status: 400 })
  }

  const delimiter = detectDelimiter(lines[0])
  const headers = parseCSVLine(lines[0], delimiter)
  const fieldMap = headers.map(mapHeader)

  if (!fieldMap.includes("name") || !fieldMap.includes("phone")) {
    return NextResponse.json(
      { error: "CSV precisa ter colunas de Nome e WhatsApp/Telefone" },
      { status: 400 }
    )
  }

  type EntryRow = {
    campaign_id: string
    org_id: string
    name: string
    phone: string
    email: string
    custom_data: Record<string, string>
    whatsapp_status: string
    email_status: string
    has_responded: boolean
  }

  const rows: EntryRow[] = []
  const skipped: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter)
    if (values.every((v) => !v)) continue

    const record: Record<string, string> = {}
    const custom: Record<string, string> = {}

    fieldMap.forEach((field, idx) => {
      const val = values[idx]?.trim() ?? ""
      if (field === "name" || field === "phone" || field === "email") {
        record[field] = val
      } else if (field.startsWith("custom:")) {
        const key = field.slice(7)
        if (val) custom[key] = val
      }
    })

    const name = record.name ?? ""
    const phone = record.phone ?? ""

    if (!name || !phone) {
      skipped.push(`Linha ${i + 1}: nome ou telefone ausente`)
      continue
    }

    rows.push({
      campaign_id: id,
      org_id: appUser.org_id,
      name,
      phone,
      email: record.email ?? "",
      custom_data: custom,
      whatsapp_status: "pending",
      email_status: "pending",
      has_responded: false,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ imported: 0, skipped: skipped.length, skipped_details: skipped })
  }

  const BATCH = 500
  let imported = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error, count } = await supabase
      .from("campaign_entries")
      .insert(batch, { count: "exact" })

    if (error) {
      errors.push(`Lote ${Math.floor(i / BATCH) + 1}: ${error.message}`)
    } else {
      imported += count ?? batch.length
    }
  }

  return NextResponse.json({ imported, skipped: skipped.length, skipped_details: skipped, errors })
}
