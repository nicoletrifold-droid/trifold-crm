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
  em_andamento: "bg-amber-100 text-amber-700",
  concluida: "bg-green-100 text-green-700",
}

const FASE_STATUS_LABEL: Record<string, string> = {
  pendente: "PENDENTE",
  em_andamento: "EM ANDAMENTO",
  concluida: "CONCLUÍDA",
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function FaseItem({
  fase,
  obraId,
}: {
  fase: Fase
  obraId: string
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
      <div className="flex items-center gap-3 py-3">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
          {fase.order_index}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-gray-900">
              {fase.name}
            </p>
            <span
              className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                FASE_STATUS_BADGE[fase.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {FASE_STATUS_LABEL[fase.status] ?? fase.status.toUpperCase()}
            </span>
          </div>
          {fase.description && (
            <p className="text-xs text-gray-500">{fase.description}</p>
          )}
          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
            <div
              className="h-1.5 rounded-full bg-orange-500"
              style={{ width: `${fase.progress_pct}%` }}
            />
          </div>
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
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Fases ({fases.length})
            </h2>
            {fases.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                Nenhuma fase criada.
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {fases.map((fase) => (
                  <FaseItem key={fase.id} fase={fase} obraId={obraId} />
                ))}
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
