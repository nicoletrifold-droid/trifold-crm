import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import { scopeBrandsForPost } from "@web/lib/marketing/brands"
import { MARKETING_POST_FORMATOS, type MarketingPostFormato } from "@web/lib/marketing/posts"
import {
  createAnthropicClient,
  generateMarketingPostFromRequest,
  type BrandKnowledge,
} from "@trifold/ai"

// Story 75-239 — "Pedir à Lídia": diretriz livre → UM post pronto na fila.
// Mesmo padrão fail-open do /generate: erro da Claude API ou JSON inválido →
// NENHUMA linha inserida; publicação continua 100% humana.
export const maxDuration = 90

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PEDIDO_CHARS = 2000

export async function POST(req: NextRequest) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, supabase, appUser } = g

  const body = (await req.json().catch(() => null)) as {
    pedido?: string
    formato?: string
    canal?: string
    empreendimento_id?: string | null
    scheduled_for?: string | null
  } | null

  const pedido = typeof body?.pedido === "string" ? body.pedido.trim() : ""
  if (!pedido) return NextResponse.json({ error: "Escreva o pedido para a Lídia" }, { status: 400 })
  if (pedido.length > MAX_PEDIDO_CHARS) {
    return NextResponse.json({ error: `Pedido muito longo (máx. ${MAX_PEDIDO_CHARS} caracteres)` }, { status: 400 })
  }
  if (!MARKETING_POST_FORMATOS.includes(body?.formato as MarketingPostFormato)) {
    return NextResponse.json({ error: "formato deve ser estatico, reel, story ou carrossel" }, { status: 400 })
  }
  const formato = body!.formato as MarketingPostFormato
  if (body?.canal !== "instagram" && body?.canal !== "facebook") {
    return NextResponse.json({ error: "canal deve ser 'instagram' ou 'facebook'" }, { status: 400 })
  }
  const canal = body.canal

  let empreendimentoId: string | null = null
  if (body?.empreendimento_id) {
    if (!UUID_RE.test(body.empreendimento_id)) {
      return NextResponse.json({ error: "empreendimento_id inválido" }, { status: 400 })
    }
    empreendimentoId = body.empreendimento_id
  }

  // Contexto: property (valida posse/ativo), Kit de Marcas e arquivos do Kit.
  const [propertyRes, brandsRes, assetsRes] = await Promise.all([
    empreendimentoId
      ? supabase
          .from("properties")
          .select("id, name")
          .eq("id", empreendimentoId)
          .eq("org_id", appUser.org_id)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("marketing_brands")
      .select("id, nome, tipo, property_id, voz_da_marca, diretrizes, briefing")
      .eq("org_id", appUser.org_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    admin
      .from("marketing_brand_assets")
      .select("brand_id, tipo, label, file_name")
      .eq("org_id", appUser.org_id),
  ])

  const queryError = propertyRes.error ?? brandsRes.error ?? assetsRes.error
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 })
  if (empreendimentoId && !propertyRes.data) {
    return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 })
  }
  const empreendimentoNome = (propertyRes.data?.name as string | undefined) ?? null

  // Escopo do Kit no pedido: institucional + a marca DO empreendimento do post.
  // Os ASSETS derivam do MESMO conjunto, por brand_id (QA 75-239: um segundo
  // critério próprio deixava arquivo de marca órfã vazar p/ post de outra marca).
  type BrandRow = BrandKnowledge & { id: string }
  const allBrands = (brandsRes.data ?? []) as BrandRow[]
  const brands = scopeBrandsForPost(allBrands, empreendimentoId)
  if (brands.length === 0) {
    console.warn("[marketing-posts/pedir] Kit de Marcas vazio — gerando sem contexto de marca")
  }

  const brandById = new Map(brands.map((b) => [b.id, b.nome]))
  type AssetRow = { brand_id: string; tipo: string; label: string | null; file_name: string }
  const assets = ((assetsRes.data ?? []) as AssetRow[])
    .filter((a) => brandById.has(a.brand_id))
    .map((a) => ({ marca: brandById.get(a.brand_id)!, tipo: a.tipo, label: a.label, file_name: a.file_name }))

  try {
    const anthropic = createAnthropicClient()
    const result = await generateMarketingPostFromRequest(anthropic, {
      pedido,
      formato,
      canal,
      empreendimentoId,
      empreendimentoNome,
      brands,
      assets,
      now: new Date().toISOString(),
    })

    if (!result) {
      return NextResponse.json({ error: "A Lídia retornou um formato inválido. Tente novamente." }, { status: 502 })
    }

    // scheduled_for: o do humano (se veio) vence a sugestão do modelo.
    const humanDate =
      typeof body?.scheduled_for === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.scheduled_for)
        ? body.scheduled_for
        : null

    const { data, error } = await admin
      .from("marketing_posts")
      .insert({
        org_id: appUser.org_id,
        empreendimento_id: empreendimentoId,
        canal,
        formato,
        pedido,
        copy: result.copy,
        roteiro: result.roteiro,
        scheduled_for: humanDate ?? result.scheduled_for,
        justificativa: result.justificativa,
        status: "sugerido",
        origem: "agente",
        created_by: appUser.id,
      })
      .select(
        "id, org_id, empreendimento_id, canal, formato, pedido, copy, roteiro, arte_url, scheduled_for, status, justificativa, origem, created_by, created_at, updated_at, properties:empreendimento_id(name)"
      )
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ post: data }, { status: 201 })
  } catch (err) {
    console.error("[marketing-posts/pedir] erro:", err)
    return NextResponse.json({ error: "Falha ao gerar o post. Tente novamente." }, { status: 500 })
  }
}
