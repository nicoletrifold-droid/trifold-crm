"use client"

import { useActionState } from "react"
import Image from "next/image"
import { login } from "@web/app/login/actions"

export default function ClienteLoginPage() {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await login(formData)
      return result ?? null
    },
    null
  )

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-stone-800 bg-stone-900 p-8 shadow-xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-6 flex items-center justify-center">
              <Image
                src="/logo-trifold.svg"
                alt="Trifold"
                width={150}
                height={16}
                priority
              />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-stone-100">
              Portal do Cliente
            </h1>
            <p className="mt-1 text-sm text-stone-400">
              Acompanhe o progresso da sua obra
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[13px] font-medium text-stone-400"
              >
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="block w-full rounded-xl border border-stone-700 bg-stone-800 px-4 py-2.5 text-sm text-stone-100 outline-none transition-all placeholder:text-stone-600 focus:border-[#E8856A] focus:ring-2 focus:ring-[#E8856A]/20"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-medium text-stone-400"
              >
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="block w-full rounded-xl border border-stone-700 bg-stone-800 px-4 py-2.5 text-sm text-stone-100 outline-none transition-all placeholder:text-stone-600 focus:border-[#E8856A] focus:ring-2 focus:ring-[#E8856A]/20"
                placeholder="••••••••"
              />
            </div>

            {state?.error && (
              <div className="rounded-lg bg-red-900/30 px-3 py-2 text-[13px] text-red-400 border border-red-800/50">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-2 flex w-full items-center justify-center rounded-xl bg-[#E8856A] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#d4745a] focus:outline-none focus:ring-2 focus:ring-[#E8856A] focus:ring-offset-2 focus:ring-offset-stone-900 active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Entrando...
                </span>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-stone-600">
          Trifold Engenharia — Maringá, PR
        </p>
      </div>
    </div>
  )
}
