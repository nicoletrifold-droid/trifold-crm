"use client"

import { useState } from "react"
import Image from "next/image"
import { FotoUploadForm } from "./foto-upload-form"
import { FotoDeleteButton } from "./foto-delete-button"
import { DocUploadForm } from "./doc-upload-form"
import { DocDeleteButton } from "./doc-delete-button"

interface Fase {
  id: string
  name: string
  status: string
  order_index: number
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

interface ObraDetailTabsProps {
  obraId: string
  fases: Fase[]
  fotos: Foto[]
  documentos: Documento[]
  supabaseUrl: string
}

type Tab = "fotos" | "documentos"

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

export function ObraDetailTabs({
  obraId,
  fases,
  fotos,
  documentos,
  supabaseUrl,
}: ObraDetailTabsProps) {
  const [tab, setTab] = useState<Tab>("fotos")

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
        <button
          onClick={() => setTab("fotos")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "fotos"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Fotos ({fotos.length})
        </button>
        <button
          onClick={() => setTab("documentos")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "documentos"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Documentos ({documentos.length})
        </button>
      </div>

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
    </div>
  )
}
