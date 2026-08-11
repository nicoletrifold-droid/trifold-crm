import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import { scopeBrandsForPost } from "@web/lib/marketing/brands"
import { createAnthropicClient, improveMarketingRequest, type BrandKnowledge } from "@trifold/ai"

// Story 75-294 — "✨ Melhorar meu pedido": reescreve o texto cru como briefing
// usando o Kit escopado. Haiku (rápido — o humano está com o modal aberto).
// FAIL-OPEN: qualquer falha → 502 e o client MANTÉM o texto original.
export const maxDuration = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, supabase, appUser } = g

  const body = (await req.json().catch(() => null)) as {
    pedido?: string
    empreendimento_id?: string | null
    destino?: string
  } | null

  const pedido = typeof body?.pedido === "string" ? body.pedido.trim() : ""
  if (pedido.length < 10) {
    return NextResponse.json({ error: "Escreva o pedido antes de melhorar" }, { status: 400 })
  }
  if (pedido.length > 2000) {
    return NextResponse.json({ error: "Pedido muito longo" }, { status: 400 })
  }
  let empreendimentoId: string | null = null
  if (body?.empreendimento_id) {
    if (!UUID_RE.test(body.empreendimento_id)) {
      return NextResponse.json({ error: "empreendimento_id inválido" }, { status: 400 })
    }
    empreendimentoId = body.empreendimento_id
  }
  const destino = body?.destino === "pago" ? "pago" : "organico"

  const [propertyRes, brandsRes] = await Promise.all([
    empreendimentoId
      ? supabase
          .from("properties")
          .select("id, name")
          .eq("id", empreendimentoId)
          .eq("org_id", appUser.org_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("marketing_brands")
      .select("id, nome, tipo, property_id, voz_da_marca, diretrizes, briefing")
      .eq("org_id", appUser.org_id)
      .eq("is_active", true),
  ])
  if (propertyRes.error || brandsRes.error) {
    return NextResponse.json({ error: (propertyRes.error ?? brandsRes.error)!.message }, { status: 500 })
  }

  type BrandRow = BrandKnowledge & { id: string; property_id: string | null }
  const brands = scopeBrandsForPost((brandsRes.data ?? []) as BrandRow[], empreendimentoId)

  const melhorado = await improveMarketingRequest(createAnthropicClient(), {
    pedido,
    empreendimentoNome: (propertyRes.data?.name as string | undefined) ?? null,
    brands,
    destino,
  })
  if (!melhorado) {
    return NextResponse.json({ error: "Não consegui melhorar agora — seu texto ficou como estava." }, { status: 502 })
  }
  return NextResponse.json({ pedido: melhorado })
}
