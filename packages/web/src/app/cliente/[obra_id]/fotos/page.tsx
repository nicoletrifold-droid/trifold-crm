import { redirect } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { createClient } from "@web/lib/supabase/server"

function formatPhaseDate(dateStr: string | null): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  const day = d.getUTCDate().toString().padStart(2, "0")
  const rawMonth = d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
  const month =
    rawMonth.replace(".", "").charAt(0).toUpperCase() +
    rawMonth.replace(".", "").slice(1)
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

interface PageProps {
  params: Promise<{ obra_id: string }>
  searchParams: Promise<{ fase?: string }>
}

export default async function FotosPage({ params, searchParams }: PageProps) {
  const { obra_id } = await params
  const { fase: faseFilter } = await searchParams
  const supabase = await createClient()

  const { data: obra } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .single()

  if (!obra) redirect("/cliente/sem-obra")

  const [fasesRes, fotosRes] = await Promise.all([
    supabase
      .from("obra_fases")
      .select("id, name, order_index")
      .eq("obra_id", obra_id)
      .order("order_index"),
    supabase
      .from("obra_fotos")
      .select("id, storage_path, caption, taken_at, fase_id, created_at")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false }),
  ])

  const fases = fasesRes.data ?? []
  const allFotos = fotosRes.data ?? []
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""

  const fotosFiltradas = faseFilter
    ? allFotos.filter((f) => f.fase_id === faseFilter)
    : allFotos

  const faseMap = new Map(fases.map((f) => [f.id, f.name]))

  type FaseGroup = {
    faseId: string | null
    faseName: string
    fotos: typeof allFotos
    latestDate: string | null
  }

  const groups: FaseGroup[] = []
  const groupMap = new Map<string | null, FaseGroup>()

  for (const foto of fotosFiltradas) {
    const key = foto.fase_id ?? null
    if (!groupMap.has(key)) {
      const group: FaseGroup = {
        faseId: key,
        faseName: key ? (faseMap.get(key) ?? "Fase desconhecida") : "Sem fase",
        fotos: [],
        latestDate: null,
      }
      groupMap.set(key, group)
      groups.push(group)
    }
    const g = groupMap.get(key)!
    g.fotos.push(foto)
    const dateVal = foto.taken_at ?? foto.created_at
    if (!g.latestDate || dateVal > g.latestDate) {
      g.latestDate = dateVal
    }
  }

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Mobile header */}
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs text-stone-500">Galeria de Fotos</p>
          <p className="text-sm font-semibold text-white">{obra.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 lg:py-8">
        {/* Phase filter pills */}
        {fases.length > 0 && (
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <Link
              href={`/cliente/${obra_id}/fotos`}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                !faseFilter
                  ? "bg-[#F27A5E] text-white"
                  : "bg-stone-800 text-white/70 hover:text-white"
              }`}
            >
              Todas as fases
            </Link>
            {fases.map((fase) => (
              <Link
                key={fase.id}
                href={`/cliente/${obra_id}/fotos?fase=${fase.id}`}
                className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  faseFilter === fase.id
                    ? "bg-[#F27A5E] text-white"
                    : "bg-stone-800 text-white/70 hover:text-white"
                }`}
              >
                {fase.name}
              </Link>
            ))}
          </div>
        )}

        {/* Empty state */}
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg
              className="mb-3 h-10 w-10 text-stone-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <p className="text-sm text-stone-500">Nenhuma foto disponível ainda.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group.faseId ?? "no-fase"}>
                {/* Phase header */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-white">
                    {group.faseName}
                  </h2>
                  <span className="rounded-full bg-[#F27A5E] px-2 py-0.5 text-xs font-medium text-white">
                    {group.fotos.length}{" "}
                    {group.fotos.length === 1 ? "foto" : "fotos"}
                  </span>
                  {group.latestDate && (
                    <span className="text-sm text-white/40">
                      — {formatPhaseDate(group.latestDate)}
                    </span>
                  )}
                </div>

                {/* Photos grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.fotos.map((foto) => {
                    const url = `${supabaseUrl}/storage/v1/object/public/obra-fotos/${foto.storage_path}`
                    return (
                      <div
                        key={foto.id}
                        className="relative overflow-hidden rounded-xl bg-stone-900"
                      >
                        <div className="relative aspect-square w-full sm:aspect-video">
                          <Image
                            src={url}
                            alt={foto.caption ?? "Foto da obra"}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                        </div>
                        {foto.caption && (
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-8">
                            <p className="text-xs font-medium text-white">
                              {foto.caption}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
