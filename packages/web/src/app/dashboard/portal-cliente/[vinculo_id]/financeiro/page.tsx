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
  const pendentes = installments.filter((i) => i.status !== "PAGO")
  const totalPago = pagas.reduce((s, i) => s + (i.receiptValue ?? i.originalValue), 0)
  const totalPendente = pendentes.reduce(
    (s, i) => s + (i.currentBalance > 0 ? i.currentBalance : i.originalValue),
    0
  )

  return (
    <div>
      {ctx.clienteNome && (
        <p className="mb-4 text-xs text-stone-500">
          Extrato de <span className="font-medium text-stone-300">{ctx.clienteNome}</span>
        </p>
      )}

      {installments.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pagas.length > 0 && (
            <div className="rounded-xl border border-stone-800 bg-stone-900 p-3 text-center">
              <p className="text-xs font-semibold text-emerald-400">Pago</p>
              <p className="mt-1 text-sm font-bold text-white">{formatCurrency(totalPago)}</p>
              <p className="text-xs text-stone-500">
                {pagas.length} parcela{pagas.length !== 1 ? "s" : ""}
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {CONDITION_LABEL[inst.conditionType] ?? inst.conditionType} {inst.installmentNumber}
                </span>
                <StatusBadge status={inst.status} />
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Vencimento: {formatDate(inst.dueDate)}
                {inst.receiptDate && (
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
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
