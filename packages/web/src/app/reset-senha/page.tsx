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
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      <div className="relative w-full max-w-sm">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          {/* Logo & Title */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
              <Image
                src="/logo-trifold.webp"
                alt="Trifold"
                width={40}
                height={40}
              />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-stone-900">
              Nova senha
            </h1>
            <p className="mt-1 text-sm text-stone-400">
              Escolha uma senha com pelo menos 8 caracteres
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-medium text-stone-600"
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
                  className="block w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 pr-10 text-sm text-stone-900 outline-none transition-all placeholder:text-stone-300 focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-[13px] font-medium text-stone-600"
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
                  className="block w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 pr-10 text-sm text-stone-900 outline-none transition-all placeholder:text-stone-300 focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label={showConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {state?.error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-2 flex w-full items-center justify-center rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
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

        <p className="mt-6 text-center text-[11px] text-stone-300">
          Trifold Engenharia — Maringá, PR
        </p>
      </div>
    </div>
  )
}
