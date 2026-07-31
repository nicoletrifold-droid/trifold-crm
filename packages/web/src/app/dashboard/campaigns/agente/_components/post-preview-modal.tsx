"use client"

// Story 75-254 — "como ficaria a postagem". Mockup de leitura, não emulador:
// serve para DECIDIR aprovar, então prioriza mostrar a sequência e a verdade.
//
// 🔴 A verdade que ele expõe (AC3): o sistema gera UMA arte por post, e a Lídia
// propõe 2 telas de story. A tela 2 aparece com aviso de que NÃO tem arte, em vez
// de repetir a arte da tela 1 — repetir seria mentir, e mentir é pior que não ter
// preview.

import { useEffect, useState } from "react"

import { buildPostPreview, type PostPreview } from "@web/lib/marketing/post-preview"
import type { MarketingPostFormato } from "@web/lib/marketing/posts"

interface Props {
  copy: string | null
  formato: MarketingPostFormato | null
  roteiro: string | null
  arteUrl: string | null
  onClose: () => void
}

const ASPECT_CLASS: Record<string, string> = {
  "9:16": "aspect-[9/16]",
  "4:5": "aspect-[4/5]",
  "1:1": "aspect-square",
}

const TIPO_LABEL: Record<PostPreview["tipo"], string> = {
  story: "Story",
  carrossel: "Carrossel",
  feed: "Post de feed",
  reel: "Reel",
  indefinido: "Formato não definido",
}

export function PostPreviewModal({ copy, formato, roteiro, arteUrl, onClose }: Props) {
  const preview = buildPostPreview({ copy, formato, roteiro, temArteGerada: !!arteUrl })
  const [i, setI] = useState(0)
  const total = preview.telas.length
  const tela = preview.telas[i]

  // Setas do teclado ajudam quem está revisando vários posts em sequência.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, total - 1))
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, total])

  const aspecto = ASPECT_CLASS[preview.aspecto ?? "4:5"] ?? "aspect-[4/5]"
  const mostraArte = !!arteUrl && !!tela?.temArte

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pré-visualização da postagem"
    >
      <div
        className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-stone-500">
              Pré-visualização
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-stone-100">
              {TIPO_LABEL[preview.tipo]}
              {total > 1 && <span className="ml-1 font-normal text-gray-500 dark:text-stone-400">· {total} telas</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {total === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-stone-400">
            Sem conteúdo para pré-visualizar.
          </p>
        ) : (
          <>
            {/* Barras de progresso, uma por tela — como no Instagram (AC2) */}
            {total > 1 && (
              <div className="mb-2 flex gap-1">
                {preview.telas.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setI(idx)}
                    aria-label={`Ir para tela ${idx + 1}`}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      idx === i ? "bg-[#E8856A]" : "bg-gray-300 dark:bg-stone-700"
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Moldura */}
            <div className={`relative w-full overflow-hidden rounded-xl bg-stone-950 ${aspecto}`}>
              {mostraArte ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={arteUrl!} alt="Arte do post" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">{tela?.texto}</p>
                  {/* 🔴 AC3 — a verdade, com rótulo */}
                  {preview.tipo !== "reel" && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
                      Sem arte gerada para esta tela
                    </span>
                  )}
                </div>
              )}

              {/* Texto da tela sobreposto quando há arte (no story o texto é DA tela) */}
              {mostraArte && preview.tipo === "story" && tela?.texto && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="whitespace-pre-wrap text-xs leading-snug text-white">{tela.texto}</p>
                </div>
              )}
            </div>

            {/* Navegação */}
            {total > 1 && (
              <div className="mt-2 flex items-center justify-between">
                <button
                  onClick={() => setI((v) => Math.max(v - 1, 0))}
                  disabled={i === 0}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  ← Anterior
                </button>
                <span className="text-xs text-gray-500 dark:text-stone-400">
                  {tela?.rotulo ?? `${i + 1} de ${total}`}
                </span>
                <button
                  onClick={() => setI((v) => Math.min(v + 1, total - 1))}
                  disabled={i === total - 1}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  Próxima →
                </button>
              </div>
            )}

            {/* Legenda embaixo (feed, carrossel, reel) — no story não existe */}
            {preview.legenda && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3 dark:bg-stone-800/60">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-stone-500">
                  Legenda
                </p>
                <p className="whitespace-pre-wrap text-xs text-gray-700 dark:text-stone-300">{preview.legenda}</p>
              </div>
            )}

            {preview.tipo === "reel" && (
              <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-stone-400">
                O vídeo é produzido pela equipe — a Lídia entrega o roteiro e a legenda.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
