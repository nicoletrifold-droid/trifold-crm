import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { logAudit } from "@web/lib/audit"
import { sendEmail } from "@web/lib/email"
import { notifyClientes } from "@web/lib/notificacoes"
import { createAdminClient } from "@web/lib/supabase/admin"
import type { SupabaseClient } from "@supabase/supabase-js"

const ALLOWED_ROLES = ["admin", "supervisor"]

// DELETE — o AUTOR desfaz o próprio envio enquanto pendente (ou dispensa um
// rejeitado da tela antes do purge de 7 dias). Admin/supervisor também podem.
// A RLS da tabela não dá DELETE ao autor (policy é admin/supervisor) — a
// fronteira de segurança é esta rota, que valida autor+status e usa o admin
// client, mesmo padrão do lancamentosGuard.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string; id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { obra_id, id } = await params

  const { data: aprovacao } = await supabase
    .from("obra_upload_aprovacoes")
    .select("id, tipo, storage_path, storage_bucket, enviado_por, status")
    .eq("id", id)
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!aprovacao) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const isGestor = ALLOWED_ROLES.includes(appUser.role)
  const isAutor = aprovacao.enviado_por === appUser.id
  if (!isGestor && !isAutor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (aprovacao.status === "aprovado") {
    return NextResponse.json(
      { error: "Upload já aprovado e publicado — exclua o item publicado" },
      { status: 409 }
    )
  }

  // Delete atômico com guard de status: se um gestor aprovar em paralelo, o
  // status muda para 'aprovado' e este DELETE não casa nada (espelho do claim
  // atômico do PATCH, que por sua vez não casa se esta linha já sumiu).
  const admin = createAdminClient()
  const { data: deleted, error: delErr } = await admin
    .from("obra_upload_aprovacoes")
    .delete()
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .in("status", ["pendente", "rejeitado"])
    .select("id")
    .maybeSingle()

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }
  if (!deleted) {
    return NextResponse.json(
      { error: "Upload já foi revisado por outro usuário" },
      { status: 409 }
    )
  }

  // 'exclusao_foto' é um PEDIDO de exclusão: o storage_path aponta para a foto
  // VIVA publicada — cancelar o pedido não pode apagar o arquivo dela.
  if (aprovacao.tipo !== "exclusao_foto") {
    const { error: rmErr } = await admin.storage
      .from(aprovacao.storage_bucket)
      .remove([aprovacao.storage_path])
    if (rmErr) {
      // Linha já foi excluída — o purge de rejeitados não vai varrer este path.
      console.error(
        `[aprovacoes] arquivo órfão em ${aprovacao.storage_bucket}/${aprovacao.storage_path}: ${rmErr.message}`
      )
    }
  }

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "aprovacao.excluir",
    entity_type: "obra_upload_aprovacao",
    entity_id: id,
    obra_id,
    metadata: { tipo: aprovacao.tipo, status_anterior: aprovacao.status },
  })

  return NextResponse.json({ ok: true })
}

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
    // O autor pode ter excluído o próprio envio enquanto a aba do gestor
    // estava aberta — mensagem clara em vez de um "Not found" seco.
    return NextResponse.json(
      { error: "Item não está mais na fila (removido pelo autor ou já processado)" },
      { status: 409 }
    )
  }

  if (aprovacao.status !== "pendente") {
    return NextResponse.json(
      { error: "Upload já foi revisado" },
      { status: 409 }
    )
  }

  // Claim atômico: UPDATE WHERE status='pendente' — previne race condition
  // se dois admins clicarem ao mesmo tempo. Se retornar 0 rows, outro já revisou.
  const newStatus = acao === "aprovar" ? "aprovado" : "rejeitado"
  const { data: claimed, error: claimErr } = await supabase
    .from("obra_upload_aprovacoes")
    .update({
      status: newStatus,
      aprovado_por: appUser.id,
      reviewed_at: new Date().toISOString(),
      ...(acao === "rejeitar" ? { motivo_rejeicao: motivo_rejeicao!.trim() } : {}),
    })
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("status", "pendente")   // ← condição atômica
    .select("id")
    .maybeSingle()

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 })
  }
  if (!claimed) {
    return NextResponse.json({ error: "Upload já foi revisado por outro usuário" }, { status: 409 })
  }

  if (acao === "aprovar") {
    if (aprovacao.tipo === "exclusao_foto") {
      // Story 75-14 — aprovar pedido de exclusão: apaga a foto viva + o arquivo.
      const meta = aprovacao.metadata as { foto_id?: string }
      if (meta.foto_id) {
        await supabase
          .from("obra_fotos")
          .delete()
          .eq("id", meta.foto_id)
          .eq("obra_id", aprovacao.obra_id)
          .eq("org_id", aprovacao.org_id)
        await supabase.storage.from("obra-fotos").remove([aprovacao.storage_path])
      }
    } else if (aprovacao.tipo === "foto") {
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
        cliente_obra_id?: string | null
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
        cliente_obra_id: meta.cliente_obra_id ?? null,
      })
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }
    }

    // Status já atualizado no claim atômico acima
  }
  // Story 75-15: NÃO remove o arquivo na rejeição. Uploads rejeitados ficam 7 dias
  // (visíveis com o motivo) e são purgados pelo cron purge-rejected-uploads.
  // Para 'exclusao_foto' rejeitado, a foto viva permanece intocada (nada a remover).

  // Busca obra para subject do email
  const { data: obra } = await supabase
    .from("obras")
    .select("name")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  const obraName = obra?.name ?? "Obra"

  // Story 75-5: ao aprovar um UPLOAD (foto/documento), notifica os clientes.
  // 'exclusao_foto' é exclusão — não notifica cliente.
  if (acao === "aprovar" && aprovacao.tipo !== "exclusao_foto") {
    // Story 75-175 — doc de unidade avisa só o dono (usa cliente_obra_id do metadata
    // da aprovação); foto é sempre da obra (null → fan-out para todos).
    const aprovMeta = aprovacao.metadata as { cliente_obra_id?: string | null } | null
    notifyClientes(
      obra_id,
      aprovacao.tipo === "foto" ? "nova_foto" : "novo_documento",
      obraName,
      { clienteObraId: aprovacao.tipo === "foto" ? null : aprovMeta?.cliente_obra_id ?? null }
    ).catch(() => {})
  }

  // Fire-and-forget: email ao usuário obras que enviou (só para uploads;
  // pedido de exclusão não usa a cópia de "upload aprovado/rejeitado").
  if (aprovacao.tipo !== "exclusao_foto") {
    notificarResultadoUpload({
      supabase,
      enviadoPorId: aprovacao.enviado_por,
      acao,
      obraName,
      motivo: motivo_rejeicao?.trim(),
    }).catch(() => {})
  }

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
