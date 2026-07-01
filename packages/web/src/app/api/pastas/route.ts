import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { requireAuth } from "@web/lib/api-auth"
import { buildDocSlots, type PastaTipo } from "@web/lib/pastas/checklist"
import { isPastaManager } from "@web/lib/pastas/roles"

// POST /api/pastas — cria uma pasta, gera o token do link público e semeia os
// documentos exigidos conforme tipo (pf/pj) e estado civil (casado).
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!isPastaManager(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const nome = typeof body.nome === "string" ? body.nome.trim() : ""
  const tipo: PastaTipo = body.tipo === "pj" ? "pj" : "pf"
  const casado = tipo === "pf" && body.casado === true
  const empreendimento = typeof body.empreendimento === "string" ? body.empreendimento.trim() || null : null

  if (!nome) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
  }

  const token = randomBytes(24).toString("hex")

  const { data: pasta, error } = await supabase
    .from("pastas")
    .insert({
      org_id: appUser.org_id,
      nome,
      tipo,
      casado,
      empreendimento,
      token,
      created_by: appUser.id,
    })
    .select("id, token")
    .single()

  if (error || !pasta) {
    return NextResponse.json({ error: error?.message ?? "Falha ao criar pasta" }, { status: 500 })
  }

  const slots = buildDocSlots(tipo, casado)
  const docsPayload = slots.map((s, i) => ({
    pasta_id: pasta.id,
    slug: s.slug,
    label: s.label,
    titular: s.titular,
    required: true,
    ordem: i,
  }))

  const { error: docsError } = await supabase.from("pasta_documentos").insert(docsPayload)
  if (docsError) {
    // Rollback manual: remove a pasta se os docs falharem (mantém consistência).
    await supabase.from("pastas").delete().eq("id", pasta.id)
    return NextResponse.json({ error: docsError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { id: pasta.id, token: pasta.token } }, { status: 201 })
}
