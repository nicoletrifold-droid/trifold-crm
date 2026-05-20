"use client"

import { useState } from "react"
import type { OrgRole, PermissionsMatrix } from "@web/lib/permissions"
import { deleteRole, updatePermission } from "./actions"

// ============================================================================
// Labels e helpers visuais
// ============================================================================

/**
 * Mapa de labels em português dos módulos do sistema (Story 35-3 AC 12).
 */
const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  pipeline: "Pipeline",
  leads: "Leads",
  imoveis: "Imóveis",
  corretores: "Corretores",
  conversas: "Conversas",
  agenda: "Agenda",
  alertas: "Alertas",
  atividades: "Atividades",
  analytics: "Analytics",
  campanhas: "Campanhas",
  treinamento: "Treinamento",
  obras: "Obras",
  brindes: "Brindes",
  mensagens: "Mensagens",
  configuracoes: "Configurações",
  sistema: "Sistema",
}

const ROLE_BADGE_NEUTRAL =
  "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"

/**
 * Mapa de cores dos roles de sistema (espelha `usuarios/page.tsx`).
 * Para roles customizados, usa `OrgRole.color` como chave; fallback neutro.
 */
const ROLE_BADGE_BY_NAME: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  supervisor: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  broker: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  obras: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
}

const ROLE_BADGE_BY_COLOR: Record<string, string> = {
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  green: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
  gray: ROLE_BADGE_NEUTRAL,
  stone: ROLE_BADGE_NEUTRAL,
}

function getRoleBadgeClass(role: OrgRole): string {
  return (
    ROLE_BADGE_BY_NAME[role.name] ??
    ROLE_BADGE_BY_COLOR[role.color] ??
    ROLE_BADGE_NEUTRAL
  )
}

function cellKey(roleId: string, module: string): string {
  return `${roleId}:${module}`
}

// ============================================================================
// Skeleton — exibido enquanto os dados carregam no Server Component
// ============================================================================

export function PermissionsMatrixSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-9 w-64 rounded-md bg-gray-200 dark:bg-stone-800" />
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-stone-800">
        <div className="grid grid-cols-5 gap-2 bg-gray-50 px-4 py-3 dark:bg-stone-800/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-4 rounded bg-gray-200 dark:bg-stone-700"
            />
          ))}
        </div>
        {Array.from({ length: 17 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-2 border-t border-gray-100 px-4 py-3 dark:border-stone-800"
          >
            {Array.from({ length: 5 }).map((_, j) => (
              <div
                key={j}
                className="h-4 rounded bg-gray-100 dark:bg-stone-800"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Toggle Switch — componente interno reutilizável
// ============================================================================

interface PermissionToggleProps {
  roleId: string
  module: string
  roleLabel: string
  moduleLabel: string
  checked: boolean
  loading: boolean
  onToggle: (roleId: string, module: string, next: boolean) => void
}

function PermissionToggle({
  roleId,
  module,
  roleLabel,
  moduleLabel,
  checked,
  loading,
  onToggle,
}: PermissionToggleProps) {
  return (
    <label className="relative inline-flex cursor-pointer items-center align-middle">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={loading}
        onChange={(e) => onToggle(roleId, module, e.target.checked)}
        aria-label={`${moduleLabel} — ${roleLabel}`}
      />
      <div
        aria-hidden="true"
        className="peer h-5 w-9 rounded-full bg-gray-200 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-orange-500 peer-checked:after:translate-x-full peer-disabled:opacity-40 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400 dark:bg-stone-700 dark:after:bg-stone-200"
      />
      {loading && (
        <span
          aria-hidden="true"
          className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-orange-500 border-t-transparent"
        />
      )}
    </label>
  )
}

// ============================================================================
// PermissionsMatrix — Client Component principal
// ============================================================================

interface PermissionsMatrixProps {
  roles: OrgRole[]
  matrix: PermissionsMatrix
  modules: readonly string[]
}

/**
 * Cria uma cópia profunda (dois níveis) da matriz, para servir como estado
 * mutável otimista sem mutar a prop original.
 */
function cloneMatrix(matrix: PermissionsMatrix): PermissionsMatrix {
  const out: PermissionsMatrix = {}
  for (const [roleId, perms] of Object.entries(matrix)) {
    out[roleId] = { ...perms }
  }
  return out
}

export function PermissionsMatrix({
  roles: initialRoles,
  matrix,
  modules,
}: PermissionsMatrixProps) {
  // Story 35-4: roles é estado local para permitir exclusão otimista de colunas
  const [roles, setRoles] = useState<OrgRole[]>(() => [...initialRoles])
  const [optimisticMatrix, setOptimisticMatrix] = useState<PermissionsMatrix>(
    () => cloneMatrix(matrix)
  )
  const [loadingCells, setLoadingCells] = useState<Set<string>>(() => new Set())
  const [search, setSearch] = useState("")
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null)

  const filteredModules = modules.filter((m) => {
    const label = MODULE_LABELS[m] ?? m
    return label.toLowerCase().includes(search.trim().toLowerCase())
  })

  function setCellLoading(key: string, loading: boolean) {
    setLoadingCells((prev) => {
      const next = new Set(prev)
      if (loading) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  async function handleToggle(
    roleId: string,
    module: string,
    newValue: boolean
  ) {
    const key = cellKey(roleId, module)
    if (loadingCells.has(key)) return

    const previous = optimisticMatrix[roleId]?.[module] ?? false

    // 1. Marca célula como loading
    setCellLoading(key, true)

    // 2. Optimistic update
    setOptimisticMatrix((prev) => ({
      ...prev,
      [roleId]: { ...(prev[roleId] ?? {}), [module]: newValue },
    }))

    // 3. Invoca Server Action
    try {
      const result = await updatePermission(roleId, module, newValue)

      if (!result.success) {
        // Rollback otimista
        setOptimisticMatrix((prev) => ({
          ...prev,
          [roleId]: { ...(prev[roleId] ?? {}), [module]: previous },
        }))
        if (typeof window !== "undefined") {
          window.alert(
            `Falha ao salvar permissão: ${result.error ?? "erro desconhecido"}`
          )
        }
      }
      // Sucesso: a Server Action já invalidou o cache via revalidateTag.
      // O estado otimista já reflete o valor salvo, então não há nada a fazer.
    } catch (err) {
      // Erro de rede / exceção inesperada
      setOptimisticMatrix((prev) => ({
        ...prev,
        [roleId]: { ...(prev[roleId] ?? {}), [module]: previous },
      }))
      if (typeof window !== "undefined") {
        const message =
          err instanceof Error ? err.message : "erro desconhecido"
        window.alert(`Falha ao salvar permissão: ${message}`)
      }
    } finally {
      setCellLoading(key, false)
    }
  }

  async function handleDeleteRole(role: OrgRole) {
    if (role.is_system) return
    if (deletingRoleId) return

    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Excluir o perfil '${role.label}'? Esta ação não pode ser desfeita.`
      )
      if (!ok) return
    }

    // Snapshot para rollback em caso de erro
    const previousRoles = roles
    const previousMatrix = optimisticMatrix

    setDeletingRoleId(role.id)

    // Optimistic: remover a coluna imediatamente do estado local
    setRoles((prev) => prev.filter((r) => r.id !== role.id))
    setOptimisticMatrix((prev) => {
      const next = { ...prev }
      delete next[role.id]
      return next
    })

    try {
      const result = await deleteRole(role.id)
      if (!result.success) {
        // Rollback
        setRoles(previousRoles)
        setOptimisticMatrix(previousMatrix)
        if (typeof window !== "undefined") {
          window.alert(
            `Falha ao excluir perfil: ${result.error ?? "erro desconhecido"}`
          )
        }
      }
      // Sucesso: estado local já reflete a exclusão; cache já foi invalidado
      // server-side via revalidateOrgPermissions.
    } catch (err) {
      // Rollback em caso de exceção inesperada
      setRoles(previousRoles)
      setOptimisticMatrix(previousMatrix)
      if (typeof window !== "undefined") {
        const message =
          err instanceof Error ? err.message : "erro desconhecido"
        window.alert(`Falha ao excluir perfil: ${message}`)
      }
    } finally {
      setDeletingRoleId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Campo de busca */}
      <div>
        <label htmlFor="permissions-search" className="sr-only">
          Buscar módulo
        </label>
        <input
          id="permissions-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar módulo..."
          className="w-full max-w-xs rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder-stone-500"
        />
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th scope="col" className="px-6 py-3">
                Módulo
              </th>
              {roles.map((role) => (
                <th key={role.id} scope="col" className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getRoleBadgeClass(
                        role
                      )}`}
                    >
                      {role.label}
                    </span>
                    {!role.is_system && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(role)}
                        disabled={deletingRoleId === role.id}
                        aria-label={`Excluir perfil ${role.label}`}
                        title={`Excluir perfil ${role.label}`}
                        className="ml-1 text-gray-400 transition-colors hover:text-red-500 disabled:opacity-50 dark:text-stone-500 dark:hover:text-red-400"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.8}
                          stroke="currentColor"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {filteredModules.map((module) => {
              const moduleLabel = MODULE_LABELS[module] ?? module
              return (
                <tr
                  key={module}
                  className="hover:bg-gray-50 dark:hover:bg-stone-800/30"
                >
                  <td className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-stone-100">
                    {moduleLabel}
                  </td>
                  {roles.map((role) => {
                    const key = cellKey(role.id, module)
                    const checked =
                      optimisticMatrix[role.id]?.[module] ?? false
                    const loading = loadingCells.has(key)
                    return (
                      <td key={role.id} className="px-6 py-3">
                        <PermissionToggle
                          roleId={role.id}
                          module={module}
                          roleLabel={role.label}
                          moduleLabel={moduleLabel}
                          checked={checked}
                          loading={loading}
                          onToggle={handleToggle}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {filteredModules.length === 0 && (
              <tr>
                <td
                  colSpan={roles.length + 1}
                  className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  Nenhum módulo encontrado para &quot;{search}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
