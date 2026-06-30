import { NextRequest, NextResponse, after } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getReceivableBill, getFinancialStatement } from "@web/lib/integrations/sienge/client"
import { notifyNovoBoleto } from "@web/lib/notificacoes"

// Story 75-76 — Webhook do Sienge: notifica o cliente do portal quando um novo
// boleto é registrado no banco (evento PAYMENT_SLIP_REGISTERED, status CONFIRMED).
//
// Mecânica do Sienge: POST na nossa URL, evento no header `x-sienge-event`, timeout
// de 2,5s para resposta e retry agressivo (10→30→60→180→300 min, ~10h). Por isso:
//  1. respondemos 200 imediatamente e processamos em `after()`;
//  2. idempotência via claim_sienge_webhook (dedup por receivableBillId:installmentId).
// A origem é validada por um segredo na query string da URL registrada no hook
// (`?token=<SIENGE_WEBHOOK_TOKEN>`), pois controlamos a URL do `POST /hooks`.

const EVENTO_BOLETO = "PAYMENT_SLIP_REGISTERED"

interface PaymentSlipEvent {
  receivableBillId?: number
  installmentId?: number
  accountNumber?: string
  status?: string
}

export async function POST(request: NextRequest) {
  const expected = process.env.SIENGE_WEBHOOK_TOKEN
  if (!expected) {
    console.error("[SIENGE-WEBHOOK] SIENGE_WEBHOOK_TOKEN não configurado — webhook bloqueado")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }

  const token = request.nextUrl.searchParams.get("token")
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const event = request.headers.get("x-sienge-event") ?? ""
  const eventId = request.headers.get("x-sienge-id") ?? ""

  let body: PaymentSlipEvent
  try {
    body = (await request.json()) as PaymentSlipEvent
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Só nos interessa o registro de boleto confirmado. Demais eventos/status: 200 silencioso.
  if (event !== EVENTO_BOLETO || body.status !== "CONFIRMED") {
    return NextResponse.json({ status: "ignored" })
  }

  if (!body.receivableBillId || !body.installmentId) {
    return NextResponse.json({ status: "ignored" })
  }

  // Responde já (< 2,5s); processamento pesado é assíncrono.
  const payload = { receivableBillId: body.receivableBillId, installmentId: body.installmentId }
  after(async () => {
    await processBoletoAsync(payload.receivableBillId, payload.installmentId, eventId)
  })

  return NextResponse.json({ status: "ok" })
}

async function processBoletoAsync(
  receivableBillId: number,
  installmentId: number,
  eventId: string
): Promise<void> {
  const admin = createAdminClient()
  // Dedup por chave de negócio (estável entre retries do Sienge).
  const eventKey = `${receivableBillId}:${installmentId}`

  const { data: claimed, error: claimError } = await admin.rpc("claim_sienge_webhook", {
    p_event_key: eventKey,
    p_event_type: EVENTO_BOLETO,
  })
  if (!claimError && claimed !== true) {
    console.log("[SIENGE-WEBHOOK] evento duplicado (retry) — ignorando", { eventKey, eventId })
    return
  }
  if (claimError) {
    console.error("[SIENGE-WEBHOOK] claim_sienge_webhook falhou — seguindo sem dedup:", claimError)
  }

  let transientFailure = false
  try {
    const bill = await getReceivableBill(receivableBillId)
    if (!bill?.customerId) {
      console.warn("[SIENGE-WEBHOOK] título sem customerId/encontrado — ignorando", { receivableBillId })
      return
    }

    // Mapeia empreendimento Sienge → obra do portal.
    const { data: obra } = await admin
      .from("obras")
      .select("id, name, org_id")
      .eq("sienge_enterprise_id", bill.enterpriseCode ?? -1)
      .is("deleted_at", null)
      .maybeSingle()

    if (!obra) {
      console.warn("[SIENGE-WEBHOOK] sem obra para enterpriseCode — ignorando", {
        receivableBillId,
        enterpriseCode: bill.enterpriseCode,
      })
      return
    }

    // Cliente do portal = users.sienge_customer_id == customerId do título.
    const { data: portalUsers } = await admin
      .from("users")
      .select("id, name, email, phone")
      .eq("sienge_customer_id", bill.customerId)

    if (!portalUsers?.length) {
      console.warn("[SIENGE-WEBHOOK] sem portal user para customerId — ignorando", {
        customerId: bill.customerId,
      })
      return
    }

    // Vencimento da parcela específica (o evento só traz IDs).
    let vencimento = ""
    try {
      const installments = await getFinancialStatement(bill.customerId)
      const inst = installments.find(
        (i) => i.billReceivableId === receivableBillId && i.installmentId === installmentId
      )
      if (inst?.dueDate) vencimento = formatDate(inst.dueDate)
    } catch (err) {
      // Sienge indisponível → transitório: libera o dedup para o retry re-tentar.
      transientFailure = true
      throw err
    }

    // Dispara apenas para usuários efetivamente vinculados a esta obra (o deep-link
    // /cliente/boleto/{obra_id} também exige o vínculo).
    let enviados = 0
    for (const user of portalUsers) {
      const { data: vinculo } = await admin
        .from("cliente_obras")
        .select("obra_id")
        .eq("obra_id", obra.id)
        .eq("user_id", user.id)
        .maybeSingle()
      if (!vinculo) continue

      await notifyNovoBoleto({
        orgId: obra.org_id,
        userId: user.id,
        nome: user.name,
        email: user.email,
        phone: user.phone,
        obraId: obra.id,
        obraName: obra.name,
        vencimento,
      })
      enviados++
    }

    if (enviados === 0) {
      console.warn("[SIENGE-WEBHOOK] customer não vinculado à obra no portal — nada enviado", {
        customerId: bill.customerId,
        obraId: obra.id,
      })
    }
  } catch (err) {
    console.error("[SIENGE-WEBHOOK] processBoletoAsync error:", err)
    if (transientFailure) {
      // Libera o slot para que a retry do Sienge re-processe.
      await admin.from("sienge_webhook_dedup").delete().eq("event_key", eventKey)
    }
  }
}

/** "2026-04-27" → "27/04/2026". */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0]?.split("-") ?? []
  return y && m && d ? `${d}/${m}/${y}` : iso
}
