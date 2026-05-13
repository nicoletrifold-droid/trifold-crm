"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function UserEditModal({
  userId,
  userName,
  userEmail,
  isOwnAccount,
}: {
  userId: string
  userName: string
  userEmail: string
  isOwnAccount: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"edit" | "password">("edit")
  const [name, setName] = useState(userName)
  const [email, setEmail] = useState(userEmail)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (isOwnAccount) return null

  function openModal() {
    setOpen(true)
    setTab("edit")
    setError(null)
    setSuccess(null)
    setName(userName)
    setEmail(userEmail)
    setNewPassword("")
    setConfirmPassword("")
  }

  function switchTab(t: "edit" | "password") {
    setTab(t)
    setError(null)
    setSuccess(null)
  }

  async function handleSaveEdit() {
    setError(null)
    setSuccess(null)
    if (!name.trim()) {
      setError("O nome não pode estar vazio.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Email inválido.")
      return
    }
    setLoading(true)
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim() }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? "Erro ao salvar.")
      return
    }
    setSuccess("Dados atualizados com sucesso.")
    router.refresh()
  }

  async function handleResetPassword() {
    setError(null)
    setSuccess(null)
    if (newPassword.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.")
      return
    }
    setLoading(true)
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: newPassword }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? "Erro ao redefinir senha.")
      return
    }
    setSuccess("Senha redefinida com sucesso.")
    setNewPassword("")
    setConfirmPassword("")
  }

  return (
    <>
      <button
        onClick={openModal}
        className="mr-2 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/20"
      >
        Editar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Editar usuário</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:text-stone-500 dark:hover:text-stone-300"
              >
                ✕
              </button>
            </div>

            <div className="mb-5 flex gap-4 border-b border-gray-200 dark:border-stone-800">
              <button
                onClick={() => switchTab("edit")}
                className={`pb-2 text-sm font-medium transition-colors ${
                  tab === "edit"
                    ? "border-b-2 border-orange-500 text-orange-600 dark:text-orange-300"
                    : "text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
                }`}
              >
                Dados
              </button>
              <button
                onClick={() => switchTab("password")}
                className={`pb-2 text-sm font-medium transition-colors ${
                  tab === "password"
                    ? "border-b-2 border-orange-500 text-orange-600 dark:text-orange-300"
                    : "text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
                }`}
              >
                Redefinir senha
              </button>
            </div>

            {tab === "edit" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300">
                    Nome
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                  />
                </div>
              </div>
            )}

            {tab === "password" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300">
                    Nova senha
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300">
                    Confirmar senha
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>
            )}
            {success && (
              <p className="mt-3 text-sm text-green-600 dark:text-green-300">{success}</p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Fechar
              </button>
              <button
                onClick={tab === "edit" ? handleSaveEdit : handleResetPassword}
                disabled={loading}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {loading
                  ? "Salvando..."
                  : tab === "edit"
                    ? "Salvar"
                    : "Redefinir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
