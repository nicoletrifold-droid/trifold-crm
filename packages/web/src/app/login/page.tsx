"use client"

import { useActionState, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff } from "lucide-react"
import { login, requestPasswordReset } from "./actions"

type RecoveryState = { error?: string; sent?: boolean; email?: string } | null

function LoginContent() {
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get("reset") === "success"
  const tokenError = searchParams.get("error") === "invalid-token"

  const [view, setView] = useState<"login" | "recovery">("login")
  const [showPassword, setShowPassword] = useState(false)

  const [loginState, loginAction, loginPending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await login(formData)
      return result ?? null
    },
    null
  )

  const [recoveryState, recoveryAction, recoveryPending] = useActionState(
    async (_prev: RecoveryState, formData: FormData) => {
      const result = await requestPasswordReset(formData)
      return result ?? null
    },
    null
  )

  const recoverySent = recoveryState && "sent" in recoveryState && recoveryState.sent

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">

      <div className="relative w-full max-w-sm">
        <div className="rounded-2xl border border-stone-800/60 bg-stone-950 p-8 shadow-2xl">
          {/* Logo & Title */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 ring-1 ring-stone-800">
              <Image
                src="/logo-trifold.svg"
                alt="Trifold"
                width={36}
                height={36}
                className="brightness-0 invert"
              />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Trifold CRM
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {view === "recovery" ? "Recuperação de senha" : "Entre com suas credenciais"}
            </p>
          </div>

          {/* Success banner */}
          {resetSuccess && view === "login" && (
            <div className="mb-4 rounded-lg bg-green-900/30 border border-green-800/40 px-3 py-2 text-[13px] text-green-400">
              Senha redefinida com sucesso. Faça login com a nova senha.
            </div>
          )}

          {/* Invalid token banner */}
          {tokenError && view === "login" && (
            <div className="mb-4 rounded-lg bg-red-900/30 border border-red-800/40 px-3 py-2 text-[13px] text-red-400">
              Link de recuperação inválido ou expirado. Solicite um novo.
            </div>
          )}

          {view === "login" ? (
            /* ===== Login form ===== */
            <form action={loginAction} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-[13px] font-medium text-stone-300"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="block w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-stone-600 focus:border-[#F27A5E] focus:ring-2 focus:ring-[#F27A5E]/20"
                  placeholder="seu@email.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-[13px] font-medium text-stone-300"
                >
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    className="block w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-2.5 pr-10 text-sm text-white outline-none transition-all placeholder:text-stone-600 focus:border-[#F27A5E] focus:ring-2 focus:ring-[#F27A5E]/20"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {loginState?.error && (
                <div className="rounded-lg bg-red-900/30 border border-red-800/40 px-3 py-2 text-[13px] text-red-400">
                  {loginState.error}
                </div>
              )}

              <button
                type="submit"
                disabled={loginPending}
                className="mt-2 flex w-full items-center justify-center rounded-xl bg-[#F27A5E] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#d4705a] focus:outline-none focus:ring-2 focus:ring-[#F27A5E] focus:ring-offset-2 focus:ring-offset-stone-950 active:scale-[0.98] disabled:opacity-50"
              >
                {loginPending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Entrando...
                  </span>
                ) : (
                  "Entrar"
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setView("recovery")}
                  className="text-[13px] text-stone-500 underline-offset-2 hover:text-stone-300 hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
            </form>
          ) : recoverySent ? (
            /* ===== Sent confirmation ===== */
            <div className="space-y-4 text-center">
              <div className="rounded-lg bg-green-900/30 border border-green-800/40 px-4 py-3 text-[13px] text-green-400">
                Enviamos um link de recuperação para{" "}
                <span className="font-medium">
                  {"email" in recoveryState! ? recoveryState.email : ""}
                </span>
                . Verifique sua caixa de entrada.
              </div>
              <button
                type="button"
                onClick={() => setView("login")}
                className="text-[13px] text-stone-500 underline-offset-2 hover:text-stone-300 hover:underline"
              >
                Voltar ao login
              </button>
            </div>
          ) : (
            /* ===== Recovery form ===== */
            <form action={recoveryAction} className="space-y-4">
              <div>
                <label
                  htmlFor="recovery-email"
                  className="mb-1.5 block text-[13px] font-medium text-stone-300"
                >
                  Email cadastrado
                </label>
                <input
                  id="recovery-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="block w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-stone-600 focus:border-[#F27A5E] focus:ring-2 focus:ring-[#F27A5E]/20"
                  placeholder="seu@email.com"
                />
              </div>

              {recoveryState && "error" in recoveryState && recoveryState.error && (
                <div className="rounded-lg bg-red-900/30 border border-red-800/40 px-3 py-2 text-[13px] text-red-400">
                  {recoveryState.error}
                </div>
              )}

              <button
                type="submit"
                disabled={recoveryPending}
                className="mt-2 flex w-full items-center justify-center rounded-xl bg-[#F27A5E] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#d4705a] focus:outline-none focus:ring-2 focus:ring-[#F27A5E] focus:ring-offset-2 focus:ring-offset-stone-950 active:scale-[0.98] disabled:opacity-50"
              >
                {recoveryPending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Enviando...
                  </span>
                ) : (
                  "Enviar link de recuperação"
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="text-[13px] text-stone-500 underline-offset-2 hover:text-stone-300 hover:underline"
                >
                  Voltar ao login
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-stone-600">
          Trifold Engenharia — Maringá, PR
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
