import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, FileDown } from "lucide-react"
import { createClient } from "@web/lib/supabase/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getFinancialStatement } from "@web/lib/integrations/sienge/client"
import type { FormattedInstallment } from "@web/lib/integrations/sienge/types"

interface PageProps {
  params: Promise<{ obra_id: string }>
  searchParams: Promise<{ de?: string; ate?: string }>
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
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

export default async function ExtratoPage({ params, searchParams }: PageProps) {
  const { obra_id } = await params
  const { de, ate } = await searchParams

  const supabase = await createClient()

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
          const adminClient = createAdminClient()
          await adminClient
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

      // Filtra por contrato da obra (se houver)
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
        installments = installments.filter((i) => contractNumbers.includes(i.documentId))
      }

      // Aplica filtro de período
      if (de) installments = installments.filter((i) => i.dueDate >= de)
      if (ate) installments = installments.filter((i) => i.dueDate <= ate)

      // Ordena por vencimento
      installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    } catch {
      siengeUnavailable = true
    }
  }

  // Monta query string para o PDF (com os mesmos filtros)
  const pdfParams = new URLSearchParams()
  if (de) pdfParams.set("de", de)
  if (ate) pdfParams.set("ate", ate)
  const pdfQs = pdfParams.toString()
  const pdfHref = `/api/cliente/obras/${obra_id}/financeiro/extrato/pdf${pdfQs ? `?${pdfQs}` : ""}`

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Mobile header */}
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs text-stone-500">Financeiro · Extrato</p>
          <p className="text-sm font-semibold text-white">{obra.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 lg:py-8">
        <Link
          href={`/cliente/${obra_id}/financeiro`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-stone-400 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold text-white lg:text-2xl">Extrato</h1>

          {siengeConfigured && !siengeUnavailable && (
            <a
              href={pdfHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg bg-[#E8856A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d4705a] active:scale-95"
            >
              <FileDown className="h-4 w-4" />
              Gerar PDF
            </a>
          )}
        </div>

        {/* Filtro de período */}
        {siengeConfigured && !siengeUnavailable && (
          <form
            method="GET"
            className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-stone-800 bg-stone-900 p-4"
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-400">Vencimento de</label>
              <input
                type="date"
                name="de"
                defaultValue={de ?? ""}
                className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white placeholder-stone-500 focus:border-[#E8856A] focus:outline-none"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-400">até</label>
              <input
                type="date"
                name="ate"
                defaultValue={ate ?? ""}
                className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white placeholder-stone-500 focus:border-[#E8856A] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-stone-700 bg-stone-800 px-4 py-2 text-sm font-medium text-stone-300 transition-colors hover:border-stone-600 hover:text-white"
            >
              Filtrar
            </button>
            {(de || ate) && (
              <a
                href={`/cliente/${obra_id}/financeiro/extrato`}
                className="rounded-lg px-4 py-2 text-sm text-stone-500 transition-colors hover:text-stone-300"
              >
                Limpar
              </a>
            )}
          </form>
        )}

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
            <p className="text-sm text-stone-500">
              {de || ate ? "Nenhuma parcela no período selecionado." : "Nenhuma parcela encontrada."}
            </p>
          </div>
        )}

        {siengeConfigured && !siengeUnavailable && installments.length > 0 && (
          <>
            {/* Resumo rápido */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["PAGO", "BOLETO_GERADO", "EM_ABERTO"] as const).map((status) => {
                const group = installments.filter((i) => i.status === status)
                if (group.length === 0) return null
                const total = group.reduce(
                  (sum, i) =>
                    sum + (status === "PAGO" ? i.originalValue : i.currentBalance > 0 ? i.currentBalance : i.originalValue),
                  0
                )
                const label =
                  status === "PAGO" ? "Pago" : status === "BOLETO_GERADO" ? "Boleto" : "Em aberto"
                const color =
                  status === "PAGO"
                    ? "text-emerald-400"
                    : status === "BOLETO_GERADO"
                      ? "text-amber-400"
                      : "text-stone-400"
                return (
                  <div key={status} className="rounded-xl border border-stone-800 bg-stone-900 p-3 text-center">
                    <p className={`text-xs font-semibold ${color}`}>{label}</p>
                    <p className="mt-1 text-sm font-bold text-white">{formatCurrency(total)}</p>
                    <p className="text-xs text-stone-500">{group.length} parcela{group.length !== 1 ? "s" : ""}</p>
                  </div>
                )
              })}
            </div>

            {/* Lista de parcelas */}
            <div className="space-y-3">
              {installments.map((inst) => (
                <div
                  key={`${inst.billReceivableId}-${inst.installmentId}`}
                  className="rounded-xl border border-stone-800 bg-stone-900 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
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
                        {inst.receiptDate && (
                          <span className="ml-3 text-emerald-600">
                            Pago em: {formatDate(inst.receiptDate)}
                          </span>
                        )}
                        {inst.documentId && (
                          <span className="ml-3 text-stone-600">Doc: {inst.documentId}</span>
                        )}
                      </p>
                      <p className="mt-2 text-base font-bold text-white">
                        {formatCurrency(
                          inst.status === "PAGO"
                            ? inst.originalValue
                            : inst.currentBalance > 0
                              ? inst.currentBalance
                              : inst.originalValue
                        )}
                      </p>
                    </div>

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
          </>
        )}
      </main>
    </div>
  )
}
