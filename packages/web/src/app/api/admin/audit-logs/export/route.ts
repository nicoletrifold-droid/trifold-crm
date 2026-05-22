import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

// Hard cap para exportação — proteção contra cargas enormes.
// Per @po: sem range/offset, apenas .limit(MAX_EXPORT_ROWS) como teto.
const MAX_EXPORT_ROWS = 10000

// UTF-8 BOM (U+FEFF) — garante que Excel pt-BR abra o CSV com encoding correto.
const UTF8_BOM = "﻿"

const ACTION_LABELS: Record<string, string> = {
  "obra.create": "Obra criada",
  "obra.update": "Obra atualizada",
  "obra.delete": "Obra arquivada",
  "obra.reativar": "Obra reativada",
  "documento.upload": "Documento enviado",
  "documento.delete": "Documento excluído",
  "documento.view": "Documento visualizado",
  "foto.upload": "Foto enviada",
  "foto.delete": "Foto excluída",
  "session.login": "Login",
  "session.logout": "Logout",
}

interface AuditLogRow {
  created_at: string
  user_name: string | null
  action: string
  entity_type: string | null
  entity_name: string | null
  obra_id: string | null
  ip_address: string | null
}

function formatDateBR(iso: string): string {
  // Formato esperado pelo AC3: dd/MM/yyyy HH:mm:ss em America/Sao_Paulo
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function csvEscape(val: string | null | undefined): string {
  if (val === null || val === undefined) return ""
  const str = String(val)
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * GET /api/admin/audit-logs/export
 *
 * Exporta logs de auditoria em CSV (mesmos filtros do endpoint de listagem).
 * Sem paginação — exporta todos os registros que casarem, até MAX_EXPORT_ROWS.
 * Restrita a role=admin. Isolamento por `org_id`.
 *
 * Headers:
 *   Content-Type: text/csv; charset=utf-8
 *   Content-Disposition: attachment; filename="audit-log-YYYYMMDD.csv"
 *
 * Colunas: Data/Hora, Usuário, Ação, Tipo, Entidade, Obra, IP
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (appUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const user_id = searchParams.get("user_id")
  const action = searchParams.get("action")
  const entity_type = searchParams.get("entity_type")
  const obra_id = searchParams.get("obra_id")
  const date_from = searchParams.get("date_from")
  const date_to = searchParams.get("date_to")

  let query = supabase
    .from("audit_logs")
    .select("created_at, user_name, action, entity_type, entity_name, obra_id, ip_address")
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })
    .limit(MAX_EXPORT_ROWS)

  if (user_id) query = query.eq("user_id", user_id)
  if (action) {
    if (action.endsWith(".")) {
      query = query.ilike("action", `${action}%`)
    } else {
      query = query.eq("action", action)
    }
  }
  if (entity_type) query = query.eq("entity_type", entity_type)
  if (obra_id) query = query.eq("obra_id", obra_id)
  if (date_from) query = query.gte("created_at", date_from)
  if (date_to) query = query.lte("created_at", date_to)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const logs: AuditLogRow[] = data ?? []

  const header = "Data/Hora,Usuário,Ação,Tipo,Entidade,Obra,IP"
  const rows = logs.map((log) =>
    [
      formatDateBR(log.created_at),
      log.user_name,
      ACTION_LABELS[log.action] ?? log.action,
      log.entity_type ?? "",
      log.entity_name ?? "",
      log.obra_id ?? "",
      log.ip_address ?? "",
    ]
      .map(csvEscape)
      .join(",")
  )

  const csvBody = [header, ...rows].join("\n")
  const csv = `${UTF8_BOM}${csvBody}`

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${date}.csv"`,
    },
  })
}
