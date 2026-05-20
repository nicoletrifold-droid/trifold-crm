"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ALL_MODULES, MODULE_LABELS, SUBMODULE_MAP } from "@web/lib/permissions-modules"
import { getUserExceptions, getUserPermissions, setUserException, removeUserException } from "@web/lib/permissions-exceptions-actions"

type Exception = { module: string; can_access: boolean }

export function UserEditModal({
  userId,
  userName,
  userEmail,
  isOwnAccount,
  orgId,
}: {
  userId: string
  userName: string
  userEmail: string
  isOwnAccount: boolean
  orgId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"edit" | "password" | "exceptions">("edit")
  const [name, setName] = useState(userName)
  const [email, setEmail] = useState(userEmail)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Estado da aba exceções
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [basePerms, setBasePerms] = useState<Record<string, boolean>>({})
  const [exceptionsLoading, setExceptionsLoading] = useState(false)
  // Quais módulos pai estão expandidos (mostrando seus sub-módulos)
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  function toggleExpanded(mod: string) {
    setExpandedModules((prev) => {
      if (prev.has(mod)) {
        const next = new Set(prev)
        next.delete(mod)
        return next
      }
      return new Set([...prev, mod])
    })
  }

  const fetchExceptions = useCallback(async () => {
    setExceptionsLoading(true)
    try {
      const [excs, perms] = await Promise.all([
        getUserExceptions(userId),
        getUserPermissions(userId, orgId),
      ])
      setExceptions(excs)
      setBasePerms(perms)
    } finally {
      setExceptionsLoading(false)
    }
  }, [userId, orgId])

  useEffect(() => {
    if (tab !== "exceptions" || !open) return
    fetchExceptions()
  }, [tab, open, fetchExceptions])

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

  function switchTab(t: "edit" | "password" | "exceptions") {
    setTab(t)
    setError(null)
    setSuccess(null)
  }

  async function handleSetException(module: string, canAccess: boolean) {
    const prev = [...exceptions]
    // Update otimista
    setExceptions((cur) => {
      const filtered = cur.filter((e) => e.module !== module)
      return [...filtered, { module, can_access: canAccess }]
    })
    const res = await setUserException(userId, module, canAccess)
    if (!res.success) {
      setExceptions(prev)
      setError(res.error ?? "Erro ao salvar exceção.")
    }
  }

  async function handleRemoveException(module: string) {
    const prev = [...exceptions]
    // Update otimista
    setExceptions((cur) => cur.filter((e) => e.module !== module))
    const res = await removeUserException(userId, module)
    if (!res.success) {
      setExceptions(prev)
      setError(res.error ?? "Erro ao remover exceção.")
    }
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

  function getException(module: string): Exception | undefined {
    return exceptions.find((e) => e.module === module)
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
          <div className={`w-full rounded-xl bg-white p-6 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800 ${tab === "exceptions" ? "max-w-2xl" : "max-w-md"}`}>
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
              <button
                onClick={() => switchTab("exceptions")}
                className={`pb-2 text-sm font-medium transition-colors ${
                  tab === "exceptions"
                    ? "border-b-2 border-orange-500 text-orange-600 dark:text-orange-300"
                    : "text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
                }`}
              >
                Exceções
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

            {tab === "exceptions" && (
              <div>
                <p className="mb-3 text-xs text-gray-500 dark:text-stone-400">
                  Exceções individuais sobrescrevem o perfil base deste usuário.
                </p>
                {exceptionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                  </div>
                ) : (
                  <div className="max-h-[380px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white dark:bg-stone-900">
                        <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-stone-500">
                          <th className="pb-2 pr-4">Módulo</th>
                          <th className="pb-2 pr-4">Perfil base</th>
                          <th className="pb-2 pr-4">Exceção</th>
                          <th className="pb-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
                        {ALL_MODULES.flatMap((mod) => {
                          const exc = getException(mod)
                          const base = basePerms[mod] ?? false
                          const submodules = SUBMODULE_MAP[mod]
                          const hasSubmodules = submodules !== undefined
                          const isExpanded = expandedModules.has(mod)

                          const rows = [
                            <tr key={mod} className="text-xs">
                              <td className="py-2 pr-4 font-medium text-gray-700 dark:text-stone-300">
                                <div className="flex items-center gap-1">
                                  {hasSubmodules ? (
                                    <button
                                      onClick={() => toggleExpanded(mod)}
                                      className="inline-flex h-4 w-4 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                                      title={isExpanded ? "Recolher sub-módulos" : "Expandir sub-módulos"}
                                      aria-label={isExpanded ? "Recolher sub-módulos" : "Expandir sub-módulos"}
                                      aria-expanded={isExpanded}
                                    >
                                      <span
                                        className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                      >
                                        ▶
                                      </span>
                                    </button>
                                  ) : (
                                    <span className="inline-block w-4" aria-hidden="true" />
                                  )}
                                  <span>{MODULE_LABELS[mod] ?? mod}</span>
                                </div>
                              </td>
                              <td className="py-2 pr-4 text-gray-400 dark:text-stone-500">
                                {base ? "✓ Acesso" : "✗ Sem acesso"}
                              </td>
                              <td className="py-2 pr-4">
                                {exc ? (
                                  exc.can_access ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                                      + Acesso forçado
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                                      − Acesso bloqueado
                                    </span>
                                  )
                                ) : (
                                  <span className="text-gray-400 dark:text-stone-500">Herdado do perfil</span>
                                )}
                              </td>
                              <td className="py-2">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleSetException(mod, true)}
                                    disabled={exc?.can_access === true}
                                    className="rounded px-1.5 py-0.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-green-400 dark:hover:bg-green-500/10"
                                    title="Forçar acesso"
                                  >
                                    + Forçar
                                  </button>
                                  <button
                                    onClick={() => handleSetException(mod, false)}
                                    disabled={exc?.can_access === false}
                                    className="rounded px-1.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/10"
                                    title="Bloquear acesso"
                                  >
                                    − Bloquear
                                  </button>
                                  {exc && (
                                    <button
                                      onClick={() => handleRemoveException(mod)}
                                      className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                                      title="Remover exceção"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>,
                          ]

                          if (hasSubmodules && isExpanded) {
                            for (const [subKey, subLabel] of Object.entries(submodules)) {
                              const subExc = getException(subKey)
                              // Herdado do módulo pai quando não há exceção explícita no sub-módulo.
                              const subInheritedBase = base
                              rows.push(
                                <tr key={subKey} className="bg-gray-50/40 text-xs dark:bg-stone-800/30">
                                  <td className="py-2 pr-4 pl-8 text-gray-600 dark:text-stone-400">
                                    <span className="mr-1 text-gray-400 dark:text-stone-500">↳</span>
                                    {subLabel}
                                  </td>
                                  <td className="py-2 pr-4 text-gray-400 dark:text-stone-500">
                                    {subInheritedBase ? "✓ Acesso" : "✗ Sem acesso"}
                                  </td>
                                  <td className="py-2 pr-4">
                                    {subExc ? (
                                      subExc.can_access ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                                          + Acesso forçado
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                                          − Acesso bloqueado
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-gray-400 dark:text-stone-500">↳ Herdado do módulo</span>
                                    )}
                                  </td>
                                  <td className="py-2">
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => handleSetException(subKey, true)}
                                        disabled={subExc?.can_access === true}
                                        className="rounded px-1.5 py-0.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-green-400 dark:hover:bg-green-500/10"
                                        title="Forçar acesso"
                                      >
                                        + Forçar
                                      </button>
                                      <button
                                        onClick={() => handleSetException(subKey, false)}
                                        disabled={subExc?.can_access === false}
                                        className="rounded px-1.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/10"
                                        title="Bloquear acesso"
                                      >
                                        − Bloquear
                                      </button>
                                      {subExc && (
                                        <button
                                          onClick={() => handleRemoveException(subKey)}
                                          className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                                          title="Remover exceção"
                                        >
                                          ×
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            }
                          }

                          return rows
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>
            )}
            {success && (
              <p className="mt-3 text-sm text-green-600 dark:text-green-300">{success}</p>
            )}

            {tab !== "exceptions" && (
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
            )}

            {tab === "exceptions" && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
