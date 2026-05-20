"use client"

import { useEffect, useState } from "react"
import { X, Check, Loader2, Sparkles } from "lucide-react"
import { createRole } from "./actions"

// ============================================================================
// Cores fixas para perfis customizados (Story 35-4 AC 5)
// ============================================================================

const ROLE_COLORS = [
  {
    value: "purple",
    label: "Roxo",
    bg: "bg-purple-500",
    ring: "ring-purple-400/40",
    shadow: "shadow-purple-500/30",
  },
  {
    value: "blue",
    label: "Azul",
    bg: "bg-blue-500",
    ring: "ring-blue-400/40",
    shadow: "shadow-blue-500/30",
  },
  {
    value: "green",
    label: "Verde",
    bg: "bg-emerald-500",
    ring: "ring-emerald-400/40",
    shadow: "shadow-emerald-500/30",
  },
  {
    value: "yellow",
    label: "Amarelo",
    bg: "bg-amber-400",
    ring: "ring-amber-400/40",
    shadow: "shadow-amber-500/30",
  },
  {
    value: "orange",
    label: "Laranja",
    bg: "bg-orange-500",
    ring: "ring-orange-400/40",
    shadow: "shadow-orange-500/30",
  },
  {
    value: "gray",
    label: "Cinza",
    bg: "bg-gray-400",
    ring: "ring-gray-400/40",
    shadow: "shadow-gray-500/20",
  },
] as const

type RoleColor = (typeof ROLE_COLORS)[number]["value"]

const NAME_REGEX = /^[a-z0-9-]+$/

interface CreateRoleModalProps {
  orgId: string
  isOpen: boolean
  onClose: () => void
}

export function CreateRoleModal({
  orgId,
  isOpen,
  onClose,
}: CreateRoleModalProps) {
  const [name, setName] = useState("")
  const [label, setLabel] = useState("")
  const [selectedColor, setSelectedColor] = useState<RoleColor>("blue")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [labelError, setLabelError] = useState<string | null>(null)

  // Fecha com ESC e bloqueia scroll do body enquanto aberto
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        handleClose()
      }
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isSubmitting])

  function resetForm() {
    setName("")
    setLabel("")
    setSelectedColor("blue")
    setNameError(null)
    setLabelError(null)
    setIsSubmitting(false)
  }

  function handleClose() {
    if (isSubmitting) return
    resetForm()
    onClose()
  }

  function validateName(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed) return "Informe o nome interno."
    if (!NAME_REGEX.test(trimmed)) {
      return "Use apenas letras minúsculas, números e hífens (sem espaços)."
    }
    return null
  }

  function handleNameBlur() {
    setNameError(validateName(name))
  }

  function handleLabelBlur() {
    setLabelError(label.trim() ? null : "Informe o label do perfil.")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSubmitting) return

    const nameValidation = validateName(name)
    const labelValidation = label.trim() ? null : "Informe o label do perfil."

    setNameError(nameValidation)
    setLabelError(labelValidation)

    if (nameValidation || labelValidation) {
      return
    }

    setIsSubmitting(true)
    try {
      const result = await createRole(orgId, {
        name: name.trim(),
        label: label.trim(),
        color: selectedColor,
      })

      if (result.success) {
        resetForm()
        onClose()
        return
      }

      // Erro de constraint UNIQUE → mensagem inline no campo nome
      if (result.error === "Este nome de perfil já está em uso.") {
        setNameError(result.error)
        return
      }

      // Outros erros → alert
      if (typeof window !== "undefined") {
        window.alert(
          `Falha ao criar perfil: ${result.error ?? "erro desconhecido"}`
        )
      }
    } catch (err) {
      if (typeof window !== "undefined") {
        const message =
          err instanceof Error ? err.message : "erro desconhecido"
        window.alert(`Falha ao criar perfil: ${message}`)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  // Preview do label com a cor selecionada
  const selectedColorData =
    ROLE_COLORS.find((c) => c.value === selectedColor) ?? ROLE_COLORS[1]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-role-modal-title"
    >
      {/* Backdrop com blur e fade-in */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar"
        onClick={handleClose}
        className="modal-backdrop-in absolute inset-0 cursor-default bg-gray-900/60 backdrop-blur-sm dark:bg-black/70"
      />

      {/* Card do modal — animação slide-up + fade */}
      <div className="modal-dialog-in relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200 dark:bg-stone-900 dark:ring-stone-800">
        {/* Faixa decorativa superior — gradiente laranja sutil */}
        <div
          aria-hidden="true"
          className="h-1 w-full bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600"
        />

        <div className="p-6">
          {/* Header do modal */}
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:ring-orange-500/20">
                <Sparkles
                  className="h-5 w-5 text-orange-600 dark:text-orange-400"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2
                  id="create-role-modal-title"
                  className="text-lg font-semibold text-gray-900 dark:text-stone-100"
                >
                  Novo Perfil
                </h2>
                <p className="text-xs text-gray-500 dark:text-stone-400">
                  Crie um perfil customizado para sua equipe
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Label (visível) — fica em cima por ser o que o usuário enxerga */}
            <div>
              <label
                htmlFor="role-label"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-stone-300"
              >
                Nome do perfil
              </label>
              <input
                id="role-label"
                type="text"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value)
                  if (labelError) setLabelError(null)
                }}
                onBlur={handleLabelBlur}
                placeholder="Ex: Gerente Comercial"
                autoComplete="off"
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-orange-400 dark:focus:ring-orange-400/20"
                aria-invalid={labelError !== null}
                aria-describedby={labelError ? "role-label-error" : undefined}
              />
              {labelError && (
                <p
                  id="role-label-error"
                  className="mt-1.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                >
                  <span className="inline-block h-1 w-1 rounded-full bg-current" />
                  {labelError}
                </p>
              )}
            </div>

            {/* Nome interno (identificador técnico) */}
            <div>
              <label
                htmlFor="role-name"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-stone-300"
              >
                Identificador interno
                <span className="ml-1 text-xs font-normal text-gray-400 dark:text-stone-500">
                  (não pode ser alterado depois)
                </span>
              </label>
              <input
                id="role-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError(null)
                }}
                onBlur={handleNameBlur}
                placeholder="ex: gerente-comercial"
                autoComplete="off"
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-orange-400 dark:focus:ring-orange-400/20"
                aria-invalid={nameError !== null}
                aria-describedby={nameError ? "role-name-error" : "role-name-help"}
              />
              {nameError ? (
                <p
                  id="role-name-error"
                  className="mt-1.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                >
                  <span className="inline-block h-1 w-1 rounded-full bg-current" />
                  {nameError}
                </p>
              ) : (
                <p
                  id="role-name-help"
                  className="mt-1.5 text-xs text-gray-500 dark:text-stone-400"
                >
                  Apenas letras minúsculas, números e hífens.
                </p>
              )}
            </div>

            {/* Color picker — swatches grandes com label e check */}
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-stone-300">
                Cor de identificação
              </span>
              <div className="grid grid-cols-6 gap-2">
                {ROLE_COLORS.map((color) => {
                  const isSelected = selectedColor === color.value
                  return (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setSelectedColor(color.value)}
                      disabled={isSubmitting}
                      aria-pressed={isSelected}
                      aria-label={color.label}
                      title={color.label}
                      className={`relative flex h-11 w-full items-center justify-center rounded-xl ${color.bg} shadow-sm transition-all disabled:opacity-60 ${
                        isSelected
                          ? `scale-105 ring-2 ring-offset-2 ${color.ring} shadow-lg ${color.shadow} dark:ring-offset-stone-900`
                          : "hover:scale-105 hover:shadow-md"
                      }`}
                    >
                      {isSelected && (
                        <Check
                          className="h-5 w-5 text-white drop-shadow"
                          strokeWidth={3}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-stone-400">
                Selecionado:{" "}
                <span className="font-medium text-gray-700 dark:text-stone-300">
                  {selectedColorData.label}
                </span>
              </p>
            </div>

            {/* Preview do badge — feedback visual do que o usuário está criando */}
            {label.trim() && (
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3 dark:border-stone-800 dark:bg-stone-800/40">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
                  Preview
                </p>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                    selectedColor === "purple"
                      ? "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/20"
                      : selectedColor === "blue"
                      ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20"
                      : selectedColor === "green"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20"
                      : selectedColor === "yellow"
                      ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20"
                      : selectedColor === "orange"
                      ? "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20"
                      : "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-700"
                  }`}
                >
                  {label.trim()}
                </span>
              </div>
            )}

            {/* Ações */}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 ring-1 ring-orange-600/30 transition-all hover:from-orange-500 hover:to-orange-700 hover:shadow-lg hover:shadow-orange-500/30 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Criando...
                  </>
                ) : (
                  "Criar perfil"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
