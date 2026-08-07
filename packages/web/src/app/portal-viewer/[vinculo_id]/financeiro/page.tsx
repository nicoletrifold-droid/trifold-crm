import { redirect } from "next/navigation"
import { requireViewerAccess, getViewerVinculo } from "@web/lib/portal/viewer"
import { getVinculoFinancialStatement } from "@web/lib/portal/obra-financeiro"
import type { FormattedInstallment } from "@web/lib/integrations/sienge/types"

const CONDITION_LABEL: Record<string, string> = {
  AT: "À Vista",
  PI: "Entrada",
  PM: "Parcela",
  CH: "Chave",
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function StatusBadge({ status }: { status: FormattedInstallment["status"] }) {
  if (status === "PAGO") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
        Pago
      </span>
    )
  }
  if (status === "PARCIAL") {
    return (
      <span className="inline-flex items-center rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-400">
        Parcialmente pago
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

export default async function ViewerFinanceiroPage({
  params,
}: {
  params: Promise<{ vinculo_id: string }>
}) {
  const { vinculo_id } = await params
  const { user, admin } = await requireViewerAccess()

  const ctx = await getViewerVinculo(admin, vinculo_id, user.orgId)
  if (!ctx) redirect("/dashboard/portal-cliente")

  const { configured, unavailable, installments } = await getVinculoFinancialStatement(
    ctx.siengeCustomerId,
    ctx.contractNumbers
  )

  if (!configured) {
    return (
      <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-12 text-center">
        <p className="text-sm font-medium text-white">Extrato indisponível</p>
        <p className="mt-1 text-sm text-stone-500">
          Este cliente não tem vínculo Sienge (sienge_customer_id).
        </p>
      </div>
    )
  }

  if (unavailable) {
    return (
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-6 py-12 text-center">
        <p className="text-sm font-medium text-amber-300">Serviço temporariamente indisponível</p>
        <p className="mt-1 text-sm text-stone-500">
          Não foi possível conectar ao sistema financeiro. Tente novamente em alguns minutos.
        </p>
      </div>
    )
  }

  const pagas = installments.filter((i) => i.status === "PAGO")
  const parciais = installments.filter((i) => i.status === "PARCIAL")
  const pendentes = installments.filter((i) => i.status !== "PAGO")
  // Total pago = todas as baixas, inclusive as parciais de parcelas em aberto.
  const totalPago = installments.reduce((s, i) => s + (i.receiptValue ?? 0), 0)
  const totalPendente = pendentes.reduce(
    (s, i) => s + (i.currentBalance > 0 ? i.currentBalance : i.originalValue),
    0
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {ctx.clienteNome ? (
          <p className="text-xs text-stone-500">
            Extrato de <span className="font-medium text-stone-300">{ctx.clienteNome}</span>
          </p>
        ) : (
          <span />
        )}
        {installments.length > 0 && (
          <a
            href={`/api/dashboard/portal-cliente/${vinculo_id}/extrato-pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#E8856A] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#d4705a]"
          >
            Gerar PDF do extrato
          </a>
        )}
      </div>

      {installments.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {totalPago > 0 && (
            <div className="rounded-xl border border-stone-800 bg-stone-900 p-3 text-center">
              <p className="text-xs font-semibold text-emerald-400">Pago</p>
              <p className="mt-1 text-sm font-bold text-white">{formatCurrency(totalPago)}</p>
              <p className="text-xs text-stone-500">
                {pagas.length} parcela{pagas.length !== 1 ? "s" : ""}
                {parciais.length > 0 &&
                  ` + ${parciais.length} parcial${parciais.length !== 1 ? "is" : ""}`}
              </p>
            </div>
          )}
          {pendentes.length > 0 && (
            <div className="rounded-xl border border-stone-800 bg-stone-900 p-3 text-center">
              <p className="text-xs font-semibold text-stone-400">Em aberto</p>
              <p className="mt-1 text-sm font-bold text-white">{formatCurrency(totalPendente)}</p>
              <p className="text-xs text-stone-500">
                {pendentes.length} parcela{pendentes.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {installments.length === 0 ? (
        <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-12 text-center">
          <p className="text-sm text-stone-500">Nenhuma parcela encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {installments.map((inst) => (
            <div
              key={`${inst.billReceivableId}-${inst.installmentId}`}
              className="rounded-xl border border-stone-800 bg-stone-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {CONDITION_LABEL[inst.conditionType] ?? inst.conditionType} {inst.installmentNumber}
                    </span>
                    <StatusBadge status={inst.status} />
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    Vencimento: {formatDate(inst.dueDate)}
                    {inst.receiptDate && inst.receipts.length === 1 && (
                      <span className="ml-3 text-emerald-400">Pago em: {formatDate(inst.receiptDate)}</span>
                    )}
                    {inst.documentId && <span className="ml-3 text-stone-400">Doc: {inst.documentId}</span>}
                  </p>
                  <p className="mt-2 text-base font-bold text-white">
                    {formatCurrency(
                      inst.status === "PAGO"
                        ? (inst.receiptValue ?? inst.originalValue)
                        : inst.currentBalance > 0
                          ? inst.currentBalance
                          : inst.originalValue
                    )}
                    {inst.status === "PARCIAL" && (
                      <span className="ml-2 text-xs font-medium text-stone-400">em aberto</span>
                    )}
                  </p>
                  {inst.status === "PARCIAL" && (
                    <p className="mt-0.5 text-xs text-emerald-400">
                      Pago até agora: {formatCurrency(inst.receiptValue ?? 0)}
                    </p>
                  )}
                  {inst.receipts.length > 1 && (
                    <div className="mt-2 rounded-lg bg-stone-800/60 px-3 py-2">
                      <p className="text-xs font-semibold text-stone-400">
                        Pagamentos ({inst.receipts.length})
                      </p>
                      {inst.receipts.map((r, ri) => (
                        <p key={ri} className="mt-0.5 text-xs text-stone-500">
                          {formatDate(r.receiptDate)} — {formatCurrency(r.receiptValue)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                {inst.hasBoleto && inst.status !== "PAGO" && (
                  <a
                    href={`/api/dashboard/portal-cliente/${vinculo_id}/boleto?billReceivableId=${inst.billReceivableId}&installmentId=${inst.installmentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 rounded-lg bg-[#F27A5E] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#d4705a]"
                  >
                    Ver boleto
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
