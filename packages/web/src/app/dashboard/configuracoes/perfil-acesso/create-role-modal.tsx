"use client"

import { useState } from "react"
import { createRole } from "./actions"

// ============================================================================
// Cores fixas para perfis customizados (Story 35-4 AC 5)
// ============================================================================

const ROLE_COLORS = [
  { value: "purple", label: "Roxo", bg: "bg-purple-500" },
  { value: "blue", label: "Azul", bg: "bg-blue-500" },
  { value: "green", label: "Verde", bg: "bg-green-500" },
  { value: "yellow", label: "Amarelo", bg: "bg-yellow-400" },
  { value: "orange", label: "Laranja", bg: "bg-orange-500" },
  { value: "gray", label: "Cinza", bg: "bg-gray-400" },
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-role-modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="create-role-modal-title"
            className="text-lg font-semibold text-gray-900 dark:text-stone-100"
          >
            Novo Perfil
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 dark:text-stone-500 dark:hover:text-stone-300"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome interno */}
          <div>
            <label
              htmlFor="role-name"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300"
            >
              Nome interno
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? "role-name-error" : "role-name-help"}
            />
            {nameError ? (
              <p
                id="role-name-error"
                className="mt-1 text-xs text-red-600 dark:text-red-300"
              >
                {nameError}
              </p>
            ) : (
              <p
                id="role-name-help"
                className="mt-1 text-xs text-gray-500 dark:text-stone-400"
              >
                Apenas letras minúsculas, números e hífens.
              </p>
            )}
          </div>

          {/* Label */}
          <div>
            <label
              htmlFor="role-label"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300"
            >
              Label
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
              aria-invalid={labelError !== null}
              aria-describedby={labelError ? "role-label-error" : undefined}
            />
            {labelError && (
              <p
                id="role-label-error"
                className="mt-1 text-xs text-red-600 dark:text-red-300"
              >
                {labelError}
              </p>
            )}
          </div>

          {/* Cor */}
          <div>
            <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-stone-300">
              Cor
            </span>
            <div className="flex flex-wrap gap-2">
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
                    className={`h-8 w-8 rounded-full ${color.bg} transition-all disabled:opacity-60 ${
                      isSelected
                        ? "ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-stone-900"
                        : "ring-1 ring-gray-200 hover:ring-gray-400 dark:ring-stone-700 dark:hover:ring-stone-500"
                    }`}
                  />
                )
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {isSubmitting ? "Criando..." : "Criar perfil"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
