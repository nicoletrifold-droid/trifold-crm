import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"
import { FileDown, FileText } from "lucide-react"

const ALL_CATEGORIES = ["Todos", "ART/RRT", "Contratos", "Memoriais", "Outros"]

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface PageProps {
  params: Promise<{ obra_id: string }>
  searchParams: Promise<{ categoria?: string }>
}

export default async function DocumentosPage({
  params,
  searchParams,
}: PageProps) {
  const { obra_id } = await params
  const { categoria } = await searchParams
  const supabase = await createClient()

  // RLS garante isolamento — retorna null se obra não pertencer ao cliente
  const { data: obra } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .single()

  if (!obra) {
    redirect("/cliente/sem-obra")
  }

  const { data: documentos } = await supabase
    .from("obra_documentos")
    .select("id, name, filename, category, file_size_bytes, created_at")
    .eq("obra_id", obra_id)
    .order("created_at", { ascending: false })

  const allDocs = documentos ?? []
  const categoriaAtiva = categoria ?? "Todos"

  // Categorias disponíveis dinamicamente + "Todos"
  const categoriasExistentes = [
    "Todos",
    ...Array.from(new Set(allDocs.map((d) => d.category).filter(Boolean))).sort(),
  ]

  const docsFiltrados =
    categoriaAtiva === "Todos"
      ? allDocs
      : allDocs.filter((d) => d.category === categoriaAtiva)

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs text-stone-500">Documentos</p>
          <p className="text-sm font-semibold text-white">{obra.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Filtros por categoria */}
        {categoriasExistentes.length > 1 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {categoriasExistentes
              .filter((c) => ALL_CATEGORIES.includes(c) || c === "Todos")
              .map((cat) => (
                <a
                  key={cat}
                  href={
                    cat === "Todos"
                      ? `/cliente/${obra_id}/documentos`
                      : `/cliente/${obra_id}/documentos?categoria=${encodeURIComponent(cat)}`
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    categoriaAtiva === cat
                      ? "bg-[#E8856A] text-white"
                      : "bg-stone-800 text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {cat}
                </a>
              ))}
          </div>
        )}

        {/* Lista de documentos */}
        {docsFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="mb-3 h-10 w-10 text-stone-700" />
            <p className="text-sm text-stone-500">
              Nenhum documento disponível ainda.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {docsFiltrados.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-800 bg-stone-900 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {doc.name}
                  </p>
                  <p className="text-xs text-stone-500">
                    {doc.category} · {formatBytes(doc.file_size_bytes)}
                  </p>
                </div>
                <DownloadButton obraId={obra_id} docId={doc.id} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function DownloadButton({
  obraId,
  docId,
}: {
  obraId: string
  docId: string
}) {
  return (
    <a
      href={`/api/cliente/obras/${obraId}/documentos/${docId}/download-redirect`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-300 hover:bg-stone-700 hover:text-white"
    >
      <FileDown className="h-3.5 w-3.5" />
      Baixar
    </a>
  )
}
