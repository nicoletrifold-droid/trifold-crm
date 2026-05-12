"use client"

import { useState } from "react"
import Image from "next/image"
import { Pencil, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { FotoUploadForm } from "./foto-upload-form"
import { FotoDeleteButton } from "./foto-delete-button"
import { DocUploadForm } from "./doc-upload-form"
import { DocDeleteButton } from "./doc-delete-button"
import { FaseCreateForm } from "./fase-create-form"
import { FaseEditModal } from "./fase-edit-modal"
import { AdminChatFeed } from "./admin-chat-feed"
import { ClientesTab } from "./clientes-tab"

interface Fase {
  id: string
  name: string
  description: string | null
  status: string
  progress_pct: number
  order_index: number
  start_date: string | null
  end_date: string | null
  expected_start_date: string | null
  expected_end_date: string | null
}

interface Foto {
  id: string
  storage_path: string
  caption: string | null
  taken_at: string | null
  fase_id: string | null
  created_at: string
}

interface Documento {
  id: string
  name: string
  filename: string
  category: string
  file_size_bytes: number | null
  created_at: string
}

interface Mensagem {
  id: string
  content: string | null
  message_type: string
  storage_path: string | null
  sender_type: string
  sender_display_name: string | null
  cliente_id: string | null
  created_at: string
}

interface Cliente {
  id: string
  name: string
  email: string
  is_primary: boolean
}

interface ObraDetailTabsProps {
  obraId: string
  adminName: string
  fases: Fase[]
  fotos: Foto[]
  documentos: Documento[]
  mensagens: Mensagem[]
  clientes: Cliente[]
  supabaseUrl: string
}

type Tab = "fases" | "fotos" | "documentos" | "mensagens" | "clientes"

const FASE_STATUS_BADGE: Record<string, string> = {
  pendente: "bg-gray-100 text-gray-600",
  a_iniciar: "bg-gray-100 text-gray-600",
  em_andamento: "bg-amber-100 text-amber-700",
  pausada: "bg-orange-100 text-orange-600",
  concluida: "bg-green-100 text-green-700",
}

const FASE_STATUS_LABEL: Record<string, string> = {
  pendente: "PENDENTE",
  a_iniciar: "A INICIAR",
  em_andamento: "EM EXECUÇÃO",
  pausada: "PAUSADA",
  concluida: "CONCLUÍDA",
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const GROUP_COLORS = [
  { bubble: "bg-orange-500 text-white", header: "bg-orange-50", headerText: "text-orange-700", border: "border-orange-200", bars: ["bg-orange-500", "bg-orange-400", "bg-orange-600", "bg-orange-300"] },
  { bubble: "bg-blue-500 text-white", header: "bg-blue-50", headerText: "text-blue-700", border: "border-blue-200", bars: ["bg-blue-500", "bg-blue-400", "bg-blue-600", "bg-blue-300"] },
  { bubble: "bg-emerald-600 text-white", header: "bg-emerald-50", headerText: "text-emerald-700", border: "border-emerald-200", bars: ["bg-emerald-500", "bg-emerald-400", "bg-emerald-600", "bg-emerald-300"] },
  { bubble: "bg-purple-500 text-white", header: "bg-purple-50", headerText: "text-purple-700", border: "border-purple-200", bars: ["bg-purple-500", "bg-purple-400", "bg-purple-600", "bg-purple-300"] },
  { bubble: "bg-teal-500 text-white", header: "bg-teal-50", headerText: "text-teal-700", border: "border-teal-200", bars: ["bg-teal-500", "bg-teal-400", "bg-teal-600", "bg-teal-300"] },
  { bubble: "bg-rose-500 text-white", header: "bg-rose-50", headerText: "text-rose-700", border: "border-rose-200", bars: ["bg-rose-500", "bg-rose-400", "bg-rose-600", "bg-rose-300"] },
  { bubble: "bg-indigo-500 text-white", header: "bg-indigo-50", headerText: "text-indigo-700", border: "border-indigo-200", bars: ["bg-indigo-500", "bg-indigo-400", "bg-indigo-600", "bg-indigo-300"] },
  { bubble: "bg-amber-500 text-white", header: "bg-amber-50", headerText: "text-amber-700", border: "border-amber-200", bars: ["bg-amber-500", "bg-amber-400", "bg-amber-600", "bg-amber-300"] },
] as const

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function buildFaseGroups(fases: Fase[]): [string, Fase[]][] {
  const sorted = [...fases].sort((a, b) => {
    if (!a.start_date && !b.start_date) return a.order_index - b.order_index
    if (!a.start_date) return 1
    if (!b.start_date) return -1
    return new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  })
  const groups: [string, Fase[]][] = []
  const idx = new Map<string, number>()
  for (const fase of sorted) {
    if (!idx.has(fase.name)) {
      idx.set(fase.name, groups.length)
      groups.push([fase.name, []])
    }
    groups[idx.get(fase.name)!][1].push(fase)
  }
  return groups
}

function FaseItem({
  fase,
  obraId,
  barColor = "bg-orange-500",
}: {
  fase: Fase
  obraId: string
  barColor?: string
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`Excluir a fase "${fase.name}"?`)) return
    try {
      const res = await fetch(
        `/api/admin/obras/${obraId}/fases/${fase.id}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao excluir")
      }
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao excluir fase")
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {fase.description && (
              <p className="truncate text-sm font-medium text-gray-800">
                {fase.description}
              </p>
            )}
            <span
              className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                FASE_STATUS_BADGE[fase.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {FASE_STATUS_LABEL[fase.status] ?? fase.status.toUpperCase()}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-gray-200">
              <div
                className={`h-1.5 rounded-full transition-all ${barColor}`}
                style={{ width: `${fase.progress_pct ?? 0}%` }}
              />
            </div>
            <span className="w-8 flex-shrink-0 text-right text-xs text-gray-500">
              {fase.progress_pct ?? 0}%
            </span>
          </div>
          {(fase.start_date || fase.end_date) && (
            <p className="mt-1 text-xs text-gray-400">
              {fase.start_date ? formatDate(fase.start_date) : "—"}
              {" → "}
              {fase.end_date ? formatDate(fase.end_date) : "—"}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            onClick={() => setEditOpen(true)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {editOpen && (
        <FaseEditModal
          obraId={obraId}
          fase={fase}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  )
}

export function ObraDetailTabs({
  obraId,
  adminName,
  fases,
  fotos,
  documentos,
  mensagens,
  clientes,
  supabaseUrl,
}: ObraDetailTabsProps) {
  const [tab, setTab] = useState<Tab>("fases")

  const tabs: { key: Tab; label: string }[] = [
    { key: "fases", label: `Fases (${fases.length})` },
    { key: "fotos", label: `Fotos (${fotos.length})` },
    { key: "documentos", label: `Documentos (${documentos.length})` },
    { key: "mensagens", label: "Mensagens" },
    { key: "clientes", label: `Clientes (${clientes.length})` },
  ]

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Fases tab */}
      {tab === "fases" && (
        <div className="space-y-4">
          <FaseCreateForm obraId={obraId} />

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Fases ({fases.length})
            </h2>
            {fases.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                Nenhuma fase criada.
              </p>
            ) : (
              <div className="space-y-3">
                {buildFaseGroups(fases).map(([groupName, groupFases], groupIdx) => {
                  const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length]
                  return (
                    <div
                      key={groupName}
                      className={`overflow-hidden rounded-lg border ${color.border}`}
                    >
                      <div className={`flex items-center justify-between px-4 py-2.5 ${color.header}`}>
                        <span className={`text-sm font-semibold ${color.headerText}`}>
                          {groupName}
                        </span>
                        {groupFases.length > 1 && (
                          <span className="text-xs text-gray-400">
                            {groupFases.length} etapas
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-gray-100 bg-white">
                        {groupFases.map((fase, subIdx) => (
                          <FaseItem
                            key={fase.id}
                            fase={fase}
                            obraId={obraId}
                            barColor={color.bars[subIdx % color.bars.length]}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Fotos tab */}
      {tab === "fotos" && (
        <div className="space-y-6">
          <FotoUploadForm obraId={obraId} fases={fases} />

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Fotos ({fotos.length})
            </h2>
            {fotos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm text-gray-500">Nenhuma foto ainda.</p>
                <p className="mt-1 text-xs text-gray-400">
                  Use o formulário acima para adicionar fotos.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {fotos.map((foto) => {
                  const url = `${supabaseUrl}/storage/v1/object/public/obra-fotos/${foto.storage_path}`
                  return (
                    <div
                      key={foto.id}
                      className="group relative overflow-hidden rounded-lg border border-gray-200"
                    >
                      <div className="relative aspect-square w-full bg-gray-100">
                        <Image
                          src={url}
                          alt={foto.caption ?? "Foto da obra"}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                        <FotoDeleteButton obraId={obraId} fotoId={foto.id} />
                      </div>
                      {foto.caption && (
                        <p className="truncate px-2 py-1.5 text-xs text-gray-700">
                          {foto.caption}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Documentos tab */}
      {tab === "documentos" && (
        <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Adicionar documento
            </h2>
            <DocUploadForm obraId={obraId} />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Documentos ({documentos.length})
            </h2>
            {documentos.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                Nenhum documento enviado ainda.
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {documentos.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {doc.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {doc.category} · {formatBytes(doc.file_size_bytes)} ·{" "}
                        {formatDate(doc.created_at)}
                      </p>
                    </div>
                    <DocDeleteButton obraId={obraId} docId={doc.id} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Mensagens tab */}
      {tab === "mensagens" && (
        <div className="h-[560px] overflow-hidden rounded-lg border border-gray-200">
          <AdminChatFeed
            obraId={obraId}
            adminName={adminName}
            clientes={clientes.map((c) => ({ id: c.id, name: c.name }))}
            initialMensagens={mensagens}
          />
        </div>
      )}

      {/* Clientes tab */}
      {tab === "clientes" && (
        <ClientesTab obraId={obraId} clientes={clientes} />
      )}
    </div>
  )
}
