import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { requireAuth } from "@web/lib/api-auth"
import { isPastaManager } from "@web/lib/pastas/roles"

// Story 75-146 — POST /api/pasta-links: gera um link de auto-cadastro por imobiliária.
// Gate: isPastaManager (mesmo do módulo Pastas). Cria a row em pasta_links com token
// único e ativo=true; guarda defaults opcionais de corretor.
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!isPastaManager(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const optStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null
  const optId = (v: unknown): string | null =>
    typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v.trim()) ? v.trim() : null

  // Story 75-148 — o link é POR imobiliária da base: id obrigatório + nome (snapshot).
  const imobiliariaId = optId(body.imobiliaria_id)
  const imobiliaria = optStr(body.imobiliaria)
  if (!imobiliariaId || !imobiliaria) {
    return NextResponse.json({ error: "Selecione a imobiliária" }, { status: 400 })
  }

  const token = randomBytes(24).toString("hex")

  const { data: link, error } = await supabase
    .from("pasta_links")
    .insert({
      org_id: appUser.org_id,
      imobiliaria_id: imobiliariaId,
      imobiliaria,
      token,
      ativo: true,
      corretor_nome: optStr(body.corretor_nome),
      corretor_telefone: optStr(body.corretor_telefone),
      corretor_email: optStr(body.corretor_email),
      created_by: appUser.id,
    })
    .select("id, imobiliaria, token, ativo, corretor_nome, created_at")
    .single()

  if (error || !link) {
    return NextResponse.json({ error: error?.message ?? "Falha ao gerar link" }, { status: 500 })
  }

  return NextResponse.json(
    {
      data: {
        id: link.id,
        imobiliaria: link.imobiliaria,
        token: link.token,
        ativo: link.ativo,
        corretorNome: link.corretor_nome ?? null,
        createdAt: link.created_at,
      },
    },
    { status: 201 }
  )
}
