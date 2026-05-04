"use client"

import Image from "next/image"

interface Foto {
  id: string
  storage_path: string
  caption: string | null
  taken_at: string | null
  fase_id: string | null
}

interface FotosGridProps {
  fotos: Foto[]
  supabaseUrl: string
}

export function FotosGrid({ fotos, supabaseUrl }: FotosGridProps) {
  if (fotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-stone-800 bg-stone-900/60 py-10 text-center">
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
        <p className="text-sm text-stone-500">Nenhuma foto disponível</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {fotos.map((foto) => {
        const url = `${supabaseUrl}/storage/v1/object/public/obra-fotos/${foto.storage_path}`
        return (
          <div key={foto.id} className="overflow-hidden rounded-xl">
            <div className="relative aspect-square w-full bg-stone-800">
              <Image
                src={url}
                alt={foto.caption ?? "Foto da obra"}
                fill
                unoptimized
                className="object-cover"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement
                  target.style.display = "none"
                }}
              />
            </div>
            {foto.caption && (
              <p className="mt-1 truncate px-1 text-xs text-stone-500">
                {foto.caption}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
