"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@web/lib/supabase/client"
import { Send, User } from "lucide-react"

interface Mensagem {
  id: string
  content: string | null
  message_type: string
  storage_path: string | null
  sender_type: string
  sender_display_name: string | null
  cliente_id: string | null
  created_at: string
}

interface ClienteItem {
  id: string
  name: string
}

interface AdminChatFeedProps {
  obraId: string
  adminName: string
  clientes?: ClienteItem[]
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

function AvatarCircle({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
  return (
    <div
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${className ?? "bg-teal-100 text-teal-700"}`}
    >
      {initials || "?"}
    </div>
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
  const senderName = mensagem.sender_display_name ?? (isEquipe ? adminName : "Cliente")

  const bubbleContent = () => {
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

  if (isEquipe) {
    return (
      <div className="flex items-end justify-end gap-2">
        <div className="max-w-[72%] rounded-2xl rounded-br-none bg-orange-500 px-4 py-2.5 text-white shadow-sm">
          <p className="mb-1 text-[11px] font-semibold text-orange-100">{senderName}</p>
          {bubbleContent()}
          <p className="mt-1 text-right text-[10px] text-orange-200">
            {formatTimestamp(mensagem.created_at)}
          </p>
        </div>
        <AvatarCircle name={senderName} className="mb-0.5 bg-orange-100 text-orange-700" />
      </div>
    )
  }

  return (
    <div className="flex items-end justify-start gap-2">
      <AvatarCircle name={senderName} className="mb-0.5 bg-teal-100 text-teal-700" />
      <div className="max-w-[72%] rounded-2xl rounded-bl-none bg-white px-4 py-2.5 text-gray-800 shadow-sm">
        <p className="mb-1 text-[11px] font-semibold text-teal-600">{senderName}</p>
        {bubbleContent()}
        <p className="mt-1 text-right text-[10px] text-gray-400">
          {formatTimestamp(mensagem.created_at)}
        </p>
      </div>
    </div>
  )
}

function ClienteSelector({
  clientes,
  unreadCounts,
  onSelect,
}: {
  clientes: ClienteItem[]
  unreadCounts: Record<string, number>
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <p className="mb-4 text-sm font-medium text-gray-700">
        Selecione o cliente para ver a conversa:
      </p>
      <div className="w-full max-w-sm space-y-2">
        {clientes.map((c) => {
          const unread = unreadCounts[c.id] ?? 0
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:border-orange-300 hover:bg-orange-50 transition-colors"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-100">
                <User className="h-4 w-4 text-orange-600" />
              </div>
              <span className="flex-1 text-sm font-medium text-gray-900">
                {c.name}
              </span>
              {unread > 0 && (
                <span className="flex-shrink-0 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AdminChatFeed({
  obraId,
  adminName,
  clientes: clientesProp,
  initialMensagens,
}: AdminChatFeedProps) {
  const clientes = clientesProp ?? []
  // legacy mode: no client list provided (used by inbox ConversationPanel)
  const legacyMode = !clientesProp

  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(
    legacyMode
      ? (initialMensagens.find((m) => m.cliente_id)?.cliente_id ?? null)
      : clientes.length === 1
        ? clientes[0].id
        : null
  )
  const [mensagens, setMensagens] = useState<Mensagem[]>(
    legacyMode || clientes.length === 1 ? initialMensagens : []
  )
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fetchMensagens = useCallback(
    async (clienteId: string) => {
      setLoadingMsgs(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/admin/obras/${obraId}/mensagens?cliente_id=${clienteId}`
        )
        if (!res.ok) return
        const data = await res.json()
        setMensagens(data.mensagens ?? [])
      } finally {
        setLoadingMsgs(false)
      }
    },
    [obraId]
  )

  // Fetch unread counts for multi-client selector
  useEffect(() => {
    if (legacyMode || clientes.length <= 1) return
    fetch(`/api/admin/obras/${obraId}/mensagens`)
      .then((r) => r.json())
      .then((data) => {
        const counts: Record<string, number> = {}
        for (const m of data.mensagens ?? []) {
          if (m.sender_type === "cliente" && !m.read_at && m.cliente_id) {
            counts[m.cliente_id] = (counts[m.cliente_id] ?? 0) + 1
          }
        }
        setUnreadCounts(counts)
      })
      .catch(() => {})
  }, [obraId, clientes.length, legacyMode])

  // Fetch messages when a client is selected (skip in legacy mode — initialMensagens already provided)
  useEffect(() => {
    if (legacyMode || !selectedClienteId) return
    fetchMensagens(selectedClienteId)
  }, [legacyMode, selectedClienteId, fetchMensagens])

  // Realtime subscription — filter client-side by selected cliente_id
  useEffect(() => {
    if (!selectedClienteId) return
    let cleanup: (() => void) | undefined

    try {
      const supabase = createClient()
      const channel = supabase
        .channel(`obra-mensagens-${obraId}-${selectedClienteId}`)
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
            if (nova.cliente_id !== selectedClienteId) return
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
  }, [obraId, selectedClienteId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [mensagens])

  async function sendText() {
    const content = text.trim()
    if (!content || sending || !selectedClienteId) return
    setError(null)
    setSending(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, cliente_id: selectedClienteId }),
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

  const selectedCliente = clientes.find((c) => c.id === selectedClienteId)

  if (!legacyMode && clientes.length === 0) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-lg border border-gray-200 bg-white">
        <p className="text-sm text-gray-500">
          Nenhum cliente vinculado a esta obra.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col overflow-hidden">
      {/* Header: botão voltar quando multi-cliente */}
      {selectedClienteId && clientes.length > 1 && (
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
          <button
            onClick={() => {
              setSelectedClienteId(null)
              setMensagens([])
            }}
            className="text-xs text-orange-600 hover:underline"
          >
            ← Clientes
          </button>
          <span className="text-xs text-gray-400">/</span>
          <span className="text-xs font-medium text-gray-700">
            {selectedCliente?.name}
          </span>
        </div>
      )}

      {/* Seletor de clientes (multi-cliente, nenhum selecionado) */}
      {!legacyMode && !selectedClienteId && (
        <ClienteSelector
          clientes={clientes}
          unreadCounts={unreadCounts}
          onSelect={(id) => setSelectedClienteId(id)}
        />
      )}

      {/* Feed de mensagens */}
      {selectedClienteId && (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto bg-[#f0ece3] px-4 py-4">
            {loadingMsgs && (
              <p className="py-10 text-center text-sm text-gray-400">
                Carregando mensagens...
              </p>
            )}
            {!loadingMsgs && mensagens.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/70 shadow-sm">
                  <Send className="h-6 w-6 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500">Nenhuma mensagem ainda.</p>
                <p className="mt-1 text-xs text-gray-400">Seja o primeiro a enviar uma mensagem.</p>
              </div>
            )}
            {!loadingMsgs &&
              mensagens.map((m) => (
                <MensagemBubble key={m.id} mensagem={m} adminName={adminName} />
              ))}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-gray-200 bg-white px-4 py-3">
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
                placeholder="Responder ao cliente… (Enter envia, Shift+Enter nova linha)"
                rows={1}
                disabled={sending}
                className="flex-1 resize-none rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-300 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={sendText}
                disabled={sending || !text.trim()}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition-colors hover:bg-orange-600 disabled:opacity-30"
                title="Enviar mensagem"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
