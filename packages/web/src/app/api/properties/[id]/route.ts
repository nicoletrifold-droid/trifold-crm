import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { softDelete } from "@web/lib/api-utils"
import { avaliarMinimosNicole, carregarCadastroNicole } from "@web/lib/nicole-minimos"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: property, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (error || !property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 })
  }

  return NextResponse.json({ data: property })
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Editar empreendimento: admin/supervisor/obras/gerente-relacionamento (fonte
  // única). Story 87-13 — o comentário dizia "admin/supervisor/obras" e estava
  // errado desde a 72-1: `IMOVEIS_EDIT_ROLES` tem QUATRO papéis.
  const forbidden = await requireCapability(appUser, "imoveis.editar")
  if (forbidden) return forbidden

  const body = await request.json()

  // Validate state if provided
  if (body.state !== undefined) {
    if (!body.state?.trim() || body.state.trim().length !== 2) {
      return NextResponse.json(
        { error: "state must be exactly 2 characters" },
        { status: 400 }
      )
    }
  }

  // Build update payload with only provided fields
  const updateFields: Record<string, unknown> = {}
  if (body.name !== undefined) updateFields.name = body.name.trim()
  if (body.slug !== undefined) updateFields.slug = body.slug.trim()
  if (body.status !== undefined) updateFields.status = body.status
  if (body.city !== undefined) updateFields.city = body.city.trim()
  if (body.state !== undefined)
    updateFields.state = body.state.trim().toUpperCase()
  if (body.address !== undefined) updateFields.address = body.address?.trim() || null
  if (body.neighborhood !== undefined) updateFields.neighborhood = body.neighborhood?.trim() || null
  // zip_code NÃO existe em properties (schema: migration 002). Se essa chave chegasse
  // no body, o Postgres recusava o UPDATE inteiro. Nenhum consumidor a envia hoje.
  if (body.concept !== undefined) updateFields.concept = body.concept?.trim() || null
  if (body.description !== undefined) updateFields.description = body.description?.trim() || null
  if (body.delivery_date !== undefined) updateFields.delivery_date = body.delivery_date || null
  if (body.total_units !== undefined) updateFields.total_units = body.total_units
  if (body.total_floors !== undefined) updateFields.total_floors = body.total_floors
  if (body.units_per_floor !== undefined) updateFields.units_per_floor = body.units_per_floor
  if (body.type_floors !== undefined) updateFields.type_floors = body.type_floors
  if (body.basement_floors !== undefined) updateFields.basement_floors = body.basement_floors
  if (body.leisure_floors !== undefined) updateFields.leisure_floors = body.leisure_floors
  if (body.amenities !== undefined) updateFields.amenities = body.amenities
  if (body.differentials !== undefined) updateFields.differentials = body.differentials
  if (body.commercial_rules !== undefined) updateFields.commercial_rules = body.commercial_rules
  if (body.faq !== undefined) updateFields.faq = body.faq
  if (body.restrictions !== undefined) updateFields.restrictions = body.restrictions
  if (body.video_tour_url !== undefined) updateFields.video_tour_url = body.video_tour_url?.trim() || null

  // ── Story 87-13 — o switch do que a Nicole pode falar ──────────────────────
  // Ele NÃO é mais um campo da allowlist acima, e por três razões que são o
  // miolo da story:
  //  (1) papel próprio: decidir o que a IA diz a um lead pago não é atribuição
  //      do perfil de obras nem do de gerente-relacionamento;
  //  (2) LIGAR exige mínimos de cadastro, no servidor, fail-closed;
  //  (3) as duas checagens valem só quando o valor MUDA de verdade — quem edita
  //      outros campos da tela não pode ser barrado por reenviar o valor atual.
  if (body.nicole_enabled !== undefined) {
    // Falhar ALTO em vez de coagir. Um `"true"` (string) coagido por
    // `=== true` viraria `false` e DESLIGARIA a Nicole em silêncio — mudança de
    // estado não pedida, na superfície que esta story existe para tornar
    // deliberada.
    if (typeof body.nicole_enabled !== "boolean") {
      return NextResponse.json(
        { error: "nicole_enabled must be a boolean" },
        { status: 400 }
      )
    }
    const desejado = body.nicole_enabled === true

    const { data: atual } = await supabase
      .from("properties")
      .select("nicole_enabled")
      .eq("id", id)
      .eq("org_id", appUser.org_id)
      .eq("is_active", true)
      .single()

    if (!atual) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const muda = (atual as { nicole_enabled: boolean }).nicole_enabled !== desejado

    if (muda) {
      // Papel: `IMOVEIS_CREATE_ROLES` (admin/supervisor) — a mesma constante que
      // já governa criar e excluir. Usa constante existente, não inventa papel.
      const forbiddenNicole = await requireCapability(appUser, "imoveis.ativar_nicole")
      if (forbiddenNicole) return forbiddenNicole

      // DESLIGAR nunca é bloqueado, em qualquer estado de cadastro. É a válvula:
      // nada que este código faça pode impedir alguém de calar a Nicole sobre um
      // empreendimento.
      if (desejado) {
        const cadastro = await carregarCadastroNicole(supabase, id, appUser.org_id)
        if (!cadastro) {
          return NextResponse.json({ error: "Property not found" }, { status: 404 })
        }

        const veredito = avaliarMinimosNicole(cadastro)
        if (veredito.missing.length > 0) {
          return NextResponse.json(
            {
              error:
                "Não dá para ligar a Nicole neste empreendimento: o cadastro não tem o mínimo.",
              missing: veredito.missing,
              faltando: veredito.rotulosFaltantes,
              avisos: veredito.avisos,
            },
            { status: 422 }
          )
        }
      }
    }

    // Idempotente de propósito: mesmo quando não muda, o campo entra no UPDATE.
    // Se ele só entrasse na mudança, um PATCH que enviasse APENAS o valor atual
    // cairia no "No fields to update" (400) abaixo.
    updateFields.nicole_enabled = desejado
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    )
  }

  const { data: property, error } = await supabase
    .from("properties")
    .update(updateFields)
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .select()
    .single()

  if (error || !property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 })
  }

  return NextResponse.json({ data: property })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Excluir empreendimento: admin/supervisor (fonte única).
  const forbidden = await requireCapability(appUser, "imoveis.apagar")
  if (forbidden) return forbidden

  const result = await softDelete(supabase, "properties", id, appUser.org_id)
  if (result.error) return result.error

  return NextResponse.json({ data: { message: "Property deleted" } })
}
