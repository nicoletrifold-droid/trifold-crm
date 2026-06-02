"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Upload, CalendarDays, ChevronLeft, ChevronRight, Pencil, Trash2, Printer, Package } from "lucide-react"
import { DateSelector } from "./date-selector"
import { BrindesFilterBar, type BrindesFilters } from "./brindes-filter-bar"
import { StatusBadge } from "./status-badge"
import { DestinatarioModal } from "./destinatario-modal"
import { DatasModal } from "./datas-modal"
import { TiposModal } from "./tipos-modal"
import { ImportModal } from "./import-modal"
import { PrintModal } from "./print-modal"
import type { BrindeTipo, DataComemorativa, Destinatario, Entrega, EntregaStatus } from "./types"
import { ScrollableX } from "@web/components/ui/scrollable-x"

interface BrindesTableProps {
  datas: DataComemorativa[]
  tipos: BrindeTipo[]
  obraOptions: string[]
}

const TIPO_LABEL: Record<string, string> = { mae: "Mãe", pai: "Pai", outro: "Outro" }

const EMPTY_FILTERS: BrindesFilters = { obra_nome: "", tipo: "", nome: "", cidade: "", estado: "" }

export function BrindesTable({ datas, tipos: initialTipos, obraOptions }: BrindesTableProps) {
  const [tipos, setTipos] = useState(initialTipos)
  const router = useRouter()
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 50

  const [filters, setFilters] = useState<BrindesFilters>(EMPTY_FILTERS)
  const [selectedDateId, setSelectedDateId] = useState<string | null>(null)
  const [entregasMap, setEntregasMap] = useState<Record<string, Entrega>>({})

  const [loadingTable, setLoadingTable] = useState(false)
  const [loadingEntregas, setLoadingEntregas] = useState(false)

  const [modalCreate, setModalCreate] = useState(false)
  const [modalEdit, setModalEdit] = useState<Destinatario | null>(null)
  const [modalDatas, setModalDatas] = useState(false)
  const [modalTipos, setModalTipos] = useState(false)
  const [modalImport, setModalImport] = useState(false)
  const [modalPrint, setModalPrint] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Destinatario | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchTipos = useCallback(async () => {
    const res = await fetch("/api/brindes/tipos")
    if (res.ok) {
      const d = (await res.json()) as { data: BrindeTipo[] }
      setTipos(d.data)
    }
  }, [])

  const fetchDestinatarios = useCallback(async () => {
    setLoadingTable(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (filters.obra_nome) params.set("obra_nome", filters.obra_nome)
      if (filters.tipo) params.set("tipo", filters.tipo)
      if (filters.nome) params.set("nome", filters.nome)
      if (filters.cidade) params.set("cidade", filters.cidade)
      if (filters.estado) params.set("estado", filters.estado)

      const res = await fetch(`/api/brindes/destinatarios?${params}`)
      if (res.ok) {
        const data = (await res.json()) as { data: Destinatario[]; total: number }
        setDestinatarios(data.data)
        setTotal(data.total)
      }
    } finally {
      setLoadingTable(false)
    }
  }, [page, filters])

  useEffect(() => { fetchDestinatarios() }, [fetchDestinatarios])

  // When filters change, reset to page 1
  useEffect(() => { setPage(1) }, [filters])

  // Fetch entregas when date changes
  useEffect(() => {
    if (!selectedDateId) { setEntregasMap({}); return }
    setLoadingEntregas(true)
    fetch(`/api/brindes/entregas?data_comemorativa_id=${selectedDateId}`)
      .then((r) => r.json())
      .then((d: { data: Entrega[] }) => {
        const map: Record<string, Entrega> = {}
        for (const e of d.data ?? []) map[e.destinatario_id] = e
        setEntregasMap(map)
      })
      .finally(() => setLoadingEntregas(false))
  }, [selectedDateId])

  function handleStatusChange(destinatarioId: string, newStatus: EntregaStatus, tipoId: string | null) {
    const tipoObj = tipoId ? (tipos.find((t) => t.id === tipoId) ?? null) : null
    setEntregasMap((prev) => ({
      ...prev,
      [destinatarioId]: {
        ...prev[destinatarioId],
        destinatario_id: destinatarioId,
        status: newStatus,
        observacao_entrega: null,
        entregue_em: newStatus === "entregue" ? new Date().toISOString() : null,
        brinde_tipo_id: tipoId,
        brindes_tipos: tipoObj ? { nome: tipoObj.nome, tamanho: tipoObj.tamanho, cor: tipoObj.cor } : null,
      },
    }))
  }

  async function handleDelete() {
    if (!deleteConfirm || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/brindes/destinatarios/${deleteConfirm.id}`, { method: "DELETE" })
      if (res.ok) {
        setDeleteConfirm(null)
        fetchDestinatarios()
        router.refresh()
      }
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const startIdx = (page - 1) * limit + 1
  const endIdx = Math.min(page * limit, total)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <DateSelector datas={datas} selectedId={selectedDateId} onChange={setSelectedDateId} />
          {loadingEntregas && <p className="mt-1 text-xs text-gray-400 dark:text-stone-500">Carregando status...</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setModalPrint(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
            <Printer className="h-4 w-4" /> Exportar
          </button>
          <button type="button" onClick={() => setModalDatas(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
            <CalendarDays className="h-4 w-4" /> Gerenciar Datas
          </button>
          <button type="button" onClick={() => setModalTipos(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
            <Package className="h-4 w-4" /> Gerenciar Tipos
          </button>
          <button type="button" onClick={() => setModalImport(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
            <Upload className="h-4 w-4" /> Importar
          </button>
          <button type="button" onClick={() => setModalCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700">
            <Plus className="h-4 w-4" /> Novo Destinatário
          </button>
        </div>
      </div>

      {/* Filters */}
      <BrindesFilterBar filters={filters} onFiltersChange={setFilters} obraOptions={obraOptions} />

      {/* Table */}
      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        {total > 0 && (
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 dark:border-stone-800">
            <p className="text-sm text-gray-500 dark:text-stone-400">
              {loadingTable ? "Carregando..." : `${startIdx}–${endIdx} de ${total} destinatário(s)`}
            </p>
          </div>
        )}

        <ScrollableX>
          <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
                <th className="px-4 py-3">Obra</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Cidade/UF</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
              {loadingTable && destinatarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-stone-500">Carregando...</td>
                </tr>
              )}
              {!loadingTable && destinatarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-stone-400">
                    Nenhum destinatário encontrado.
                  </td>
                </tr>
              )}
              {destinatarios.map((d) => {
                const entrega = entregasMap[d.id]
                const status: EntregaStatus = entrega?.status ?? "pendente"
                const cidade = [d.endereco_cidade, d.endereco_estado].filter(Boolean).join(" - ") ||
                  (d.endereco_referencia ? d.endereco_referencia : "—")

                return (
                  <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-32 truncate dark:text-stone-100">{d.obra_nome}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-stone-300">{TIPO_LABEL[d.tipo] ?? d.tipo}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-stone-100">{d.nome}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-stone-400">{cidade}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={status}
                        disabled={!selectedDateId}
                        destinatarioId={d.id}
                        dataComemorativaId={selectedDateId ?? ""}
                        currentTipoId={entrega?.brinde_tipo_id ?? null}
                        defaultTipoId={d.brinde_tipo_id ?? null}
                        tipos={tipos}
                        onStatusChange={handleStatusChange}
                      />
                      {entrega?.brindes_tipos && (
                        <span className="text-xs text-gray-400 dark:text-stone-500 block mt-0.5">
                          {entrega.brindes_tipos.nome}
                          {entrega.brindes_tipos.tamanho && ` · ${entrega.brindes_tipos.tamanho}`}
                          {entrega.brindes_tipos.cor && ` · ${entrega.brindes_tipos.cor}`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => setModalEdit(d)}
                          className="text-gray-400 hover:text-orange-600 dark:text-stone-500 dark:hover:text-orange-300" aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setDeleteConfirm(d)}
                          className="text-gray-400 hover:text-red-600 dark:text-stone-500 dark:hover:text-red-300" aria-label="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollableX>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-stone-800">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <span className="text-sm text-gray-500 dark:text-stone-400">Página {page} de {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
              Próximo <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 dark:bg-black/70">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5 space-y-4 dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <h3 className="text-base font-semibold text-gray-900 dark:text-stone-100">Confirmar exclusão</h3>
            <p className="text-sm text-gray-600 dark:text-stone-300">
              Deseja excluir <strong>{deleteConfirm.nome}</strong>? Esta ação remove também os registros de entrega vinculados.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDeleteConfirm(null)} disabled={deleting}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800">
                Cancelar
              </button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {modalCreate && (
        <DestinatarioModal mode="create" obraOptions={obraOptions}
          onClose={() => { setModalCreate(false); fetchDestinatarios() }} />
      )}
      {modalEdit && (
        <DestinatarioModal mode="edit" destinatario={modalEdit} obraOptions={obraOptions}
          onClose={() => { setModalEdit(null); fetchDestinatarios() }} />
      )}
      {modalDatas && <DatasModal datas={datas} onClose={() => setModalDatas(false)} />}
      {modalTipos && (
        <TiposModal tipos={tipos} onClose={() => { setModalTipos(false); fetchTipos() }} />
      )}
      {modalPrint && (
        <PrintModal
          filters={filters}
          datas={datas}
          selectedDateId={selectedDateId}
          entregasMap={entregasMap}
          onClose={() => setModalPrint(false)}
        />
      )}
      {modalImport && <ImportModal onClose={() => { setModalImport(false); fetchDestinatarios() }} />}
    </div>
  )
}
