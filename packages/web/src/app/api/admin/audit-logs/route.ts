import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

/**
 * GET /api/admin/audit-logs
 *
 * Lista paginada de logs de auditoria da org do usuário autenticado.
 * Restrita a role=admin. Isolamento multi-tenant via filtro por `org_id`.
 *
 * Query params (todos opcionais):
 *   - user_id        — filtra por usuário específico
 *   - action         — exato (`obra.create`) ou prefixo (`obra.`) usando ILIKE
 *   - entity_type    — `obra`, `documento`, `foto`, `session`
 *   - obra_id        — filtra por obra específica
 *   - date_from      — ISO 8601, created_at >= date_from
 *   - date_to        — ISO 8601, created_at <= date_to
 *   - limit          — default 100, máximo 500
 *   - offset         — default 0
 *
 * Retorna: { logs: AuditLog[], total: number }
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

  const parsedLimit = parseInt(searchParams.get("limit") ?? `${DEFAULT_LIMIT}`, 10)
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT

  const parsedOffset = parseInt(searchParams.get("offset") ?? "0", 10)
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

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

  const { data: logs, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: logs ?? [], total: count ?? 0 })
}
