import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"
import { getFinancialStatement } from "@web/lib/integrations/sienge/client"
import type { FormattedInstallment } from "@web/lib/integrations/sienge/types"

interface PageProps {
  params: Promise<{ obra_id: string }>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

const CONDITION_LABEL: Record<string, string> = {
  AT: "À Vista",
  PI: "Entrada",
  PM: "Parcela",
  CH: "Chave",
}

function StatusBadge({ status }: { status: FormattedInstallment["status"] }) {
  if (status === "PAGO") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
        Pago
      </span>
    )
  }
  if (status === "BOLETO_GERADO") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
        Boleto gerado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-stone-700/60 px-2.5 py-0.5 text-xs font-semibold text-stone-400">
      Em aberto
    </span>
  )
}

export default async function FinanceiroPage({ params }: PageProps) {
  const { obra_id } = await params
  const supabase = await createClient()

  // Valida acesso: obra deve existir E o usuário autenticado deve ter vínculo via cliente_obras
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: portalUserBase } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single()

  if (!portalUserBase) redirect("/login")

  const { data: acesso } = await supabase
    .from("cliente_obras")
    .select("obra_id")
    .eq("obra_id", obra_id)
    .eq("user_id", portalUserBase.id)
    .single()

  const { data: obra } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .single()

  if (!obra || !acesso) redirect("/cliente/sem-obra")

  let installments: FormattedInstallment[] = []
  let siengeConfigured = false
  let siengeUnavailable = false

  if (user) {
    const { data: portalUser } = await supabase
      .from("users")
      .select("id, sienge_customer_id, cpf, email")
      .eq("auth_id", user.id)
      .single()

    let siengeCustomerId: number | null = portalUser?.sienge_customer_id ?? null

    // Fallback por email via clientes_obras_vinculos
    if (!siengeCustomerId && portalUser?.email) {
      const { data: vinculos } = await supabase
        .from("clientes_obras_vinculos")
        .select("clientes(sienge_customer_id, email)")
        .eq("obra_id", obra_id)

      for (const v of vinculos ?? []) {
        const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
        if ((c as { email?: string | null })?.email === portalUser.email) {
          siengeCustomerId =
            (c as { sienge_customer_id?: number | null })?.sienge_customer_id ?? null
          if (siengeCustomerId) {
            await supabase
              .from("users")
              .update({ sienge_customer_id: siengeCustomerId })
              .eq("id", portalUser.id)
          }
          break
        }
      }
    }

    if (siengeCustomerId) {
      siengeConfigured = true
      try {
        installments = await getFinancialStatement(siengeCustomerId)

        // Filtra installments por contract numbers desta obra (se houver)
        const { data: vinculos } = await supabase
          .from("clientes_obras_vinculos")
          .select("sienge_contract_numbers, clientes(sienge_customer_id)")
          .eq("obra_id", obra_id)

        const vinculo = (vinculos ?? []).find((v) => {
          const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
          return (
            (c as { sienge_customer_id?: number | null })?.sienge_customer_id ===
            siengeCustomerId
          )
        })

        const contractNumbers =
          (vinculo as { sienge_contract_numbers?: string[] | null } | undefined)
            ?.sienge_contract_numbers ?? []

        if (contractNumbers.length > 0) {
          installments = installments.filter((i) =>
            contractNumbers.includes(i.documentId)
          )
        }
      } catch {
        siengeUnavailable = true
      }
    }
  }

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Mobile header */}
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs text-stone-500">Financeiro</p>
          <p className="text-sm font-semibold text-white">{obra.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 lg:py-8">
        <h1 className="mb-6 text-xl font-bold text-white lg:text-2xl">Financeiro</h1>

        {!siengeConfigured && (
          <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-12 text-center">
            <p className="text-sm font-medium text-white">Extrato indisponível</p>
            <p className="mt-1 text-sm text-stone-500">
              O extrato financeiro ainda não foi vinculado. Entre em contato com a construtora.
            </p>
          </div>
        )}

        {siengeConfigured && siengeUnavailable && (
          <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-6 py-12 text-center">
            <p className="text-sm font-medium text-amber-300">Serviço temporariamente indisponível</p>
            <p className="mt-1 text-sm text-stone-500">
              Não foi possível conectar ao sistema financeiro. Tente novamente em alguns minutos.
            </p>
          </div>
        )}

        {siengeConfigured && !siengeUnavailable && installments.length === 0 && (
          <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-12 text-center">
            <p className="text-sm text-stone-500">Nenhuma parcela encontrada.</p>
          </div>
        )}

        {siengeConfigured && !siengeUnavailable && installments.length > 0 && (
          <div className="space-y-3">
            {installments.map((inst) => (
              <div
                key={`${inst.billReceivableId}-${inst.installmentId}`}
                className="rounded-xl border border-stone-800 bg-stone-900 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {CONDITION_LABEL[inst.conditionType] ?? inst.conditionType}{" "}
                        {inst.installmentNumber}
                      </span>
                      <StatusBadge status={inst.status} />
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      Vencimento: {formatDate(inst.dueDate)}
                      {inst.documentId && (
                        <span className="ml-3 text-stone-600">Doc: {inst.documentId}</span>
                      )}
                    </p>
                    <p className="mt-2 text-base font-bold text-white">
                      {formatCurrency(inst.currentBalance > 0 ? inst.currentBalance : inst.originalValue)}
                    </p>
                  </div>

                  {/* Right: boleto button */}
                  {inst.hasBoleto && inst.status !== "PAGO" && (
                    <a
                      href={`/api/cliente/obras/${obra_id}/financeiro/boleto?billReceivableId=${inst.billReceivableId}&installmentId=${inst.installmentId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 rounded-lg bg-[#F27A5E] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#d4705a] active:scale-95"
                    >
                      Ver boleto
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
