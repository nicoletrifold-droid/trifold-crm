"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, MessageSquarePlus } from "lucide-react"

interface OpeningTemplateMenuProps {
  leadId: string
  /**
   * Chamado após envio bem-sucedido — cada superfície decide o pós-envio
   * (o /broker faz `router.refresh()`; o drawer marca sucesso + recarrega).
   */
  onSent?: () => void
  /**
   * Texto auxiliar exibido com o menu fechado. Default = copy original do
   * /broker ("reabrir a conversa", caminho janela de 24h fechada — AC7); o
   * estado "sem conversa" passa a variante "iniciar a conversa".
   */
  idleHint?: string
  /** Conteúdo extra no estado de sucesso (ex.: CTA "Ver conversa" no drawer). */
  successExtra?: React.ReactNode
}

const DEFAULT_IDLE_HINT =
  "Abre as mensagens de abertura aprovadas pelo WhatsApp para reabrir a conversa com o cliente."

/**
 * Story 75-267 — menu de templates de abertura ("Iniciar atendimento")
 * compartilhado entre o composer do /broker (`broker-message-input.tsx`) e o
 * drawer do lead (`lead-detail-drawer.tsx`). Extraído SEM mudança de
 * comportamento das Stories 75-142/75-217/75-225: lista os templates aprovados
 * na Meta (GET /api/leads/[id]/opening-templates) com preview renderizado para
 * o lead e envia via POST /api/leads/[id]/start-whatsapp.
 */
export function OpeningTemplateMenu({
  leadId,
  onSent,
  idleHint = DEFAULT_IDLE_HINT,
  successExtra,
}: OpeningTemplateMenuProps) {
  // Story 75-142 — "Iniciar atendimento" via template (janela fechada / lead frio).
  // Story 75-217 — o botão abre um menu com os templates de abertura aprovados
  // na Meta (um por contexto), com preview já renderizado para este lead.
  const [startDone, setStartDone] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templates, setTemplates] = useState<Array<{ name: string; preview: string }> | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [sendingTemplate, setSendingTemplate] = useState<string | null>(null)
  // Story 75-225 — o menu expande dentro da área rolável da conversa e o fim da
  // lista fica abaixo da dobra ("só aparecem 3 de 4"). Ao abrir (inclusive quando
  // os templates chegam depois do loading), garante o fim do menu visível.
  // `nearest` não mexe no scroll quando já está tudo à vista.
  const templatesEndRef = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    if (!templatesOpen || templates === null) return
    templatesEndRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" })
  }, [templatesOpen, templates])

  async function handleToggleTemplates() {
    if (startDone || sendingTemplate) return
    setStartError(null)
    if (templatesOpen) {
      setTemplatesOpen(false)
      return
    }
    setTemplatesOpen(true)
    if (templates !== null || templatesLoading) return
    setTemplatesLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/opening-templates`)
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        setStartError(data?.message ?? "Não foi possível carregar as mensagens. Tente novamente.")
        setTemplatesOpen(false)
        return
      }
      setTemplates(data.templates as Array<{ name: string; preview: string }>)
    } catch {
      setStartError("Erro de conexão. Tente novamente.")
      setTemplatesOpen(false)
    } finally {
      setTemplatesLoading(false)
    }
  }

  async function handleStartWhatsapp(templateName: string) {
    if (sendingTemplate || startDone) return
    setSendingTemplate(templateName)
    setStartError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/start-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: templateName }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        setStartError(data?.message ?? "Não foi possível iniciar o atendimento. Tente novamente.")
        return
      }
      setStartDone(true)
      setTemplatesOpen(false)
      onSent?.()
    } catch {
      setStartError("Erro de conexão. Tente novamente.")
    } finally {
      setSendingTemplate(null)
    }
  }

  return (
    <>
      {startDone ? (
        <>
          <div className="flex min-h-[44px] items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400" aria-live="polite">
            <MessageSquarePlus className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            Convite enviado. Aguarde a resposta do cliente para continuar.
          </div>
          {successExtra}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void handleToggleTemplates()}
            disabled={templatesLoading || sendingTemplate !== null}
            aria-expanded={templatesOpen}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-emerald-500 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
          >
            {templatesLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageSquarePlus className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
            Iniciar atendimento (mensagem de abertura)
          </button>
          {templatesOpen && templates !== null && (
            <div className="space-y-2" role="listbox" aria-label="Escolha a mensagem de abertura">
              {templates.length === 0 && (
                <p className="rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                  Nenhuma mensagem de abertura aprovada disponível no momento.
                </p>
              )}
              {templates.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => void handleStartWhatsapp(t.name)}
                  disabled={sendingTemplate !== null}
                  className="flex w-full items-start gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-left text-sm text-stone-700 hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-500/10"
                >
                  {sendingTemplate === t.name ? (
                    <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  ) : (
                    <MessageSquarePlus className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  )}
                  <span className="whitespace-pre-line">{t.preview}</span>
                </button>
              ))}
            </div>
          )}
          <p ref={templatesEndRef} className="px-1 text-xs text-stone-500 dark:text-stone-500">
            {templatesOpen
              ? "Toque na mensagem que combina com o contexto do lead — ela será enviada como está."
              : idleHint}
          </p>
        </>
      )}
      {startError && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {startError}
        </p>
      )}
    </>
  )
}
