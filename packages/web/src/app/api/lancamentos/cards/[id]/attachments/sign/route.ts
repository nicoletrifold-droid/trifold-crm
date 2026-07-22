import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

const MAX_SIZE_BYTES = 25 * 1024 * 1024

// POST — gera uma signed upload URL para o bucket privado "lancamentos". Story Lançamentos-05 (fix upload).
//
// Por que existe: a rota POST .../attachments original recebia o binário via req.formData()
// (relay multipart pela Serverless Function). Vercel Serverless Functions têm teto de payload
// de ~4.5 MB, muito abaixo dos 25 MB anunciados — arquivos maiores travavam antes de chegar ao
// código. Aqui geramos uma signed upload URL para que o cliente envie o arquivo DIRETO ao Supabase
// Storage (via uploadToSignedUrl), sem passar o corpo pela função. O registro dos metadados fica
// na rota POST .../attachments (agora JSON). Não há padrão de signed-upload-url pré-existente no
// projeto; esta é uma criação nova motivada pelo limite fixo de infraestrutura da Vercel.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data: card } = await admin
    .from("lancamento_cards").select("id").eq("id", id).eq("org_id", appUser.org_id).maybeSingle()
  if (!card) return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 })

  const body = (await req.json().catch(() => null)) as { file_name?: string; file_size_bytes?: number } | null
  const fileName = typeof body?.file_name === "string" ? body.file_name : "arquivo"
  const size = Number(body?.file_size_bytes)
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
  }
  if (size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo excede 25 MB" }, { status: 413 })
  }

  const ext = (fileName.split(".").pop() ?? "bin").toLowerCase()
  const storagePath = `${id}/${Date.now()}-${Math.round(size)}.${ext}`

  const { data: signed, error } = await admin.storage
    .from("lancamentos")
    .createSignedUploadUrl(storagePath)
  if (error || !signed?.token) {
    return NextResponse.json({ error: error?.message ?? "Erro ao gerar URL de upload" }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: signed.signedUrl, token: signed.token, storagePath })
}
