import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getDefaultStageId } from "@web/lib/leads/default-stage"
import { parseFormSchema, type FormSchema } from "@web/lib/forms/schema"
import { limparRespostas, formularioCompleto, type Respostas } from "@web/lib/forms/branching"
import { calcularScore } from "@web/lib/forms/score"
import { normalizePhoneBR } from "@trifold/shared"

// Story 75-330 (Epic 89) — endpoint PÚBLICO do formulário de qualificação.
// Token = lead_forms.token (uuid não-enumerável). Mesmas garantias do
// /api/agendar/[token]: token inválido, mal formado ou de formulário inativo
// responde igual, sem revelar se existe, de qual org é ou de qual campanha.
//
// A agenda no fim é a Story 75-331. Aqui o formulário termina na mensagem final.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Resposta única para QUALQUER falha de token — não vazar qual das causas foi.
const TOKEN_INVALIDO = { error: "Link inválido ou desativado." }

interface LeadForm {
  id: string
  org_id: string
  nome: string
  schema: unknown
}

// ─── Rate limit (em memória, por IP, 30 req/min) ─────────────────────────────
// Mesmo padrão do app/api/agent/chat/route.ts:60 — decisão da story: reusar o
// que existe em vez de introduzir Redis aqui.
// ⚠️ LIMITAÇÃO CONHECIDA E ACEITA: na Vercel isso vale POR INSTÂNCIA de lambda.
// Segura repetição acidental e script ingênuo; NÃO é defesa contra abuso
// distribuído. Defesa séria de endpoint público é story própria.
const rateLimitMap = new Map<string, number[]>()
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const janela = 60 * 1000
  const recentes = (rateLimitMap.get(ip) ?? []).filter((t) => now - t < janela)
  if (recentes.length >= 30) return false
  recentes.push(now)
  rateLimitMap.set(ip, recentes)
  return true
}

function ipDaRequisicao(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for")
  return fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "desconhecido"
}

async function acharFormularioPorToken(token: string): Promise<{ form: LeadForm; schema: FormSchema } | null> {
  if (!UUID_RE.test(token)) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from("lead_forms")
    .select("id, org_id, nome, schema")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle()
  if (!data) return null
  try {
    // Schema quebrado no banco não pode virar página quebrada para quem clicou
    // no anúncio: trata como link inválido e falha visível no log.
    return { form: data as LeadForm, schema: parseFormSchema((data as LeadForm).schema) }
  } catch (e) {
    console.error(`[formulario] schema inválido no form ${(data as LeadForm).id}:`, e)
    return null
  }
}

// GET /api/formulario/[token] → { nome, schema }
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const encontrado = await acharFormularioPorToken(token)
  if (!encontrado) return NextResponse.json(TOKEN_INVALIDO, { status: 404 })
  return NextResponse.json({ nome: encontrado.form.nome, schema: encontrado.schema })
}

interface CorpoPost {
  session_token?: string
  respostas?: Respostas
  lgpd_aceito?: boolean
  finalizar?: boolean
  utm?: Record<string, string>
}

// POST /api/formulario/[token]
// Salva o progresso (parcial) e, com finalizar=true, fecha a resposta.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  if (!checkRateLimit(ipDaRequisicao(request))) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 })
  }

  const encontrado = await acharFormularioPorToken(token)
  if (!encontrado) return NextResponse.json(TOKEN_INVALIDO, { status: 404 })
  const { form, schema } = encontrado

  const body = (await request.json().catch(() => null)) as CorpoPost | null
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 })

  // Descarta respostas de ramo abandonado ANTES de qualquer conta: score e
  // completude precisam enxergar só o caminho que a pessoa realmente percorreu.
  const respostas = limparRespostas(schema, body.respostas ?? {})

  const admin = createAdminClient()

  // ─── Sessão: continua a resposta parcial, ou cria uma nova ─────────────────
  const sessionToken = body.session_token && UUID_RE.test(body.session_token) ? body.session_token : null
  let respostaId: string | null = null
  let leadId: string | null = null

  if (sessionToken) {
    const { data } = await admin
      .from("lead_form_responses")
      .select("id, lead_id, status")
      .eq("session_token", sessionToken)
      .eq("form_id", form.id) // sessão de OUTRO formulário não serve
      .maybeSingle()
    if (data) {
      // Resposta já fechada não volta a ser editada — senão um POST atrasado
      // reabriria um lead já entregue ao SDR.
      if (data.status === "completa") {
        return NextResponse.json({ session_token: sessionToken, status: "completa" })
      }
      respostaId = data.id as string
      leadId = (data.lead_id as string | null) ?? null
    }
  }

  // ─── Contato: o que faz o lead nascer (AC4) ────────────────────────────────
  const contato: { nome?: string; email?: string; telefone?: string } = {}
  for (const pergunta of schema.perguntas) {
    if (!pergunta.campo_contato) continue
    const valor = respostas[pergunta.id]
    if (valor === undefined || Array.isArray(valor)) continue
    const texto = String(valor).trim()
    if (texto) contato[pergunta.campo_contato] = texto
  }

  const telefoneNormalizado = normalizePhoneBR(contato.telefone)

  // ─── Score ────────────────────────────────────────────────────────────────
  // Calculado sempre, gravado só ao finalizar. NÃO decide nada: a agenda
  // aparece para todos (Epic 89, D2). Ver o cabeçalho de lib/forms/score.ts.
  const { score } = calcularScore(schema, respostas)

  const completo = formularioCompleto(schema, respostas)
  const querFinalizar = body.finalizar === true
  if (querFinalizar) {
    if (!completo) {
      return NextResponse.json({ error: "Ainda faltam respostas obrigatórias." }, { status: 400 })
    }
    // AC7: sem aceite não finaliza. O banco também recusa (CHECK
    // lead_form_responses_completa_exige_lgpd) — aqui é para dar mensagem boa.
    if (body.lgpd_aceito !== true) {
      return NextResponse.json({ error: "É preciso aceitar a política de privacidade." }, { status: 400 })
    }
    if (!contato.nome || !telefoneNormalizado) {
      return NextResponse.json({ error: "Informe nome e telefone válidos." }, { status: 400 })
    }
  }

  // ─── Lead: nasce assim que há nome + telefone, mesmo sem finalizar ─────────
  if (!leadId && contato.nome && telefoneNormalizado) {
    const utm = body.utm ?? {}
    const { data: existente } = await admin
      .from("leads")
      .select("id")
      .eq("org_id", form.org_id)
      .eq("phone_normalized", telefoneNormalizado)
      .limit(1)
      .maybeSingle()

    if (existente) {
      leadId = existente.id as string
      // Lead que já existia NÃO tem a origem reescrita: quem chegou antes pelo
      // Meta Ads continua sendo do Meta Ads. Só completamos o que falta.
      await admin
        .from("leads")
        .update({
          ...(contato.email ? { email: contato.email } : {}),
          last_contact_at: new Date().toISOString(),
        })
        .eq("id", leadId)
    } else {
      const { data: novo, error: erroLead } = await admin
        .from("leads")
        .insert({
          org_id: form.org_id,
          name: contato.nome,
          phone: contato.telefone,
          email: contato.email ?? null,
          // Origem PRÓPRIA — ver 231_lead_source_form_qualificacao.sql.
          source: "form_qualificacao",
          // Nunca criar lead com stage null (Story 75-218): fica invisível no
          // Pipeline. Mesma decisão compartilhada dos outros pontos de entrada.
          stage_id: await getDefaultStageId(admin, form.org_id),
          // AC6: colunas DEDICADAS, não metadata.
          utm_source: utm.utm_source ?? null,
          utm_medium: utm.utm_medium ?? null,
          utm_campaign: utm.utm_campaign ?? null,
          utm_content: utm.utm_content ?? null,
          utm_term: utm.utm_term ?? null,
          metadata: { form_id: form.id, form_nome: form.nome },
        })
        .select("id")
        .single()
      if (erroLead || !novo) {
        console.error("[formulario] falha ao criar lead:", erroLead)
        return NextResponse.json(
          { error: "Não foi possível registrar seus dados. Tente novamente." },
          { status: 500 }
        )
      }
      leadId = novo.id as string
    }
  }

  // ─── Grava a resposta ─────────────────────────────────────────────────────
  const agora = new Date().toISOString()
  const camposResposta = {
    lead_id: leadId,
    answers: respostas,
    metadata: { ...(body.utm ? { utm: body.utm } : {}) },
    ...(querFinalizar
      ? { status: "completa" as const, score, completed_at: agora, lgpd_aceito_em: agora }
      : { status: "parcial" as const }),
  }

  let tokenDaSessao = sessionToken
  if (respostaId) {
    const { error } = await admin.from("lead_form_responses").update(camposResposta).eq("id", respostaId)
    if (error) {
      console.error("[formulario] falha ao atualizar resposta:", error)
      return NextResponse.json({ error: "Não foi possível salvar. Tente novamente." }, { status: 500 })
    }
  } else {
    const { data, error } = await admin
      .from("lead_form_responses")
      .insert({ org_id: form.org_id, form_id: form.id, ...camposResposta })
      .select("id, session_token")
      .single()
    if (error || !data) {
      console.error("[formulario] falha ao criar resposta:", error)
      return NextResponse.json({ error: "Não foi possível salvar. Tente novamente." }, { status: 500 })
    }
    respostaId = data.id as string
    tokenDaSessao = data.session_token as string
  }

  // ─── Score na ficha do lead ───────────────────────────────────────────────
  // AC5: o corretor já olha `leads.qualification_score` (0–100, com faixa de
  // cor). Escrever só na tabela de respostas deixaria a tela dele vazia.
  if (querFinalizar && leadId) {
    await admin
      .from("leads")
      .update({ qualification_score: score, last_contact_at: agora })
      .eq("id", leadId)

    // `activities.type` é varchar livre (001:266), não enum. Tipo descritivo,
    // no padrão de `lead_reactivated`/`appointment_created`.
    // ⚠️ Este tipo NÃO dispara o trigger de `last_contact_at` (152), que só
    // reage a 'broker_note'/'note_added' — por isso a coluna é escrita
    // explicitamente logo abaixo. Preencher o formulário É contato do lead.
    await admin.from("activities").insert({
      org_id: form.org_id,
      lead_id: leadId,
      type: "form_completed",
      description: `Formulário de qualificação preenchido: ${form.nome}`,
      metadata: { form_id: form.id, response_id: respostaId, score },
    })
  }

  return NextResponse.json({
    session_token: tokenDaSessao,
    status: querFinalizar ? "completa" : "parcial",
    ...(querFinalizar ? { mensagem_final: schema.mensagem_final ?? null } : {}),
  })
}
