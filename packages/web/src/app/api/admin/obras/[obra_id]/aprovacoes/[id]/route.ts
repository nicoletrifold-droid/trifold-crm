import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { logAudit } from "@web/lib/audit"
import { sendEmail } from "@web/lib/email"
import type { SupabaseClient } from "@supabase/supabase-js"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string; id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, id } = await params

  let body: { acao: "aprovar" | "rejeitar"; motivo_rejeicao?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 })
  }

  const { acao, motivo_rejeicao } = body

  if (acao !== "aprovar" && acao !== "rejeitar") {
    return NextResponse.json(
      { error: "Campo 'acao' deve ser 'aprovar' ou 'rejeitar'" },
      { status: 400 }
    )
  }

  if (acao === "rejeitar" && (!motivo_rejeicao || !motivo_rejeicao.trim())) {
    return NextResponse.json(
      { error: "Campo 'motivo_rejeicao' é obrigatório para rejeição" },
      { status: 400 }
    )
  }

  // Busca o registro com isolamento de org_id
  const { data: aprovacao, error: fetchError } = await supabase
    .from("obra_upload_aprovacoes")
    .select("id, tipo, storage_path, storage_bucket, metadata, enviado_por, obra_id, org_id, status")
    .eq("id", id)
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (fetchError || !aprovacao) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (aprovacao.status !== "pendente") {
    return NextResponse.json(
      { error: "Upload já foi revisado" },
      { status: 409 }
    )
  }

  if (acao === "aprovar") {
    // Inserir na tabela publicada correspondente
    if (aprovacao.tipo === "foto") {
      const meta = aprovacao.metadata as {
        caption?: string
        fase_id?: string
        taken_at?: string
      }
      const { error: insertErr } = await supabase.from("obra_fotos").insert({
        obra_id: aprovacao.obra_id,
        org_id: aprovacao.org_id,
        uploaded_by: aprovacao.enviado_por,
        storage_path: aprovacao.storage_path,
        caption: meta.caption ?? null,
        fase_id: meta.fase_id ?? null,
        taken_at: meta.taken_at ?? null,
      })
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }
    } else {
      const meta = aprovacao.metadata as {
        name: string
        filename?: string
        category: string
        file_size_bytes: number
      }
      const { error: insertErr } = await supabase.from("obra_documentos").insert({
        obra_id: aprovacao.obra_id,
        org_id: aprovacao.org_id,
        uploaded_by: aprovacao.enviado_por,
        storage_path: aprovacao.storage_path,
        name: meta.name,
        filename: meta.filename ?? meta.name,
        category: meta.category,
        file_size_bytes: meta.file_size_bytes,
      })
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }
    }

    // Atualiza status
    await supabase
      .from("obra_upload_aprovacoes")
      .update({
        status: "aprovado",
        aprovado_por: appUser.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
  } else {
    // Rejeição: remove arquivo do Storage
    await supabase.storage
      .from(aprovacao.storage_bucket)
      .remove([aprovacao.storage_path])

    await supabase
      .from("obra_upload_aprovacoes")
      .update({
        status: "rejeitado",
        aprovado_por: appUser.id,
        reviewed_at: new Date().toISOString(),
        motivo_rejeicao: motivo_rejeicao!.trim(),
      })
      .eq("id", id)
  }

  // Busca obra para subject do email
  const { data: obra } = await supabase
    .from("obras")
    .select("name")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  const obraName = obra?.name ?? "Obra"

  // Fire-and-forget: email para o usuário obras que enviou
  notificarResultadoUpload({
    supabase,
    enviadoPorId: aprovacao.enviado_por,
    acao,
    obraName,
    motivo: motivo_rejeicao?.trim(),
  }).catch(() => {})

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: acao === "aprovar" ? "aprovacao.aprovar" : "aprovacao.rejeitar",
    entity_type: "obra_upload_aprovacao",
    entity_id: id,
    obra_id,
    metadata: acao === "rejeitar" ? { motivo_rejeicao } : undefined,
  })

  return NextResponse.json({ ok: true, status: acao === "aprovar" ? "aprovado" : "rejeitado" })
}

async function notificarResultadoUpload(params: {
  supabase: SupabaseClient
  enviadoPorId: string
  acao: "aprovar" | "rejeitar"
  obraName: string
  motivo?: string
}) {
  const { data: usuario } = await params.supabase
    .from("users")
    .select("name, email")
    .eq("id", params.enviadoPorId)
    .not("email", "is", null)
    .maybeSingle()

  if (!usuario?.email) return

  if (params.acao === "aprovar") {
    await sendEmail({
      to: usuario.email,
      subject: `[Trifold] Seu upload foi aprovado — ${params.obraName}`,
      html: `<p>Olá ${usuario.name},</p>
             <p>Seu upload para a obra <strong>${params.obraName}</strong> foi <strong>aprovado</strong> e já está publicado.</p>`,
    })
  } else {
    await sendEmail({
      to: usuario.email,
      subject: `[Trifold] Seu upload foi rejeitado — ${params.obraName}`,
      html: `<p>Olá ${usuario.name},</p>
             <p>Seu upload para a obra <strong>${params.obraName}</strong> foi <strong>rejeitado</strong>.</p>
             <p><strong>Motivo:</strong> ${params.motivo ?? "Não informado"}</p>`,
    })
  }
}
