import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { tentarAppUrl } from "@web/lib/tenancy/app-url-fallback"
import { sendPushToUser } from "@web/lib/server/push-service"
import {
  hojeSaoPaulo,
  toIsoDate,
  diffDiasAteVencer,
  deveAlertar,
  type SaoPauloDate,
} from "@web/lib/billing/reminder-schedule"

// Story 78-11 — Motor de lembretes com ESCALONAMENTO (reescreve o Passo 1 da 78-8; remove o
// Passo 2 da 78-8). Gatilhos discretos de alerta (America/Sao_Paulo):
//   - D-N exato: distanciaAteVencer === alert_days_before (usuário configura 3 = "3 dias antes");
//   - D-0 exato: distanciaAteVencer === 0 (dia do vencimento);
//   - vencida:   distanciaAteVencer < 0 → TODO dia (D+1, D+2, ...), enquanto não paga.
// Candidatos: status NOT IN ('paid','postponed','skipped') — inclui 'pending' E 'alerted'
//   ('alerted' deixou de ser estado terminal de dedup). Dedup passou a ser POR DIA via
//   last_alerted_on (coluna nova, migration 169), não mais por status permanente.
// Dedup ATÔMICO por dia: UPDATE ... WHERE last_alerted_on IS DISTINCT FROM hoje RETURNING —
//   2 execuções concorrentes no mesmo dia não notificam 2x; no dia seguinte, volta a alertar.
// RECORRÊNCIA REMOVIDA do cron (antigo "Passo 2"): o cron NUNCA mais avança due_date de uma
//   linha vencida-não-paga (AC8). A recorrência agora só ocorre no PATCH .../[id] quando o
//   status vira 'paid' (evento de pagamento), síncrona na mesma requisição.
// Canais reusados (e-mail + push) para todos os admins ativos (role='admin', is_active=true,
//   SEM filtro org_id — dado da plataforma). Guard CRON_SECRET. Dry-run: GET ?dry=1.
// Best-effort: erro numa linha/admin não derruba o restante (NFR-3).


// Status que NUNCA disparam alerta (suprimem o motor). 'paid' = pago; 'postponed'/'skipped' =
// decisão manual do admin. Candidatos do cron = tudo que NÃO está nesta lista.
const STATUS_SUPRIMIDOS = ["paid", "postponed", "skipped"] as const

type ReminderRow = {
  id: string
  service_id: string
  // Story 78-14 (AC12): due_date passou a ser nullable na migration 172 (uma assinatura fixa
  // pode existir "cadastrada" antes de o admin informar a data de renovação). Linhas com
  // due_date=null são filtradas ANTES de deveAlertar()/diffDiasAteVencer() (ver abaixo), pois
  // diffDias() faz .split() num valor null e quebraria em runtime.
  due_date: string | null
  expected_amount: number | null
  currency: string
  billing_cycle: string
  alert_days_before: number
  status: string
  last_alerted_on: string | null
  platform_services: { slug: string; name: string } | null
}

type AdminRow = { id: string; name: string | null; email: string | null }

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("T")[0]?.split("-") ?? []
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function formatAmount(amount: number | null, currency: string): string {
  if (amount === null || amount === undefined) return "valor não informado"
  return `${currency} ${amount.toFixed(2)}`
}

/**
 * Constrói assunto/corpo do e-mail variando pelo tipo de gatilho (D-N / D-0 / vencida),
 * usando a distância até vencer já calculada. Diferenciação recomendada pela story (T3.4),
 * não bloqueante — melhora a clareza para o admin.
 */
function buildMensagem(
  serviceName: string,
  valor: string,
  vencBr: string,
  distancia: number,
  /** Story 900-66 — base do link, resolvida pelo handler (que sabe abortar quando não há). */
  appUrl: string
): { subject: string; pushTitle: string; pushBody: string; html: string } {
  let situacao: string
  let acao: string
  if (distancia < 0) {
    const diasVencida = -distancia
    situacao = `está <strong>vencida há ${diasVencida} dia${diasVencida > 1 ? "s" : ""}</strong> e ainda não foi paga`
    acao = "Pague o quanto antes para não interromper a produção (crm.trifold.eng.br)."
  } else if (distancia === 0) {
    situacao = `<strong>vence hoje</strong> (${vencBr})`
    acao = "Garanta o pagamento hoje para não interromper a produção."
  } else {
    situacao = `vence em <strong>${distancia} dia${distancia > 1 ? "s" : ""}</strong> (${vencBr})`
    acao = "Programe o pagamento para não interromper a produção."
  }

  const subject =
    distancia < 0
      ? `[Trifold] Fatura VENCIDA: ${serviceName} (${vencBr})`
      : distancia === 0
        ? `[Trifold] Vence hoje: ${serviceName} (${vencBr})`
        : `[Trifold] Vencimento em ${distancia} dia${distancia > 1 ? "s" : ""}: ${serviceName} (${vencBr})`

  const pushTitle = distancia < 0 ? "Fatura vencida" : distancia === 0 ? "Fatura vence hoje" : "Fatura vencendo"
  const pushBody = `${serviceName}: fatura ${distancia < 0 ? "vencida" : distancia === 0 ? "vence hoje" : `vence em ${distancia}d`} (${valor}).`

  const html =
    `<p>Olá,</p>` +
    `<p>A fatura do serviço <strong>${serviceName}</strong> ${situacao}.</p>` +
    `<p>Valor esperado: <strong>${valor}</strong> · Vencimento: ${vencBr}</p>` +
    `<p>${acao}</p>` +
    `<p><a href="${appUrl}/dashboard">Abrir o painel</a></p>`

  return { subject, pushTitle, pushBody, html }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1"
  const admin = createAdminClient()
  const now = new Date()
  const hoje: SaoPauloDate = hojeSaoPaulo(now)
  const hojeIso = toIsoDate(hoje)

  // Story 900-66 (AC4) — quem não tem URL não envia. Resolvido ANTES do laço porque a env é a
  // mesma para todo item: por item, o único efeito seria repetir o log. Nenhum alerta sai, e
  // nenhum `last_alerted_on` é carimbado — ligada a URL, os alertas do dia voltam a sair.
  const base = tentarAppUrl(process.env.NEXT_PUBLIC_APP_URL, "cron/billing-reminders")
  if (!base.ok) {
    return NextResponse.json({ ok: true, dryRun, hoje: hojeIso, skipped: "app_url_indisponivel" })
  }

  const selectCols =
    "id, service_id, due_date, expected_amount, currency, billing_cycle, alert_days_before, status, last_alerted_on, platform_services!inner(slug, name, enabled)"

  // ── Buscar candidatos: tudo que NÃO está suprimido (inclui 'pending' E 'alerted') ──
  let alertsSent = 0
  let alertErrors = 0
  const wouldAlert: Array<Record<string, unknown>> = []

  const { data: candidatosRaw, error: candErr } = await admin
    .from("service_billing_reminders")
    .select(selectCols)
    .not("status", "in", `(${STATUS_SUPRIMIDOS.join(",")})`)
    .eq("platform_services.enabled", true)

  if (candErr) {
    console.error("[billing-reminders] erro ao buscar candidatos:", candErr.message)
    return NextResponse.json({ ok: false, error: candErr.message }, { status: 500 })
  }

  const candidatos = (candidatosRaw ?? []) as unknown as ReminderRow[]

  // Story 78-14 (AC12): exclui explicitamente due_date=null ANTES de deveAlertar() — as
  // assinaturas fixas seedadas (migration 172) nascem com due_date=null e quebrariam
  // diffDias()/deveAlertar() em runtime (.split() num null). O type guard também estreita o
  // tipo de due_date para string no restante do fluxo.
  // Gatilho D-N/D-0/vencida + dedup por dia (last_alerted_on != hoje) — em memória.
  const paraAlertar = candidatos
    .filter((r): r is ReminderRow & { due_date: string } => r.due_date !== null)
    .filter((r) => deveAlertar(r, hoje))

  if (paraAlertar.length > 0) {
    if (dryRun) {
      for (const r of paraAlertar) {
        wouldAlert.push({
          id: r.id,
          service: r.platform_services?.name ?? r.service_id,
          due_date: r.due_date,
          alert_days_before: r.alert_days_before,
          distancia: diffDiasAteVencer(r.due_date, hoje),
          last_alerted_on: r.last_alerted_on,
        })
      }
    } else {
      // Dedup ATÔMICO POR DIA: só notifica as linhas efetivamente marcadas (RETURNING). O filtro
      // `last_alerted_on IS DISTINCT FROM hoje` (via OR: is.null OU neq.hoje — .neq exclui NULLs
      // no PostgREST, por isso o is.null explícito) garante que 2 execuções concorrentes no MESMO
      // dia não notificam 2x. No dia seguinte, o filtro volta a passar e a linha alerta de novo.
      const ids = paraAlertar.map((r) => r.id)
      const { data: alertadasRaw, error: updErr } = await admin
        .from("service_billing_reminders")
        .update({ status: "alerted", last_alerted_on: hojeIso })
        .in("id", ids)
        .or(`last_alerted_on.is.null,last_alerted_on.neq.${hojeIso}`)
        .select(
          "id, service_id, due_date, expected_amount, currency, billing_cycle, alert_days_before, status, last_alerted_on, platform_services(slug, name)"
        )

      if (updErr) {
        console.error("[billing-reminders] erro ao marcar alerted:", updErr.message)
      } else {
        // due_date garantidamente non-null: alertadas vêm de paraAlertar (já filtrado, AC12).
        const alertadas = (alertadasRaw ?? []) as unknown as Array<
          ReminderRow & { due_date: string }
        >

        // Destinatários: TODOS os admins ativos, SEM filtro org_id (dado da plataforma).
        const { data: adminsRaw } = await admin
          .from("users")
          .select("id, name, email")
          .eq("role", "admin")
          .eq("is_active", true)
        const admins = (adminsRaw ?? []) as AdminRow[]

        // Coleta todos os envios e AWAIT com Promise.allSettled: em serverless, retornar a resposta
        // antes dos envios os congela. Cada envio tem .catch próprio — falha de um canal/admin não
        // bloqueia os demais nem interrompe o loop (best-effort, herdado de 78-8).
        const pending: Promise<unknown>[] = []
        for (const r of alertadas) {
          const serviceName = r.platform_services?.name ?? "Serviço"
          const valor = formatAmount(r.expected_amount, r.currency)
          const vencBr = formatDateBr(r.due_date)
          // distancia recomputada a partir do due_date (recorrência nunca acontece aqui, então
          // due_date é estável); usada só para diferenciar a mensagem por tipo de gatilho.
          const distancia = diffDiasAteVencer(r.due_date, hoje) ?? 0
          const { subject, pushTitle, pushBody, html } = buildMensagem(
            serviceName,
            valor,
            vencBr,
            distancia,
            base.url
          )

          for (const a of admins) {
            if (a.email) {
              pending.push(
                sendEmail({ to: a.email, subject, html }).catch((e: unknown) => {
                  alertErrors++
                  console.error("[billing-reminders] email:", a.email, e)
                })
              )
            }
            pending.push(
              sendPushToUser(admin, a.id, {
                title: pushTitle,
                body: pushBody,
                url: `${base.url}/dashboard`,
              }).catch((e: unknown) => {
                alertErrors++
                console.error("[billing-reminders] push:", a.id, e)
              })
            )
          }
          alertsSent++
        }
        await Promise.allSettled(pending)
      }
    }
  }

  const summary = {
    ok: true,
    dryRun,
    hoje: hojeIso,
    // Shape observável mudou vs 78-8 (T4.2): removida a chave `passo2` (recorrência por decurso
    // de tempo, agora inexistente no cron); `passo1` renomeado para `alertas`. Nenhum consumidor
    // atual (a UI/78-9 não chama este endpoint) — registrado para rastreabilidade.
    alertas: {
      candidatos: candidatos.length,
      paraAlertar: paraAlertar.length,
      alertsSent,
      alertErrors,
      ...(dryRun ? { wouldAlert } : {}),
    },
  }
  console.log("[billing-reminders] concluído:", summary)
  return NextResponse.json(summary)
}
