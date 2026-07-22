import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

const MAX_SIZE_BYTES = 25 * 1024 * 1024

// GET (listar) / POST (registrar metadados) anexos de um cartão. Story Lançamentos-05.
// Bucket privado "lancamentos"; download via rota signed-url. Mesma mecânica do módulo Pastas.
//
// POST não recebe mais o binário: o arquivo é enviado DIRETO ao Storage pelo cliente via
// signed upload URL (rota .../attachments/sign), evitando o teto de ~4.5 MB de payload das
// Serverless Functions da Vercel. Aqui só validamos e persistimos os metadados em JSON.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data, error } = await admin
    .from("lancamento_card_attachments")
    .select("id, file_name, file_size_bytes, mime, created_at")
    .eq("card_id", id)
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attachments: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data: card } = await admin
    .from("lancamento_cards").select("id").eq("id", id).eq("org_id", appUser.org_id).maybeSingle()
  if (!card) return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 })

  const body = (await req.json().catch(() => null)) as {
    storage_path?: string; file_name?: string; file_size_bytes?: number; mime?: string | null
  } | null

  const storagePath = typeof body?.storage_path === "string" ? body.storage_path : ""
  const fileName = typeof body?.file_name === "string" && body.file_name ? body.file_name : "arquivo"
  const size = Number(body?.file_size_bytes)
  const mime = typeof body?.mime === "string" && body.mime ? body.mime : null

  // O storage_path é gerado pela rota /sign no formato `${cardId}/...`; recusa qualquer
  // caminho que não pertença a este cartão para impedir registro de objetos alheios.
  if (!storagePath || !storagePath.startsWith(`${id}/`)) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
  }
  if (size > MAX_SIZE_BYTES) {
    await admin.storage.from("lancamentos").remove([storagePath])
    return NextResponse.json({ error: "Arquivo excede 25 MB" }, { status: 413 })
  }

  const { data, error } = await admin
    .from("lancamento_card_attachments")
    .insert({
      org_id: appUser.org_id, card_id: id, file_name: fileName, storage_path: storagePath,
      file_size_bytes: size, mime, uploaded_by: appUser.id,
    })
    .select("id, file_name, file_size_bytes, mime, created_at")
    .single()
  if (error) {
    await admin.storage.from("lancamentos").remove([storagePath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ attachment: data })
}
