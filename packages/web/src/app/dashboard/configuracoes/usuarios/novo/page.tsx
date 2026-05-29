"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

type RoleOption = { name: string; label: string }

export default function NovoUsuarioPage() {
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [roles, setRoles] = useState<RoleOption[]>([])

  useEffect(() => {
    fetch("/api/admin/roles")
      .then((r) => r.json())
      .then((data) => setRoles(data.roles ?? []))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const form = new FormData(e.currentTarget)
    const name = form.get("name") as string
    const email = form.get("email") as string
    const password = form.get("password") as string
    const role = form.get("role") as string
    const phone = (form.get("phone") as string).trim() || null

    if (!name || !email || !password || !role) {
      setError("Preencha todos os campos")
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError("Senha deve ter no mínimo 6 caracteres")
      setLoading(false)
      return
    }

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role, phone }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || "Erro ao criar usuário")
      setLoading(false)
      return
    }

    router.push("/dashboard/configuracoes/usuarios")
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes/usuarios"
          className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Usuários
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-stone-900 dark:text-stone-100">Novo Usuário</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Criar acesso ao sistema. Usuários com perfil &quot;Corretor&quot; também aparecem como corretores no pipeline.
        </p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              Nome completo
            </label>
            <input
              name="name"
              type="text"
              required
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:bg-stone-800"
              placeholder="Nome do usuário"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:bg-stone-800"
              placeholder="email@empresa.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              Telefone / WhatsApp
            </label>
            <input
              name="phone"
              type="tel"
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:bg-stone-800"
              placeholder="(44) 99999-9999"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              Senha
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:bg-stone-800"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              Perfil de acesso
            </label>
            <select
              name="role"
              required
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:bg-stone-800"
            >
              <option value="">{roles.length === 0 ? "Carregando perfis..." : "Selecione..."}</option>
              {roles.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
              Corretores só veem seus próprios leads e agenda. Supervisores veem tudo mas não configuram. Admins têm acesso total.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/15 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {loading ? "Criando..." : "Criar usuário"}
            </button>
            <Link
              href="/dashboard/configuracoes/usuarios"
              className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
