import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// DELETE de um anexo (remove do banco e do bucket). Story Lançamentos-05.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; attId: string }> }) {
  const { attId } = await params
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const { data: att } = await admin
    .from("lancamento_card_attachments")
    .select("id, storage_path")
    .eq("id", attId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()
  if (!att) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 })

  if (att.storage_path) await admin.storage.from("lancamentos").remove([att.storage_path as string])
  const { error } = await admin
    .from("lancamento_card_attachments").delete().eq("id", attId).eq("org_id", appUser.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
