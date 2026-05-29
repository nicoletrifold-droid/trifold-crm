import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, FileDown, TrendingDown, TrendingUp, Wallet } from "lucide-react"
import { createClient } from "@web/lib/supabase/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getFinancialStatement, getIncomeTax, computeInformeFromStatements } from "@web/lib/integrations/sienge/client"
import type { ComputedInforme } from "@web/lib/integrations/sienge/types"

interface PageProps {
  params: Promise<{ obra_id: string }>
  searchParams: Promise<{ ano?: string }>
}

const CURRENT_YEAR = new Date().getFullYear()

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function buildInformeFromSienge(
  siengeResult: NonNullable<Awaited<ReturnType<typeof getIncomeTax>>>,
  year: number
): ComputedInforme {
  const contracts = siengeResult.results[0]?.enterprises.flatMap((e) => e.contracts) ?? []
  const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
  const monthMap = new Map<number, number>()
  for (const c of contracts) {
    for (const p of c.payments) {
      monthMap.set(p.month, (monthMap.get(p.month) ?? 0) + p.value)
    }
  }
  return {
    year,
    totalPaidInYear: contracts.reduce((s, c) => s + c.paidValueInYear, 0),
    accumulatedPaid: contracts.reduce((s, c) => s + c.accumulatedPaidValue, 0),
    remainingBalance: contracts.reduce((s, c) => s + c.remainingBalance, 0),
    totalContractValue: contracts.reduce((s, c) => s + c.totalContractValue, 0),
    contractNumbers: contracts.map((c) => c.contractNumber),
    monthlyBreakdown: Array.from(monthMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([month, value]) => ({ month, monthName: MONTHS[month - 1] ?? "", value, installments: [] })),
    source: "sienge",
  }
}

export default async function InformePage({ params, searchParams }: PageProps) {
  const { obra_id } = await params
  const { ano } = await searchParams

  const year = ano ? parseInt(ano) : CURRENT_YEAR - 1
  const safeYear = isNaN(year) || year < 2000 || year > CURRENT_YEAR ? CURRENT_YEAR - 1 : year

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: portalUserBase } = await supabase
    .from("users").select("id").eq("auth_id", user.id).single()
  if (!portalUserBase) redirect("/login")

  const { data: acesso } = await supabase
    .from("cliente_obras").select("obra_id")
    .eq("obra_id", obra_id).eq("user_id", portalUserBase.id).single()

  const { data: obra } = await supabase
    .from("obras").select("id, name").eq("id", obra_id).single()

  if (!obra || !acesso) redirect("/cliente/sem-obra")

  const { data: portalUser } = await supabase
    .from("users").select("id, sienge_customer_id, cpf, email, name")
    .eq("auth_id", user.id).single()

  let siengeCustomerId: number | null = portalUser?.sienge_customer_id ?? null

  if (!siengeCustomerId && portalUser?.email) {
    const { data: vinculos } = await supabase
      .from("clientes_obras_vinculos")
      .select("clientes(sienge_customer_id, email)")
      .eq("obra_id", obra_id)

    for (const v of vinculos ?? []) {
      const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      if ((c as { email?: string | null })?.email === portalUser.email) {
        siengeCustomerId = (c as { sienge_customer_id?: number | null })?.sienge_customer_id ?? null
        if (siengeCustomerId) {
          const adminClient = createAdminClient()
          await adminClient.from("users").update({ sienge_customer_id: siengeCustomerId }).eq("id", portalUserBase.id)
        }
        break
      }
    }
  }

  let informe: ComputedInforme | null = null
  let siengeUnavailable = false

  if (siengeCustomerId) {
    try {
      let installments = await getFinancialStatement(siengeCustomerId)

      // Filtra por contrato da obra
      const { data: vinculos } = await supabase
        .from("clientes_obras_vinculos")
        .select("sienge_contract_numbers, clientes(sienge_customer_id)")
        .eq("obra_id", obra_id)

      const vinculo = (vinculos ?? []).find((v) => {
        const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
        return (c as { sienge_customer_id?: number | null })?.sienge_customer_id === siengeCustomerId
      })

      const contractNumbers =
        (vinculo as { sienge_contract_numbers?: string[] | null } | undefined)?.sienge_contract_numbers ?? []

      if (contractNumbers.length > 0) {
        installments = installments.filter((i) => contractNumbers.includes(i.documentId))
      }

      // Tenta endpoint dedicado; fallback para cálculo
      const siengeResult = await getIncomeTax(siengeCustomerId, safeYear)
      if (siengeResult?.results?.[0]) {
        informe = buildInformeFromSienge(siengeResult, safeYear)
      } else {
        informe = computeInformeFromStatements(installments, safeYear)
      }
    } catch {
      siengeUnavailable = true
    }
  }

  const years = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)
  const pdfHref = `/api/cliente/obras/${obra_id}/financeiro/informe/pdf?ano=${safeYear}`

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Mobile header */}
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs text-stone-500">Financeiro · Informe de Rendimentos</p>
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
          <div>
            <h1 className="text-xl font-bold text-white lg:text-2xl">Informe de Rendimentos</h1>
            <p className="mt-1 text-xs text-stone-500">Para fins de declaração de Imposto de Renda (IRPF)</p>
          </div>
          {informe && (
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

        {/* Seletor de ano */}
        <form method="GET" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-stone-800 bg-stone-900 p-4">
          <label className="text-sm font-medium text-stone-300">Ano-Calendário</label>
          <select
            name="ano"
            defaultValue={safeYear}
            className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white focus:border-[#E8856A] focus:outline-none"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-stone-700 bg-stone-800 px-4 py-2 text-sm font-medium text-stone-300 transition-colors hover:border-stone-600 hover:text-white"
          >
            Consultar
          </button>
        </form>

        {/* Estados */}
        {!siengeCustomerId && (
          <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-12 text-center">
            <p className="text-sm font-medium text-white">Informe indisponível</p>
            <p className="mt-1 text-sm text-stone-500">
              O vínculo financeiro ainda não foi configurado. Entre em contato com a construtora.
            </p>
          </div>
        )}

        {siengeCustomerId && siengeUnavailable && (
          <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-6 py-12 text-center">
            <p className="text-sm font-medium text-amber-300">Serviço temporariamente indisponível</p>
            <p className="mt-1 text-sm text-stone-500">Tente novamente em alguns minutos.</p>
          </div>
        )}

        {informe && (
          <>
            {/* Aviso de fonte calculada */}
            {informe.source === "calculated" && (
              <div className="mb-4 rounded-xl border border-stone-700 bg-stone-900/50 px-4 py-3">
                <p className="text-xs text-stone-400">
                  <span className="font-semibold text-stone-300">Calculado a partir do extrato financeiro.</span>{" "}
                  Os valores são baseados nos recibos de pagamento registrados no sistema.
                </p>
              </div>
            )}

            {/* Cards de resumo */}
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400">Pago em {safeYear}</span>
                </div>
                <p className="text-lg font-bold text-white">{formatCurrency(informe.totalPaidInYear)}</p>
                {informe.source === "calculated" && (() => {
                  const count = informe.monthlyBreakdown.reduce((n, m) => n + m.installments.length, 0)
                  return count > 0 ? (
                    <p className="mt-1 text-xs text-stone-500">{count} parcela(s)</p>
                  ) : null
                })()}
              </div>

              <div className="rounded-xl border border-stone-800 bg-stone-900 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-stone-400" />
                  <span className="text-xs font-semibold text-stone-400">Total Acumulado</span>
                </div>
                <p className="text-lg font-bold text-white">{formatCurrency(informe.accumulatedPaid)}</p>
                <p className="mt-1 text-xs text-stone-500">Todos os anos</p>
              </div>

              <div className="rounded-xl border border-stone-800 bg-stone-900 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-stone-400" />
                  <span className="text-xs font-semibold text-stone-400">Saldo Devedor</span>
                </div>
                <p className="text-lg font-bold text-white">{formatCurrency(informe.remainingBalance)}</p>
                <p className="mt-1 text-xs text-stone-500">de {formatCurrency(informe.totalContractValue)}</p>
              </div>
            </div>

            {/* Tabela mensal */}
            {informe.monthlyBreakdown.length === 0 ? (
              <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-12 text-center">
                <p className="text-sm text-stone-500">Nenhum pagamento registrado em {safeYear}.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-stone-800 bg-stone-900 overflow-hidden">
                <div className="border-b border-stone-800 px-4 py-3">
                  <h2 className="text-sm font-semibold text-white">Pagamentos em {safeYear}</h2>
                </div>
                <div className="divide-y divide-stone-800">
                  {informe.monthlyBreakdown.map((m) => (
                    <div key={m.month} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{m.monthName}</p>
                        {m.installments.length > 0 && (
                          <p className="mt-0.5 text-xs text-stone-500">
                            {m.installments.map((i) => (
                              i.date ? `Parcela ${i.number} — ${formatDate(i.date)}` : `Parcela ${i.number}`
                            )).join(" · ")}
                          </p>
                        )}
                      </div>
                      <span className="ml-4 flex-shrink-0 text-sm font-bold text-white">
                        {formatCurrency(m.value)}
                      </span>
                    </div>
                  ))}
                  {/* Total */}
                  <div className="flex items-center justify-between bg-stone-800/50 px-4 py-3">
                    <span className="text-sm font-bold text-white">Total {safeYear}</span>
                    <span className="text-sm font-bold text-[#E8856A]">
                      {formatCurrency(informe.totalPaidInYear)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Nota IRPF */}
            <div className="mt-4 rounded-xl border border-stone-800 bg-stone-900/50 px-4 py-3">
              <p className="text-xs leading-relaxed text-stone-500">
                <span className="font-semibold text-stone-400">Como declarar no IRPF:</span> Na ficha{" "}
                <em>Bens e Direitos</em>, informe o saldo devedor atual ({formatCurrency(informe.remainingBalance)}) no
                campo "Situação em 31/12/{safeYear}". O valor pago no ano ({formatCurrency(informe.totalPaidInYear)})
                representa o acréscimo patrimonial do exercício. Em caso de dúvidas, consulte seu contador.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
