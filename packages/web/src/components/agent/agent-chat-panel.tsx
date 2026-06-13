"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// ─── Types ─────────────────────────────────────────────────────────────────

interface ActionCard {
  type: "pause_campaign" | "resume_campaign" | "set_daily_budget"
  entity_id: string
  entity_name?: string
  description?: string
  value?: number
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  action_card: ActionCard | null
  action_status: "pending" | "confirmed" | "cancelled" | "executed" | null
  action_executed_at: string | null
  created_at: string
}

interface Session {
  id: string
  title: string | null
  context_type: "global" | "campaign"
  context_id: string | null
  updated_at: string
}

// ─── Inline markdown renderer ───────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const segments = text.split("\n\n")
  const result: React.ReactNode[] = []

  segments.forEach((block, bi) => {
    const lines = block.split("\n")

    // Table detection: lines with | separators
    if (lines.length >= 2 && lines[0]?.includes("|") && lines[1]?.includes("---")) {
      const headers = lines[0]!.split("|").map((h) => h.trim()).filter(Boolean)
      const rows = lines.slice(2).map((l) => l.split("|").map((c) => c.trim()).filter(Boolean))
      result.push(
        <div key={bi} className="overflow-x-auto my-2">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr>{headers.map((h, i) => <th key={i} className="border border-gray-200 dark:border-stone-700 px-2 py-1 bg-gray-50 dark:bg-stone-800 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>{row.map((cell, ci) => <td key={ci} className="border border-gray-200 dark:border-stone-700 px-2 py-1">{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      return
    }

    // Bullet list
    if (lines.every((l) => l.startsWith("- ") || l.startsWith("* ") || l === "")) {
      const items = lines.filter((l) => l.startsWith("- ") || l.startsWith("* "))
      if (items.length > 0) {
        result.push(
          <ul key={bi} className="list-disc list-inside space-y-0.5 my-1">
            {items.map((l, i) => (
              <li key={i}>{applyInline(l.replace(/^[-*] /, ""))}</li>
            ))}
          </ul>
        )
        return
      }
    }

    // Heading
    if (lines.length === 1 && lines[0]!.startsWith("# ")) {
      result.push(<p key={bi} className="font-bold mt-2 mb-0.5">{lines[0]!.replace(/^#+\s*/, "")}</p>)
      return
    }
    if (lines.length === 1 && lines[0]!.startsWith("## ")) {
      result.push(<p key={bi} className="font-semibold mt-1.5 mb-0.5">{lines[0]!.replace(/^#+\s*/, "")}</p>)
      return
    }

    // Regular paragraph
    result.push(
      <p key={bi} className={bi > 0 ? "mt-1.5" : ""}>
        {lines.map((line, li) => (
          <span key={li}>
            {applyInline(line)}
            {li < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    )
  })

  return result
}

function applyInline(text: string): React.ReactNode {
  // code, bold, italic
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="rounded bg-gray-100 dark:bg-stone-700 px-1 py-0.5 text-xs font-mono">{part.slice(1, -1)}</code>
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

// ─── Action card component ──────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  pause_campaign:    "Pausar Campanha",
  resume_campaign:   "Reativar Campanha",
  set_daily_budget:  "Ajustar Budget Diário",
}

function MessageActionCard({
  messageId,
  card,
  status,
  executedAt,
  isAdmin,
  onResolved,
}: {
  messageId: string
  card: ActionCard
  status: string | null
  executedAt: string | null
  isAdmin: boolean
  onResolved: (id: string, newStatus: "executed" | "cancelled") => void
}) {
  const [loading, setLoading] = useState(false)

  async function execute(action: "confirm" | "cancel") {
    setLoading(true)
    try {
      const res = await fetch(`/api/agent/action/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId }),
      })
      if (res.ok) {
        onResolved(messageId, action === "confirm" ? "executed" : "cancelled")
      }
    } finally {
      setLoading(false)
    }
  }

  const budgetBRL = card.value != null
    ? (card.value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null

  return (
    <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/30 dark:bg-orange-500/10">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-orange-800 dark:text-orange-300">
          ⚡ {ACTION_LABELS[card.type] ?? card.type}
        </span>
      </div>
      {card.entity_name && (
        <p className="text-xs text-orange-700 dark:text-orange-400 font-medium">{card.entity_name}</p>
      )}
      {budgetBRL && (
        <p className="text-xs text-orange-700 dark:text-orange-400">Novo budget: {budgetBRL}/dia</p>
      )}
      {card.description && (
        <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5 opacity-80">{card.description}</p>
      )}

      {status === "pending" && (
        <div className="mt-2 flex gap-2">
          {isAdmin ? (
            <>
              <button
                onClick={() => void execute("confirm")}
                disabled={loading}
                className="rounded px-3 py-1.5 bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 disabled:opacity-50"
              >
                {loading ? "..." : "Confirmar"}
              </button>
              <button
                onClick={() => void execute("cancel")}
                disabled={loading}
                className="rounded px-3 py-1.5 bg-white border border-orange-300 text-orange-700 text-xs font-medium hover:bg-orange-50 disabled:opacity-50 dark:bg-transparent dark:text-orange-400 dark:border-orange-500/50"
              >
                Cancelar
              </button>
            </>
          ) : (
            <p className="text-xs text-orange-600 dark:text-orange-400 italic">Somente admin pode executar ações.</p>
          )}
        </div>
      )}

      {status === "executed" && (
        <p className="mt-2 text-xs text-green-600 dark:text-green-400 font-medium">
          ✅ Executado {executedAt ? `às ${new Date(executedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </p>
      )}
      {status === "cancelled" && (
        <p className="mt-2 text-xs text-gray-500 dark:text-stone-400">❌ Cancelado</p>
      )}
    </div>
  )
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  isAdmin: boolean
  contextType?: "global" | "campaign"
  contextId?: string | null
  contextLabel?: string | null   // campaign name for display
}

// ─── Main panel ─────────────────────────────────────────────────────────────

export default function AgentChatPanel({
  isAdmin,
  contextType: initialContextType = "global",
  contextId: initialContextId = null,
  contextLabel = null,
}: Props) {
  const [isOpen, setIsOpen]                 = useState(false)
  const [sessions, setSessions]             = useState<Session[]>([])
  const [sessionsOpen, setSessionsOpen]     = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages]             = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const [isStreaming, setIsStreaming]        = useState(false)
  const [input, setInput]                   = useState("")
  const [contextType, setContextType]       = useState<"global" | "campaign">(initialContextType)
  const [contextId, setContextId]           = useState<string | null>(initialContextId)
  const [contextName, setContextName]       = useState<string | null>(contextLabel)

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLTextAreaElement>(null)
  const abortRef        = useRef<AbortController | null>(null)

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingContent])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
      void loadSessions()
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const res = await fetch("/api/agent/chat/sessions")
      if (res.ok) {
        const data = (await res.json()) as { sessions: Session[] }
        setSessions(data.sessions)
      }
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  const loadSession = useCallback(async (sessionId: string) => {
    setLoadingMessages(true)
    setActiveSessionId(sessionId)
    setMessages([])
    setStreamingContent("")
    setSessionsOpen(false)
    try {
      const res = await fetch(`/api/agent/chat/${sessionId}`)
      if (res.ok) {
        const data = (await res.json()) as { session: Session; messages: ChatMessage[] }
        setMessages(data.messages)
        setContextType(data.session.context_type)
        setContextId(data.session.context_id)
      }
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  const startNewSession = useCallback(() => {
    abortRef.current?.abort()
    setActiveSessionId(null)
    setMessages([])
    setStreamingContent("")
    setSessionsOpen(false)
    // Restore initial context
    setContextType(initialContextType)
    setContextId(initialContextId)
    setContextName(contextLabel)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [initialContextType, initialContextId, contextLabel])

  const handleActionResolved = useCallback((messageId: string, newStatus: "executed" | "cancelled") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, action_status: newStatus, action_executed_at: new Date().toISOString() }
          : m,
      ),
    )
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    setInput("")
    setIsStreaming(true)
    setStreamingContent("")

    // Optimistic user message
    const tempId = `temp-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: text, action_card: null, action_status: null, action_executed_at: null, created_at: new Date().toISOString() },
    ])

    abortRef.current = new AbortController()

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: activeSessionId,
          message: text,
          context_type: contextType,
          context_id: contextId,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText  = ""
      let newSessionId: string | null = null
      let hasAction = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const raw = decoder.decode(value, { stream: true })
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6)) as {
              text?: string
              done?: boolean
              session_id?: string
              has_action?: boolean
              error?: string
            }
            if (event.text) {
              fullText += event.text
              setStreamingContent(fullText)
            }
            if (event.done) {
              newSessionId = event.session_id ?? null
              hasAction    = event.has_action ?? false
            }
          } catch { /* ignore parse errors */ }
        }
      }

      // Update session ID if new session was created
      if (newSessionId && !activeSessionId) {
        setActiveSessionId(newSessionId)
        void loadSessions()
      }

      // Finalize: replace streaming with real message
      // The assistant message was saved on the server; reload to get the real ID and action_card
      if (newSessionId ?? activeSessionId) {
        const sid = newSessionId ?? activeSessionId!
        const msgRes = await fetch(`/api/agent/chat/${sid}`)
        if (msgRes.ok) {
          const data = (await msgRes.json()) as { session: Session; messages: ChatMessage[] }
          setMessages(data.messages)
        }
      } else {
        // fallback: add assistant message locally
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: fullText,
            action_card: null,
            action_status: hasAction ? "pending" : null,
            action_executed_at: null,
            created_at: new Date().toISOString(),
          },
        ])
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Erro ao conectar com o agente. Tente novamente.",
          action_card: null,
          action_status: null,
          action_executed_at: null,
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setIsStreaming(false)
      setStreamingContent("")
    }
  }, [input, isStreaming, activeSessionId, contextType, contextId, loadSessions])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const hasCampaignContext = initialContextType === "campaign" && !!initialContextId

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-orange-600 text-white shadow-lg hover:bg-orange-700 transition-colors"
        title="Abrir agente de análise Meta Ads"
        aria-label="Abrir agente"
      >
        {/* Bot icon (inline SVG to avoid lucide import issues) */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="10" x="3" y="11" rx="2" />
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v4" />
          <line x1="8" y1="16" x2="8" y2="16" />
          <line x1="16" y1="16" x2="16" y2="16" />
        </svg>
      </button>
    )
  }

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className="fixed inset-0 z-40 bg-black/20 sm:hidden"
        onClick={() => setIsOpen(false)}
      />

      {/* Panel */}
      <div className="fixed bottom-0 right-0 z-50 flex h-full w-full flex-col bg-white shadow-2xl sm:bottom-4 sm:right-4 sm:h-[85vh] sm:max-h-[700px] sm:w-[420px] sm:rounded-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-700">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-stone-700">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="10" x="3" y="11" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-stone-100">Agente Meta Ads</p>
              <p className="text-xs text-gray-500 dark:text-stone-400">Análise sênior de tráfego</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded p-1 text-gray-400 hover:text-gray-600 dark:text-stone-500 dark:hover:text-stone-300"
            aria-label="Fechar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Context bar */}
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 dark:border-stone-800 dark:bg-stone-800/50">
          <button
            onClick={() => { setContextType("global"); setContextId(null); setContextName(null) }}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              contextType === "global"
                ? "bg-orange-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300"
            }`}
          >
            Portfólio
          </button>
          {hasCampaignContext && (
            <button
              onClick={() => { setContextType("campaign"); setContextId(initialContextId); setContextName(contextLabel) }}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors truncate max-w-[200px] ${
                contextType === "campaign"
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300"
              }`}
              title={contextName ?? "Campanha"}
            >
              {contextName ?? "Campanha"}
            </button>
          )}
        </div>

        {/* Session list (collapsible) */}
        <div className="border-b border-gray-100 dark:border-stone-800">
          <button
            onClick={() => setSessionsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-xs text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            <span>Conversas anteriores {sessions.length > 0 ? `(${sessions.length})` : ""}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); startNewSession() }}
                className="rounded px-2 py-0.5 text-xs bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20"
              >
                + Nova
              </button>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${sessionsOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </button>

          {sessionsOpen && (
            <div className="max-h-40 overflow-y-auto border-t border-gray-100 dark:border-stone-800">
              {loadingSessions ? (
                <p className="px-4 py-3 text-xs text-gray-400 dark:text-stone-500">Carregando...</p>
              ) : sessions.length === 0 ? (
                <p className="px-4 py-3 text-xs text-gray-400 dark:text-stone-500 italic">Nenhuma conversa anterior</p>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => void loadSession(s.id)}
                    className={`flex w-full flex-col items-start px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-stone-800/50 ${
                      activeSessionId === s.id ? "bg-orange-50 dark:bg-orange-500/10" : ""
                    }`}
                  >
                    <span className="text-xs font-medium text-gray-800 dark:text-stone-200 truncate w-full">
                      {s.title ?? "Conversa sem título"}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-stone-500">
                      {new Date(s.updated_at).toLocaleDateString("pt-BR")}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {messages.length === 0 && !isStreaming && !loadingMessages && (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-gray-400 dark:text-stone-500">
              <span className="text-3xl mb-2">✨</span>
              <p className="font-medium text-gray-500 dark:text-stone-400">
                {contextType === "campaign" && contextName
                  ? `Analisando "${contextName}"`
                  : "Análise do portfólio Meta Ads"}
              </p>
              <p className="mt-1 text-xs">Pergunte sobre performance, CPL, criativos ou solicite recomendações.</p>
            </div>
          )}

          {loadingMessages && (
            <div className="flex justify-center py-8">
              <svg className="h-5 w-5 animate-spin text-gray-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-orange-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm dark:bg-stone-800 dark:text-stone-200"
                }`}
              >
                {msg.role === "assistant"
                  ? renderMarkdown(msg.content)
                  : <p>{msg.content}</p>
                }
                {msg.action_card && (
                  <MessageActionCard
                    messageId={msg.id}
                    card={msg.action_card}
                    status={msg.action_status}
                    executedAt={msg.action_executed_at}
                    isAdmin={isAdmin}
                    onResolved={handleActionResolved}
                  />
                )}
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2.5 text-sm leading-relaxed text-gray-800 dark:bg-stone-800 dark:text-stone-200">
                {streamingContent
                  ? renderMarkdown(streamingContent)
                  : (
                    <span className="inline-flex items-center gap-1 text-gray-400 dark:text-stone-500">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 dark:bg-stone-500" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 dark:bg-stone-500" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 dark:bg-stone-500" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 px-3 py-3 dark:border-stone-700">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre campanhas, CPL, criativos..."
              disabled={isStreaming}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
              style={{ maxHeight: "100px" }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isStreaming}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Enviar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 text-center text-xs text-gray-300 dark:text-stone-600">
            Enter para enviar · Shift+Enter nova linha
          </p>
        </div>
      </div>
    </>
  )
}
