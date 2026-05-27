"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Eye, KeyRound, Pencil, Plus, Trash2 } from "lucide-react"
import { ClienteModal } from "./cliente-modal"
import { SenhaClienteModal } from "@web/app/dashboard/_components/senha-cliente-modal"

export interface ObraOption {
  id: string
  name: string
}

export interface ClienteVinculo {
  id: string
  obra_id: string
  numero_unidade: string | null
  obras: { id: string; name: string } | { id: string; name: string }[] | null
}

export interface ClienteRow {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  created_at: string
  clientes_obras_vinculos: ClienteVinculo[] | null
  portal_user_id?: string | null
}

interface ClientesPageClientProps {
  initialClientes: ClienteRow[]
  initialTotal: number
  obras: ObraOption[]
  perPage: number
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("pt-BR")
  } catch {
    return "—"
  }
}

function formatVinculos(vinculos: ClienteVinculo[] | null): string {
  if (!vinculos || vinculos.length === 0) return "—"
  return vinculos
    .map((v) => {
      const obra = Array.isArray(v.obras) ? v.obras[0] : v.obras
      const nome = obra?.name ?? "(obra)"
      return v.numero_unidade ? `${nome} — un. ${v.numero_unidade}` : nome
    })
    .join(", ")
}

export function ClientesPageClient({
  initialClientes,
  initialTotal,
  obras,
  perPage,
}: ClientesPageClientProps) {
  const router = useRouter()
  const [clientes, setClientes] = useState<ClienteRow[]>(initialClientes)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)

  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [obraId, setObraId] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isFirstLoad = useRef(true)

  const [modalCreate, setModalCreate] = useState(false)
  const [modalView, setModalView] = useState<ClienteRow | null>(null)
  const [modalEdit, setModalEdit] = useState<ClienteRow | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<ClienteRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [senhaModal, setSenhaModal] = useState<{
    userId: string
    nome: string
    email: string
  } | null>(null)

  // Debounce do filtro de texto (500ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 500)
    return () => clearTimeout(t)
  }, [q])

  // Resetar página quando filtros mudam
  useEffect(() => {
    setPage(1)
  }, [debouncedQ, obraId])

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      })
      if (debouncedQ) params.set("q", debouncedQ)
      if (obraId) params.set("obra_id", obraId)

      const res = await fetch(`/api/admin/clientes?${params.toString()}`)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? "Erro ao carregar clientes.")
        return
      }
      const data = (await res.json()) as { data: ClienteRow[]; total: number }
      setClientes(data.data ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setError("Erro de rede ao carregar clientes.")
    } finally {
      setLoading(false)
    }
  }, [page, perPage, debouncedQ, obraId])

  // No primeiro render usamos os dados SSR; depois, refetch quando filtros/página mudam
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      return
    }
    fetchClientes()
  }, [fetchClientes])

  async function handleDelete() {
    if (!deleteConfirm || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/clientes/${deleteConfirm.id}`, {
        method: "DELETE",
      })
      if (res.status === 204) {
        setDeleteConfirm(null)
        await fetchClientes()
        router.refresh()
        return
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        count?: number
      }
      if (res.status === 409) {
        const n = data.count ?? 0
        setDeleteError(
          n > 0
            ? `Não é possível excluir: cliente possui ${n} destinatário(s) de brinde vinculado(s). Remova os vínculos primeiro.`
            : data.error ??
                "Não é possível excluir: cliente possui dependências."
        )
        return
      }
      setDeleteError(data.error ?? "Erro ao excluir cliente.")
    } catch {
      setDeleteError("Erro de rede ao excluir.")
    } finally {
      setDeleting(false)
    }
  }

  function handleModalClose(refresh: boolean) {
    setModalCreate(false)
    setModalEdit(null)
    if (refresh) {
      fetchClientes()
      router.refresh()
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const startIdx = total === 0 ? 0 : (page - 1) * perPage + 1
  const endIdx = Math.min(page * perPage, total)

  const hasFilters = Boolean(q || obraId)

  return (
    <div className="space-y-4">
      {/* Header / Ações */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Buscar
            </label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome ou email..."
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-stone-400">
              Obra
            </label>
            <select
              value={obraId}
              onChange={(e) => setObraId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            >
              <option value="">Todas</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setQ("")
                setObraId("")
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Limpar
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setModalCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          <Plus className="h-4 w-4" /> Novo Cliente
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Tabela */}
      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        {total > 0 && (
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 dark:border-stone-800">
            <p className="text-sm text-gray-500 dark:text-stone-400">
              {loading
                ? "Carregando..."
                : `${startIdx}–${endIdx} de ${total} cliente(s)`}
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Obras</th>
                <th className="px-4 py-3">Cadastrado em</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
              {loading && clientes.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-gray-400 dark:text-stone-500"
                  >
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && clientes.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                  >
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
              {clientes.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 dark:hover:bg-stone-800/30"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-stone-100">
                    {c.nome}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-stone-300">
                    {c.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-stone-300">
                    {c.telefone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-stone-400">
                    {formatVinculos(c.clientes_obras_vinculos)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-stone-400">
                    {formatDate(c.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setModalView(c)}
                        className="text-gray-400 hover:text-[#E8856A] dark:text-stone-500 dark:hover:text-[#E8856A]"
                        aria-label="Visualizar"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalEdit(c)}
                        className="text-gray-400 hover:text-orange-600 dark:text-stone-500 dark:hover:text-orange-300"
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {c.portal_user_id && c.email && (
                        <button
                          type="button"
                          onClick={() =>
                            setSenhaModal({
                              userId: c.portal_user_id!,
                              nome: c.nome,
                              email: c.email!,
                            })
                          }
                          className="text-gray-400 hover:text-[#E8856A] dark:text-stone-500 dark:hover:text-[#E8856A]"
                          aria-label="Gerenciar senha do portal"
                          title="Gerenciar senha do portal"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null)
                          setDeleteConfirm(c)
                        }}
                        className="text-gray-400 hover:text-red-600 dark:text-stone-500 dark:hover:text-red-300"
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <span className="text-sm text-gray-500 dark:text-stone-400">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Confirmação de exclusão */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 dark:bg-black/70">
          <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <h3 className="text-base font-semibold text-gray-900 dark:text-stone-100">
              Confirmar exclusão
            </h3>
            <p className="text-sm text-gray-600 dark:text-stone-300">
              Deseja excluir o cliente <strong>{deleteConfirm.nome}</strong>?
              Esta ação não pode ser desfeita.
            </p>
            {deleteError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
                {deleteError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirm(null)
                  setDeleteError(null)
                }}
                disabled={deleting}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modais */}
      {modalCreate && (
        <ClienteModal
          mode="create"
          obras={obras}
          onClose={(refresh) => handleModalClose(refresh)}
        />
      )}
      {modalView && (
        <ClienteModal
          mode="view"
          clienteId={modalView.id}
          obras={obras}
          onClose={() => setModalView(null)}
        />
      )}
      {modalEdit && (
        <ClienteModal
          mode="edit"
          clienteId={modalEdit.id}
          obras={obras}
          onClose={(refresh) => handleModalClose(refresh)}
        />
      )}
      {senhaModal && (
        <SenhaClienteModal
          userId={senhaModal.userId}
          clienteNome={senhaModal.nome}
          clienteEmail={senhaModal.email}
          onClose={() => setSenhaModal(null)}
        />
      )}
    </div>
  )
}
