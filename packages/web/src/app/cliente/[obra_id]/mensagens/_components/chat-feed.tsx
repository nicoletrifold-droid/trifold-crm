"use client"

import React, { useEffect, useRef, useState } from "react"
import { createClient } from "@web/lib/supabase/client"
import { Loader2, Paperclip, Send } from "lucide-react"
import { useUnreadBadge } from "../../_components/unread-badge-provider"

interface Mensagem {
  id: string
  content: string | null
  message_type: string
  storage_path: string | null
  sender_type: string
  created_at: string
}

interface ChatFeedProps {
  obraId: string
  userId: string | null
  initialMensagens: Mensagem[]
  supabaseUrl?: string
  hasMoreInitial?: boolean
  oldestCursorInitial?: string | null
}

function getDayKey(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return "Hoje"
  if (date.toDateString() === yesterday.toDateString()) return "Ontem"
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-stone-800" />
      <span className="text-xs text-stone-500">{label}</span>
      <div className="h-px flex-1 bg-stone-800" />
    </div>
  )
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  }) + " " + d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function SignedAudio({ storagePath, bucket }: { storagePath: string; bucket: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 300)
      .then(({ data }) => {
        if (data) setUrl(data.signedUrl)
      })
  }, [storagePath, bucket])

  if (!url) return <span className="text-xs text-stone-500">Carregando áudio...</span>
  return <audio controls src={url} className="max-w-[240px]" />
}

function SignedImage({ storagePath, bucket }: { storagePath: string; bucket: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 300)
      .then(({ data }) => {
        if (data) setUrl(data.signedUrl)
      })
  }, [storagePath, bucket])

  if (!url) return <span className="text-xs text-stone-500">Carregando imagem...</span>
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

function SignedDocument({
  storagePath,
  bucket,
  filename,
}: {
  storagePath: string
  bucket: string
  filename: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 300)
      .then(({ data }) => {
        if (data) setUrl(data.signedUrl)
      })
  }, [storagePath, bucket])

  if (!url) return <span className="text-xs text-stone-500">Carregando documento...</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={filename}
      className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
    >
      <span className="text-lg">📎</span>
      <span className="max-w-[180px] truncate font-medium">{filename}</span>
    </a>
  )
}

function MensagemBubble({ mensagem }: { mensagem: Mensagem }) {
  const isCliente = mensagem.sender_type === "cliente"

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
        <SignedImage
          storagePath={mensagem.storage_path}
          bucket="obra-mensagens"
        />
      )
    }
    if (mensagem.message_type === "audio" && mensagem.storage_path) {
      return (
        <SignedAudio
          storagePath={mensagem.storage_path}
          bucket="obra-mensagens"
        />
      )
    }
    if (mensagem.message_type === "document" && mensagem.storage_path) {
      return (
        <SignedDocument
          storagePath={mensagem.storage_path}
          bucket="obra-mensagens"
          filename={mensagem.content ?? "Documento"}
        />
      )
    }
    return null
  }

  return (
    <div className={`flex ${isCliente ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
          isCliente
            ? "bg-[#F27A5E] text-white"
            : "border border-[#F27A5E]/20 bg-stone-800 text-stone-100"
        }`}
      >
        {!isCliente && (
          <p className="mb-1 text-xs font-medium text-[#F27A5E]">Equipe Trifold</p>
        )}
        {content()}
        <p
          className={`mt-1 text-right text-[10px] ${
            isCliente ? "text-orange-100" : "text-stone-500"
          }`}
        >
          {formatTimestamp(mensagem.created_at)}
        </p>
      </div>
    </div>
  )
}

export function ChatFeed({
  obraId,
  userId,
  initialMensagens,
  hasMoreInitial = false,
  oldestCursorInitial = null,
}: ChatFeedProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>(initialMensagens)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(hasMoreInitial)
  const [oldestCursor, setOldestCursor] = useState<string | null>(oldestCursorInitial)
  const [loadingMore, setLoadingMore] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { clearUnread } = useUnreadBadge()

  // Zerar badge ao abrir o chat (mensagens são marcadas como lidas pelo server no page.tsx)
  useEffect(() => {
    clearUnread()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime subscription — filtrar client-side por cliente_id do usuário logado
  useEffect(() => {
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
          const nova = payload.new as Mensagem & { cliente_id?: string | null }
          // Apenas mensagens desta conversa (cliente_id corresponde ou admin respondendo ao cliente)
          if (userId && nova.cliente_id !== null && nova.cliente_id !== undefined && nova.cliente_id !== userId) {
            return
          }
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [obraId, userId])

  // Auto-scroll no mount
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" })
  }, [])

  // Auto-scroll quando mensagens mudam (apenas novas)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [mensagens])

  async function loadMoreMensagens() {
    if (loadingMore || !hasMore || !oldestCursor) return
    setLoadingMore(true)

    // Salvar scroll height antes de inserir mensagens antigas
    const feed = feedRef.current
    const prevScrollHeight = feed?.scrollHeight ?? 0

    try {
      const url = `/api/cliente/obras/${obraId}/mensagens?before=${encodeURIComponent(oldestCursor)}`
      const res = await fetch(url)
      if (!res.ok) throw new Error("Erro ao carregar mensagens")
      const { mensagens: older, hasMore: moreExist } = (await res.json()) as {
        mensagens: Mensagem[]
        hasMore: boolean
      }

      if (older.length > 0) {
        setMensagens((prev) => {
          const existingIds = new Set(prev.map((m) => m.id))
          const novas = older.filter((m) => !existingIds.has(m.id))
          return [...novas, ...prev]
        })
        setOldestCursor(older[0]!.created_at)

        // Restaurar scroll position após inserção
        requestAnimationFrame(() => {
          if (feed) {
            feed.scrollTop = feed.scrollHeight - prevScrollHeight
          }
        })
      }
      setHasMore(moreExist)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar mensagens")
    } finally {
      setLoadingMore(false)
    }
  }

  async function sendText() {
    const content = text.trim()
    if (!content || sending) return
    setError(null)
    setSending(true)
    try {
      const res = await fetch(`/api/cliente/obras/${obraId}/mensagens`, {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagem")
    } finally {
      setSending(false)
    }
  }

  async function handleFileUpload(file: File) {
    setError(null)
    setSending(true)
    try {
      const isAudio = file.type.startsWith("audio/")
      const isImage = file.type.startsWith("image/")
      const type = isAudio ? "audio" : isImage ? "image" : "document"
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", type)

      const res = await fetch(
        `/api/cliente/obras/${obraId}/mensagens/upload`,
        { method: "POST", body: formData }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao enviar arquivo")
      }
      const { mensagem } = await res.json()
      setMensagens((prev) => [...prev, mensagem])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar arquivo")
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header contato */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-stone-800 bg-stone-900/50 px-4 py-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#F27A5E] text-sm font-bold text-white">
          T
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Equipe Trifold</p>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="text-xs text-stone-400">Online</span>
          </div>
        </div>
      </div>

      {/* Feed de mensagens */}
      <div ref={feedRef} className="flex-1 overflow-y-auto bg-stone-900/40 px-4 py-4">
        {/* Botão carregar mensagens anteriores */}
        {hasMore && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={loadMoreMensagens}
              disabled={loadingMore}
              className="flex items-center gap-2 rounded-full border border-stone-700 bg-stone-800/70 px-4 py-2 text-xs font-medium text-stone-300 transition-colors hover:bg-stone-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando...
                </>
              ) : (
                "Carregar mensagens anteriores"
              )}
            </button>
          </div>
        )}

        <div className="space-y-3">
          {mensagens.length === 0 && (
            <p className="py-10 text-center text-sm text-stone-500">
              Nenhuma mensagem ainda. Diga olá para a equipe!
            </p>
          )}
          {mensagens.map((m, i) => {
            const currentDay = getDayKey(m.created_at)
            const prevDay = i > 0 ? getDayKey(mensagens[i - 1]!.created_at) : null
            return (
              <React.Fragment key={m.id}>
                {currentDay !== prevDay && <DateDivider label={currentDay} />}
                <MensagemBubble mensagem={m} />
              </React.Fragment>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-stone-800 bg-stone-950 px-4 py-3">
        {error && (
          <p className="mb-2 text-xs text-red-400">{error}</p>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Enviar foto, áudio ou documento"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-800 hover:text-white disabled:opacity-50"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                handleFileUpload(file)
                e.target.value = ""
              }
            }}
          />
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              e.target.style.height = "auto"
              e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`
            }}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem..."
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-white placeholder-stone-500 focus:border-[#F27A5E] focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={sendText}
            disabled={sending || !text.trim()}
            aria-label="Enviar mensagem"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-[#F27A5E] hover:bg-stone-800 disabled:opacity-30"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
