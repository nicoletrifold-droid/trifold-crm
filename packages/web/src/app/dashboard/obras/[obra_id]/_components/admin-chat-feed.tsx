"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@web/lib/supabase/client"
import { Send } from "lucide-react"

interface Mensagem {
  id: string
  content: string | null
  message_type: string
  storage_path: string | null
  sender_type: string
  sender_display_name: string | null
  created_at: string
}

interface AdminChatFeedProps {
  obraId: string
  adminName: string
  initialMensagens: Mensagem[]
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  )
}

function SignedAudio({
  storagePath,
  bucket,
}: {
  storagePath: string
  bucket: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    try {
      const supabase = createClient()
      supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 300)
        .then(({ data }) => {
          if (data) setUrl(data.signedUrl)
        })
    } catch {
      // Supabase browser client unavailable (env vars missing in this environment)
    }
  }, [storagePath, bucket])

  if (!url)
    return <span className="text-xs text-gray-500">Carregando áudio...</span>
  return <audio controls src={url} className="max-w-[240px]" />
}

function SignedImage({
  storagePath,
  bucket,
}: {
  storagePath: string
  bucket: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    try {
      const supabase = createClient()
      supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 300)
        .then(({ data }) => {
          if (data) setUrl(data.signedUrl)
        })
    } catch {
      // Supabase browser client unavailable (env vars missing in this environment)
    }
  }, [storagePath, bucket])

  if (!url)
    return <span className="text-xs text-gray-500">Carregando imagem...</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Imagem"
        className="max-h-48 max-w-[240px] rounded-lg object-cover"
      />
    </a>
  )
}

function MensagemBubble({
  mensagem,
  adminName,
}: {
  mensagem: Mensagem
  adminName: string
}) {
  const isEquipe = mensagem.sender_type === "equipe"

  const content = () => {
    if (mensagem.message_type === "text") {
      return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {mensagem.content}
        </p>
      )
    }
    if (mensagem.message_type === "image" && mensagem.storage_path) {
      return (
        <SignedImage storagePath={mensagem.storage_path} bucket="obra-mensagens" />
      )
    }
    if (mensagem.message_type === "audio" && mensagem.storage_path) {
      return (
        <SignedAudio storagePath={mensagem.storage_path} bucket="obra-mensagens" />
      )
    }
    return null
  }

  return (
    <div className={`flex ${isEquipe ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isEquipe
            ? "bg-orange-500 text-white"
            : "border border-gray-200 bg-gray-50 text-gray-900"
        }`}
      >
        {isEquipe ? (
          <p className="mb-1 text-xs font-medium text-orange-100">
            {`${mensagem.sender_display_name ?? adminName} (como Trifold)`}
          </p>
        ) : (
          <p className="mb-1 text-xs font-medium text-orange-500">Cliente</p>
        )}
        {content()}
        <p
          className={`mt-1 text-right text-[10px] ${
            isEquipe ? "text-orange-100" : "text-gray-400"
          }`}
        >
          {formatTimestamp(mensagem.created_at)}
        </p>
      </div>
    </div>
  )
}

export function AdminChatFeed({
  obraId,
  adminName,
  initialMensagens,
}: AdminChatFeedProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>(initialMensagens)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cleanup: (() => void) | undefined

    try {
      const supabase = createClient()
      const channel = supabase
        .channel(`obra-mensagens-${obraId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "obra_mensagens",
            filter: `obra_id=eq.${obraId}`,
          },
          (payload) => {
            const nova = payload.new as Mensagem
            setMensagens((prev) => {
              if (prev.some((m) => m.id === nova.id)) return prev
              return [...prev, nova]
            })
            requestAnimationFrame(() =>
              bottomRef.current?.scrollIntoView({ behavior: "smooth" })
            )
          }
        )
        .subscribe()
      cleanup = () => supabase.removeChannel(channel)
    } catch {
      // Realtime subscription unavailable — client will still work via polling
    }

    return () => cleanup?.()
  }, [obraId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [mensagens])

  async function sendText() {
    const content = text.trim()
    if (!content || sending) return
    setError(null)
    setSending(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao enviar")
      }
      const { mensagem } = await res.json()
      setMensagens((prev) => [...prev, mensagem])
      setText("")
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagem")
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendText()
    }
  }

  return (
    <div className="flex h-[500px] flex-col rounded-lg border border-gray-200 bg-white">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {mensagens.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-500">
            Nenhuma mensagem ainda.
          </p>
        )}
        {mensagens.map((m) => (
          <MensagemBubble key={m.id} mensagem={m} adminName={adminName} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              e.target.style.height = "auto"
              e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`
            }}
            onKeyDown={handleKeyDown}
            placeholder="Responder ao cliente... (Enter envia, Shift+Enter nova linha)"
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={sendText}
            disabled={sending || !text.trim()}
            className="flex-shrink-0 rounded-lg p-2 text-orange-500 hover:bg-orange-50 disabled:opacity-30"
            title="Enviar mensagem"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
