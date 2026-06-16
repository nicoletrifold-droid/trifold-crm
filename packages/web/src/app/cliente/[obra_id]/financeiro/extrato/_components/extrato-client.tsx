"use client"

import { useState, useMemo } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
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
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
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
  const pendentes = filtered.filter((i) => i.status !== "PAGO")
  const totalPago = pagas.reduce((sum, i) => sum + (i.receiptValue ?? i.originalValue), 0)
  const totalPendente = pendentes.reduce(
    (sum, i) => sum + (i.currentBalance > 0 ? i.currentBalance : i.originalValue),
    0
  )

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
                    <StatusBadge status={inst.status} />
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    Vencimento: {formatDate(inst.dueDate)}
                    {inst.receiptDate && (
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
                        : inst.currentBalance > 0
                          ? inst.currentBalance
                          : inst.originalValue
                    )}
                  </p>
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
