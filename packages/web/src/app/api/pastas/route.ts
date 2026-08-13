import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { requireAuth } from "@web/lib/api-auth"
import { buildDocSlots, type PastaTipo } from "@web/lib/pastas/checklist"
import { canManagePastas } from "@web/lib/pastas/roles"
import { isValidEmail, isValidPhoneBR, formatPhoneBR, normalizeEmail } from "@web/lib/validation/contato"

// POST /api/pastas — cria uma pasta, gera o token do link público e semeia os
// documentos exigidos conforme tipo (pf/pj) e estado civil (casado).
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!(await canManagePastas(appUser.id, appUser.org_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  // Sanitiza uma string opcional (trim + limite). Retorna null quando vazia.
  const optStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null
  // Story 75-148 — id de imobiliária (uuid) ou null. A FK garante existência real.
  const optId = (v: unknown): string | null =>
    typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v.trim()) ? v.trim() : null

  const nome = typeof body.nome === "string" ? body.nome.trim() : ""
  const tipo: PastaTipo = body.tipo === "pj" ? "pj" : "pf"
  // Story 75-124 — casado e união estável são mutuamente exclusivos (só PF).
  // Se ambos vierem true, união estável prevalece.
  const uniaoEstavel = tipo === "pf" && body.uniao_estavel === true
  const casado = tipo === "pf" && body.casado === true && !uniaoEstavel
  const temPix = body.tem_pix === true
  // Story 75-126 — preferência de fluxo de pagamento (opcional; só grava se válido).
  const FLUXOS = ["fluxo_30_70", "fluxo_100_obra", "plano_safra", "plano_investidor"]
  const fluxoPagamento = FLUXOS.includes(body.fluxo_pagamento) ? body.fluxo_pagamento : null
  const empreendimento = optStr(body.empreendimento)
  // Story 75-123 — origem (texto livre, não amarra ao CRM) + contatos do interessado.
  const corretorNome = optStr(body.corretor_nome)
  const corretorTelefone = optStr(body.corretor_telefone)
  const corretorEmail = optStr(body.corretor_email)
  // Story 75-148 — imobiliária da BASE: id (verdade p/ relatório) + nome (snapshot p/ exibição).
  const imobiliariaId = optId(body.imobiliaria_id)
  const imobiliaria = optStr(body.imobiliaria)
  const interessadoTelefone = optStr(body.interessado_telefone)
  const interessadoEmail = optStr(body.interessado_email)

  if (!nome) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
  }

  // Story 80-1 — validação de contato (server-side; o link público não pode ser burlado).
  // Comprador: telefone + e-mail obrigatórios e válidos. Corretor: válido se preenchido.
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

  const token = randomBytes(24).toString("hex")

  const { data: pasta, error } = await supabase
    .from("pastas")
    .insert({
      org_id: appUser.org_id,
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
      imobiliaria_id: imobiliariaId,
      imobiliaria,
      interessado_telefone: formatPhoneBR(interessadoTelefone),
      interessado_email: normalizeEmail(interessadoEmail),
      token,
      created_by: appUser.id,
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

  // Story 75-123 — retorna os docs semeados p/ a Tela 3 do wizard anexar inline.
  // NB: não usar .order() aqui — o PostgREST não aplica order no retorno de INSERT
  // (reporta "column ... does not exist"). Os docs vêm na ordem de inserção e a
  // Tela 3 agrupa por titular de qualquer forma.
  const { data: docs, error: docsError } = await supabase
    .from("pasta_documentos")
    .insert(docsPayload)
    .select("id, slug, label, titular, situacao")
  if (docsError) {
    // Rollback manual: remove a pasta se os docs falharem (mantém consistência).
    await supabase.from("pastas").delete().eq("id", pasta.id)
    return NextResponse.json({ error: docsError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { id: pasta.id, token: pasta.token, docs: docs ?? [] } }, { status: 201 })
}
