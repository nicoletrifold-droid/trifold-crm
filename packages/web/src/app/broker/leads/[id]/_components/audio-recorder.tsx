"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Mic, Square, Trash2, Send, Loader2 } from "lucide-react"
import type { OptimisticMessage } from "./broker-message-input"

const MAX_BYTES = 4 * 1024 * 1024
const ENCODER_PATH = "/opus/encoderWorker.min.js"

/** Subconjunto da API do opus-recorder que usamos (a lib não traz tipos). */
interface OpusRecorderInstance {
  start: () => Promise<void>
  stop: () => void
  ondataavailable: (data: Uint8Array) => void
}
interface OpusRecorderCtor {
  new (config: Record<string, unknown>): OpusRecorderInstance
}

type RecState = "idle" | "recording" | "preview" | "sending"

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, "0")}`
}

/**
 * Story 75-29 — Gravação de áudio (mensagem de voz) no composer.
 *
 * Grava OGG/Opus no navegador via opus-recorder (worker WASM vendorizado em
 * /opus/encoderWorker.min.js) — formato que o WhatsApp toca como voz. Envia pelo
 * mesmo endpoint de arquivo (`/api/leads/[id]/send-file`), que detecta audio/* e
 * manda `type:audio`. Fica à direita do composer, separado do clips.
 */
export function AudioRecorder({
  leadId,
  disabled = false,
  onSent,
}: {
  leadId: string
  disabled?: boolean
  onSent?: (msg: OptimisticMessage) => void
}) {
  const router = useRouter()
  const [state, setState] = useState<RecState>("idle")
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  // Alguns navegadores (ex.: Safari) não TOCAM OGG, mas o áudio é gravado e
  // enviado normalmente (o WhatsApp aceita OGG/Opus). Tratamos o erro do <audio>
  // de forma graciosa, sem bloquear o envio.
  const [previewError, setPreviewError] = useState(false)

  const recRef = useRef<OpusRecorderInstance | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function resetAll() {
    stopTimer()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPreviewError(false)
    blobRef.current = null
    recRef.current = null
    setSeconds(0)
    setState("idle")
  }

  async function startRecording() {
    if (disabled || state !== "idle") return
    setError(null)
    try {
      const mod = (await import("opus-recorder")) as unknown as { default: OpusRecorderCtor }
      const Recorder = mod.default
      const rec = new Recorder({
        encoderPath: ENCODER_PATH,
        numberOfChannels: 1,
        encoderSampleRate: 48000,
        recordingGain: 1,
      })
      rec.ondataavailable = (typedArray: Uint8Array) => {
        const blob = new Blob([typedArray as unknown as BlobPart], { type: "audio/ogg" })
        blobRef.current = blob
        setPreviewUrl(URL.createObjectURL(blob))
        setState("preview")
      }
      await rec.start()
      recRef.current = rec
      setSeconds(0)
      setState("recording")
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError("Não foi possível acessar o microfone. Verifique a permissão.")
      resetAll()
    }
  }

  function stopRecording() {
    stopTimer()
    recRef.current?.stop() // dispara ondataavailable → estado "preview"
  }

  function discard() {
    if (state === "recording") recRef.current?.stop()
    resetAll()
  }

  async function send() {
    const blob = blobRef.current
    if (!blob || state === "sending") return
    if (blob.size > MAX_BYTES) {
      setError("Áudio muito longo (máx. 4 MB).")
      return
    }
    setState("sending")
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", new File([blob], "audio.ogg", { type: "audio/ogg" }))
      const res = await fetch(`/api/leads/${leadId}/send-file`, { method: "POST", body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        if (data?.error === "WHATSAPP_WINDOW_CLOSED") {
          setError("Fora da janela de 24h do WhatsApp. Aguarde o lead responder.")
        } else {
          setError(data?.message ?? "Não foi possível enviar o áudio. Tente novamente.")
        }
        setState("preview")
        return
      }
      onSent?.({
        id: data.messageId ?? crypto.randomUUID(),
        role: "broker",
        content: "[Áudio]",
        created_at: new Date().toISOString(),
        failed: data.sent === false,
      })
      resetAll()
      router.refresh()
    } catch {
      setError("Erro de conexão. Tente novamente.")
      setState("preview")
    }
  }

  // Botão de microfone (estado idle) — fica na barra, à direita.
  if (state === "idle") {
    return (
      <button
        type="button"
        title="Gravar áudio"
        aria-label="Gravar áudio"
        onClick={() => void startRecording()}
        disabled={disabled}
        className="relative flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-400 dark:hover:border-orange-500 dark:hover:text-orange-400"
      >
        <Mic className="h-5 w-5" />
        {error && (
          <span className="absolute bottom-full right-0 mb-2 w-56 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 shadow dark:bg-amber-500/10 dark:text-amber-300">
            {error}
          </span>
        )}
      </button>
    )
  }

  // Estados ativos (recording/preview/sending) — painel flutuante acima da barra.
  return (
    <div className="relative flex min-h-[44px] flex-shrink-0 items-center">
      <div className="absolute bottom-full right-0 mb-2 w-72 max-w-[80vw] rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-800">
        {state === "recording" && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              Gravando {fmt(seconds)}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={discard} aria-label="Cancelar" title="Cancelar"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-700">
                <Trash2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={stopRecording} aria-label="Parar gravação" title="Parar"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600">
                <Square className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {(state === "preview" || state === "sending") && previewUrl && (
          <div className="space-y-2">
            {previewError ? (
              <p className="flex items-center gap-2 rounded-md bg-stone-100 px-2.5 py-1.5 text-[11px] text-stone-600 dark:bg-stone-700 dark:text-stone-300">
                <Mic className="h-3.5 w-3.5 shrink-0" /> Áudio gravado ({fmt(seconds)}). A pré-escuta não funciona neste navegador, mas o envio é normal.
              </p>
            ) : (
              <audio src={previewUrl} controls className="w-full" onError={() => setPreviewError(true)} />
            )}
            {error && (
              <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                {error}
              </p>
            )}
            <div className="flex items-center justify-end gap-1.5">
              <button type="button" onClick={discard} disabled={state === "sending"} aria-label="Descartar" title="Descartar"
                className="flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-700">
                <Trash2 className="h-4 w-4" /> Descartar
              </button>
              <button type="button" onClick={() => void send()} disabled={state === "sending"} aria-label="Enviar áudio" title="Enviar"
                className="flex h-9 items-center gap-1 rounded-lg bg-orange-500 px-3 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60">
                {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botão placeholder na barra (mantém o layout enquanto o painel está aberto) */}
      <button
        type="button"
        disabled
        aria-hidden="true"
        className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg border border-orange-300 text-orange-500 dark:border-orange-500/50 dark:text-orange-400"
      >
        <Mic className="h-5 w-5" />
      </button>
    </div>
  )
}
