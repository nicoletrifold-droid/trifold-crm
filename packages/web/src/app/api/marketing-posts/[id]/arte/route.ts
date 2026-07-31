import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import { gerarArteParaPost, montarPatchDeArtes, removerArteAntiga, type ArteGerada } from "@web/lib/marketing/arte-service"
import { isMarketingPostEditable, type MarketingPostFormato, MARKETING_POST_FORMATOS, MARKETING_POST_SELECT } from "@web/lib/marketing/posts"

// Story 75-240 — "Refazer arte": regenera a imagem de um post com um ajuste
// opcional do humano ("menos texto", "usa a foto da piscina"). Não toca na
// copy nem chama o Sonnet — usa a arte_descricao persistida na geração.
// 300s (padrão do repo p/ rotas longas): downloads + Vertex não podem estourar
// a função no pior caso (QA 75-240 #6).
export const maxDuration = 300

const MAX_AJUSTE_CHARS = 500

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const body = (await req.json().catch(() => ({}))) as { ajuste?: string; ordem?: number } | null
  const ajuste = typeof body?.ajuste === "string" ? body.ajuste.trim() : ""
  // Story 75-255 — refazer é POR TELA. Sem `ordem`, refaz a tela 1 (comportamento
  // de antes, para chamada antiga não mudar de significado).
  const ordem = Number.isInteger(body?.ordem) && body!.ordem! > 0 ? body!.ordem! : 1
  if (ajuste.length > MAX_AJUSTE_CHARS) {
    return NextResponse.json({ error: `Ajuste muito longo (máx. ${MAX_AJUSTE_CHARS} caracteres)` }, { status: 400 })
  }

  const { data: post } = await admin
    .from("marketing_posts")
    .select("id, status, formato, empreendimento_id, arte_descricao, arte_arquivos, arte_cta, arte_url, artes, copy")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!post) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 })
  if (!isMarketingPostEditable(post.status as string)) {
    return NextResponse.json({ error: "Só posts sugeridos ou aprovados podem ter a arte refeita" }, { status: 409 })
  }
  const formato = post.formato as MarketingPostFormato | null
  if (!formato || !MARKETING_POST_FORMATOS.includes(formato) || formato === "reel") {
    return NextResponse.json({ error: "Este formato não gera arte" }, { status: 422 })
  }

  // Story 75-255 — a tela pedida manda: sua própria descrição e CTA. Fallback
  // para os campos de topo (que espelham a tela 1) e, por fim, para a copy.
  const artesAtuais = (Array.isArray(post.artes) ? post.artes : []) as Array<{
    ordem: number
    url: string
    descricao?: string | null
    cta?: string | null
  }>
  const telaAtual = artesAtuais.find((a) => a.ordem === ordem) ?? null

  // Sem direção de arte persistida (post antigo/manual): a copy vira a base.
  // 75-248: não pedir mais o CTA ao modelo — ele é composto pelo código.
  const descricao =
    telaAtual?.descricao ??
    (post.arte_descricao as string | null) ??
    `Arte para o post abaixo. Extraia o TÍTULO da copy e componha a arte (NÃO desenhe CTA):\n${(post.copy as string).slice(0, 1200)}`

  const arquivosKit = Array.isArray(post.arte_arquivos)
    ? (post.arte_arquivos as unknown[]).filter((f): f is string => typeof f === "string")
    : []

  const arte = await gerarArteParaPost(admin, {
    orgId: appUser.org_id,
    empreendimentoId: (post.empreendimento_id as string | null) ?? null,
    formato,
    descricao,
    arquivosKit,
    ajuste: ajuste || null,
    // 75-248 — CTA persistido em coluna própria; o Refazer não chama o Sonnet,
    // então sem isso o CTA se perderia a cada refazer.
    cta: telaAtual?.cta ?? ((post.arte_cta as string | null) ?? null),
  })
  if (!arte) {
    return NextResponse.json({ error: "Não consegui gerar a arte agora. Tente novamente." }, { status: 502 })
  }

  // QA #11 — arte substituída não fica pública p/ sempre (best-effort).
  // 🔴 AC5 — remove só a arte DAQUELA tela, não a do post.
  await removerArteAntiga(admin, telaAtual?.url ?? (post.arte_url as string | null))

  // 🔴 AC5 — as OUTRAS telas são preservadas. Antes o Refazer trocava a arte única
  // do post; agora refazer a tela 2 não pode destruir a tela 1 já aprovada.
  const novas: ArteGerada[] = [
    ...artesAtuais
      .filter((a) => a.ordem !== ordem)
      .map((a) => ({
        ordem: a.ordem,
        url: a.url,
        descricao: a.descricao ?? "",
        cta: a.cta ?? null,
        arquivosUsados: [] as string[],
      })),
    { ordem, url: arte.arteUrl, descricao, cta: telaAtual?.cta ?? ((post.arte_cta as string | null) ?? null), arquivosUsados: arte.arquivosUsados },
  ]

  const { data, error } = await admin
    .from("marketing_posts")
    .update({ ...montarPatchDeArtes(novas), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select(
      MARKETING_POST_SELECT
    )
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
