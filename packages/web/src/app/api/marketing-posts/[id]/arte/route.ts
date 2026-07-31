import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"
import { gerarArteParaPost, removerArteAntiga } from "@web/lib/marketing/arte-service"
import { isMarketingPostEditable, type MarketingPostFormato, MARKETING_POST_FORMATOS } from "@web/lib/marketing/posts"

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

  const body = (await req.json().catch(() => ({}))) as { ajuste?: string } | null
  const ajuste = typeof body?.ajuste === "string" ? body.ajuste.trim() : ""
  if (ajuste.length > MAX_AJUSTE_CHARS) {
    return NextResponse.json({ error: `Ajuste muito longo (máx. ${MAX_AJUSTE_CHARS} caracteres)` }, { status: 400 })
  }

  const { data: post } = await admin
    .from("marketing_posts")
    .select("id, status, formato, empreendimento_id, arte_descricao, arte_arquivos, arte_cta, arte_url, copy")
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

  // Sem direção de arte persistida (post antigo/manual): a copy vira a base.
  // 75-248: não pedir mais o CTA ao modelo — ele é composto pelo código.
  const descricao =
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
    cta: (post.arte_cta as string | null) ?? null,
  })
  if (!arte) {
    return NextResponse.json({ error: "Não consegui gerar a arte agora. Tente novamente." }, { status: 502 })
  }

  // QA #11 — arte substituída não fica pública p/ sempre (best-effort).
  await removerArteAntiga(admin, post.arte_url as string | null)

  const { data, error } = await admin
    .from("marketing_posts")
    .update({ arte_url: arte.arteUrl, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .select(
      "id, org_id, empreendimento_id, canal, formato, pedido, copy, roteiro, arte_url, scheduled_for, status, justificativa, origem, created_by, created_at, updated_at, properties:empreendimento_id(name)"
    )
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
