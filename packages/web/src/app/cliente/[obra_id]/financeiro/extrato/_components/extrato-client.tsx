"use client"

import { useState, useMemo } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import type { FormattedInstallment } from "@web/lib/integrations/sienge/types"
import { getNonCashLabel, getOpenBalance } from "@web/lib/integrations/sienge/installments"

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
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function StatusBadge({ inst }: { inst: FormattedInstallment }) {
  const status = inst.status
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
  if (status === "RENEGOCIADA") {
    // Rótulo pelo tipo real da baixa: distrato, cancelamento e substituição
    // caem no mesmo status, mas não são "renegociada" para o cliente.
    return (
      <span className="inline-flex items-center rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
        {getNonCashLabel(inst)}
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

interface Props {
  obraId: string
  installments: FormattedInstallment[]
  unidadeInicial?: string
  de?: string
  ate?: string
}

export function ExtratoClient({ obraId, installments, unidadeInicial, de, ate }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [unidade, setUnidade] = useState(unidadeInicial ?? "")

  const unidades = useMemo(() => {
    const ids = [...new Set(installments.map((i) => i.documentId).filter(Boolean))].sort()
    return ids
  }, [installments])

  const hasMultipleUnidades = unidades.length > 1

  const filtered = useMemo(() => {
    if (!unidade) return installments
    return installments.filter((i) => i.documentId === unidade)
  }, [installments, unidade])

  function handleUnidadeChange(value: string) {
    setUnidade(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set("unidade", value)
    } else {
      params.delete("unidade")
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const pdfParams = new URLSearchParams()
  if (de) pdfParams.set("de", de)
  if (ate) pdfParams.set("ate", ate)
  if (unidade) pdfParams.set("unidade", unidade)
  const pdfQs = pdfParams.toString()
  const pdfHref = `/api/cliente/obras/${obraId}/financeiro/extrato/pdf${pdfQs ? `?${pdfQs}` : ""}`

  const pagas = filtered.filter((i) => i.status === "PAGO")
  const parciais = filtered.filter((i) => i.status === "PARCIAL")
  const semPagamento = filtered.filter((i) => i.status === "RENEGOCIADA")
  const pendentes = filtered.filter(
    (i) => i.status !== "PAGO" && i.status !== "RENEGOCIADA"
  )
  // Total pago = baixas em dinheiro, inclusive as parciais de parcelas em
  // aberto. Baixa que não é pagamento não entra: já foi filtrada em
  // getFinancialStatement.
  const totalPago = filtered.reduce((sum, i) => sum + (i.receiptValue ?? 0), 0)
  const totalPendente = pendentes.reduce((sum, i) => sum + getOpenBalance(i), 0)

  return (
    <>
      {/* Seletor de unidade — só aparece quando há 2+ unidades */}
      {hasMultipleUnidades && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-stone-400">Unidade:</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleUnidadeChange("")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                unidade === ""
                  ? "bg-[#F27A5E] text-white"
                  : "border border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200"
              }`}
            >
              Todas
            </button>
            {unidades.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => handleUnidadeChange(u)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  unidade === u
                    ? "bg-[#F27A5E] text-white"
                    : "border border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Link PDF atualizado com filtro de unidade */}
      <div className="mb-4 flex justify-end">
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-[#E8856A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d4705a] active:scale-95"
        >
          Gerar PDF
        </a>
      </div>

      {/* Resumo */}
      {filtered.length > 0 && (
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

      {/* Explica as parcelas baixadas sem pagamento — sem isso o cliente vê parcelas
          sem valor pago e sem saldo, e acha que sumiu dinheiro. */}
      {semPagamento.length > 0 && (
        <div className="mb-4 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
          <p className="text-xs leading-relaxed text-stone-400">
            <span className="font-semibold text-violet-300">
              {semPagamento.length === 1
                ? "1 parcela baixada sem pagamento."
                : `${semPagamento.length} parcelas baixadas sem pagamento.`}
            </span>{" "}
            São baixas que o Sienge registra sem entrada de dinheiro — renegociação,
            substituição, cancelamento, distrato ou adiantamento. Não entram no total pago
            nem no total em aberto, para a mesma dívida não ser contada duas vezes.
          </p>
        </div>
      )}

      {/* Lista de parcelas */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-12 text-center">
          <p className="text-sm text-stone-500">Nenhuma parcela encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inst) => (
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
                    <StatusBadge inst={inst} />
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    Vencimento: {formatDate(inst.dueDate)}
                    {inst.receiptDate && inst.receipts.length === 1 && (
                      <span className="ml-3 text-emerald-400">
                        Pago em: {formatDate(inst.receiptDate)}
                      </span>
                    )}
                    {inst.documentId && (
                      <span className="ml-3 text-stone-400">Doc: {inst.documentId}</span>
                    )}
                  </p>
                  <p className="mt-2 text-base font-bold text-white">
                    {formatCurrency(
                      inst.status === "PAGO"
                        ? (inst.receiptValue ?? inst.originalValue)
                        : inst.status === "RENEGOCIADA"
                          ? inst.originalValue
                          : getOpenBalance(inst)
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
                    href={`/api/cliente/obras/${obraId}/financeiro/boleto?billReceivableId=${inst.billReceivableId}&installmentId=${inst.installmentId}`}
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
    </>
  )
}
