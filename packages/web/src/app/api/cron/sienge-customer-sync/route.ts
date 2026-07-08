import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getCustomerById } from "@web/lib/integrations/sienge/client"
import { syncClienteEmail } from "@web/lib/integrations/sienge/customer-profile-sync"

// Story 79-1 — cron diário: reflete no CRM as mudanças de e-mail feitas no Sienge e
// propaga ao login do portal (users + auth). Não há webhook de cadastro no Sienge
// (só de boleto), então o mecanismo é polling dos clientes já vinculados.

export const maxDuration = 300

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: clientes, error } = await admin
    .from("clientes")
    .select("id, email, sienge_customer_id, org_id")
    .not("sienge_customer_id", "is", null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let checked = 0
  let errors = 0
  const changes: Array<{
    clienteId: string
    from: string | null
    to: string | null
    portalUpdated: boolean
    portalError?: string
  }> = []

  for (const c of clientes ?? []) {
    checked++
    try {
      const customer = await getCustomerById(c.sienge_customer_id as number)
      if (customer) {
        const outcome = await syncClienteEmail(
          admin,
          {
            id: c.id as string,
            email: c.email as string | null,
            sienge_customer_id: c.sienge_customer_id as number,
            org_id: c.org_id as string,
          },
          customer.email
        )
        if (outcome.changed) {
          changes.push({
            clienteId: c.id as string,
            from: outcome.oldEmail,
            to: outcome.newEmail,
            portalUpdated: outcome.portalUpdated,
            ...(outcome.portalError ? { portalError: outcome.portalError } : {}),
          })
        }
      }
    } catch {
      errors++
    }
    // Respeita o rate limit do Sienge (mesmo padrão do boleto-scan).
    await sleep(300)
  }

  return NextResponse.json({ ok: true, checked, changed: changes.length, errors, changes })
}
