import { NextRequest, NextResponse } from "next/server"
import { marketingGuard } from "@web/lib/marketing/guard"

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB — espelha o file_size_limit do bucket (mig 197)

// Story 75-229 — signed upload URL para o bucket público "marketing-brands".
// Convenção 75-208: o binário vai DIRETO ao Storage (uploadToSignedUrl); a
// Serverless Function nunca vê o corpo (teto de ~4.5 MB da Vercel). O registro
// dos metadados fica na rota POST ../assets.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await marketingGuard()
  if (g.error) return g.error
  const { admin, appUser } = g
  const { id } = await params

  const { data: brand } = await admin
    .from("marketing_brands")
    .select("id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!brand) return NextResponse.json({ error: "Marca não encontrada" }, { status: 404 })

  const body = (await req.json().catch(() => null)) as {
    file_name?: string
    file_size_bytes?: number
  } | null
  const fileName = typeof body?.file_name === "string" ? body.file_name : "arquivo"
  const size = Number(body?.file_size_bytes)
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
  }
  if (size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. 10 MB)" }, { status: 413 })
  }

  // Extensão sanitizada: só alfanumérico curto — o path assinado nunca contém "/" ou "..".
  const ext = fileName.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toLowerCase() ?? ""
  const storagePath = `${appUser.org_id}/${id}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`

  const { data: signed, error } = await admin.storage
    .from("marketing-brands")
    .createSignedUploadUrl(storagePath)
  if (error || !signed?.token) {
    return NextResponse.json(
      { error: error?.message ?? "Erro ao gerar URL de upload" },
      { status: 500 }
    )
  }

  return NextResponse.json({ signedUrl: signed.signedUrl, token: signed.token, storagePath })
}
