import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

/**
 * Story 75-15 — Purga de uploads reprovados após 7 dias.
 *
 * Uploads (foto/documento) rejeitados ficam visíveis com o motivo por 7 dias
 * (para o perfil obras entender a recusa); depois o arquivo do Storage E o
 * registro são eliminados. Pedidos de exclusão (`exclusao_foto`) rejeitados têm
 * apenas o registro removido — o `storage_path` deles aponta para a FOTO VIVA,
 * que não pode ser apagada.
 */
const CRON_SECRET = process.env.CRON_SECRET
const RETENTION_DAYS = 7

export async function GET(request: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: rejeitados, error } = await admin
    .from("obra_upload_aprovacoes")
    .select("id, tipo, storage_bucket, storage_path")
    .eq("status", "rejeitado")
    .lt("reviewed_at", cutoff)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (!rejeitados || rejeitados.length === 0) {
    return NextResponse.json({ ok: true, purged: 0 })
  }

  // Remove do Storage apenas arquivos de UPLOAD (foto/documento) — NUNCA de
  // exclusao_foto (cujo path é a foto viva).
  const porBucket = new Map<string, string[]>()
  for (const r of rejeitados) {
    if (r.tipo === "exclusao_foto") continue
    if (!r.storage_bucket || !r.storage_path) continue
    const arr = porBucket.get(r.storage_bucket) ?? []
    arr.push(r.storage_path)
    porBucket.set(r.storage_bucket, arr)
  }
  for (const [bucket, paths] of porBucket) {
    if (paths.length > 0) {
      await admin.storage.from(bucket).remove(paths)
    }
  }

  // Remove os registros (de todos os tipos rejeitados acima do prazo)
  const ids = rejeitados.map((r) => r.id)
  const { error: delErr } = await admin
    .from("obra_upload_aprovacoes")
    .delete()
    .in("id", ids)

  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, purged: ids.length })
}
