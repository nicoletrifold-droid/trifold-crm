import { redirect } from "next/navigation"
import { FileDown } from "lucide-react"
import { requireViewerAccess, getViewerVinculo } from "@web/lib/portal/viewer"

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface DocRow {
  id: string
  name: string
  category: string | null
  file_size_bytes: number | null
  storage_path: string | null
  created_at: string
}

export default async function ViewerDocumentosPage({
  params,
}: {
  params: Promise<{ vinculo_id: string }>
}) {
  const { vinculo_id } = await params
  const { user, admin } = await requireViewerAccess()

  const ctx = await getViewerVinculo(admin, vinculo_id, user.orgId)
  if (!ctx) redirect("/dashboard/portal-cliente")

  const { data } = await admin
    .from("obra_documentos")
    .select("id, name, category, file_size_bytes, storage_path, created_at")
    .eq("obra_id", ctx.obra.id)
    .order("created_at", { ascending: false })

  const docs = (data ?? []) as DocRow[]

  // Signed URLs (leitura apenas; bucket obra-docs). Não persiste nada.
  const signed = await Promise.all(
    docs.map(async (d) => {
      if (!d.storage_path) return null
      const { data: s } = await admin.storage
        .from("obra-docs")
        .createSignedUrl(d.storage_path, 120)
      return s?.signedUrl ?? null
    })
  )

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-stone-500">Nenhum documento disponível ainda.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {docs.map((doc, idx) => (
        <div
          key={doc.id}
          className="flex items-center gap-4 rounded-xl border border-stone-800 bg-stone-900 px-4 py-3.5"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#F27A5E]/15">
            <span className="text-[9px] font-bold tracking-wide text-[#F27A5E]">PDF</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{doc.name}</p>
            <div className="mt-1 flex items-center gap-2">
              {doc.category && (
                <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-medium text-white/70">
                  {doc.category}
                </span>
              )}
              {doc.file_size_bytes && (
                <span className="text-[11px] text-white/40">{formatBytes(doc.file_size_bytes)}</span>
              )}
            </div>
          </div>
          {signed[idx] ? (
            <a
              href={signed[idx]!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg bg-[#F27A5E] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#d4705a]"
            >
              <FileDown className="h-3.5 w-3.5" />
              Baixar
            </a>
          ) : (
            <span className="text-[11px] text-stone-600">indisponível</span>
          )}
        </div>
      ))}
    </div>
  )
}
