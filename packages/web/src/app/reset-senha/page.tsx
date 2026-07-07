"use client"

import { useActionState, useState } from "react"
import Image from "next/image"
import { Eye, EyeOff } from "lucide-react"
import { resetPassword } from "./actions"

export default function ResetSenhaPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const password = formData.get("password") as string
      const confirmPassword = formData.get("confirmPassword") as string

      if (!password || password.length < 8) {
        return { error: "A senha deve ter pelo menos 8 caracteres" }
      }
      if (password !== confirmPassword) {
        return { error: "As senhas não coincidem" }
      }

      const result = await resetPassword(formData)
      return result ?? null
    },
    null
  )

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
              Nova senha
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Escolha uma senha com pelo menos 8 caracteres
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-medium text-stone-300"
              >
                Nova senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
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

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-[13px] font-medium text-stone-300"
              >
                Confirmar senha
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  className="block w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-2.5 pr-10 text-sm text-white outline-none transition-all placeholder:text-stone-600 focus:border-[#F27A5E] focus:ring-2 focus:ring-[#F27A5E]/20"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
                  aria-label={showConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {state?.error && (
              <div className="rounded-lg bg-red-900/30 border border-red-800/40 px-3 py-2 text-[13px] text-red-400">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-2 flex w-full items-center justify-center rounded-xl bg-[#F27A5E] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#d4705a] focus:outline-none focus:ring-2 focus:ring-[#F27A5E] focus:ring-offset-2 focus:ring-offset-stone-950 active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Redefinindo...
                </span>
              ) : (
                "Redefinir senha"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-stone-600">
          Trifold Engenharia — Maringá, PR
        </p>
      </div>
    </div>
  )
}
