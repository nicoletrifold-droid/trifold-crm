import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getFinancialStatement, getReceivableBill } from "@web/lib/integrations/sienge/client"
import { notifyNovoBoleto, portalNotificacoesPausadas } from "@web/lib/notificacoes"

// Story 75-101 — Notificação de novo boleto via VARREDURA (não só webhook).
//
// O webhook do Sienge (Story 75-76, evento PAYMENT_SLIP_REGISTERED) não dispara para
// esta conta: os boletos aparecem como "Boleto gerado" (generatedBillet=true) — estado
// ANTERIOR à confirmação bancária que o webhook escuta. Aqui detectamos pelo NOSSO lado,
// varrendo /customer-financial-statements (a mesma fonte do portal) e notificando via
// notifyNovoBoleto. Dedup compartilhado com o webhook (sienge_webhook_dedup, chave
// receivableBillId:installmentId) → cada boleto notifica UMA vez, venha de onde vier.

const EVENT_TYPE = "BOLETO_SCAN"
const PAGE_DELAY_MS = 300

/** "2026-07-10" → "10/07/2026". */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0]?.split("-") ?? []
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("[BOLETO_SCAN] CRON_SECRET não configurado")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (portalNotificacoesPausadas()) {
    console.log("[BOLETO_SCAN] portal pausado (PORTAL_NOTIF_PAUSED) — nada a fazer")
    return NextResponse.json({ ok: true, paused: true })
  }

  const admin = createAdminClient()

  const { data: clientes, error: clientesErr } = await admin
    .from("users")
    .select("id, name, email, phone, sienge_customer_id")
    .eq("role", "cliente")
    .eq("is_active", true)
    .not("sienge_customer_id", "is", null)

  if (clientesErr) {
    console.error("[BOLETO_SCAN] erro ao listar clientes:", clientesErr.message)
    return NextResponse.json({ ok: false, error: clientesErr.message }, { status: 500 })
  }

  let notified = 0
  let suppressed = 0
  let clientErrors = 0
  const scanned = clientes?.length ?? 0

  for (const cliente of clientes ?? []) {
    const customerId = cliente.sienge_customer_id as number | null
    if (!customerId) continue

    try {
      const installments = await getFinancialStatement(customerId)
      // Parcelas com boleto gerado e saldo em aberto, do vencimento mais próximo ao mais distante.
      const abertos = installments
        .filter((i) => i.hasBoleto)
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))

      let sentForClient = false

      for (const inst of abertos) {
        const eventKey = `${inst.billReceivableId}:${inst.installmentId}`

        // Reivindica o slot (atômico, compartilhado com o webhook). Só as inéditas contam.
        const { data: claimed, error: claimError } = await admin.rpc("claim_sienge_webhook", {
          p_event_key: eventKey,
          p_event_type: EVENT_TYPE,
        })
        if (claimError) {
          console.error("[BOLETO_SCAN] claim falhou — pulando parcela:", { eventKey, err: claimError.message })
          continue
        }
        if (claimed !== true) continue // já notificado (run anterior ou webhook)

        // Anti-flood: no máximo 1 notificação por cliente por execução. As demais
        // parcelas inéditas ficam marcadas (claimadas) sem enviar — o portal já as mostra.
        if (sentForClient) {
          suppressed++
          continue
        }

        // Resolve a obra do título (mesma lógica do webhook 75-76).
        let released = false
        try {
          const bill = await getReceivableBill(inst.billReceivableId)
          if (!bill?.customerId || bill.enterpriseCode == null) {
            console.warn("[BOLETO_SCAN] título sem customerId/enterpriseCode — mantendo claimado", { eventKey })
            continue
          }

          const { data: obra } = await admin
            .from("obras")
            .select("id, name, org_id")
            .eq("sienge_enterprise_id", bill.enterpriseCode)
            .is("deleted_at", null)
            .maybeSingle()

          if (!obra) {
            console.warn("[BOLETO_SCAN] sem obra para enterpriseCode — mantendo claimado", {
              eventKey,
              enterpriseCode: bill.enterpriseCode,
            })
            continue
          }

          const { data: vinculo } = await admin
            .from("cliente_obras")
            .select("obra_id")
            .eq("obra_id", obra.id)
            .eq("user_id", cliente.id)
            .maybeSingle()

          if (!vinculo) {
            console.warn("[BOLETO_SCAN] cliente não vinculado à obra no portal — mantendo claimado", {
              userId: cliente.id,
              obraId: obra.id,
            })
            continue
          }

          await notifyNovoBoleto({
            orgId: obra.org_id,
            userId: cliente.id,
            nome: cliente.name,
            email: cliente.email,
            phone: cliente.phone,
            obraId: obra.id,
            obraName: obra.name,
            vencimento: formatDate(inst.dueDate),
          })
          sentForClient = true
          notified++
        } catch (err) {
          // Falha transitória (Sienge indisponível): libera o claim para re-tentar no próximo run.
          released = true
          await admin.from("sienge_webhook_dedup").delete().eq("event_key", eventKey)
          throw err
        } finally {
          if (released) {
            console.warn("[BOLETO_SCAN] claim liberado por falha transitória", { eventKey })
          }
        }
      }
    } catch (err) {
      clientErrors++
      console.error("[BOLETO_SCAN] erro no cliente — pulando:", {
        userId: cliente.id,
        err: err instanceof Error ? err.message : String(err),
      })
    }

    await sleep(PAGE_DELAY_MS)
  }

  const summary = { ok: true, scanned, notified, suppressed, clientErrors }
  console.log("[BOLETO_SCAN] concluído:", summary)
  return NextResponse.json(summary)
}
