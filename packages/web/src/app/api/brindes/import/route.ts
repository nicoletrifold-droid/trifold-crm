import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { parseEndereco } from "@web/lib/brindes/parse-endereco"

const BATCH_LIMIT = 500

interface ImportRecord {
  obra_nome?: unknown
  tipo?: unknown
  nome?: unknown
  observacao?: unknown
  endereco_raw?: unknown
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin", "supervisor"])
  if (roleError) return roleError

  let body: { records?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!Array.isArray(body.records)) {
    return NextResponse.json({ error: "records deve ser um array" }, { status: 400 })
  }

  const records = (body.records as ImportRecord[]).slice(0, BATCH_LIMIT)
  const rows: Record<string, unknown>[] = []
  const errors: { index: number; reason: string }[] = []

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const obra_nome = typeof r.obra_nome === "string" ? r.obra_nome.trim() : ""
    const tipo = typeof r.tipo === "string" ? r.tipo.trim().toLowerCase() : ""
    const nome = typeof r.nome === "string" ? r.nome.trim() : ""

    if (!obra_nome) { errors.push({ index: i, reason: "obra_nome vazio" }); continue }
    if (!nome) { errors.push({ index: i, reason: "nome vazio" }); continue }
    if (!["mae", "pai", "outro"].includes(tipo)) {
      errors.push({ index: i, reason: `tipo inválido: ${tipo}` }); continue
    }

    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : null

    const enderecoRaw = str(r.endereco_raw)
    const parsed = enderecoRaw ? parseEndereco(enderecoRaw) : {}

    rows.push({
      org_id: appUser.org_id,
      obra_nome,
      tipo,
      nome,
      observacao: str(r.observacao),
      ...parsed,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, errors })
  }

  const { error } = await supabase.from("brindes_destinatarios").insert(rows)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ inserted: rows.length, errors })
}
