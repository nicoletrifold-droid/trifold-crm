"use client"

import { useRef, forwardRef, useImperativeHandle, useCallback, useState } from "react"
import {
  VisualEditor,
  type VisualEditorRef,
} from "@web/app/dashboard/sistema/email-templates/_components/visual-editor"

export interface ImageVariantSession {
  variant_id: string
  link_url: string | null
  image_url: string
}

export interface CampaignEditorRef {
  getHtmlAndDesign: () => Promise<{
    html: string
    design: object
    images: ImageVariantSession[]
  }>
}

interface Props {
  campaignId: string
  initialDesign?: object | null
  onReady?: () => void
}

export const CampaignVisualEditor = forwardRef<CampaignEditorRef, Props>(
  function CampaignVisualEditor({ campaignId, initialDesign, onReady }, ref) {
    const editorRef = useRef<VisualEditorRef>(null)
    const imagesRef = useRef<ImageVariantSession[]>([])
    const [uploading, setUploading] = useState(false)

    const handleReady = useCallback(() => {
      // Registra callback de upload de imagem no Unlayer após o editor estar pronto
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unlayer = (editorRef.current as any)?._editorRef?.current?.editor
      if (unlayer) {
        registerUploadCallback(unlayer)
      }
      onReady?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onReady, campaignId])

    function registerUploadCallback(unlayer: {
      registerCallback: (
        type: string,
        cb: (file: { attachments: File[] }, done: (data: { progress: number; url?: string }) => void) => void
      ) => void
    }) {
      unlayer.registerCallback("image", async (file, done) => {
        const attachment = file.attachments[0]
        if (!attachment) {
          done({ progress: 100 })
          return
        }

        setUploading(true)
        done({ progress: 10 })

        try {
          const formData = new FormData()
          formData.append("file", attachment)

          const res = await fetch(
            `/api/campaigns/upload-image?campaign_id=${encodeURIComponent(campaignId)}`,
            { method: "POST", body: formData }
          )

          if (!res.ok) {
            done({ progress: 100 })
            return
          }

          const { url, variant_id } = (await res.json()) as {
            url: string
            variant_id: string
          }

          // Persistir variante no banco
          await fetch(`/api/campaigns/${campaignId}/images`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_url: url, variant_id }),
          })

          imagesRef.current.push({ variant_id, link_url: null, image_url: url })

          done({ progress: 100, url })
        } catch {
          done({ progress: 100 })
        } finally {
          setUploading(false)
        }
      })
    }

    useImperativeHandle(ref, () => ({
      getHtmlAndDesign: async () => {
        const { html, design } = await editorRef.current!.exportHtml()
        return { html, design, images: [...imagesRef.current] }
      },
    }))

    return (
      <div className="relative">
        {uploading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/40">
            <span className="text-sm text-white">Enviando imagem...</span>
          </div>
        )}
        <VisualEditor
          ref={editorRef}
          initialDesign={initialDesign}
          onReady={handleReady}
        />
      </div>
    )
  }
)
