"use client"

import { useState } from "react"
import { Printer, X } from "lucide-react"
import type { BrindesFilters } from "./brindes-filter-bar"
import type { DataComemorativa, Destinatario, Entrega } from "./types"
import { STATUS_LABEL } from "./types"

interface PrintModalProps {
  filters: BrindesFilters
  datas: DataComemorativa[]
  selectedDateId: string | null
  entregasMap: Record<string, Entrega>
  onClose: () => void
}

const TIPO_LABEL: Record<string, string> = { mae: "Mãe", pai: "Pai", outro: "Outro" }

function buildEndereco(d: Destinatario): string {
  if (d.endereco_referencia) return d.endereco_referencia
  const parts = [
    d.endereco_logradouro,
    d.endereco_numero && `nº ${d.endereco_numero}`,
    d.endereco_complemento,
    d.endereco_bairro,
    d.endereco_cidade,
    d.endereco_estado,
    d.endereco_cep && `CEP ${d.endereco_cep}`,
  ].filter(Boolean)
  return parts.join(", ") || "—"
}

function buildPrintHtml(
  records: Destinatario[],
  entregasMap: Record<string, Entrega>,
  dataNome: string | undefined,
  hasDate: boolean,
  activeFilters: string[],
): string {
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
  const titulo = dataNome ? `Controle de Brindes — ${dataNome}` : "Controle de Brindes — Lista de Destinatários"

  const rows = records.map((d, i) => {
    const entrega = entregasMap[d.id]
    const statusCell = hasDate
      ? `<td class="status">${entrega ? STATUS_LABEL[entrega.status] : "Pendente"}</td>`
      : `<td class="status assinatura"><div class="linha-assinatura"></div></td>`

    const observacao = d.observacao ? `<br><span class="obs">${d.observacao}</span>` : ""

    return `
      <tr class="${i % 2 === 0 ? "par" : "impar"}">
        <td class="num">${i + 1}</td>
        <td class="obra">${d.obra_nome}</td>
        <td class="tipo">${TIPO_LABEL[d.tipo] ?? d.tipo}</td>
        <td class="nome">${d.nome}${observacao}</td>
        <td class="endereco">${buildEndereco(d)}</td>
        ${statusCell}
      </tr>`
  }).join("")

  const filtrosInfo = activeFilters.length > 0
    ? `<p class="filtros">Filtros: ${activeFilters.join(" | ")}</p>`
    : `<p class="filtros">Sem filtros aplicados — todos os registros</p>`

  const statusHeader = hasDate ? "Status" : "Assinatura / Conferência"

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #1a1a1a; padding: 16mm 12mm; }
    .cabecalho { margin-bottom: 10px; }
    h1 { font-size: 14pt; font-weight: bold; margin-bottom: 2px; }
    .meta { font-size: 8pt; color: #555; margin-bottom: 2px; }
    .filtros { font-size: 8pt; color: #777; margin-bottom: 8px; font-style: italic; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f0f0; font-size: 8pt; font-weight: bold; padding: 5px 6px; text-align: left; border: 1px solid #ccc; }
    td { padding: 4px 6px; border: 1px solid #ddd; vertical-align: top; font-size: 9pt; }
    .par { background: #fff; }
    .impar { background: #fafafa; }
    .num { width: 24px; text-align: center; color: #888; font-size: 8pt; }
    .obra { width: 120px; font-weight: 500; }
    .tipo { width: 36px; }
    .nome { min-width: 140px; }
    .obs { color: #e06b00; font-size: 8pt; }
    .endereco { color: #444; font-size: 8.5pt; }
    .status { width: 80px; text-align: center; }
    .assinatura { width: 110px; }
    .linha-assinatura { border-bottom: 1px solid #aaa; margin: 10px 4px 2px; }
    .rodape { margin-top: 10px; font-size: 8pt; color: #888; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 10mm 8mm; }
      @page { margin: 10mm 8mm; }
    }
  </style>
</head>
<body>
  <div class="cabecalho">
    <h1>${titulo}</h1>
    <p class="meta">Gerado em ${hoje} &nbsp;|&nbsp; ${records.length} destinatário(s)</p>
    ${filtrosInfo}
  </div>
  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th class="obra">Obra</th>
        <th class="tipo">Tipo</th>
        <th class="nome">Nome</th>
        <th class="endereco">Endereço</th>
        <th class="status">${statusHeader}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="rodape">
    <span>Trifold — Controle de Brindes</span>
    <span>Total: ${records.length} registros</span>
  </div>
</body>
</html>`
}

export function PrintModal({ filters, datas, selectedDateId, entregasMap, onClose }: PrintModalProps) {
  const [scope, setScope] = useState<"filtered" | "all">("filtered")
  const [loading, setLoading] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedData = datas.find((d) => d.id === selectedDateId)

  function describeFilters(): string[] {
    const labels: string[] = []
    if (filters.obra_nome) labels.push(`Obra: ${filters.obra_nome}`)
    if (filters.tipo) labels.push(`Tipo: ${filters.tipo === "mae" ? "Mãe" : filters.tipo === "pai" ? "Pai" : "Outro"}`)
    if (filters.nome) labels.push(`Nome: ${filters.nome}`)
    if (filters.cidade) labels.push(`Cidade: ${filters.cidade}`)
    if (filters.estado) labels.push(`UF: ${filters.estado}`)
    return labels
  }

  const hasFilters = describeFilters().length > 0

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ export: "1" })
      if (scope === "filtered") {
        if (filters.obra_nome) params.set("obra_nome", filters.obra_nome)
        if (filters.tipo) params.set("tipo", filters.tipo)
        if (filters.nome) params.set("nome", filters.nome)
        if (filters.cidade) params.set("cidade", filters.cidade)
        if (filters.estado) params.set("estado", filters.estado)
      }

      const res = await fetch(`/api/brindes/destinatarios?${params}`)
      if (!res.ok) { setError("Erro ao buscar dados."); return }

      const json = (await res.json()) as { data: Destinatario[]; total: number }
      const records = json.data
      setCount(records.length)

      const activeFilters = scope === "filtered" ? describeFilters() : []
      const html = buildPrintHtml(records, entregasMap, selectedData?.nome, !!selectedDateId, activeFilters)

      const win = window.open("", "_blank", "width=1000,height=750")
      if (!win) { setError("O navegador bloqueou a janela. Permita pop-ups para este site."); return }
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => win.print(), 400)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Exportar / Imprimir lista</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {selectedData && (
            <div className="rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-700">
              Data selecionada: <strong>{selectedData.nome}</strong> — o status de entrega será incluído na lista.
            </div>
          )}
          {!selectedData && (
            <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500">
              Nenhuma data comemorativa selecionada — a lista terá coluna de assinatura para conferência manual.
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Escopo da exportação</p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50">
                <input
                  type="radio"
                  name="scope"
                  value="filtered"
                  checked={scope === "filtered"}
                  onChange={() => setScope("filtered")}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Filtros aplicados</p>
                  {hasFilters
                    ? <p className="text-xs text-gray-500">{describeFilters().join(" · ")}</p>
                    : <p className="text-xs text-gray-400">Nenhum filtro ativo — equivale a todos os registros</p>
                  }
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50">
                <input
                  type="radio"
                  name="scope"
                  value="all"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Todos os registros</p>
                  <p className="text-xs text-gray-500">Ignora qualquer filtro ativo</p>
                </div>
              </label>
            </div>
          </div>

          {count !== null && !loading && (
            <p className="text-sm text-gray-500">
              {count} registro(s) serão incluídos na lista.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {loading ? "Gerando..." : "Gerar e Imprimir"}
          </button>
        </div>
      </div>
    </div>
  )
}
