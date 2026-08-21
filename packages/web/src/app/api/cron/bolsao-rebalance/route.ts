import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import {
  businessMinutesBetweenSchedule,
  isOpenAtNow,
  getOrgSchedule,
} from "@web/lib/roleta/business-time"
import { sendPushToUser } from "@web/lib/server/push-service"
import { logWhatsappSend } from "@web/lib/whatsapp/log-send"
import {
  BOLSAO_REBALANCE_MIN,
  selecionarPreAviso,
  paramsPreAviso,
} from "@web/lib/bolsao/pre-aviso"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"

// Story 75-80 (Epic 64) — Bolsão de Leads: rebalanceamento.
// Lead distribuído e NÃO atendido por >= BOLSAO_REBALANCE_MIN minutos de horário
// comercial (contados da última distribuição) sai da base do corretor e vai pro
// bolsão (assigned_broker_id = null, bolsao_em = now()). De lá, qualquer corretor
// pode puxá-lo (Story 75-81). Idempotente, gated por roleta_config.bolsao_enabled.
// Dry-run: GET ?dry=1 (calcula e relata o que faria, sem mover nada).
//
// Naturalmente idempotente: ao mover, assigned_broker_id vira null → o lead deixa
// de casar com o filtro de candidatos (.not assigned_broker_id is null).
//
// ⚠️ A escalada de 60min do SLA (lead nunca atendido) precisa passar a considerar
// leads no bolsão (sem dono) — isso é tratado na Story 75-82. Por isso este cron
// nasce gated (bolsao_enabled default false): só ligar após a 75-82.

// Story 75-366 — BOLSAO_REBALANCE_MIN mudou-se para lib/bolsao/pre-aviso.ts (fonte
// única: a janela de pré-aviso é derivada dele e route files não podem exportar consts).
const BOLSAO_DIGEST_MIN = 15 // tempo parado no bolsão p/ entrar no resumo da Fernanda
const BOLSAO_DIGEST_WINDOW_S = 30 * 60 // anti-flood: no máx. 1 resumo a cada 30min por org
const PRE_AVISO_WINDOW_S = 10 * 60 // anti-flood do pré-aviso: no máx. 1 a cada 10min por org
const RECENT_HOURS = 48 // só leads distribuídos recentemente (evita varrer histórico)

type CfgRow = {
  org_id: string
  bolsao_enabled: boolean
  notify_user_on_fora_horario: string | null
  notify_user_on_distribution: string | null
}

type LeadRow = {
  id: string
  name: string | null
  assigned_broker_id: string
  distribuido_em: string | null
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1"
  const admin = createAdminClient()
  const now = new Date()

  const { data: configs } = await admin
    .from("roleta_config")
    .select("org_id, bolsao_enabled, notify_user_on_fora_horario, notify_user_on_distribution")
  const summary: Array<Record<string, unknown>> = []

  for (const cfg of (configs ?? []) as CfgRow[]) {
    const orgId = cfg.org_id
    if (!cfg.bolsao_enabled && !dryRun) {
      summary.push({ orgId, skipped: "bolsao_enabled=false" })
      continue
    }

    // Horário pela agenda por dia (mesma fonte do SLA/distribuição). Relógio pausa fora do expediente.
    const { week: schedule, timezone: scheduleTz } = await getOrgSchedule(orgId, admin)
    const withinHours = isOpenAtNow(now, schedule, scheduleTz)
    if (!withinHours && !dryRun) {
      summary.push({ orgId, skipped: "fora do horario comercial" })
      continue
    }

    const { data: novoStage } = await admin
      .from("kanban_stages")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", "novo")
      .maybeSingle()
    const novoId = (novoStage?.id as string | undefined) ?? null
    if (!novoId) {
      summary.push({ orgId, skipped: "sem stage 'novo'" })
      continue
    }

    // Candidatos: em "Aguardando atendimento", não atendidos, COM dono, fora do bolsão, recentes.
    const recentIso = new Date(now.getTime() - RECENT_HOURS * 3600 * 1000).toISOString()
    const { data: leads } = await admin
      .from("leads")
      .select("id, name, assigned_broker_id, distribuido_em")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .eq("segmento", "principal") // Story 75-98: bolsão é do mundo principal, nunca IMOB
      .eq("stage_id", novoId)
      .is("primeiro_atendimento_em", null)
      .is("bolsao_em", null)
      .not("assigned_broker_id", "is", null)
      .gte("created_at", recentIso)
      .limit(500)
    const leadRows = (leads ?? []) as LeadRow[]

    // Última distribuição por lead (mesma lógica do SLA).
    const { data: distLog } = await admin
      .from("lead_distribution_log")
      .select("lead_id, created_at")
      .eq("org_id", orgId)
      .eq("status", "distributed")
      .in("lead_id", leadRows.map((l) => l.id))
    const distByLead = new Map<string, number[]>()
    for (const d of (distLog ?? []) as Array<{ lead_id: string; created_at: string }>) {
      const arr = distByLead.get(d.lead_id) ?? []
      arr.push(new Date(d.created_at).getTime())
      distByLead.set(d.lead_id, arr)
    }
    // Story 75-106: distribuido_em (carimbo atômico) é fonte adicional do relógio, cobrindo
    // órfãos cujo insert em lead_distribution_log falhou → antes eram pulados (dists vazio).
    for (const l of leadRows) {
      if (!l.distribuido_em) continue
      const arr = distByLead.get(l.id) ?? []
      arr.push(new Date(l.distribuido_em).getTime())
      distByLead.set(l.id, arr)
    }

    const toMove: Array<{ id: string; broker: string; elapsed: number; name: string | null }> = []
    for (const lead of leadRows) {
      const dists = (distByLead.get(lead.id) ?? []).filter((t) => t <= now.getTime())
      if (dists.length === 0) continue
      const distribuido = new Date(Math.max(...dists))
      const elapsed = businessMinutesBetweenSchedule(distribuido, now, schedule, scheduleTz)
      if (elapsed >= BOLSAO_REBALANCE_MIN) {
        toMove.push({ id: lead.id, broker: lead.assigned_broker_id, elapsed, name: lead.name })
      }
    }

    if (!dryRun && toMove.length > 0) {
      await admin
        .from("leads")
        .update({ assigned_broker_id: null, bolsao_em: now.toISOString() })
        .in("id", toMove.map((m) => m.id))

      await admin.from("activities").insert(
        toMove.map((m) => ({
          org_id: orgId,
          lead_id: m.id,
          type: "bolsao_in",
          description: `Lead foi para o bolsão (sem atendimento em ${m.elapsed} min)`,
          metadata: { from_broker_id: m.broker, elapsed_min: m.elapsed },
        }))
      )
    }

    // ── Pré-aviso ao gerente comercial (Story 75-366) ──
    // Lead na janela [10, 15) min sem atendimento: ainda tem dono, mas vai cair no
    // bolsão na(s) próxima(s) rodada(s). Avisa o gerente-comercial por WhatsApp
    // (template `aviso_pre_bolsao_gestor`) + push, para ele acionar o corretor ANTES
    // da queda. Regras anti-spam, nesta ordem:
    //   1. cada lead dispara no MÁXIMO 1 pré-aviso na vida (marcador em activities,
    //      type='pre_bolsao_aviso') — só lead NOVO na janela gera mensagem;
    //   2. claim (org,'pre_bolsao_aviso') de 10 min — pico de leads não vira metralhadora;
    //      lead que ficou sem marcador por causa do claim entra na próxima rodada.
    // A contagem da mensagem é TODA a janela (não só os novos): "3 leads indo para o
    // bolsão em 2 min" é o retrato real; o gatilho é que apareceu gente nova.
    let preAvisoCount = 0
    let preAvisoSent = false
    const candidatosPre = leadRows
      .map((lead) => {
        const dists = (distByLead.get(lead.id) ?? []).filter((t) => t <= now.getTime())
        if (dists.length === 0) return null
        const distribuido = new Date(Math.max(...dists))
        return { id: lead.id, elapsed: businessMinutesBetweenSchedule(distribuido, now, schedule, scheduleTz) }
      })
      .filter((c): c is { id: string; elapsed: number } => c !== null)

    const { data: avisadosRows } = await admin
      .from("activities")
      .select("lead_id")
      .eq("org_id", orgId)
      .eq("type", "pre_bolsao_aviso")
      .in("lead_id", candidatosPre.map((c) => c.id))
    const jaAvisados = new Set(
      ((avisadosRows ?? []) as Array<{ lead_id: string }>).map((r) => r.lead_id)
    )
    const selecao = selecionarPreAviso(candidatosPre, jaAvisados)
    preAvisoCount = selecao.naJanela.length

    if (selecao.novos.length > 0 && selecao.minutosRestantes !== null && !dryRun) {
      const { data: claimedPre } = await admin.rpc("claim_obra_notif", {
        p_obra_id: orgId,
        p_evento: "pre_bolsao_aviso",
        p_window_seconds: PRE_AVISO_WINDOW_S,
      })
      if (claimedPre === true) {
        // Marcador ANTES do envio: se o envio falhar, o WhatsApp fica devendo mas o
        // push sai e o lead não vira metralhadora a cada 5 min; a falha fica visível
        // no whatsapp_send_log (lição do token morto — falha nunca é muda).
        await admin.from("activities").insert(
          selecao.novos.map((c) => ({
            org_id: orgId,
            lead_id: c.id,
            type: "pre_bolsao_aviso",
            description: `Gerente avisado: lead vai ao bolsão em ~${selecao.minutosRestantes} min sem atendimento (${Math.round(c.elapsed)} min parado)`,
            metadata: { elapsed_min: Math.round(c.elapsed), minutos_restantes: selecao.minutosRestantes },
          }))
        )
        preAvisoSent = await notificarGerentesComerciais(admin, orgId, {
          template: "aviso_pre_bolsao_gestor",
          params: (nome) => paramsPreAviso(nome, selecao.naJanela.length, selecao.minutosRestantes!),
          pushTitle: "Leads a caminho do bolsão",
          pushBody: `${selecao.naJanela.length} lead(s) sem atendimento — vão para o bolsão em ~${selecao.minutosRestantes} min.`,
          pushUrl: `${APP_URL}/dashboard/pipeline`,
        })
      }
    }

    // ── Resumo periódico do bolsão à Fernanda (Story 75-82) ──
    // Conta leads parados no pool há >= BOLSAO_DIGEST_MIN (horário comercial). Anti-flood:
    // claim por (org, 'bolsao_digest') com janela → no máx. 1 resumo a cada 30min por org.
    //
    // Story 75-286 — o filtro abaixo espelha EXATAMENTE o do painel (/dashboard/bolsao,
    // Story 75-89): pool real = bolsao_em preenchido E SEM dono. `bolsao_em` é um carimbo
    // que só a RPC `pegar_lead_bolsao` limpa; quem atribui corretor por outro caminho
    // (/assign, /handoff, /transferir) deixa o carimbo sujo → o lead vira "fantasma":
    // sai do painel mas continuava contando aqui. Incidente de 05/08/2026: o gerente
    // recebeu 6 avisos em 3h por um lead atendido em 1min22s. Filtrar na LEITURA corrige
    // independentemente de qual caminho sujou o carimbo.
    // A roleta NÃO entra nessa lista: tem guard próprio contra o bolsão (distributor.ts
    // bail "em_bolsao" + `AND bolsao_em IS NULL` no UPDATE da roleta_pick_and_advance),
    // então nunca atribui lead carimbado — não precisa (nem deve) ser "corrigida".
    let digestCount = 0
    let digestSent = false
    const { data: pool } = await admin
      .from("leads")
      .select("bolsao_em")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .not("bolsao_em", "is", null)
      .is("assigned_broker_id", null)
      .limit(1000)
    digestCount = ((pool ?? []) as Array<{ bolsao_em: string }>).filter(
      (l) => businessMinutesBetweenSchedule(new Date(l.bolsao_em), now, schedule, scheduleTz) >= BOLSAO_DIGEST_MIN
    ).length

    if (digestCount > 0 && !dryRun) {
      const { data: claimed } = await admin.rpc("claim_obra_notif", {
        p_obra_id: orgId,
        p_evento: "bolsao_digest",
        p_window_seconds: BOLSAO_DIGEST_WINDOW_S,
      })
      if (claimed === true) {
        digestSent = await sendBolsaoDigest(admin, orgId, digestCount)
      }
    }

    summary.push({
      orgId,
      candidatos: leadRows.length,
      movidos: toMove.length,
      preAvisoCount,
      preAvisoSent,
      digestCount,
      digestSent,
      dryRun,
      withinHours,
      ...(dryRun ? { wouldMove: toMove.map((m) => ({ lead: m.id, elapsed: m.elapsed })) } : {}),
    })
  }

  return NextResponse.json({ ok: true, summary })
}

// Story 75-82 / 75-109 — resumo do bolsão à GERENTE COMERCIAL: quando há lead(s) parado(s)
// no pool há >= BOLSAO_DIGEST_MIN (15 min de horário comercial), avisa via WhatsApp
// (template `aviso_bolsao_gestor`, {{1}}=nome {{2}}=qtd; botão → /dashboard/bolsao) + push.
// Destinatário = usuários ATIVOS com role 'gerente-comercial' (não mais o gestor da roleta,
// que trazia efeitos colaterais). Retorna true se ao menos um envio (WhatsApp/push) ocorreu.
async function sendBolsaoDigest(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  count: number
): Promise<boolean> {
  return notificarGerentesComerciais(admin, orgId, {
    template: "aviso_bolsao_gestor",
    params: (nome) => [nome, String(count)],
    pushTitle: "Leads parados no bolsão",
    pushBody: `Há ${count} lead(s) aguardando atendimento no bolsão.`,
    pushUrl: `${APP_URL}/dashboard/bolsao`,
  })
}

// Story 75-366 — canal comum ao gerente comercial: WhatsApp por template + push,
// extraído do sendBolsaoDigest (75-82/109) para o pré-aviso não duplicar o padrão.
// `params(nome)` recebe o nome já com fallback "gerente" (nunca string vazia —
// variável vazia derruba o template inteiro, lição da 75-356).
async function notificarGerentesComerciais(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  aviso: {
    template: string
    params: (nome: string) => string[]
    pushTitle: string
    pushBody: string
    pushUrl: string
  }
): Promise<boolean> {
  const { data: gerentes } = await admin
    .from("users")
    .select("id, name, phone")
    .eq("org_id", orgId)
    .eq("role", "gerente-comercial")
    .eq("is_active", true)
  const recipients = (gerentes ?? []) as Array<{ id: string; name: string | null; phone: string | null }>
  if (recipients.length === 0) return false

  const { data: wc } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .maybeSingle()
  const waReady = Boolean(wc?.phone_number_id && wc?.access_token)

  let any = false
  for (const r of recipients) {
    const nome = (r.name ?? "").trim() || "gerente"
    if (r.phone && waReady) {
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${wc!.phone_number_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${wc!.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: r.phone,
            type: "template",
            template: {
              name: aviso.template,
              language: { code: "pt_BR" },
              components: [{
                type: "body",
                parameters: aviso.params(nome).map((text) => ({ type: "text", text })),
              }],
            },
          }),
        })
        if (res.ok) {
          const json = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null
          void logWhatsappSend(admin, { orgId, template: aviso.template, category: "utility", recipientType: "gestor", toPhone: r.phone, status: "sent", wamId: json?.messages?.[0]?.id ?? null })
          any = true
        } else {
          const err = await res.text()
          void logWhatsappSend(admin, { orgId, template: aviso.template, category: "utility", recipientType: "gestor", toPhone: r.phone, status: "failed", error: `${res.status} ${err.slice(0, 300)}` })
        }
      } catch (e) {
        console.error(`[bolsao] ${aviso.template} wpp:`, e)
      }
    }

    try {
      await sendPushToUser(admin, r.id, {
        title: aviso.pushTitle,
        body: aviso.pushBody,
        url: aviso.pushUrl,
      })
      any = true
    } catch (e) {
      console.error(`[bolsao] ${aviso.template} push:`, e)
    }
  }

  return any
}
