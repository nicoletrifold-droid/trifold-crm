"use client"

import { useRef, useState } from "react"
import { CampaignVisualEditor, type CampaignEditorRef, type ImageVariantSession } from "./campaign-visual-editor"

// Altura do header fixo — usada para cálculo explícito do Unlayer
const HEADER_H = 52

// Substitui merge tags por dados de amostra no preview
function injectSampleData(html: string): string {
  return html
    .replace(/\{\{nome\}\}/g, "João Silva")
    .replace(/\{\{email\}\}/g, "joao@exemplo.com")
    .replace(/\{\{telefone\}\}/g, "(44) 9 9999-9999")
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
  const [iframeHeight, setIframeHeight] = useState(1400)

  if (!isOpen) return null

  const bodyHeight = `calc(100vh - ${HEADER_H}px)`

  async function handleSave() {
    if (!editorRef.current) return
    setSaving(true)
    try {
      const { html, design, images } = await editorRef.current.getHtmlAndDesign()
      onSave(html, design, images)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-stone-900">
      {/* Barra superior */}
      <div
        className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 dark:border-stone-800"
        style={{ height: HEADER_H }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
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
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-gray-400 dark:text-stone-500 sm:block">
            Preview atualiza automaticamente
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar design"}
          </button>
        </div>
      </div>

      {/* Corpo: editor + preview */}
      <div className="flex" style={{ height: bodyHeight }}>
        {/* Editor Unlayer — 65% — altura explícita garante que o canvas não fica preto */}
        <div className="min-w-0 flex-[65] overflow-hidden" style={{ height: bodyHeight }}>
          <CampaignVisualEditor
            ref={editorRef}
            campaignId={campaignId}
            initialDesign={initialDesign}
            onHtmlChange={(html) => { setPreviewHtml(html); setIframeHeight(1400) }}
          />
        </div>

        {/* Preview ao vivo — 35% */}
        <div className="flex flex-[35] flex-col border-l border-gray-200 dark:border-stone-800" style={{ height: bodyHeight }}>
          <div className="flex flex-shrink-0 items-center justify-between bg-gray-50 px-4 py-2 dark:bg-stone-800/60">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-stone-500">
              Preview
            </span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400 dark:bg-stone-800 dark:text-stone-500">
              dados de amostra
            </span>
          </div>
          <div className="flex-1 overflow-y-auto bg-[#f0f0f0] dark:bg-stone-950">
            {previewHtml ? (
              <iframe
                srcDoc={injectSampleData(previewHtml)}
                className="block border-0"
                style={{ width: "100%", height: iframeHeight }}
                onLoad={(e) => {
                  const doc = e.currentTarget.contentDocument
                  if (doc?.body) {
                    setIframeHeight(doc.body.scrollHeight || 1400)
                  }
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
      </div>
    </div>
  )
}
