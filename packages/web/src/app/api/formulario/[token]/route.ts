import { NextRequest, NextResponse, after } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getDefaultStageId } from "@web/lib/leads/default-stage"
import { parseFormSchema, type FormSchema } from "@web/lib/forms/schema"
import { limparRespostas, formularioCompleto, type Respostas } from "@web/lib/forms/branching"
import { calcularScore } from "@web/lib/forms/score"
import { analisarRespostasAbertas } from "@web/lib/forms/ai-reading"
import { criarRateLimit, ipDaRequisicao } from "@web/lib/forms/rate-limit"
import {
  extrairSinais,
  enviarEventoFormulario,
  comMetaAd,
  type CorpoTracking,
} from "@web/lib/meta/form-capi"
import { normalizePhoneBR, FORM_CAPI_EVENTS } from "@trifold/shared"

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
// Story 86-9: a implementação saiu daqui para `lib/forms/rate-limit.ts`, sem
// mudança de comportamento — a rota nova de tracking do formulário precisa da
// mesma proteção, e duplicar o Map com poda em dois arquivos era pedir para os
// dois divergirem. Todos os avisos (limite por instância na Vercel, poda
// obrigatória para não vazar memória com IPs de tráfego pago) estão lá.
const checkRateLimit = criarRateLimit(30)

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
  /** Story 86-9 — sinais de atribuição lidos no browser (`_fbp`, `_fbc`, `fbclid`). */
  tracking?: CorpoTracking
  /**
   * Story 86-9 — ids gerados NO BROWSER para deduplicar com o disparo do Pixel.
   * O browser propõe os ids; QUEM DECIDE se o evento sai é o servidor, com base
   * no que de fato aconteceu (o lead nasceu? a resposta foi finalizada?). Um
   * endpoint público que aceitasse "dispare um Lead" seria um canal aberto para
   * inflar conversão de graça.
   */
  event_ids?: {
    lead?: string
    complete_registration?: string
  }
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

  // Story 86-9 — sinais de atribuição: metade veio do browser no corpo, metade
  // só o servidor enxerga (IP, User-Agent). Colhidos antes de qualquer escrita.
  const sinais = extrairSinais(request, body.tracking)
  const urlPadrao = new URL(`/formulario/${token}`, request.url).toString()
  // O `Lead` só sai no POST em que o lead REALMENTE nasce (ou é vinculado à
  // sessão pela primeira vez). O formulário salva parcial a cada passo e no
  // `visibilitychange`: sem esta trava, uma pessoa geraria cinco `Lead`.
  let leadVinculadoAgora = false
  // Eventos que o servidor DE FATO enviou neste POST. O browser espelha esta
  // lista para disparar o Pixel com o mesmo `event_id` — se ele decidisse
  // sozinho, bastaria um telefone que o servidor recusou para os dois lados
  // divergirem: o Meta contaria duas conversões em vez de deduplicar uma.
  const eventosDisparados: string[] = []

  // ─── Lead: nasce assim que há nome + telefone, mesmo sem finalizar ─────────
  if (!leadId && contato.nome && telefoneNormalizado) {
    const utm = body.utm ?? {}
    const { data: existente } = await admin
      .from("leads")
      .select("id, source, utm_content, metadata")
      .eq("org_id", form.org_id)
      .eq("phone_normalized", telefoneNormalizado)
      .limit(1)
      .maybeSingle()

    if (existente) {
      leadId = existente.id as string

      // 🔴 Story 75-340 — a origem passa a ser a do ÚLTIMO contato. Até aqui o
      // lead que já existia mantinha a origem antiga, e a ficha mostrava
      // "LP Vind Residence" (source=website + utm_content) para quem tinha
      // ACABADO de preencher o formulário — o corretor lia a origem errada e
      // ligava falando da campanha errada. Decisão do diretor (18/08): vale o
      // último lugar por onde a pessoa chegou.
      //
      // A origem anterior não se perde: vai para `metadata.origem_anterior` e
      // para a activity `lead_source_updated` abaixo.
      const sourceAnterior = (existente.source as string | null) ?? null
      const metadataAtual = (existente.metadata as Record<string, unknown> | null) ?? {}
      const trocouOrigem = sourceAnterior !== "form_qualificacao"
      const agoraIso = new Date().toISOString()

      leadVinculadoAgora = true
      await admin
        .from("leads")
        .update({
          ...(contato.email ? { email: contato.email } : {}),
          source: "form_qualificacao",
          // UTM só é sobrescrita quando ESTA visita trouxe UTM — link sem
          // parâmetro não deve apagar a atribuição que já existia.
          ...(utm.utm_source ? { utm_source: utm.utm_source } : {}),
          ...(utm.utm_medium ? { utm_medium: utm.utm_medium } : {}),
          ...(utm.utm_campaign ? { utm_campaign: utm.utm_campaign } : {}),
          ...(utm.utm_content ? { utm_content: utm.utm_content } : {}),
          ...(utm.utm_term ? { utm_term: utm.utm_term } : {}),
          // Story 75-340 monta a origem nova + `origem_anterior`; a 86-9 acrescenta
          // `meta_ad` por cima. `comMetaAd` só adiciona a sua chave e preserva o
          // resto do objeto, então as duas lógicas convivem sem se anular.
          metadata: comMetaAd(
            {
              ...metadataAtual,
              form_id: form.id,
              form_nome: form.nome,
              ...(trocouOrigem
                ? {
                    origem_anterior: {
                      source: sourceAnterior,
                      utm_content: (existente.utm_content as string | null) ?? null,
                      em: agoraIso,
                    },
                  }
                : {}),
            },
            sinais,
          ),
          last_contact_at: agoraIso,
        })
        .eq("id", leadId)

      if (trocouOrigem) {
        await admin.from("activities").insert({
          org_id: form.org_id,
          lead_id: leadId,
          type: "lead_source_updated",
          description: `Origem atualizada para o formulário "${form.nome}"`,
          metadata: {
            form_id: form.id,
            source_anterior: sourceAnterior,
            source_novo: "form_qualificacao",
          },
        })
      }
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
          // Story 86-9 — `meta_ad` entra já no nascimento do lead: é o que faz o
          // evento "Visitou" (cron meta-capi-dispatch, dias depois) sair COM
          // fbc/fbp/IP/UA. Até aqui aquele cron lia um campo que ninguém escrevia.
          metadata: comMetaAd({ form_id: form.id, form_nome: form.nome }, sinais),
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
      leadVinculadoAgora = true
    }
  }

  // ─── Story 86-9 (AC6) — evento `Lead` para o Meta ─────────────────────────
  // Sai uma única vez, no POST em que o lead passou a existir para esta sessão.
  // O `event_id` é o mesmo que o Pixel usou no browser: o Meta deduplica os dois
  // e fica com a união dos sinais (browser traz fbp/fbc; aqui vêm telefone e
  // nome hasheados, UF, IP e User-Agent).
  if (leadVinculadoAgora && leadId && body.event_ids?.lead) {
    const idDoEvento = body.event_ids.lead
    const dadosLead = {
      leadId,
      nome: contato.nome,
      email: contato.email,
      telefone: telefoneNormalizado ?? contato.telefone,
    }
    // `after()`, nunca `void`: na Vercel a invocação congela quando a resposta
    // sai, e o envio morreria no meio — sem erro, sem evento. Ver form-capi.ts.
    after(async () => {
      await enviarEventoFormulario({
        evento: FORM_CAPI_EVENTS.LEAD,
        eventId: idDoEvento,
        sinais,
        lead: dadosLead,
        contentName: form.nome,
        urlPadrao,
      })
    })
    eventosDisparados.push(FORM_CAPI_EVENTS.LEAD)
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

    // ─── Story 86-9 (AC6) — evento `CompleteRegistration` ───────────────────
    // O lead qualificado: formulário inteiro respondido, com aceite LGPD. Leva o
    // `qualification_score` em `value` — é o sinal que permite, mais adiante,
    // otimizar a campanha por qualidade e não só por volume.
    // O guard de `status === "completa"` no início da rota impede repetição.
    if (body.event_ids?.complete_registration) {
      const idDoEvento = body.event_ids.complete_registration
      const dadosLead = {
        leadId,
        nome: contato.nome,
        email: contato.email,
        telefone: telefoneNormalizado ?? contato.telefone,
      }
      after(async () => {
        await enviarEventoFormulario({
          evento: FORM_CAPI_EVENTS.COMPLETE_REGISTRATION,
          eventId: idDoEvento,
          sinais,
          lead: dadosLead,
          contentName: form.nome,
          value: score,
          urlPadrao,
        })
      })
      eventosDisparados.push(FORM_CAPI_EVENTS.COMPLETE_REGISTRATION)
    }

    // Story 75-332 — a IA lê as respostas ABERTAS depois de responder ao lead
    // (AC3: o clique em "Enviar" não espera o modelo).
    //
    // 🔴 `after()`, NÃO `void`. Um `void` solto aqui reintroduziria o bug da
    // Story 75-139: na Vercel a invocação é congelada assim que a resposta sai,
    // e o trabalho pendente morre no meio — foi assim que o e-mail de reset
    // nunca era enviado. `after()` roda depois da resposta E mantém a invocação
    // viva até terminar. Com um round-trip de até 15s ao modelo, a diferença
    // não é teórica: seria a leitura nunca acontecendo, em silêncio.
    after(async () => {
      await analisarRespostasAbertas({
        admin,
        schema,
        respostas,
        score,
        leadId,
        respostaId,
        orgId: form.org_id,
      }).catch((e: unknown) => console.error("[formulario] leitura por IA:", e))
    })
  }

  return NextResponse.json({
    session_token: tokenDaSessao,
    status: querFinalizar ? "completa" : "parcial",
    // Story 86-9 — o browser dispara no Pixel exatamente estes, com os mesmos ids.
    eventos: eventosDisparados,
    ...(querFinalizar
      ? {
          mensagem_final: schema.mensagem_final ?? null,
          // Story 75-331 — avisa a tela se o próximo passo é a agenda. Sai daqui
          // (e não de uma segunda chamada) para não piscar entre telas.
          agenda_ativa: schema.agenda?.ativa === true,
        }
      : {}),
  })
}
