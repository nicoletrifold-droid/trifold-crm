import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEvent, logEventOnce } from "@web/lib/logger"
import {
  claimCronRun,
  finishCronRun,
  INTERVALO_MINIMO_FOLLOWUP_SEGUNDOS,
} from "@web/lib/cron/claim-run"
import { claimFollowUp, fecharClaim } from "@web/lib/followup/claim"
import { decidirAcaoDoFollowUp } from "@web/lib/followup/decidir-acao"
import {
  decidirTemplateDoFollowUp,
  podeFollowUpSemConversa,
} from "@web/lib/followup/template-fallback"
import {
  listApprovedOpeningTemplates,
  renderOpeningBody,
} from "@web/lib/whatsapp/opening-templates"
import { notifyBrokerOfStalledLead } from "@web/lib/broker/notify-stalled-lead"
import { isWithinWhatsAppWindow } from "@web/lib/broker/dispatch-broker-message"
import { sendWhatsAppMessage } from "@web/lib/whatsapp/send-whatsapp-message"
import { sendFollowUpMessage } from "@web/lib/whatsapp/send-followup-message"
import { registroDoPosVisita } from "@web/lib/appointments/post-visit-record"

const CRON_SECRET = process.env.CRON_SECRET
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

/**
 * Resolve the display name of the broker assigned to a lead (Story 59-1).
 * Returns the broker's name or "" when no broker is assigned or the query fails.
 * Never throws — a missing name must not break the follow-up loop.
 */
export async function resolveBrokerName(
  supabase: SupabaseClient,
  assignedBrokerId: string | null
): Promise<string> {
  if (!assignedBrokerId) return ""
  try {
    const { data } = await supabase
      .from("users")
      .select("name")
      .eq("id", assignedBrokerId)
      .maybeSingle()
    return (data as { name?: string | null } | null)?.name ?? ""
  } catch {
    return ""
  }
}

/**
 * Follow-up cron engine.
 * GET /api/cron/followup (Vercel Cron sends GET requests)
 *
 * For each active follow_up_rule:
 * - Find leads in that stage where last message is older than alert_days / nicole_takeover_days
 * - If broker hasn't sent a message since last lead/Nicole message:
 *   - alert_days exceeded → create follow_up_log entry type='alert_broker'
 *   - nicole_takeover_days exceeded → render template, send via Telegram, create log type='nicole_sent'
 * - Respect: max 1 followup per lead per 48h, business hours only
 */
export async function GET(request: NextRequest) {
  // Validate cron secret — fail-closed
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("CRON_SECRET not configured — endpoint blocked")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  const now = new Date()
  const currentHour = now.getUTCHours() - 3 // BRT offset
  const normalizedHour = currentHour < 0 ? currentHour + 24 : currentHour

  // Business hours: 8h-20h BRT
  if (normalizedHour < 8 || normalizedHour >= 20) {
    return NextResponse.json({
      processed: 0,
      alerts_created: 0,
      messages_sent: 0,
      skipped_reason: "outside_business_hours",
    })
  }

  // Story 75-352 — este cron estava sendo invocado DUAS vezes por agendamento.
  // A prova em produção (system_events, 19/08 22:01:10): dois recibos
  // `FOLLOWUP_EXECUTED` no mesmo segundo, "98 processed" e "99 processed" — duas
  // execuções concorrentes, intercaladas lead a lead. O manifesto de cron da
  // Vercel tem a rota UMA vez, `cron.job` não a chama e existe um só projeto: o
  // segundo gatilho é externo ao repo. A trava não depende de descobrir qual é.
  //
  // A trava vem DEPOIS do horário comercial de propósito: run fora de janela não
  // faz nada e não deve consumir o intervalo da run válida.
  const { runId, claimed } = await claimCronRun(
    supabase,
    "followup",
    INTERVALO_MINIMO_FOLLOWUP_SEGUNDOS
  )

  if (!claimed) {
    // `logEventOnce` porque este é a ÚLTIMA escrita antes do response: o
    // `logEvent` fire-and-forget morre no congelamento da lambda (Story 87-6),
    // e aí a duplicata voltaria a ser invisível — que é o problema todo.
    await logEventOnce({
      level: "warn",
      category: "cron",
      event_type: "FOLLOWUP_RUN_DUPLICADA",
      message: "Invocação duplicada do cron de follow-up — run anterior ainda dentro do intervalo mínimo. Nada foi processado.",
      metadata: { job: "followup", intervalo_minimo_s: INTERVALO_MINIMO_FOLLOWUP_SEGUNDOS },
      source: "api/cron/followup",
    })

    return NextResponse.json({
      processed: 0,
      alerts_created: 0,
      messages_sent: 0,
      skipped_reason: "already_running",
    })
  }

  let alertsCreated = 0
  // Story 75-351 — `messagesSent` contava LEADS PROCESSADOS, não mensagens
  // entregues: o `++` fica depois das duas ramificações (enviou / pulou). O recibo
  // da run de 19/08 20:02 dizia "16 messages" com **zero** entregas — 84 puladas
  // por janela de 24h fechada. Quem lesse o log concluiria que o follow-up estava
  // funcionando. Agora são dois números, e o nome de cada um diz o que ele é.
  let messagesSent = 0
  let messagesSkipped = 0
  let processed = 0
  // Story 75-352 — leads que outra invocação já havia reivindicado. Zero é o
  // estado saudável; qualquer número acima disso é a prova de que a duplicata
  // continua chegando (e de que o claim está segurando).
  let duplicatasEvitadas = 0
  // Story 75-353 — entregues POR TEMPLATE (fora da janela de 24h). Antes desta
  // story este número não existia porque não podia: 20 dias, 0 entregas.
  let entregasPorTemplate = 0

  // Fetch all active follow-up rules with stage info
  const { data: rules, error: rulesError } = await supabase
    .from("follow_up_rules")
    .select("*, stage:kanban_stages(id, name, slug)")
    .eq("is_active", true)

  if (rulesError || !rules) {
    return NextResponse.json(
      { error: rulesError?.message ?? "No rules found" },
      { status: 500 }
    )
  }

  // Story 75-353 — corpo REAL dos templates aprovados, uma chamada por run (não
  // por lead). Só acontece se alguma regra optou por template; sem isso, zero
  // chamada extra e comportamento idêntico ao anterior.
  //
  // Aprovação é fato da Meta, não do banco: se a listagem falhar, NENHUM template
  // sai nesta run (fail-closed no caminho de template — o texto livre dentro da
  // janela segue normal). Mandar sem validar renderia erro 132000 pago.
  const templatesConfigurados = (rules as Array<{ hsm_template?: string | null; is_active?: boolean }>)
    .some((r) => !!r.hsm_template)
  const corpoDoTemplate = new Map<string, string>()

  if (templatesConfigurados) {
    const { data: waCfg } = await supabase
      .from("whatsapp_config")
      .select("waba_id, access_token")
      .eq("status", "active")
      .maybeSingle()

    if (waCfg?.waba_id && waCfg?.access_token) {
      try {
        for (const t of await listApprovedOpeningTemplates(waCfg.waba_id, waCfg.access_token)) {
          corpoDoTemplate.set(t.name, t.body)
        }
      } catch (err) {
        logEvent({
          level: "error",
          category: "cron",
          event_type: "FOLLOWUP_TEMPLATES_INDISPONIVEIS",
          message: `Não foi possível listar templates aprovados na Meta — nenhum envio por template nesta run: ${err instanceof Error ? err.message : String(err)}`,
          metadata: { erro: err instanceof Error ? err.message : String(err) },
          source: "api/cron/followup",
        })
      }
    }
  }
  const templatesAprovados = new Set(corpoDoTemplate.keys())

  for (const rule of rules) {
    const stageArr = rule.stage as unknown as Array<{ id: string; name: string; slug: string }> | null
    const stage = Array.isArray(stageArr) ? stageArr[0] : stageArr

    if (!stage) continue

    // Story 75-118: lead em Perdido é terminal para a automação — a Nicole não
    // manda follow-up de lead perdido. Pula qualquer regra que aponte para Perdido.
    if (rule.stage_id === STAGE_IDS.perdido) continue

    // Find leads in this stage
    const { data: leads } = await supabase
      .from("leads")
      .select(
        `id, name, phone, org_id, assigned_broker_id, property_interest_id, last_contact_at,
         marketing_optout_at, nicole_followup_off_at, created_at,
         properties:property_interest_id(name)`
      )
      .eq("org_id", rule.org_id)
      .eq("stage_id", rule.stage_id)
      .eq("is_active", true)
      .eq("segmento", "principal") // Story 75-98: follow-up é do mundo principal, nunca IMOB

    if (!leads || leads.length === 0) continue

    const leadIds = leads.map((l) => l.id)
    const cooldownDate = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    // Batch: fetch all leads in cooldown with a single query
    const { data: inCooldown } = await supabase
      .from("follow_up_log")
      .select("lead_id")
      .in("lead_id", leadIds)
      .gte("created_at", cooldownDate.toISOString())

    const cooldownSet = new Set((inCooldown ?? []).map((r) => r.lead_id))
    const eligibleLeads = leads.filter((l) => !cooldownSet.has(l.id))

    // Story 75-353 — cap de frequência do template: quando o lead recebeu o
    // ÚLTIMO template desta esteira. Em lote, uma query por regra, e só quando a
    // regra usa template. O cooldown de 48h acima é curto demais para marketing:
    // sem este teto, lead frio receberia template a cada 2 dias para sempre.
    const hsmTemplate = (rule as { hsm_template?: string | null }).hsm_template ?? null
    const hsmMinDays = (rule as { hsm_min_days?: number }).hsm_min_days ?? 7
    const ultimoTemplatePorLead = new Map<string, string>()

    if (hsmTemplate && eligibleLeads.length > 0) {
      const desde = new Date(now.getTime() - Math.max(hsmMinDays, 0) * 24 * 60 * 60 * 1000)
      const { data: enviosDeTemplate } = await supabase
        .from("follow_up_log")
        .select("lead_id, created_at, metadata")
        .in("lead_id", eligibleLeads.map((l) => l.id))
        .not("metadata->>template", "is", null)
        .gte("created_at", desde.toISOString())
        .order("created_at", { ascending: false })

      for (const linha of enviosDeTemplate ?? []) {
        const id = (linha as { lead_id: string }).lead_id
        if (!ultimoTemplatePorLead.has(id)) {
          ultimoTemplatePorLead.set(id, (linha as { created_at: string }).created_at)
        }
      }
    }

    if (eligibleLeads.length === 0) continue

    // Batch: fetch latest conversation per eligible lead in one query.
    // last_message_at is the source of truth for the WhatsApp 24h window (AC6).
    const eligibleIds = eligibleLeads.map((l) => l.id)
    const { data: allConversations } = await supabase
      .from("conversations")
      .select("id, lead_id, last_message_at")
      .in("lead_id", eligibleIds)
      .order("last_message_at", { ascending: false })

    const latestConvByLead = new Map<string, { id: string; last_message_at: string | null }>()
    for (const conv of allConversations ?? []) {
      if (!latestConvByLead.has(conv.lead_id)) {
        latestConvByLead.set(conv.lead_id, { id: conv.id, last_message_at: conv.last_message_at })
      }
    }

    for (const lead of eligibleLeads) {
      processed++

      const latestConv = latestConvByLead.get(lead.id)
      let conversationId = latestConv?.id
      const conversationLastMessageAt = latestConv?.last_message_at ?? null

      // Story 75-355 — sem conversa NÃO é mais descarte automático. Era:
      // `if (!conversationId) continue`, e isso excluía 37 dos 47 leads que batem
      // o gatilho na etapa Atendimento (medido em 20/08) — gente de tráfego pago
      // com telefone, que nunca trocou uma mensagem com a empresa. É justamente
      // quem só alcança por template: quem nunca escreveu tem a janela de 24h
      // fechada por definição.
      //
      // A liberação é estreita: só segue sem conversa quando a etapa tem template
      // E o lead passou do limiar da MENSAGEM (não do alerta). O ramo de
      // `alert_broker` continua exigindo conversa, para não virar rajada de
      // notificação ao corretor.
      const referenciaDeContato =
        (lead as { last_contact_at?: string | null }).last_contact_at ??
        (lead as { created_at?: string | null }).created_at ??
        now.toISOString()
      const diasSemContatoPreliminar =
        (now.getTime() - new Date(referenciaDeContato).getTime()) / (1000 * 60 * 60 * 24)

      if (
        !podeFollowUpSemConversa({
          temConversa: !!conversationId,
          hsmTemplate: (rule as { hsm_template?: string | null }).hsm_template ?? null,
          atingiuTakeover: diasSemContatoPreliminar >= rule.nicole_takeover_days,
        })
      ) {
        continue
      }

      // Get the last message from the conversation (quando ela existe)
      const { data: lastMessages } = conversationId
        ? await supabase
            .from("messages")
            .select("role, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(10)
        : { data: [] as Array<{ role: string; created_at: string }> }

      // Conversa existente porém vazia segue sendo descarte: é estado
      // inconsistente, não lead novo. Sem conversa, a lista vazia é o normal.
      if (conversationId && (!lastMessages || lastMessages.length === 0)) continue

      const lastMessage = lastMessages && lastMessages.length > 0 ? lastMessages[0]! : null
      const daysSinceLastMessage = lastMessage
        ? (now.getTime() - new Date(lastMessage.created_at).getTime()) / (1000 * 60 * 60 * 24)
        : diasSemContatoPreliminar

      // Story 75-110: os limiares de follow-up usam o ÚLTIMO CONTATO real (mensagem OU registro
      // manual no Histórico), via leads.last_contact_at — não só a última mensagem. Assim, um
      // contato manual ("liguei, sem retorno") adia o follow-up automático. A janela de 24h do
      // WhatsApp (brokerSentRecently / isWithinWhatsAppWindow) segue baseada na MENSAGEM real.
      const lastContactRef =
        (lead as { last_contact_at?: string | null }).last_contact_at ??
        lastMessage?.created_at ??
        referenciaDeContato
      const daysSinceLastContact = (now.getTime() - new Date(lastContactRef).getTime()) / (1000 * 60 * 60 * 24)

      // Check if broker sent a message in the last 24h — if yes, broker owns the conversation until tomorrow
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      // Story 75-355 — sem conversa não há mensagem de corretor, então a lista
      // vazia é o estado correto: `false`, e o follow-up segue.
      const brokerSentRecently = (lastMessages ?? []).some(
        (m) => m.role === "broker" && new Date(m.created_at) > oneDayAgo
      )

      if (brokerSentRecently) continue // Broker is handling, skip follow-up

      // Resolve property name for template
      const propertyArr = lead.properties as unknown as Array<{ name: string }> | null
      const propertyName = Array.isArray(propertyArr)
        ? propertyArr[0]?.name ?? "seu imóvel"
        : (propertyArr as { name: string } | null)?.name ?? "seu imóvel"

      // Resolve broker name for template — Story 59-1 (AC3)
      const brokerName = await resolveBrokerName(
        supabase,
        (lead as { assigned_broker_id?: string | null }).assigned_broker_id ?? null
      )

      // Story 75-368 — a equipe pode desligar o follow-up da Nicole POR LEAD.
      //
      // POR QUE a decisao mora AQUI e nao num `.eq()` na consulta de leads la em
      // cima: aquela consulta alimenta os DOIS ramos deste if/else. Filtrar nela
      // mataria tambem o `alert_broker`, e quem desligou a Nicole foi quem vai
      // atender na mao — e exatamente quem mais precisa do lembrete. Negando aqui,
      // o lead deixa de entrar no ramo da Nicole e CASCATEIA para o `else if`
      // abaixo. Nao "simplifique" isto para a query.
      //
      // A regra em si vive numa funcao pura, testada sem banco (mesmo desenho da
      // `decidirTemplateDoFollowUp`, Story 75-353).
      const acao = decidirAcaoDoFollowUp({
        diasSemContato: daysSinceLastContact,
        nicoleTakeoverDays: rule.nicole_takeover_days,
        alertDays: rule.alert_days,
        nicoleFollowUpOffAt:
          (lead as { nicole_followup_off_at?: string | null }).nicole_followup_off_at ?? null,
        // H1 (revisao @qa) — o ramo do alerta sempre exigiu conversa; ate a 75-368
        // isso era garantido por construcao. Ver decidir-acao.ts.
        temConversa: !!conversationId,
      })

      // Check nicole_takeover_days first (more severe)
      if (acao === "nicole") {
        // Story 75-352 — a linha nasce ANTES do envio. O `cooldownSet` acima é só
        // um pré-filtro em lote (barato, evita 800 RPCs); quem decide é este claim,
        // que é atômico por lead. `blockingTypes: null` preserva a semântica do
        // pré-filtro: qualquer tipo de follow-up nas últimas 48h bloqueia.
        const claimId = await claimFollowUp({
          supabase,
          orgId: rule.org_id,
          leadId: lead.id,
          type: "nicole_sent",
          ruleId: rule.id,
          metadata: { stage_id: rule.stage_id, origem: "cron" },
          blockingTypes: null,
        })

        if (!claimId) {
          // Outra invocação já reivindicou este lead (ou o cooldown subiu entre o
          // pré-filtro e agora). Nada é enviado — e o número aparece no recibo,
          // porque duplicata evitada é a métrica que prova que esta story funciona.
          duplicatasEvitadas++
          continue
        }

        // Render template
        const message = (rule.message_template || "")
          .replace(/\{nome\}/g, lead.name || "")
          .replace(/\{empreendimento\}/g, propertyName)
          .replace(/\{corretor\}/g, brokerName)

        // Story 75-353 — o que fazer se a janela de 24h estiver fechada. A regra
        // inteira (opt-out, cap de frequência, template conhecido e aprovado) mora
        // numa função pura, testada sem banco e sem rede.
        const decisao = decidirTemplateDoFollowUp({
          hsmTemplate,
          hsmMinDays,
          marketingOptOutAt: (lead as { marketing_optout_at?: string | null }).marketing_optout_at ?? null,
          ultimoTemplateEm: ultimoTemplatePorLead.get(lead.id) ?? null,
          templatesAprovados,
          contexto: { nomeLead: lead.name || "", corretor: brokerName, empreendimento: propertyName },
          now,
        })

        // Send via the correct channel (Telegram or WhatsApp). Dentro da janela vai
        // texto livre, como sempre; fora dela, o template aprovado (quando a decisão
        // permite) — que é o que transforma "0 entregas em 20 dias" em entrega.
        const result = await sendFollowUpMessage(
          supabase,
          rule.org_id,
          lead.phone,
          message,
          conversationLastMessageAt,
          now,
          decisao.enviar
            ? {
                name: decisao.template!,
                params: decisao.params!,
                // `abertura_*` é MARKETING na Meta — mesma categoria que o botão
                // manual "Iniciar atendimento" já registra (start-whatsapp).
                category: "marketing",
                recipientType: "lead",
              }
            : null
        )

        // O texto que o lead REALMENTE leu: fora da janela é o corpo do template
        // renderizado (vindo da Meta nesta run), não o texto livre que não saiu.
        const textoEntregue =
          result.via === "template" && result.template
            ? renderOpeningBody(corpoDoTemplate.get(result.template) ?? "", decisao.params ?? [])
            : message

        // follow_up_log status reflects the send outcome (AC4/T3):
        //  - sent ok                  → status='sent'
        //  - WhatsApp window closed   → status='skipped' + metadata.reason
        //  - other failure (best-effort) → status='sent' (message stored, retry by broker)
        const skipped = !result.sent && result.reason === "WHATSAPP_WINDOW_CLOSED"
        // Story 75-352 — a linha já existe (o claim a criou antes do envio); aqui
        // só se grava o DESFECHO. A diferença prática em relação à 75-351: falhar
        // nesta escrita não solta mais o cooldown, porque o cooldown é a linha, não
        // o desfecho. Continua gritando — 'claimed' preso é sinal de run morta.
        await fecharClaim(supabase, claimId, {
          status: skipped ? "skipped" : "sent",
          sentAt: result.sent ? now.toISOString() : null,
          message: textoEntregue,
          metadata: {
            stage_id: rule.stage_id,
            origem: "cron",
            channel: result.channel,
            ...(result.via ? { via: result.via } : {}),
            // `template` no metadata é o que o cap de frequência lê na próxima run.
            ...(result.template ? { template: result.template } : {}),
            ...(skipped && decisao.motivo ? { motivo_sem_template: decisao.motivo } : {}),
            ...(skipped && decisao.diasRestantes ? { dias_para_novo_template: decisao.diasRestantes } : {}),
            ...(skipped ? { reason: result.reason } : {}),
          },
        })

        if (result.sent) {
          logEvent({
            level: "info",
            category: "cron",
            event_type: "FOLLOWUP_MESSAGE_SENT",
            message: `Follow-up sent to lead ${lead.id} via ${result.channel}`,
            metadata: { lead_id: lead.id, type: "nicole_sent", stage: stage.name, channel: result.channel },
            source: "api/cron/followup",
          })
        } else {
          logEvent({
            level: "info",
            category: "cron",
            event_type: "FOLLOWUP_MESSAGE_SKIPPED",
            message: `Follow-up NOT sent to lead ${lead.id} via ${result.channel}: ${result.reason}`,
            metadata: { lead_id: lead.id, type: "nicole_sent", stage: stage.name, channel: result.channel, reason: result.reason },
            source: "api/cron/followup",
          })
        }

        // For the WhatsApp window-closed case the lead never received freeform
        // text, so we must NOT persist it as a delivered assistant message.
        // Story 75-355 — lead sem conversa que RECEBEU o template ganha a conversa
        // agora, para que a mensagem tenha onde morar e a resposta dele caia no
        // fluxo normal da Nicole. Mesmo padrão do botão manual "Iniciar
        // atendimento" (start-whatsapp), que já cria a conversa quando falta.
        //
        // Só cria quando houve ENTREGA de fato: conversa criada por tentativa que
        // falhou seria conversa fantasma na tela do corretor.
        if (!conversationId && result.sent) {
          const { data: novaConversa, error: erroConversa } = await supabase
            .from("conversations")
            .insert({ org_id: rule.org_id, lead_id: lead.id, channel: "whatsapp", status: "active" })
            .select("id")
            .single()

          if (erroConversa || !novaConversa) {
            logEvent({
              level: "error",
              category: "cron",
              event_type: "FOLLOWUP_CONVERSA_NAO_CRIADA",
              message: `Template entregue ao lead ${lead.id}, mas a conversa não foi criada: ${erroConversa?.message ?? "sem retorno"}`,
              metadata: { lead_id: lead.id, template: result.template, erro: erroConversa?.message },
              org_id: rule.org_id,
              source: "api/cron/followup",
            })
          } else {
            conversationId = novaConversa.id as string
          }
        }

        if (!skipped && conversationId) {
          // Save message to conversation history (regardless of transport send status)
          // Story 75-353 — `textoEntregue`: quando saiu por template, a conversa
          // mostra o CORPO DO TEMPLATE que o lead leu, não o texto livre que ficou
          // no caminho. Espelho fiel é a regra desde a 75-166.
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: textoEntregue,
            metadata: {
              source: "followup_cron",
              rule_id: rule.id,
              channel: result.channel,
              sent: result.sent,
              ...(result.via ? { via: result.via } : {}),
              ...(result.template ? { template: result.template } : {}),
            },
          })

          // Update conversation timestamp
          await supabase
            .from("conversations")
            .update({ last_message_at: now.toISOString() })
            .eq("id", conversationId)
        }

        // Create activity log
        // Story 75-353 — a atividade diz COMO saiu (ou por que não): quem lê a
        // ficha do lead precisa distinguir "conversa normal" de "template pago", e
        // "janela fechada" de "lead pediu para parar".
        const motivoLegivelSemTemplate: Record<string, string> = {
          REGRA_SEM_TEMPLATE: "sem template configurado na etapa",
          LEAD_EM_OPT_OUT: "lead pediu para nao receber",
          CAP_DE_FREQUENCIA: `ja recebeu template nos ultimos ${hsmMinDays} dia(s)`,
          TEMPLATE_DESCONHECIDO: "template nao reconhecido pelo codigo",
          TEMPLATE_NAO_APROVADO: "template nao aprovado na Meta",
          VARIAVEL_VAZIA: "faltou dado do lead para preencher o template",
        }
        const activityDesc = result.sent
          ? result.via === "template"
            ? `Nicole enviou follow-up por template "${result.template}" na etapa "${stage.name}" (fora da janela de 24h)`
            : `Nicole enviou follow-up automatico na etapa "${stage.name}" (${result.channel})`
          : skipped
            ? `Nicole NAO enviou follow-up (WhatsApp fora da janela de 24h — ${motivoLegivelSemTemplate[decisao.motivo ?? "REGRA_SEM_TEMPLATE"]}) na etapa "${stage.name}"`
            : `Nicole tentou follow-up na etapa "${stage.name}" (${result.channel}, envio pendente)`
        await supabase.from("activities").insert({
          org_id: rule.org_id,
          lead_id: lead.id,
          type: "followup_nicole_sent",
          description: activityDesc,
          metadata: {
            rule_id: rule.id,
            stage_id: rule.stage_id,
            channel: result.channel,
            sent: result.sent,
            reason: result.reason,
            ...(result.via ? { via: result.via } : {}),
            ...(result.template ? { template: result.template } : {}),
            ...(!result.sent && decisao.motivo ? { motivo_sem_template: decisao.motivo } : {}),
          },
        })

        if (result.sent) messagesSent++
        else messagesSkipped++
        if (result.via === "template" && result.sent) entregasPorTemplate++
      } else if (acao === "alerta") {
        // Story 75-352 — mesmo claim atômico do outro ramo, e aqui ele importa
        // duas vezes: a run duplicada gerou 21 pares de `alert_broker` no mesmo
        // dia, e a guarda anti-spam do `notifyBrokerOfStalledLead` decide olhando
        // quantas linhas existem (`> 1` = alerta anterior aberto → não notifica).
        // Com duas runs concorrentes inserindo, essa contagem era uma corrida: o
        // corretor podia levar notificação dupla, ou nenhuma. O claim garante
        // exatamente uma linha, e a guarda volta a medir o que ela pensa medir.
        //
        // `status: "pending"` porque é o que as telas de Alertas leem — nascer
        // 'claimed' faria o alerta desaparecer da tela.
        const claimAlerta = await claimFollowUp({
          supabase,
          orgId: rule.org_id,
          leadId: lead.id,
          type: "alert_broker",
          ruleId: rule.id,
          metadata: { stage_id: rule.stage_id, origem: "cron" },
          blockingTypes: null,
          status: "pending",
        })

        if (!claimAlerta) {
          duplicatasEvitadas++
          continue
        }

        // Create activity log
        await supabase.from("activities").insert({
          org_id: rule.org_id,
          lead_id: lead.id,
          type: "followup_alert_broker",
          description: `Alerta de follow-up: lead sem contato ha ${Math.floor(daysSinceLastContact)} dia(s) na etapa "${stage.name}"`,
          metadata: { rule_id: rule.id, stage_id: rule.stage_id },
        })

        // Story 51-4 (Gatilho B): notify the responsible broker that Nicole's
        // follow-ups are exhausted and the lead is not responding. Best-effort —
        // helper never throws, so a notification failure cannot break this loop.
        const notified = await notifyBrokerOfStalledLead({
          supabase,
          orgId: rule.org_id,
          assignedBrokerId: (lead as { assigned_broker_id?: string | null }).assigned_broker_id ?? null,
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          daysSinceLastMessage,
        })

        logEvent({
          level: "info",
          category: "cron",
          event_type: "FOLLOWUP_ALERT_BROKER",
          message: `alert_broker for lead ${lead.id} — broker notified: ${notified}`,
          metadata: { lead_id: lead.id, notified, stage: stage.name },
          source: "api/cron/followup",
        })

        alertsCreated++
      }
    }
  }

  // --- No-show detection ---
  const noShowDetected = await processNoShowDetection(supabase, now)

  // --- Post-visit follow-up ---
  // Find completed appointments with no post_visit follow-up log in the last 48h
  let postVisitSent = 0
  /** Processados (com ou sem entrega) — o `postVisitSent` conta só quem recebeu. */
  let postVisitProcessados = 0
  // Story 75-350 — erro de pós-visita vira NÚMERO no recibo do cron. Sem isso, a
  // única diferença entre "não havia o que enviar" e "tudo falhou" é ninguém ver.
  let postVisitErros = 0

  const { data: completedAppointments } = await supabase
    .from("appointments")
    .select(
      `id, lead_id, org_id, property_id,
       lead:leads!lead_id(id, name, phone, ai_summary),
       property:properties!property_id(id, name),
       feedback:visit_feedback(interest_after, feedback)`
    )
    .eq("status", "completed")

  if (completedAppointments) {
    // Story 75-352 — a janela de 48h do pós-visita agora é medida dentro do
    // `claim_follow_up` (a checagem e a escrita precisam ser atômicas). Não há mais
    // data calculada aqui.
    for (const appt of completedAppointments) {
      const leadData = Array.isArray(appt.lead) ? appt.lead[0] : appt.lead
      if (!leadData) continue

      // Story 75-350 — o `try` existe por causa de um incidente de 4 semanas.
      //
      // Este bloco não tinha guarda nenhuma, e o `logEvent(FOLLOWUP_EXECUTED)`
      // vem DEPOIS dele. Quando o modelo do follow-up passou a devolver 404
      // (alias `-latest` descontinuado), a exceção do PRIMEIRO agendamento
      // abortava a run inteira antes do log — e como o log era a única prova de
      // que o cron terminava, a falha ficou invisível: 90 a 500 tentativas por
      // dia, zero conclusões, ZERO eventos de erro, de 22/07 a 19/08/2026.
      //
      // A regra que fica: falha de UM lead não pode calar o cron dos outros.
      try {

        // Story 75-352 — o claim entra ANTES da chamada ao modelo, não depois.
        // A ordem antiga (checa cooldown → chama o modelo → envia → grava) fazia a
        // run duplicada pagar a redação da mensagem de todos os 22 a 24
        // agendamentos para jogar metade fora. `blockingTypes: ['post_visit']`
        // preserva a semântica do `.eq("type","post_visit")` que estava aqui.
        const claimPosVisita = await claimFollowUp({
          supabase,
          orgId: appt.org_id,
          leadId: appt.lead_id,
          type: "post_visit",
          metadata: { appointment_id: appt.id, origem: "cron" },
          blockingTypes: ["post_visit"],
        })

        if (!claimPosVisita) {
          duplicatasEvitadas++
          continue
        }

        // Get feedback info
        const feedbackArr = Array.isArray(appt.feedback) ? appt.feedback : appt.feedback ? [appt.feedback] : []
        const feedbackEntry = feedbackArr[0] as { interest_after?: string; feedback?: string } | undefined
        const interestLevel = feedbackEntry?.interest_after
        const visitFeedback = interestLevel || undefined

        // Get property name
        const propertyData = Array.isArray(appt.property) ? appt.property[0] : appt.property
        const propName = (propertyData as { name?: string } | null)?.name ?? "o imóvel"

        // Generate Nicole message
        const { createAnthropicClient } = await import("@trifold/ai")
        const anthropic = createAnthropicClient()
        const { generatePostVisitMessage } = await import("@trifold/ai")

        const message = await generatePostVisitMessage({
          anthropic,
          leadName: leadData.name || "",
          propertyName: propName,
          visitFeedback,
          aiSummary: (leadData as { ai_summary?: string }).ai_summary || undefined,
        })

        // Fetch the latest conversation BEFORE sending so we can check the
        // WhatsApp 24h window via conversations.last_message_at (AC6).
        const { data: conversations } = await supabase
          .from("conversations")
          .select("id, last_message_at")
          .eq("lead_id", appt.lead_id)
          .order("last_message_at", { ascending: false })
          .limit(1)

        const postVisitConv = conversations && conversations.length > 0 ? conversations[0]! : null
        const postVisitLastMessageAt = postVisitConv?.last_message_at ?? null

        // Send via the correct channel (Telegram or WhatsApp). The 24h WhatsApp
        // window is checked inside; outside it, nothing is sent (AC4).
        const leadPhone = (leadData as { phone?: string }).phone || ""
        const result = await sendFollowUpMessage(
          supabase,
          appt.org_id,
          leadPhone,
          message,
          postVisitLastMessageAt,
          now
        )

        // Story 75-350 — a decisão saiu daqui para `post-visit-record`, a MESMA que
        // a porta do feedback do corretor usa. E corrige uma mentira menor que
        // morava nesta linha: `skipped` só olhava a janela de 24h, então um
        // `API_ERROR` da Graph API era gravado como `status: "sent"`.
        const registro = registroDoPosVisita(result, interestLevel)

        // Story 75-352 — a linha já existe desde o claim; aqui só se grava o
        // desfecho. O `throw` da 75-351 saiu daqui de propósito: ele existia porque
        // o insert ERA o cooldown, e falhar em silêncio fazia o mesmo agendamento
        // voltar a cada 2h. Agora o cooldown é a linha reivindicada, que já está no
        // banco — falhar no desfecho não reabre o agendamento, e derrubar o
        // processamento deste lead por causa disso seria custo sem benefício.
        // Continua ruidoso: `fecharClaim` grita se não gravar.
        await fecharClaim(supabase, claimPosVisita, {
          status: registro.status,
          sentAt: registro.gravarSentAt ? now.toISOString() : null,
          message,
          metadata: {
            channel: result.channel,
            appointment_id: appt.id,
            origem: "cron",
            ...(result.reason ? { reason: result.reason } : {}),
          },
        })

        if (result.sent) {
          logEvent({
            level: "info",
            category: "cron",
            event_type: "FOLLOWUP_MESSAGE_SENT",
            message: `Post-visit follow-up sent to lead ${appt.lead_id} via ${result.channel}`,
            metadata: { lead_id: appt.lead_id, type: "post_visit", appointment_id: appt.id, channel: result.channel },
            source: "api/cron/followup",
          })
        } else {
          logEvent({
            level: "info",
            category: "cron",
            event_type: "FOLLOWUP_MESSAGE_SKIPPED",
            message: `Post-visit follow-up NOT sent to lead ${appt.lead_id} via ${result.channel}: ${result.reason}`,
            metadata: { lead_id: appt.lead_id, type: "post_visit", appointment_id: appt.id, channel: result.channel, reason: result.reason },
            source: "api/cron/followup",
          })
        }

        // For the WhatsApp window-closed case the lead never received freeform
        // text, so we must NOT persist it as a delivered assistant message.
        if (registro.gravarMensagem && postVisitConv) {
          const conversationId = postVisitConv.id

          await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: message,
            metadata: { source: "post_visit_followup", appointment_id: appt.id, channel: result.channel, sent: result.sent },
          })

          await supabase
            .from("conversations")
            .update({ last_message_at: now.toISOString() })
            .eq("id", conversationId)
        }

        // Activity log
        const postVisitDesc = registro.descricao
        await supabase.from("activities").insert({
          org_id: appt.org_id,
          lead_id: appt.lead_id,
          type: "followup_post_visit",
          description: postVisitDesc,
          metadata: { appointment_id: appt.id, channel: result.channel, sent: result.sent, reason: result.reason },
        })

        postVisitProcessados++
        if (result.sent) postVisitSent++
      } catch (err) {
        // Fail-open POR LEAD, e ruidoso: o próximo agendamento continua sendo
        // processado, mas o erro deixa rastro no banco (não só no console da
        // Vercel, que ninguém abre).
        logEvent({
          level: "error",
          category: "cron",
          event_type: "FOLLOWUP_POST_VISIT_ERRO",
          message: `Follow-up pós-visita falhou para o lead ${appt.lead_id}: ${err instanceof Error ? err.message : String(err)}`,
          metadata: {
            lead_id: appt.lead_id,
            appointment_id: appt.id,
            erro: err instanceof Error ? err.message : String(err),
          },
          org_id: appt.org_id,
          source: "api/cron/followup",
        })
        postVisitErros++
      }
    }
  }

  // AC13: Log cron execution result
  const recibo = {
    processed,
    alerts_created: alertsCreated,
    messages_sent: messagesSent,
    messages_skipped: messagesSkipped,
    // Story 75-352 — duplicata evitada é métrica de primeira classe: é como se
    // descobre que a segunda invocação continua chegando mesmo com a trava de run.
    duplicatas_evitadas: duplicatasEvitadas,
    // Story 75-353 — quantas chegaram ao lead fora da janela, por template pago.
    entregas_por_template: entregasPorTemplate,
    post_visit_sent: postVisitSent,
    post_visit_processados: postVisitProcessados,
    post_visit_erros: postVisitErros,
    no_show_detected: noShowDetected,
  }

  logEvent({
    level: "info",
    category: "cron",
    event_type: "FOLLOWUP_EXECUTED",
    message: `Followup cron: ${processed} processed, ${alertsCreated} alerts, ${messagesSent} enviadas (${entregasPorTemplate} por template) / ${messagesSkipped} puladas, ${duplicatasEvitadas} duplicatas evitadas, pós-visita ${postVisitSent} enviadas de ${postVisitProcessados} (${postVisitErros} erros), ${noShowDetected} no-show`,
    metadata: recibo,
    source: "api/cron/followup",
  })

  // Story 75-352 — o recibo também vai para `cron_locks.last_result`, que é escrita
  // AGUARDADA. O `logEvent` acima é fire-and-forget e pode morrer no congelamento
  // da lambda (foi o que aconteceu com o recibo da 87-6): a linha de `cron_locks` é
  // a prova que sobra de que esta run terminou, e com que números.
  await finishCronRun(supabase, runId, recibo)

  return NextResponse.json(recibo)
}

import { STAGE_IDS } from "@trifold/shared"
import { decideStaleAppointment, BROKER_ACTIVITY_TYPES } from "@web/lib/appointments/no-show-decision"

const NO_SHOW_STAGE_ID = STAGE_IDS.no_show

/**
 * Detect appointments that are 48h+ past scheduled_at with no feedback.
 * Mark as no_show, move lead to No-Show stage, reset conversation state.
 *
 * Story 75-177: antes de marcar no_show, consulta a etapa atual do lead e a última
 * atividade humana do corretor. Se o lead já avançou p/ pós-visita marca `completed`;
 * se o lead é terminal/parqueado (perdido/represamento) cancela — sem nunca
 * mover/ressuscitar o lead. Só quando NÃO há sinal de tratamento é que o no-show real
 * dispara (comportamento antigo).
 *
 * Story 75-321: "corretor tratou depois do horário" deixou de virar `completed` e passou
 * a virar `closed` (encerrado sem confirmação de presença). Nota de corretor não é prova
 * de que a visita aconteceu, e o Analytics contava como se fosse.
 */
async function processNoShowDetection(
  supabase: SupabaseClient,
  now: Date
): Promise<number> {
  const threshold = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  // Story 87-4 — o reset de estado do no-show precisa apagar a chave nova
  // (`agenda_state`) junto com as legadas; ver o uso abaixo.
  const { omitAgendaKeys } = await import("@trifold/ai")

  const { data: staleAppointments } = await supabase
    .from("appointments")
    .select("id, lead_id, org_id, scheduled_at")
    .in("status", ["scheduled", "confirmed"])
    .lt("scheduled_at", threshold.toISOString())

  if (!staleAppointments || staleAppointments.length === 0) return 0

  // Batch: etapa atual de cada lead (guard 1/terminal) — nunca atropelar lead resolvido.
  const leadIds = [...new Set(staleAppointments.map((a) => a.lead_id))]
  const { data: leadRows } = await supabase
    .from("leads")
    .select("id, stage_id")
    .in("id", leadIds)
  const stageByLead = new Map<string, string | null>(
    (leadRows ?? []).map((l) => [l.id as string, (l.stage_id as string | null) ?? null])
  )

  // Batch: última atividade humana do corretor por lead (guard 2) — corretor tratando.
  const { data: brokerActivities } = await supabase
    .from("activities")
    .select("lead_id, created_at")
    .in("lead_id", leadIds)
    .in("type", BROKER_ACTIVITY_TYPES as string[])
    .order("created_at", { ascending: false })
  const latestActivityByLead = new Map<string, string>()
  for (const act of brokerActivities ?? []) {
    if (!latestActivityByLead.has(act.lead_id)) latestActivityByLead.set(act.lead_id, act.created_at)
  }

  let count = 0
  for (const appt of staleAppointments) {
    const action = decideStaleAppointment({
      leadStageId: stageByLead.get(appt.lead_id) ?? null,
      scheduledAt: appt.scheduled_at,
      latestBrokerActivityAt: latestActivityByLead.get(appt.lead_id) ?? null,
    })

    // Lead JÁ em etapa pós-visita: a visita aconteceu. Fecha como realizada, não move o lead.
    if (action === "complete") {
      await supabase.from("appointments").update({ status: "completed" }).eq("id", appt.id)
      continue
    }

    // Story 75-321 — corretor tratou o lead depois do horário, mas ninguém confirmou
    // presença: encerra SEM afirmar que a visita ocorreu. Antes isto virava
    // `completed` e entrava no card "Visitas realizadas" do Analytics.
    if (action === "close") {
      await supabase.from("appointments").update({ status: "closed" }).eq("id", appt.id)
      continue
    }

    // Lead terminal/parqueado: cancela o agendamento pendente, não ressuscita o lead.
    if (action === "cancel") {
      await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appt.id)
      continue
    }

    // action === "no_show": no-show real — comportamento original preservado.
    // Mark appointment as no_show
    await supabase
      .from("appointments")
      .update({ status: "no_show" })
      .eq("id", appt.id)

    // Move lead to No-Show stage
    await supabase
      .from("leads")
      .update({ stage_id: NO_SHOW_STAGE_ID })
      .eq("id", appt.lead_id)

    // Reset conversation state (visit_proposed + visit_availability)
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", appt.lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (conv) {
      const { data: state } = await supabase
        .from("conversation_state")
        .select("collected_data")
        .eq("conversation_id", conv.id)
        .single()

      if (state) {
        // Story 87-4 — o reset precisa apagar a chave NOVA também: um reset que
        // deixa o `agenda_state` de pé não reseta nada, e o lead que deu no-show
        // voltaria com o mesmo dia herdado na próxima mensagem.
        // `omitAgendaKeys` remove as quatro chaves legadas E o `agenda_state`.
        const cleaned = omitAgendaKeys(state.collected_data as Record<string, unknown>)
        await supabase
          .from("conversation_state")
          .update({ visit_proposed: false, collected_data: cleaned })
          .eq("conversation_id", conv.id)
      }
    }

    // Activity log
    await supabase.from("activities").insert({
      org_id: appt.org_id,
      lead_id: appt.lead_id,
      type: "appointment_no_show",
      description: "Visita nao realizada — sem feedback do corretor apos 48h",
      metadata: { appointment_id: appt.id },
    })

    count++
  }

  return count
}
