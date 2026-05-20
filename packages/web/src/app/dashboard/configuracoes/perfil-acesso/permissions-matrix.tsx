"use client"

import { useState } from "react"
import {
  LayoutDashboard,
  Kanban,
  Users,
  Building2,
  UserCheck,
  MessageSquare,
  CalendarDays,
  Bell,
  Activity,
  BarChart3,
  Megaphone,
  GraduationCap,
  HardHat,
  Gift,
  Inbox,
  Settings,
  Shield,
  Search,
  Trash2,
  Check,
  Loader2,
  CircleDot,
} from "lucide-react"
import type { OrgRole, PermissionsMatrix } from "@web/lib/permissions"
import { MODULE_LABELS, MODULE_DESCRIPTIONS } from "@web/lib/permissions-modules"
import { deleteRole, updatePermission } from "./actions"

/**
 * Mapeamento de ícone lucide-react para cada módulo. Espelha o sidebar.
 */
const MODULE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  dashboard: LayoutDashboard,
  pipeline: Kanban,
  leads: Users,
  imoveis: Building2,
  corretores: UserCheck,
  conversas: MessageSquare,
  agenda: CalendarDays,
  alertas: Bell,
  atividades: Activity,
  analytics: BarChart3,
  campanhas: Megaphone,
  treinamento: GraduationCap,
  obras: HardHat,
  brindes: Gift,
  mensagens: Inbox,
  configuracoes: Settings,
  sistema: Shield,
}

/**
 * Paleta refinada por role — usada nos chips do cabeçalho da tabela e em
 * efeitos visuais (anel quando a coluna está ativa).
 *
 * IMPORTANTE: `toggleOnHex` e `toggleFocusHex` são valores CSS resolvidos em
 * runtime via `style={{ ... }}` para evitar concatenação dinâmica de classes
 * Tailwind (que o JIT não consegue detectar em tempo de build).
 */
interface RolePalette {
  chip: string
  iconBg: string
  iconText: string
  /** Cor sólida do trilho do toggle quando ON. */
  toggleOnHex: string
  /** Cor do anel de focus visível. */
  toggleFocusHex: string
}

const ROLE_NEUTRAL: RolePalette = {
  chip: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-700",
  iconBg: "bg-gray-100 dark:bg-stone-800",
  iconText: "text-gray-600 dark:text-stone-300",
  toggleOnHex: "#6b7280", // gray-500
  toggleFocusHex: "#9ca3af", // gray-400
}

const ROLE_PALETTE_PURPLE: RolePalette = {
  chip: "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/20",
  iconBg: "bg-purple-100 dark:bg-purple-500/15",
  iconText: "text-purple-600 dark:text-purple-300",
  toggleOnHex: "#a855f7", // purple-500
  toggleFocusHex: "#c084fc", // purple-400
}

const ROLE_PALETTE_BLUE: RolePalette = {
  chip: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20",
  iconBg: "bg-blue-100 dark:bg-blue-500/15",
  iconText: "text-blue-600 dark:text-blue-300",
  toggleOnHex: "#3b82f6", // blue-500
  toggleFocusHex: "#60a5fa", // blue-400
}

const ROLE_PALETTE_EMERALD: RolePalette = {
  chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
  iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
  iconText: "text-emerald-600 dark:text-emerald-300",
  toggleOnHex: "#10b981", // emerald-500
  toggleFocusHex: "#34d399", // emerald-400
}

const ROLE_PALETTE_AMBER: RolePalette = {
  chip: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
  iconBg: "bg-amber-100 dark:bg-amber-500/15",
  iconText: "text-amber-600 dark:text-amber-300",
  toggleOnHex: "#f59e0b", // amber-500
  toggleFocusHex: "#fbbf24", // amber-400
}

const ROLE_PALETTE_ORANGE: RolePalette = {
  chip: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20",
  iconBg: "bg-orange-100 dark:bg-orange-500/15",
  iconText: "text-orange-600 dark:text-orange-300",
  toggleOnHex: "#f97316", // orange-500
  toggleFocusHex: "#fb923c", // orange-400
}

const ROLE_PALETTE_RED: RolePalette = {
  chip: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20",
  iconBg: "bg-red-100 dark:bg-red-500/15",
  iconText: "text-red-600 dark:text-red-300",
  toggleOnHex: "#ef4444", // red-500
  toggleFocusHex: "#f87171", // red-400
}

const ROLE_PALETTE_PINK: RolePalette = {
  chip: "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-500/10 dark:text-pink-300 dark:ring-pink-500/20",
  iconBg: "bg-pink-100 dark:bg-pink-500/15",
  iconText: "text-pink-600 dark:text-pink-300",
  toggleOnHex: "#ec4899", // pink-500
  toggleFocusHex: "#f472b6", // pink-400
}

const ROLE_PALETTES_BY_NAME: Record<string, RolePalette> = {
  admin: ROLE_PALETTE_PURPLE,
  supervisor: ROLE_PALETTE_BLUE,
  broker: ROLE_PALETTE_EMERALD,
  obras: ROLE_PALETTE_AMBER,
}

const ROLE_PALETTES_BY_COLOR: Record<string, RolePalette> = {
  purple: ROLE_PALETTE_PURPLE,
  blue: ROLE_PALETTE_BLUE,
  green: ROLE_PALETTE_EMERALD,
  emerald: ROLE_PALETTE_EMERALD,
  yellow: ROLE_PALETTE_AMBER,
  amber: ROLE_PALETTE_AMBER,
  red: ROLE_PALETTE_RED,
  orange: ROLE_PALETTE_ORANGE,
  pink: ROLE_PALETTE_PINK,
  gray: ROLE_NEUTRAL,
  stone: ROLE_NEUTRAL,
}

function getRolePalette(role: OrgRole): RolePalette {
  return (
    ROLE_PALETTES_BY_NAME[role.name] ??
    ROLE_PALETTES_BY_COLOR[role.color] ??
    ROLE_NEUTRAL
  )
}

function getRoleInitial(role: OrgRole): string {
  return (
    role.label?.charAt(0).toUpperCase() ?? role.name.charAt(0).toUpperCase()
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
      <div className="flex items-center justify-between">
        <div className="h-10 w-72 rounded-lg bg-gray-200 dark:bg-stone-800" />
        <div className="h-6 w-24 rounded-full bg-gray-200 dark:bg-stone-800" />
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="grid grid-cols-5 gap-2 border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-stone-800 dark:bg-stone-800/40">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-6 rounded-full bg-gray-200 dark:bg-stone-700"
            />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-5 items-center gap-2 border-t border-gray-100 px-6 py-4 dark:border-stone-800"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-stone-800" />
              <div className="space-y-1.5">
                <div className="h-3 w-24 rounded bg-gray-200 dark:bg-stone-700" />
                <div className="h-2 w-32 rounded bg-gray-100 dark:bg-stone-800" />
              </div>
            </div>
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={j}
                className="h-5 w-9 rounded-full bg-gray-100 dark:bg-stone-800"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Toggle Switch — pill switch elegante com check icon quando ativo
// ============================================================================

interface PermissionToggleProps {
  roleId: string
  module: string
  roleLabel: string
  moduleLabel: string
  checked: boolean
  loading: boolean
  onColorHex: string
  focusColorHex: string
  onToggle: (roleId: string, module: string, next: boolean) => void
}

function PermissionToggle({
  roleId,
  module,
  roleLabel,
  moduleLabel,
  checked,
  loading,
  onColorHex,
  focusColorHex,
  onToggle,
}: PermissionToggleProps) {
  // Aplicamos a cor "on" via style inline para evitar concatenação dinâmica
  // de classes Tailwind. O trilho OFF usa cores Tailwind padrão.
  const trackStyle: React.CSSProperties = checked
    ? { backgroundColor: onColorHex }
    : {}

  return (
    <label
      className="relative inline-flex cursor-pointer items-center align-middle"
      style={
        {
          // CSS custom property usada pelo focus ring abaixo
          "--toggle-focus-color": focusColorHex,
        } as React.CSSProperties
      }
    >
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
        style={trackStyle}
        className={[
          // base
          "relative h-5 w-9 rounded-full transition-all duration-200 ease-out",
          // trilho OFF (sobrescrito por inline-style quando checked)
          "bg-gray-200 dark:bg-stone-700",
          // sombra suave quando ON
          checked ? "shadow-sm" : "",
          // bolinha (pseudo)
          "after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-out after:content-['']",
          // bolinha ON — desliza para a direita
          "peer-checked:after:translate-x-4",
          // disabled
          "peer-disabled:opacity-50",
          // focus ring (cor via CSS custom property + ring-color arbitrário)
          "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:[--tw-ring-color:var(--toggle-focus-color)] dark:peer-focus-visible:ring-offset-stone-900",
          // loading: dim
          loading ? "opacity-60" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      {/* Check icon dentro da bolinha quando ON */}
      {checked && !loading && (
        <Check
          className="pointer-events-none absolute left-[18px] top-[3px] h-3.5 w-3.5 text-white drop-shadow-sm"
          strokeWidth={3}
          aria-hidden="true"
        />
      )}
      {/* Loading spinner sobreposto */}
      {loading && (
        <Loader2
          className="pointer-events-none absolute left-[10px] top-[2px] h-4 w-4 animate-spin text-orange-500"
          aria-hidden="true"
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
    const desc = MODULE_DESCRIPTIONS[m] ?? ""
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      label.toLowerCase().includes(q) ||
      desc.toLowerCase().includes(q) ||
      m.toLowerCase().includes(q)
    )
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
    if (deletingRoleId) return

    if (typeof window !== "undefined") {
      const msg = role.is_system
        ? `'${role.label}' é um perfil do sistema. Excluí-lo removerá as permissões de todos os usuários com este perfil. Continuar?`
        : `Excluir o perfil '${role.label}'? Esta ação não pode ser desfeita.`
      const ok = window.confirm(msg)
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

  // Conta quantos módulos estão habilitados por role (para subtítulo dos chips)
  const roleEnabledCount = (roleId: string): number => {
    const perms = optimisticMatrix[roleId] ?? {}
    let c = 0
    for (const m of modules) if (perms[m]) c++
    return c
  }

  return (
    <div className="space-y-4">
      {/* Barra de controles — busca e contador de resultados */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <label htmlFor="permissions-search" className="sr-only">
            Buscar módulo
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-stone-500"
            aria-hidden="true"
          />
          <input
            id="permissions-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar módulo..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:border-orange-400 dark:focus:ring-orange-400/20"
          />
        </div>
        {search.trim() && (
          <span className="text-xs text-gray-500 dark:text-stone-400">
            {filteredModules.length} de {modules.length} módulos
          </span>
        )}
      </div>

      {/* Card principal com a matriz */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="max-h-[600px] overflow-auto">
          <table className="min-w-full">
            {/* Cabeçalho com chips de role estilizados — sticky para rolar com a tabela */}
            <thead className="sticky top-0 z-20 border-b border-gray-200 bg-gradient-to-b from-gray-50/80 to-white dark:border-stone-800 dark:from-stone-800/30 dark:to-stone-900">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-gradient-to-b from-gray-50/80 to-white px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:from-stone-800/30 dark:to-stone-900 dark:text-stone-400"
                >
                  Módulo
                </th>
                {roles.map((role) => {
                  const palette = getRolePalette(role)
                  const enabled = roleEnabledCount(role.id)
                  const initial = getRoleInitial(role)
                  return (
                    <th
                      key={role.id}
                      scope="col"
                      className="px-4 py-4 text-left align-top"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold ${palette.iconBg} ${palette.iconText}`}
                            aria-hidden="true"
                          >
                            {initial}
                          </span>
                          <div className="min-w-0">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${palette.chip}`}
                            >
                              {role.label}
                            </span>
                            <div className="mt-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-stone-500">
                              <CircleDot
                                className="h-2.5 w-2.5"
                                aria-hidden="true"
                              />
                              {enabled}/{modules.length} ativos
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteRole(role)}
                          disabled={deletingRoleId === role.id}
                          aria-label={`Excluir perfil ${role.label}`}
                          title={`Excluir perfil ${role.label}`}
                          className={`rounded-md p-1 transition-colors hover:bg-red-50 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400/40 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400 ${role.is_system ? "text-gray-300 dark:text-stone-700" : "text-gray-400 dark:text-stone-500"}`}
                        >
                          {deletingRoleId === role.id ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            {/* Corpo da tabela — linhas com ícone, label e descrição */}
            <tbody className="divide-y divide-gray-100 dark:divide-stone-800/70">
              {filteredModules.map((module) => {
                const moduleLabel = MODULE_LABELS[module] ?? module
                const moduleDesc = MODULE_DESCRIPTIONS[module] ?? ""
                const IconComponent = MODULE_ICONS[module] ?? Shield
                return (
                  <tr
                    key={module}
                    className="group transition-colors hover:bg-gray-50/70 dark:hover:bg-stone-800/30"
                  >
                    {/* Coluna do módulo: ícone + label + descrição */}
                    <td className="sticky left-0 z-10 bg-white px-6 py-3.5 transition-colors group-hover:bg-gray-50/70 dark:bg-stone-900 dark:group-hover:bg-stone-800/40">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-colors group-hover:bg-orange-100 group-hover:text-orange-600 dark:bg-stone-800 dark:text-stone-300 dark:group-hover:bg-orange-500/15 dark:group-hover:text-orange-300"
                          aria-hidden="true"
                        >
                          <IconComponent className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 dark:text-stone-100">
                            {moduleLabel}
                          </div>
                          {moduleDesc && (
                            <div className="text-xs text-gray-500 dark:text-stone-400">
                              {moduleDesc}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Toggles por role */}
                    {roles.map((role) => {
                      const palette = getRolePalette(role)
                      const key = cellKey(role.id, module)
                      const checked =
                        optimisticMatrix[role.id]?.[module] ?? false
                      const loading = loadingCells.has(key)
                      return (
                        <td key={role.id} className="px-4 py-3.5 align-middle">
                          <PermissionToggle
                            roleId={role.id}
                            module={module}
                            roleLabel={role.label}
                            moduleLabel={moduleLabel}
                            checked={checked}
                            loading={loading}
                            onColorHex={palette.toggleOnHex}
                            focusColorHex={palette.toggleFocusHex}
                            onToggle={handleToggle}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* Empty state — quando a busca não retorna nada */}
              {filteredModules.length === 0 && (
                <tr>
                  <td
                    colSpan={roles.length + 1}
                    className="px-6 py-12 text-center"
                  >
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-stone-800">
                        <Search
                          className="h-5 w-5 text-gray-400 dark:text-stone-500"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="text-sm font-medium text-gray-700 dark:text-stone-200">
                        Nenhum módulo encontrado
                      </p>
                      <p className="text-xs text-gray-500 dark:text-stone-400">
                        Não encontramos resultados para &quot;{search}&quot;.
                        Tente buscar por outro termo.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
