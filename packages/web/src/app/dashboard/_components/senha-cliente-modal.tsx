"use client"

import { useState } from "react"
import { KeyRound, Mail, X } from "lucide-react"

interface Props {
  userId: string        // ID da tabela users
  clienteNome: string
  clienteEmail: string
  onClose: () => void
}

interface FeedbackMsg {
  type: "success" | "error"
  text: string
}

export function SenhaClienteModal({
  userId,
  clienteNome,
  clienteEmail,
  onClose,
}: Props) {
  // ── Estado e-mail de redefinição ──────────────────────────────────────
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailFeedback, setEmailFeedback] = useState<FeedbackMsg | null>(null)

  // ── Estado definir senha manualmente ─────────────────────────────────
  const [novaSenha, setNovaSenha] = useState("")
  const [confirmarSenha, setConfirmarSenha] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordFeedback, setPasswordFeedback] = useState<FeedbackMsg | null>(null)

  async function handleSendResetEmail() {
    setSendingEmail(true)
    setEmailFeedback(null)
    try {
      const res = await fetch(`/api/admin/clientes/${userId}/senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_reset_email" }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        error?: string
      }
      if (!res.ok) {
        setEmailFeedback({ type: "error", text: data.error ?? "Erro ao enviar e-mail." })
        return
      }
      setEmailFeedback({ type: "success", text: data.message ?? "E-mail enviado com sucesso." })
    } catch {
      setEmailFeedback({ type: "error", text: "Erro de rede. Tente novamente." })
    } finally {
      setSendingEmail(false)
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordFeedback(null)

    if (novaSenha.length < 6) {
      setPasswordFeedback({ type: "error", text: "A senha deve ter no mínimo 6 caracteres." })
      return
    }
    if (novaSenha !== confirmarSenha) {
      setPasswordFeedback({ type: "error", text: "As senhas não coincidem." })
      return
    }

    setSavingPassword(true)
    try {
      const res = await fetch(`/api/admin/clientes/${userId}/senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_password", password: novaSenha }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        error?: string
      }
      if (!res.ok) {
        setPasswordFeedback({ type: "error", text: data.error ?? "Erro ao definir senha." })
        return
      }
      setPasswordFeedback({ type: "success", text: data.message ?? "Senha atualizada com sucesso." })
      setNovaSenha("")
      setConfirmarSenha("")
    } catch {
      setPasswordFeedback({ type: "error", text: "Erro de rede. Tente novamente." })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-stone-900 shadow-2xl ring-1 ring-stone-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#F27A5E]" />
            <h2 className="text-sm font-semibold text-stone-100">
              Gerenciar Senha &mdash; {clienteNome}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-800 hover:text-stone-200"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Seção 1: Redefinição por e-mail */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-stone-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Redefinição por e-mail
              </h3>
            </div>
            <p className="text-xs text-stone-400">
              Envia um link de redefinição para{" "}
              <span className="font-medium text-stone-300">{clienteEmail}</span>.
              O cliente poderá escolher a própria senha.
            </p>

            {emailFeedback && (
              <p
                className={`rounded-md px-3 py-2 text-xs ${
                  emailFeedback.type === "success"
                    ? "bg-green-500/15 text-green-300"
                    : "bg-red-500/15 text-red-300"
                }`}
              >
                {emailFeedback.text}
              </p>
            )}

            <button
              type="button"
              onClick={handleSendResetEmail}
              disabled={sendingEmail}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-700 px-4 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800 hover:text-[#E8856A] disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {sendingEmail ? "Enviando..." : "Enviar link de redefinição"}
            </button>
          </section>

          {/* Divisor */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-stone-900 px-2 text-xs text-stone-500">ou</span>
            </div>
          </div>

          {/* Seção 2: Definir senha manualmente */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5 text-stone-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Definir senha manualmente
              </h3>
            </div>
            <p className="text-xs text-stone-400">
              Define uma nova senha diretamente. Use quando o cliente tiver dificuldade em
              acessar o e-mail.
            </p>

            <form onSubmit={handleSetPassword} className="space-y-2.5">
              <input
                type="password"
                placeholder="Nova senha (mín. 6 caracteres)"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                minLength={6}
                required
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:border-[#F27A5E] focus:outline-none"
              />
              <input
                type="password"
                placeholder="Confirmar nova senha"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                minLength={6}
                required
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:border-[#F27A5E] focus:outline-none"
              />

              {passwordFeedback && (
                <p
                  className={`rounded-md px-3 py-2 text-xs ${
                    passwordFeedback.type === "success"
                      ? "bg-green-500/15 text-green-300"
                      : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {passwordFeedback.text}
                </p>
              )}

              <button
                type="submit"
                disabled={savingPassword || !novaSenha || !confirmarSenha}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#F27A5E] px-4 py-2 text-sm font-medium text-white hover:bg-[#E8856A] disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {savingPassword ? "Salvando..." : "Salvar senha"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
