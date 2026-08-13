import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canManagePastas } from "@web/lib/pastas/roles"
import { extractFromDocs } from "@web/lib/pastas/termo/extract"
import { buildTermoData, type PastaRowForTermo } from "@web/lib/pastas/termo/build"

// Story 75-127 (Etapa 2) — POST: lê os documentos da pasta (visão do Claude),
// junta com os dados da pasta/form_data e devolve o TermoData pré-preenchido para a
// tela de revisão. NÃO gera/persiste nada — só sugere os campos.
export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth
  if (!(await canManagePastas(appUser.id, appUser.org_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const { data: pasta } = await supabase
    .from("pastas")
    .select(
      "id, nome, tipo, casado, uniao_estavel, corretor_nome, imobiliaria, interessado_telefone, interessado_email, tem_pix, fluxo_pagamento, form_data",
    )
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!pasta) {
    return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 })
  }

  const { data: docs } = await supabase
    .from("pasta_documentos")
    .select("slug, label, storage_path, filename")
    .eq("pasta_id", id)

  const admin = createAdminClient()
  let extracted = {}
  try {
    extracted = await extractFromDocs(admin, docs ?? [], pasta.tipo as "pf" | "pj")
  } catch (e) {
    // Extração é best-effort: se a visão falhar, devolve os dados da pasta sem os
    // campos dos documentos (o gestor preenche na revisão).
    console.error("[termo/extrair] falha na visão", e)
  }

  const termo = buildTermoData(pasta as unknown as PastaRowForTermo, extracted)
  const fd = (pasta.form_data ?? {}) as Record<string, string>
  const signer = {
    name: termo.nome1 ?? pasta.nome,
    email: pasta.interessado_email || fd.email || "",
    phone: pasta.interessado_telefone || fd.celular || "",
  }

  return NextResponse.json({ data: termo, signer })
}
