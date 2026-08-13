import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { cpfLookupValues } from "@web/lib/validation/contato"


type ObraRef = { id: string; name: string } | { id: string; name: string }[] | null

type VinculoRow = {
  obra_id: string
  numero_unidade: string | null
  obras: ObraRef
}

type ClienteRow = {
  id: string
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
  clientes_obras_vinculos: VinculoRow[] | null
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "clientes.gerenciar")
  if (roleError) return roleError

  const { searchParams } = new URL(request.url)
  const email = searchParams.get("email")?.trim() || ""
  const cpf = searchParams.get("cpf")?.trim() || ""
  const q = searchParams.get("q")?.trim() || ""

  if (!email && !cpf && !q) {
    return NextResponse.json(
      { error: "Parâmetro 'cpf', 'email' ou 'q' é obrigatório" },
      { status: 400 }
    )
  }

  let query = supabase
    .from("clientes")
    .select(
      "id, nome, cpf, email, telefone, clientes_obras_vinculos(obra_id, numero_unidade, obras(id, name))"
    )
    .eq("org_id", appUser.org_id)
    .limit(10)

  if (cpf) {
    // Story 75-282: coluna é só-dígitos, mas o usuário digita com máscara (e há legado mascarado)
    query = query.in("cpf", cpfLookupValues(cpf))
  } else if (email) {
    query = query.eq("email", email)
  } else if (q) {
    const sanitized = q.replace(/[%,]/g, "")
    if (sanitized) {
      // Story 75-282: no trecho de CPF compara só dígitos — "207.363" não casa mais com
      // a coluna normalizada, mas "207363" casa.
      const digits = sanitized.replace(/\D/g, "")
      const cpfClause = digits ? `,cpf.ilike.%${digits}%` : ""
      query = query.or(
        `nome.ilike.%${sanitized}%,email.ilike.%${sanitized}%${cpfClause}`
      )
    }
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as ClienteRow[]

  const result = rows.map((row) => ({
    id: row.id,
    nome: row.nome,
    cpf: row.cpf,
    email: row.email,
    telefone: row.telefone,
    obras: (row.clientes_obras_vinculos ?? []).map((v) => {
      const obra = Array.isArray(v.obras) ? v.obras[0] : v.obras
      return {
        obra_id: v.obra_id,
        obra_nome: obra?.name ?? null,
        numero_unidade: v.numero_unidade ?? null,
      }
    }),
  }))

  return NextResponse.json({ data: result })
}
