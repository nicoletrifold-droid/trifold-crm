import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import { arquivosCitadosNoTexto, garantirFachadaNaCena, resolvePaletaDoPost, scopeBrandsForPost } from "@web/lib/marketing/brands"
import { gerarArtesParaPost, montarPatchDeArtes, type ArteSpec } from "@web/lib/marketing/arte-service"
import { buildPostPreview, quantasArtes } from "@web/lib/marketing/post-preview"
import { MARKETING_POST_FORMATOS, type MarketingPostFormato, MARKETING_POST_SELECT } from "@web/lib/marketing/posts"
import {
  AD_OBJETIVOS,
  AD_OBJETIVO_INSTRUCAO,
  AD_HEADLINE_MAX,
  AD_PRIMARY_MAX,
  chipsValidos,
  composeDirecao,
  enforceAdLimit,
  ratiosDoPedido,
  type AdObjetivo,
} from "@web/lib/marketing/direcao"
import {
  createAnthropicClient,
  generateMarketingPostFromRequest,
  type BrandKnowledge,
} from "@trifold/ai"

// Story 75-239 — "Pedir à Lídia": diretriz livre → UM post pronto na fila.
// Mesmo padrão fail-open do /generate: erro da Claude API ou JSON inválido →
// NENHUMA linha inserida; publicação continua 100% humana.
// Story 75-240: Sonnet (~30s) + motor de imagem (~15-25s) na MESMA request —
// 300s (padrão do repo p/ rotas longas). O post é inserido ANTES da arte, então
// nem um estouro aqui perde a copy (fail-open estrutural).
export const maxDuration = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PEDIDO_CHARS = 2000
const MAX_DIRECAO_CHARS = 500

export async function POST(req: NextRequest) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, supabase, appUser } = g

  const body = (await req.json().catch(() => null)) as {
    pedido?: string
    direcao_arte?: string
    formato?: string
    canal?: string
    empreendimento_id?: string | null
    scheduled_for?: string | null
    // Story 75-294 — tráfego pago
    destino?: string
    objetivo?: string
    proporcoes?: unknown
    chips?: unknown
  } | null

  const pedido = typeof body?.pedido === "string" ? body.pedido.trim() : ""
  if (!pedido) return NextResponse.json({ error: "Escreva o pedido para a Lídia" }, { status: 400 })
  if (pedido.length > MAX_PEDIDO_CHARS) {
    return NextResponse.json({ error: `Pedido muito longo (máx. ${MAX_PEDIDO_CHARS} caracteres)` }, { status: 400 })
  }
  const direcaoArteLivre = typeof body?.direcao_arte === "string" ? body.direcao_arte.trim() : ""
  if (direcaoArteLivre.length > MAX_DIRECAO_CHARS) {
    return NextResponse.json({ error: `Direção da arte muito longa (máx. ${MAX_DIRECAO_CHARS} caracteres)` }, { status: 400 })
  }
  // Story 75-294 — chips de direção: compostos NO SERVIDOR a partir do mapa
  // único (chip desconhecido é ignorado; só o texto livre é do humano).
  if (!chipsValidos(body?.chips)) {
    return NextResponse.json({ error: "chips inválidos" }, { status: 400 })
  }
  const direcaoArte = composeDirecao(body?.chips ?? null, direcaoArteLivre)

  // Story 75-294 — destino: 'pago' liga o modo anúncio. Campo ausente/organico
  // = fluxo atual intocado; valor fora da lista = 400.
  if (body?.destino !== undefined && body.destino !== "organico" && body.destino !== "pago") {
    return NextResponse.json({ error: "destino deve ser 'organico' ou 'pago'" }, { status: 400 })
  }
  const destino = (body?.destino ?? "organico") as "organico" | "pago"
  let objetivo: AdObjetivo | null = null
  if (destino === "pago") {
    if (body?.objetivo !== undefined && !AD_OBJETIVOS.includes(body.objetivo as AdObjetivo)) {
      return NextResponse.json({ error: "objetivo deve ser leads, visita ou reconhecimento" }, { status: 400 })
    }
    objetivo = (body?.objetivo as AdObjetivo | undefined) ?? "leads"
  }
  const ratios = ratiosDoPedido(destino, Array.isArray(body?.proporcoes) ? (body.proporcoes as string[]) : null)

  // Pago é sempre arte estática de anúncio; o form nem mostra formato.
  if (destino !== "pago" && !MARKETING_POST_FORMATOS.includes(body?.formato as MarketingPostFormato)) {
    return NextResponse.json({ error: "formato deve ser estatico, reel, story ou carrossel" }, { status: 400 })
  }
  const formato = destino === "pago" ? "estatico" : (body!.formato as MarketingPostFormato)
  // QA 75-241 #3 — reel não gera arte: direção digitada antes de trocar o
  // formato (campo some da tela, state fica) não pode virar instrução fantasma.
  const direcaoEfetiva = formato === "reel" ? "" : direcaoArte
  // Pago: canal é implícito (Meta — FB+IG); persistimos 'instagram' (CHECK da mig 193).
  if (destino !== "pago" && body?.canal !== "instagram" && body?.canal !== "facebook") {
    return NextResponse.json({ error: "canal deve ser 'instagram' ou 'facebook'" }, { status: 400 })
  }
  const canal = destino === "pago" ? (body?.canal === "facebook" ? "facebook" : "instagram") : (body!.canal as "instagram" | "facebook")

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
      // 75-250: `cores` é obrigatório aqui — sem ele resolvePaletaDoPost devolve
      // vazio e o Sonnet volta a não receber paleta nenhuma.
      .select("id, nome, tipo, property_id, cores, voz_da_marca, diretrizes, briefing")
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
  type BrandRow = BrandKnowledge & { id: string; cores: Array<{ hex: string; nome: string | null }> | null }
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
      direcaoArte: direcaoEfetiva || null,
      formato,
      canal,
      empreendimentoId,
      empreendimentoNome,
      brands,
      // Story 75-250 — paleta escopada pela regra única (AC6). Sem ela o Sonnet
      // escrevia hex inventado, contradizendo a PALETA OBRIGATÓRIA que o motor
      // recebe depois: prompt em conflito consigo mesmo.
      paleta: resolvePaletaDoPost(brands),
      assets,
      now: new Date().toISOString(),
      // Story 75-294 — modo anúncio: o Sonnet devolve também a ad copy.
      destino,
      objetivoInstrucao: objetivo ? AD_OBJETIVO_INSTRUCAO[objetivo] : null,
    })

    if (!result) {
      return NextResponse.json({ error: "A Lídia retornou um formato inválido. Tente novamente." }, { status: 502 })
    }

    // Story 75-250 (AC1/AC2) — o que o HUMANO citou pelo nome entra por decisão
    // do código. O Sonnet viu os 6 renders do Vind, o Marcos citou dois, e ele
    // devolveu lista vazia: a fachada virou invenção do modelo. Os forçados vêm
    // PRIMEIRO (risco 1 da story: o teto de bytes descarta o excedente).
    // Story 75-294 (AC3) — chip "Fachada real": as fotos do Kit escopado entram
    // como referência FORÇADA, mesmo sem o humano citar o file_name (jurídico:
    // IA não inventa fachada — a base tem de ser a foto real).
    const fotosForcadas =
      (body?.chips as Record<string, string> | null | undefined)?.cenario === "fachada_real"
        ? assets.filter((a) => a.tipo === "foto").map((a) => a.file_name)
        : []
    const citadosNoTexto = arquivosCitadosNoTexto(
      `${pedido}\n${direcaoEfetiva ?? ""}`,
      assets.map((a) => a.file_name)
    )
    const citadosPeloHumano = [...new Set([...fotosForcadas, ...citadosNoTexto])]
    const arquivosArte = result.arte
      ? [...citadosPeloHumano, ...result.arte.arquivos_kit.filter((f) => !citadosPeloHumano.includes(f))]
      : []
    if (citadosPeloHumano.length > 0 && result.arte) {
      const ignorados = citadosPeloHumano.filter((f) => !result.arte!.arquivos_kit.includes(f))
      if (ignorados.length > 0) {
        console.warn(`[marketing-posts/pedir] Sonnet não citou arquivos que o humano pediu — forçados: ${ignorados.join(", ")}`)
      }
    }

    // scheduled_for: o do humano (se veio) vence a sugestão do modelo.
    const humanDate =
      typeof body?.scheduled_for === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.scheduled_for)
        ? body.scheduled_for
        : null

    // QA 75-240 #1 — o post é INSERIDO ANTES da arte: se a função estourar o
    // tempo durante a geração da imagem, a copy (que custou uma chamada de
    // Sonnet) já está salva na fila — fail-open estrutural, não best-effort.
    const POST_SELECT =
      MARKETING_POST_SELECT
    const { data: inserted, error } = await admin
      .from("marketing_posts")
      .insert({
        org_id: appUser.org_id,
        empreendimento_id: empreendimentoId,
        canal,
        formato,
        pedido,
        copy: result.copy,
        roteiro: result.roteiro,
        arte_url: null,
        // QA 75-241 #1 — o norte do humano é ANCORADO na descrição persistida
        // (não dependemos de o Sonnet incorporar): todo Refazer o preserva.
        arte_descricao: result.arte
          ? direcaoEfetiva
            ? `${result.arte.descricao}\n\nDIREÇÃO DO HUMANO (prioridade): ${direcaoEfetiva}`
            : result.arte.descricao
          : null,
        arte_arquivos: result.arte ? arquivosArte : null,
        // Story 75-248 — CTA em coluna PRÓPRIA, nunca dentro da arte_descricao:
        // aquela string vai no prompt e o modelo é proibido de desenhar CTA.
        arte_cta: result.artes?.[0]?.cta ?? null,
        scheduled_for: humanDate ?? result.scheduled_for,
        justificativa: result.justificativa,
        status: "sugerido",
        origem: "agente",
        // Story 75-294 — tráfego pago: destino/objetivo + ad copy com o teto do
        // Meta reforçado no servidor (corte na fronteira de palavra, com "…").
        destino,
        objetivo,
        ad_primary_text: destino === "pago" ? enforceAdLimit(result.ad_primary_text, AD_PRIMARY_MAX) : null,
        ad_headline: destino === "pago" ? enforceAdLimit(result.ad_headline, AD_HEADLINE_MAX) : null,
        created_by: appUser.id,
      })
      .select(POST_SELECT)
      .single()

    if (error || !inserted) return NextResponse.json({ error: error?.message ?? "Erro ao salvar" }, { status: 500 })

    // Story 75-240 — arte com as referências do Kit (fail-open: null = sem arte).
    // Story 75-255 — N artes: UMA POR TELA do story. O quanto é decidido por
    // `quantasArtes` (pura), a partir do formato e do nº de telas da copy.
    let post = inserted
    if (result.artes && result.artes.length > 0) {
      const totalTelas = buildPostPreview({ copy: result.copy, formato, temArteGerada: false }).telas.length
      const quantas = quantasArtes(formato, totalTelas)

      const specs: ArteSpec[] = result.artes.slice(0, quantas).map((a, i) => ({
        ordem: i + 1,
        descricao: a.descricao,
        // A tela 1 usa a união com os arquivos que o HUMANO citou (75-250); as
        // demais usam o que o Sonnet citou para aquela tela — cada geração tem
        // seu próprio teto de 7MB de referência.
        // Story 75-295 — rede de segurança: cena que mostra o prédio SEM
        // referência de fachada ganha as do Kit forçadas (prédio inventado num
        // anúncio do empreendimento é o defeito mais grave deste fluxo).
        arquivosKit: garantirFachadaNaCena(a.descricao, i === 0 ? arquivosArte : a.arquivos_kit, assets),
        cta: a.cta,
        // Story 75-256 — o texto da faixa vem do Sonnet e é composto por código
        titulo: a.titulo,
        subtitulo: a.subtitulo,
      }))

      const geradas = await gerarArtesParaPost(
        admin,
        {
          orgId: appUser.org_id,
          empreendimentoId,
          formato,
          // Story 75-241 — a direção do humano chega ao motor VERBATIM, com
          // prioridade. DECISÃO DE PRODUTO (Marcos, "o humano é superior ao
          // sistema"): override consciente, NÃO passa pelo filtro de diretrizes.
          // A publicação continua 100% humana (fila de aprovação).
          ajuste: direcaoEfetiva || null,
          // Story 75-294 — pago: a MESMA arte nas proporções pedidas (fail-open
          // por proporção; a parcial que falhar aparece no card via Refazer).
          ratios,
        },
        specs
      )

      if (geradas.length > 0) {
        const { data: updated } = await admin
          .from("marketing_posts")
          // montarPatchDeArtes é a ÚNICA a gravar artes + arte_url juntos, para
          // os dois nunca divergirem (ressalva do @po).
          .update({ ...montarPatchDeArtes(geradas), updated_at: new Date().toISOString() })
          .eq("id", inserted.id as string)
          .eq("org_id", appUser.org_id)
          .select(POST_SELECT)
          .single()
        if (updated) post = updated
      }
    }

    return NextResponse.json({ post }, { status: 201 })
  } catch (err) {
    console.error("[marketing-posts/pedir] erro:", err)
    return NextResponse.json({ error: "Falha ao gerar o post. Tente novamente." }, { status: 500 })
  }
}
