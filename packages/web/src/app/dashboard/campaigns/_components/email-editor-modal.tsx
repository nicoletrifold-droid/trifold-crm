"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { CampaignVisualEditor, type CampaignEditorRef, type ImageVariantSession } from "./campaign-visual-editor"

const HEADER_H = 52

const MERGE_SAMPLES: Record<string, string> = {
  nome: "João Silva",
  email: "joao@exemplo.com",
  telefone: "(44) 9 9999-9999",
}

function injectSampleData(html: string): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => MERGE_SAMPLES[key] ?? `{{${key}}}`)
}

interface Props {
  isOpen: boolean
  campaignId: string
  campaignName?: string
  initialDesign?: object | null
  onClose: () => void
  onSave: (html: string, design: object, images: ImageVariantSession[]) => void
}

export function EmailEditorModal({ isOpen, campaignId, campaignName, initialDesign, onClose, onSave }: Props) {
  const editorRef = useRef<CampaignEditorRef>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [iframeHeight, setIframeHeight] = useState(800)
  const [showPreview, setShowPreview] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Refs para closures estáveis em event handlers
  const isDirtyRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const initialHtmlRef = useRef(false) // ignora o primeiro onHtmlChange (carga inicial)

  useEffect(() => { isDirtyRef.current = isDirty }, [isDirty])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Reset ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      setIsDirty(false)
      setSyncing(false)
      setPreviewHtml(null)
      setIframeHeight(800)
      initialHtmlRef.current = false
    }
  }, [isOpen])

  // ESC para fechar
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (isDirtyRef.current && !window.confirm("Há alterações não salvas. Deseja sair mesmo assim?")) return
      onCloseRef.current()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen])

  // Callback estável — evita recriar handleReady no VisualEditor a cada render
  const handleHtmlChange = useCallback((html: string) => {
    setPreviewHtml(html)
    setSyncing(true)
    // Primeira chamada é a carga inicial do design — não marca como "não salvo"
    if (initialHtmlRef.current) {
      setIsDirty(true)
    } else {
      initialHtmlRef.current = true
    }
  }, [])

  if (!isOpen) return null

  const bodyHeight = `calc(100vh - ${HEADER_H}px)`

  function handleClose() {
    if (isDirtyRef.current && !window.confirm("Há alterações não salvas. Deseja sair mesmo assim?")) return
    onClose()
  }

  async function handleSave() {
    if (!editorRef.current) return
    setSaving(true)
    try {
      const { html, design, images } = await editorRef.current.getHtmlAndDesign()
      onSave(html, design, images)
      setIsDirty(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-stone-900">
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 dark:border-stone-800"
        style={{ height: HEADER_H }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-stone-200">
            {campaignName ? `E-mail — ${campaignName}` : "Editor de E-mail"}
          </span>
          {isDirty && (
            <span className="text-xs text-amber-500 dark:text-amber-400">● não salvo</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Status do preview */}
          {showPreview && (
            <span className="hidden items-center gap-1.5 text-xs text-gray-400 dark:text-stone-500 sm:flex">
              {syncing ? (
                <>
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Atualizando...
                </>
              ) : (
                <>✓ Sincronizado</>
              )}
            </span>
          )}

          {/* Toggle preview */}
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              showPreview
                ? "bg-gray-100 text-gray-700 dark:bg-stone-800 dark:text-stone-200"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md px-4 py-1.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#F27A5E" }}
          >
            {saving ? "Salvando..." : "Salvar design"}
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="flex" style={{ height: bodyHeight }}>
        {/* Editor — scrollável verticalmente; canvas fixo em 1920px de altura */}
        <div
          className="overflow-y-auto overflow-x-hidden"
          style={{ height: bodyHeight, width: showPreview ? "calc(100% - 440px)" : "100%" }}
        >
          <div style={{ height: 1920 }}>
            <CampaignVisualEditor
              ref={editorRef}
              campaignId={campaignId}
              initialDesign={initialDesign}
              onHtmlChange={handleHtmlChange}
            />
          </div>
        </div>

        {/* Painel de preview — 440px fixos, só montado quando aberto */}
        {showPreview && (
          <div
            className="flex flex-shrink-0 flex-col border-l border-gray-200 dark:border-stone-800"
            style={{ width: 440, height: bodyHeight }}
          >
            <div className="flex flex-shrink-0 items-center justify-between bg-gray-50 px-4 py-2 dark:bg-stone-800/60">
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-stone-500">
                Preview
              </span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400 dark:bg-stone-800 dark:text-stone-500">
                dados de amostra
              </span>
            </div>
            <div className="flex-1 overflow-y-auto bg-[#f0f0f0] dark:bg-stone-900">
              {previewHtml ? (
                <iframe
                  srcDoc={injectSampleData(previewHtml)}
                  className="block border-0"
                  style={{ width: "100%", height: iframeHeight }}
                  onLoad={(e) => {
                    const doc = e.currentTarget.contentDocument
                    if (doc?.body) setIframeHeight(doc.body.scrollHeight || 800)
                    setSyncing(false)
                  }}
                  title="Preview do e-mail"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-xs text-gray-400 dark:text-stone-600">Carregando preview...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
