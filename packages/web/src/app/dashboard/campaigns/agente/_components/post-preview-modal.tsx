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
  /** Story 75-255 — artes por tela; arteUrl fica como fallback da tela 1. */
  artes?: Array<{ ordem: number; url: string }> | null
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

export function PostPreviewModal({ copy, formato, roteiro, arteUrl, artes, onClose }: Props) {
  // Story 75-255 — cada tela tem a SUA arte. O mapa por ordem é a fonte; arteUrl
  // continua servindo a tela 1 para post legado (antes da migração 208).
  const porOrdem = new Map<number, string>((artes ?? []).map((a) => [a.ordem, a.url]))
  if (arteUrl && !porOrdem.has(1)) porOrdem.set(1, arteUrl)

  const preview = buildPostPreview({ copy, formato, roteiro, temArteGerada: porOrdem.size > 0 })
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
  // A arte da tela é a de ordem i+1 — não a do post. Tela sem arte cai no aviso
  // honesto da 75-254, que continua sendo a verdade quando o teto de 3 corta ou
  // uma geração falha.
  const urlDaTela = porOrdem.get(i + 1) ?? null
  const mostraArte = !!urlDaTela && preview.tipo !== "reel"

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
                // Story 75-257 (AC4) — `object-contain`, não `cover`: quem aprova
                // precisa ver a peça INTEIRA. Com `cover`, arte de proporção
                // diferente da moldura (post que trocou de formato depois da
                // geração) tem justamente a faixa inferior recortada.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urlDaTela!}
                  alt={`Arte da ${tela?.rotulo ?? "peça"}`}
                  className="h-full w-full object-contain"
                />
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

              {/* Story 75-257 — NADA sobreposto à arte.
                  A 75-254 desenhava o texto da tela por cima da imagem, no
                  pressuposto (correto na época) de que a arte não carregava
                  texto. Desde a 75-246/248 e a 75-256 a faixa inferior da arte
                  JÁ tem título, subtítulo, CTA e logo compostos — o overlay caía
                  exatamente sobre eles. Pior: o que vai ao Instagram é o arquivo,
                  então o overlay simulava uma camada que nunca vai existir.
                  O texto agora vive abaixo do quadro (AC2). */}
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

            {/* Story 75-257 (AC2) — o texto da tela, ABAIXO do quadro. Só quando
                há arte: sem arte ele já é o conteúdo do quadro, e repetir seria
                mostrar a mesma coisa duas vezes. O rótulo diz o que é — no story
                não existe "legenda" (post-preview.ts força `legenda: null`), e
                chamar isso de legenda ensinaria a coisa errada a quem aprova. */}
            {mostraArte && tela?.texto && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3 dark:bg-stone-800/60">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-stone-500">
                  {preview.tipo === "story" ? "Texto desta tela" : "Texto da peça"}
                </p>
                <p className="whitespace-pre-wrap text-xs text-gray-700 dark:text-stone-300">{tela.texto}</p>
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
