import { NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// GET — signed URL (1h) para baixar um anexo do bucket privado "lancamentos". Story Lançamentos-05.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; attId: string }> }) {
  const { attId } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data: att } = await admin
    .from("lancamento_card_attachments")
    .select("storage_path")
    .eq("id", attId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!att?.storage_path) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 })

  const { data: signed, error } = await admin.storage
    .from("lancamentos")
    .createSignedUrl(att.storage_path as string, 3600)
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Erro ao gerar URL" }, { status: 500 })
  }
  return NextResponse.json({ url: signed.signedUrl })
}
