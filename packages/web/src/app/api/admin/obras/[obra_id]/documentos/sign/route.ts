import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

// POST — gera uma signed upload URL para o bucket privado "obra-docs".
//
// Por que existe: a rota POST ../documentos recebia o binário via req.formData()
// (relay multipart pela Serverless Function). Vercel Serverless Functions têm teto de
// payload de ~4.5 MB, muito abaixo dos 50 MB anunciados — PDFs assinados (Clicksign)
// estouravam antes de chegar ao código e o form só via um 413 sem JSON ("Erro ao
// enviar documento" genérico). Aqui geramos uma signed upload URL para o cliente
// enviar o arquivo DIRETO ao Supabase Storage (uploadToSignedUrl), sem passar o corpo
// pela função. O registro dos metadados fica na rota POST ../documentos (agora também
// JSON). Mesma mecânica de lancamentos/cards/[id]/attachments/sign.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (await requireCapability(appUser, "obras.documentos_assinar")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

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
    return NextResponse.json(
      { error: "Arquivo muito grande (máx. 50 MB)" },
      { status: 413 }
    )
  }

  // Mesmo formato de path do fluxo legado, para downloads e limpeza continuarem iguais.
  // Extensão sanitizada: só alfanumérico curto, para o path assinado nunca conter "/" ou "..".
  const ext = fileName.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toLowerCase() ?? ""
  const storagePath = `obra-docs/${obra_id}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`

  const admin = createAdminClient()
  const { data: signed, error } = await admin.storage
    .from("obra-docs")
    .createSignedUploadUrl(storagePath)
  if (error || !signed?.token) {
    return NextResponse.json(
      { error: error?.message ?? "Erro ao gerar URL de upload" },
      { status: 500 }
    )
  }

  return NextResponse.json({ signedUrl: signed.signedUrl, token: signed.token, storagePath })
}
