import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createAdminClient } from "@web/lib/supabase/admin"
import { buildDocSlots, type PastaTipo } from "@web/lib/pastas/checklist"
import { notifyNovaPastaGestor } from "@web/lib/notificacoes"
import { isValidEmail, isValidPhoneBR, formatPhoneBR, normalizeEmail } from "@web/lib/validation/contato"

// Story 75-146 — POST PÚBLICO de criação de pasta (auto-cadastro pela imobiliária).
// SEM auth: valida o token do link em `pasta_links` (ativo=true) e usa service role
// (createAdminClient), espelhando o insert+seed de POST /api/pastas. Diferenças:
//   - resolve org_id do LINK (não de um usuário logado);
//   - imobiliária vem do LINK (ignora o body);
//   - created_by = null, origem = 'auto_cadastro', link_id = o link.
// Ao criar, dispara (fire-and-forget) a notificação aos gestores — falha NÃO bloqueia.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient()

  // 1. Resolve o link ativo. Token inexistente OU revogado → rejeita limpo.
  const { data: link } = await admin
    .from("pasta_links")
    .select("id, org_id, imobiliaria, imobiliaria_id, ativo")
    .eq("token", token)
    .maybeSingle()

  if (!link || link.ativo !== true) {
    return NextResponse.json({ error: "Link inválido ou desativado" }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  // Sanitiza uma string opcional (trim + limite). Retorna null quando vazia.
  const optStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null

  const nome = typeof body.nome === "string" ? body.nome.trim() : ""
  const tipo: PastaTipo = body.tipo === "pj" ? "pj" : "pf"
  // Story 75-124 — casado e união estável são mutuamente exclusivos (só PF).
  const uniaoEstavel = tipo === "pf" && body.uniao_estavel === true
  const casado = tipo === "pf" && body.casado === true && !uniaoEstavel
  const temPix = body.tem_pix === true
  const FLUXOS = ["fluxo_30_70", "fluxo_100_obra", "plano_safra", "plano_investidor"]
  const fluxoPagamento = FLUXOS.includes(body.fluxo_pagamento) ? body.fluxo_pagamento : null
  const empreendimento = optStr(body.empreendimento)
  const corretorNome = optStr(body.corretor_nome)
  const corretorTelefone = optStr(body.corretor_telefone)
  const corretorEmail = optStr(body.corretor_email)
  const interessadoTelefone = optStr(body.interessado_telefone)
  const interessadoEmail = optStr(body.interessado_email)

  if (!nome) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
  }

  // Story 80-1 — validação de contato (server-side; link público não pode ser burlado).
  if (!interessadoTelefone || !isValidPhoneBR(interessadoTelefone)) {
    return NextResponse.json({ error: "Telefone do comprador inválido." }, { status: 400 })
  }
  if (!interessadoEmail || !isValidEmail(interessadoEmail)) {
    return NextResponse.json({ error: "E-mail do comprador inválido." }, { status: 400 })
  }
  if (corretorTelefone && !isValidPhoneBR(corretorTelefone)) {
    return NextResponse.json({ error: "Telefone do corretor inválido." }, { status: 400 })
  }
  if (corretorEmail && !isValidEmail(corretorEmail)) {
    return NextResponse.json({ error: "E-mail do corretor inválido." }, { status: 400 })
  }

  const pastaToken = randomBytes(24).toString("hex")

  const { data: pasta, error } = await admin
    .from("pastas")
    .insert({
      org_id: link.org_id,
      nome,
      tipo,
      casado,
      uniao_estavel: uniaoEstavel,
      empreendimento,
      tem_pix: temPix,
      fluxo_pagamento: fluxoPagamento,
      corretor_nome: corretorNome,
      corretor_telefone: corretorTelefone ? formatPhoneBR(corretorTelefone) : null,
      corretor_email: corretorEmail ? normalizeEmail(corretorEmail) : null,
      // Imobiliária SEMPRE do link (ignora o body — AC 3). Story 75-148: id + nome snapshot.
      imobiliaria_id: link.imobiliaria_id,
      imobiliaria: link.imobiliaria,
      interessado_telefone: formatPhoneBR(interessadoTelefone),
      interessado_email: normalizeEmail(interessadoEmail),
      token: pastaToken,
      created_by: null,
      origem: "auto_cadastro",
      link_id: link.id,
    })
    .select("id, token")
    .single()

  if (error || !pasta) {
    return NextResponse.json({ error: error?.message ?? "Falha ao criar pasta" }, { status: 500 })
  }

  const slots = buildDocSlots(tipo, casado, temPix, uniaoEstavel)
  const docsPayload = slots.map((s, i) => ({
    pasta_id: pasta.id,
    slug: s.slug,
    label: s.label,
    titular: s.titular,
    required: true,
    ordem: i,
  }))

  // NB: não usar .order() no retorno do INSERT (gotcha PostgREST).
  const { data: docs, error: docsError } = await admin
    .from("pasta_documentos")
    .insert(docsPayload)
    .select("id, slug, label, titular, situacao")
  if (docsError) {
    // Rollback manual: remove a pasta se os docs falharem (mantém consistência).
    await admin.from("pastas").delete().eq("id", pasta.id)
    return NextResponse.json({ error: docsError.message }, { status: 500 })
  }

  // Notificação aos gestores (e-mail + WhatsApp). Fire-and-forget: NUNCA bloqueia a
  // criação da pasta — se o template `nova_pasta_gestor` ainda estiver PENDING na Meta
  // ou faltar config, o erro só é logado (AC 4).
  notifyNovaPastaGestor({
    orgId: link.org_id,
    pastaId: pasta.id,
    compradorNome: nome,
    imobiliaria: link.imobiliaria,
  }).catch((err) => console.error("[pasta/nova] notifyNovaPastaGestor error:", err))

  return NextResponse.json({ data: { id: pasta.id, token: pasta.token, docs: docs ?? [] } }, { status: 201 })
}
