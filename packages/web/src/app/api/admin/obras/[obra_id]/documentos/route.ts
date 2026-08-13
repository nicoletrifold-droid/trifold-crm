import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { getRequestIp, logAudit } from "@web/lib/audit"
import { notifyClientes } from "@web/lib/notificacoes"
import { notificarAdminsNovoUpload } from "@web/lib/obras/aprovacao-notifications"
import { createAdminClient } from "@web/lib/supabase/admin"

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
const VALID_CATEGORIES = ["ART/RRT", "Contratos", "Memoriais", "Outros"]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (await requireCapability(appUser, "obras.ver")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: documentos, error } = await supabase
    .from("obra_documentos")
    .select("id, name, filename, category, file_size_bytes, created_at")
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ documentos: documentos ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (await requireCapability(appUser, "obras.documentos_gerenciar")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: obra } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Dois formatos de entrada:
  // - JSON: fluxo signed-upload — o arquivo JÁ está no Storage (enviado direto pelo
  //   browser via ../documentos/sign + uploadToSignedUrl, contornando o teto de
  //   ~4.5 MB de payload das Serverless Functions da Vercel); aqui só registramos.
  // - FormData: fluxo legado com o binário no corpo (segue funcionando p/ arquivos pequenos).
  const isJson = (req.headers.get("content-type") ?? "").includes("application/json")

  let name: string
  let categoryRaw: unknown
  let clienteObraIdRaw: unknown
  let filename: string
  let fileSizeBytes: number
  let storagePath: string
  let pendingFile: File | null = null

  if (isJson) {
    const body = (await req.json().catch(() => null)) as {
      storage_path?: string
      name?: string
      category?: string
      cliente_obra_id?: string
      filename?: string
      file_size_bytes?: number
    } | null

    storagePath = typeof body?.storage_path === "string" ? body.storage_path : ""
    // O storage_path é gerado pela rota /sign no formato exato
    // `obra-docs/${obra_id}/${uuid}[.ext]`. Regex estrita (não startsWith) para
    // impedir "../" e amarrar o registro a objetos desta obra.
    const pathOk = new RegExp(
      `^obra-docs/${obra_id}/[0-9a-f-]{36}(\\.[a-z0-9]{1,10})?$`
    ).test(storagePath)
    if (!pathOk) {
      return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
    }

    const nameRaw = body?.name
    if (typeof nameRaw !== "string" || !nameRaw.trim()) {
      return NextResponse.json({ error: "Campo 'name' é obrigatório" }, { status: 400 })
    }
    name = nameRaw

    fileSizeBytes = Number(body?.file_size_bytes)
    if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
      return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 })
    }

    // Antes de qualquer remove()/insert: o path não pode pertencer a um registro
    // existente (impede re-registrar ou apagar objeto de documento já publicado)
    // e o objeto precisa existir no Storage (upload do passo 2 concluído).
    const admin = createAdminClient()
    const [{ data: docDup }, { data: aprDup }] = await Promise.all([
      admin
        .from("obra_documentos")
        .select("id")
        .eq("storage_path", storagePath)
        .maybeSingle(),
      admin
        .from("obra_upload_aprovacoes")
        .select("id")
        .eq("storage_path", storagePath)
        .maybeSingle(),
    ])
    if (docDup || aprDup) {
      return NextResponse.json({ error: "Arquivo já registrado" }, { status: 409 })
    }
    const { data: objectExists } = await admin.storage
      .from("obra-docs")
      .exists(storagePath)
    if (!objectExists) {
      return NextResponse.json(
        { error: "Arquivo não encontrado. Envie novamente." },
        { status: 400 }
      )
    }

    if (fileSizeBytes > MAX_SIZE_BYTES) {
      await supabase.storage.from("obra-docs").remove([storagePath])
      return NextResponse.json(
        { error: "Arquivo muito grande (máx. 50 MB)" },
        { status: 413 }
      )
    }

    filename =
      typeof body?.filename === "string" && body.filename ? body.filename : "arquivo"
    categoryRaw = body?.category
    clienteObraIdRaw = body?.cliente_obra_id
  } else {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
    }

    const file = formData.get("file")
    const nameRaw = formData.get("name")
    categoryRaw = formData.get("category")
    clienteObraIdRaw = formData.get("cliente_obra_id")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Campo 'file' é obrigatório" }, { status: 400 })
    }

    if (typeof nameRaw !== "string" || !nameRaw.trim()) {
      return NextResponse.json({ error: "Campo 'name' é obrigatório" }, { status: 400 })
    }
    name = nameRaw

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Arquivo muito grande (máx. 50 MB)" },
        { status: 400 }
      )
    }

    // Extensão sanitizada (só alfanumérico curto) — path nunca contém "/" ou "..".
    const ext = file.name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toLowerCase() ?? ""
    filename = file.name
    fileSizeBytes = file.size
    storagePath = `obra-docs/${obra_id}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`
    pendingFile = file
  }

  const category =
    typeof categoryRaw === "string" && VALID_CATEGORIES.includes(categoryRaw)
      ? categoryRaw
      : "Outros"

  // Story 75-6: destinatário opcional (documento exclusivo de um cliente/unidade).
  let clienteObraId: string | null = null
  if (typeof clienteObraIdRaw === "string" && clienteObraIdRaw.trim()) {
    const { data: vinculo } = await supabase
      .from("cliente_obras")
      .select("id")
      .eq("id", clienteObraIdRaw.trim())
      .eq("obra_id", obra_id)
      .maybeSingle()
    if (!vinculo) {
      // No fluxo JSON o objeto já está no Storage — limpa para não deixar órfão.
      if (isJson) {
        await supabase.storage.from("obra-docs").remove([storagePath])
      }
      return NextResponse.json(
        { error: "Destinatário inválido para esta obra" },
        { status: 400 }
      )
    }
    clienteObraId = vinculo.id
  }

  if (pendingFile) {
    const bytes = await pendingFile.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from("obra-docs")
      .upload(storagePath, Buffer.from(bytes), {
        contentType: pendingFile.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }
  }

  // Role obras: entra em fila de aprovação
  if (appUser.role === "obras" || appUser.role === "gerente-relacionamento") {
    const { data: aprovacao, error: insertError } = await supabase
      .from("obra_upload_aprovacoes")
      .insert({
        org_id: appUser.org_id,
        obra_id,
        tipo: "documento",
        storage_path: storagePath,
        storage_bucket: "obra-docs",
        metadata: {
          name: name.trim(),
          filename,
          category,
          file_size_bytes: fileSizeBytes,
          cliente_obra_id: clienteObraId,
        },
        enviado_por: appUser.id,
      })
      .select("id, status")
      .single()

    if (insertError) {
      await supabase.storage.from("obra-docs").remove([storagePath])
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    notificarAdminsNovoUpload({
      supabase,
      orgId: appUser.org_id,
      obraName: obra.name,
      obraId: obra_id,
      tipoUpload: "documento",
      nomeEnviador: appUser.name,
      aprovacaoId: aprovacao.id as string,
    }).catch(() => {})

    return NextResponse.json({ aprovacao }, { status: 201 })
  }

  // Role admin/supervisor: publicação direta
  const { data: documento, error: dbError } = await supabase
    .from("obra_documentos")
    .insert({
      obra_id,
      org_id: appUser.org_id,
      uploaded_by: appUser.id,
      name: name.trim(),
      filename,
      storage_path: storagePath,
      category,
      file_size_bytes: fileSizeBytes,
      cliente_obra_id: clienteObraId,
    })
    .select("id, name, category, filename, file_size_bytes, created_at, cliente_obra_id")
    .single()

  if (dbError) {
    await supabase.storage.from("obra-docs").remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Fire-and-forget: notificar clientes. Story 75-175 — doc de unidade
  // (cliente_obra_id) avisa SÓ o dono; doc geral da obra (null) avisa todos.
  notifyClientes(obra_id, "novo_documento", obra.name, { clienteObraId: clienteObraId ?? null }).catch(() => {})

  void logAudit({
    org_id: appUser.org_id,
    user_id: appUser.id,
    user_name: appUser.name,
    action: "documento.upload",
    entity_type: "documento",
    entity_id: documento.id,
    entity_name: documento.name,
    obra_id,
    metadata: {
      filename: documento.filename,
      file_size_bytes: documento.file_size_bytes,
    },
    ip_address: getRequestIp(req.headers),
  })

  return NextResponse.json({ documento }, { status: 201 })
}
