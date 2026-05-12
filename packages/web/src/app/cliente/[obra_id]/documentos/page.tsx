import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@web/lib/supabase/server"
import { FileDown } from "lucide-react"

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

  const { data: obra } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .single()

  if (!obra) redirect("/cliente/sem-obra")

  const { data: documentos } = await supabase
    .from("obra_documentos")
    .select("id, name, filename, category, file_size_bytes, created_at")
    .eq("obra_id", obra_id)
    .order("created_at", { ascending: false })

  const allDocs = documentos ?? []
  const categoriaAtiva = categoria ?? "Todos"

  const categoriasExistentes = [
    "Todos",
    ...Array.from(
      new Set(allDocs.map((d) => d.category).filter(Boolean))
    ).sort(),
  ]

  const docsFiltrados =
    categoriaAtiva === "Todos"
      ? allDocs
      : allDocs.filter((d) => d.category === categoriaAtiva)

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Mobile header */}
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs text-stone-500">Documentos</p>
          <p className="text-sm font-semibold text-white">{obra.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 lg:py-8">
        {/* Category filter pills */}
        {categoriasExistentes.length > 1 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {categoriasExistentes
              .filter((c) => ALL_CATEGORIES.includes(c) || c === "Todos")
              .map((cat) => (
                <Link
                  key={cat}
                  href={
                    cat === "Todos"
                      ? `/cliente/${obra_id}/documentos`
                      : `/cliente/${obra_id}/documentos?categoria=${encodeURIComponent(cat)}`
                  }
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    categoriaAtiva === cat
                      ? "bg-[#F27A5E] text-white"
                      : "bg-stone-800 text-white/70 hover:text-white"
                  }`}
                >
                  {cat}
                </Link>
              ))}
          </div>
        )}

        {/* Documents list */}
        {docsFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-stone-500">
              Nenhum documento disponível ainda.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {docsFiltrados.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-4 rounded-xl border border-stone-800 bg-stone-900 px-4 py-3.5 transition-colors hover:bg-stone-800/60"
              >
                {/* PDF icon */}
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#F27A5E]/15">
                  <span className="text-[9px] font-bold text-[#F27A5E] tracking-wide">
                    PDF
                  </span>
                </div>

                {/* Doc info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {doc.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {doc.category && (
                      <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-medium text-white/70">
                        {doc.category}
                      </span>
                    )}
                    {doc.file_size_bytes && (
                      <span className="text-[11px] text-white/40">
                        {formatBytes(doc.file_size_bytes)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Download button */}
                <a
                  href={`/api/cliente/obras/${obra_id}/documentos/${doc.id}/download-redirect`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg bg-[#F27A5E] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#d4705a] active:scale-95"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Baixar
                </a>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
