import { NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { IMOVEIS_CREATE_ROLES } from "@web/lib/permissions-imoveis"
import { PROPERTY_STATUSES, isPropertyStatus } from "@web/lib/property-status"

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: properties, error } = await supabase
    .from("properties")
    .select("*")
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: properties })
}

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Criar empreendimento: admin/supervisor (fonte única).
  const forbidden = requireRole(appUser, [...IMOVEIS_CREATE_ROLES])
  if (forbidden) return forbidden

  const body = await request.json()

  // Validation
  const errors: string[] = []
  if (!body.name?.trim()) errors.push("name is required")
  if (!body.city?.trim()) errors.push("city is required")
  // properties.address é NOT NULL no schema — validar aqui dá mensagem clara
  // em vez de deixar o Postgres estourar um 500 opaco.
  if (!body.address?.trim()) errors.push("address is required")
  if (!body.state?.trim()) errors.push("state is required")
  else if (body.state.trim().length !== 2)
    errors.push("state must be exactly 2 characters")
  if (body.status !== undefined && !isPropertyStatus(body.status))
    errors.push(`status must be one of: ${PROPERTY_STATUSES.join(", ")}`)

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(", ") }, { status: 400 })
  }

  const slug = body.slug?.trim() || slugify(body.name.trim())

  const { data: property, error } = await supabase
    .from("properties")
    .insert({
      name: body.name.trim(),
      slug,
      status: body.status ?? undefined,
      city: body.city.trim(),
      state: body.state.trim().toUpperCase(),
      address: body.address.trim(),
      neighborhood: body.neighborhood?.trim() || null,
      concept: body.concept?.trim() || null,
      description: body.description?.trim() || null,
      delivery_date: body.delivery_date ?? null,
      total_units: body.total_units ?? null,
      total_floors: body.total_floors ?? null,
      units_per_floor: body.units_per_floor ?? null,
      org_id: appUser.org_id,
      is_active: true,
      // 🔴 Story 87-13 — `nicole_enabled` NÃO entra aqui, e a ausência é a
      // feature: NÃO DÁ PARA NASCER LIGADO. A coluna tem `default false` e
      // ligar é um ato separado, com o cadastro já existindo, sob
      // `IMOVEIS_CREATE_ROLES` e sob os mínimos do `PATCH`. A tese da story é
      // "cadastrar não basta" — acrescentar o campo a este INSERT a desfaz.
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let obraCreated = false
  let obraError: string | undefined

  if (body.create_obra === true && property) {
    const { error: obraInsertError } = await supabase
      .from("obras")
      .insert({
        org_id: appUser.org_id,
        name: property.name,
        property_id: property.id,
        status: "em_andamento",
        progress_pct: 0,
        expected_delivery_date: body.delivery_date ?? null,
      })

    if (obraInsertError) {
      obraError = obraInsertError.message
    } else {
      obraCreated = true
    }
  }

  return NextResponse.json(
    { data: property, obra_created: obraCreated, obra_error: obraError },
    { status: 201 }
  )
}
