"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Upload, CalendarDays, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react"
import { DateSelector } from "./date-selector"
import { BrindesFilterBar, type BrindesFilters } from "./brindes-filter-bar"
import { StatusBadge } from "./status-badge"
import { DestinatarioModal } from "./destinatario-modal"
import { DatasModal } from "./datas-modal"
import { ImportModal } from "./import-modal"
import type { DataComemorativa, Destinatario, Entrega, EntregaStatus } from "./types"

interface BrindesTableProps {
  datas: DataComemorativa[]
  obraOptions: string[]
}

const TIPO_LABEL: Record<string, string> = { mae: "Mãe", pai: "Pai", outro: "Outro" }

const EMPTY_FILTERS: BrindesFilters = { obra_nome: "", tipo: "", nome: "", cidade: "", estado: "" }

export function BrindesTable({ datas, obraOptions }: BrindesTableProps) {
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
  const [modalImport, setModalImport] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Destinatario | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  function handleStatusChange(destinatarioId: string, newStatus: EntregaStatus) {
    setEntregasMap((prev) => ({
      ...prev,
      [destinatarioId]: { ...prev[destinatarioId], destinatario_id: destinatarioId, status: newStatus, observacao_entrega: null, entregue_em: newStatus === "entregue" ? new Date().toISOString() : null },
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
          {loadingEntregas && <p className="mt-1 text-xs text-gray-400">Carregando status...</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setModalDatas(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <CalendarDays className="h-4 w-4" /> Gerenciar Datas
          </button>
          <button type="button" onClick={() => setModalImport(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
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
      <div className="rounded-lg bg-white shadow-sm">
        {total > 0 && (
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
            <p className="text-sm text-gray-500">
              {loadingTable ? "Carregando..." : `${startIdx}–${endIdx} de ${total} destinatário(s)`}
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Obra</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Cidade/UF</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingTable && destinatarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Carregando...</td>
                </tr>
              )}
              {!loadingTable && destinatarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
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
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-32 truncate">{d.obra_nome}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{TIPO_LABEL[d.tipo] ?? d.tipo}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{d.nome}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{cidade}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={status}
                        disabled={!selectedDateId}
                        destinatarioId={d.id}
                        dataComemorativaId={selectedDateId ?? ""}
                        onStatusChange={handleStatusChange}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => setModalEdit(d)}
                          className="text-gray-400 hover:text-orange-600" aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setDeleteConfirm(d)}
                          className="text-gray-400 hover:text-red-600" aria-label="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              Próximo <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Confirmar exclusão</h3>
            <p className="text-sm text-gray-600">
              Deseja excluir <strong>{deleteConfirm.nome}</strong>? Esta ação remove também os registros de entrega vinculados.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDeleteConfirm(null)} disabled={deleting}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">
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
      {modalImport && <ImportModal onClose={() => { setModalImport(false); fetchDestinatarios() }} />}
    </div>
  )
}
