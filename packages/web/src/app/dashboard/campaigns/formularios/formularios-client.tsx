"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { parseFormSchema, type FormSchema } from "@web/lib/forms/schema"
import { ConstrutorPerguntas } from "./construtor-perguntas"

// Story 75-330 — editor do schema. Deliberadamente um editor de JSON com
// validação, não um construtor visual arrastando campos (fora de escopo, Epic
// 89 §7). O que importa para a AC8 é: dá para mudar as perguntas sem deploy, e
// JSON inválido é recusado com um erro que diz QUAL pergunta está errada.

export interface FormularioRow {
  id: string
  nome: string
  token: string
  schema: unknown
  is_active: boolean
  created_at: string
}

/**
 * Story 75-334 (AC8) — formulário criado pela tela antiga abre no construtor.
 * Schema ilegível degrada para vazio em vez de quebrar a página: perder a tela
 * inteira por causa de um JSON ruim seria pior do que começar do zero naquele.
 */
function schemaSeguro(bruto: unknown): FormSchema {
  try {
    return parseFormSchema(bruto)
  } catch {
    return { perguntas: [] }
  }
}

export function FormulariosClient({
  formularios,
  podeEditar,
}: {
  formularios: FormularioRow[]
  podeEditar: boolean
}) {
  const router = useRouter()
  const [novoNome, setNovoNome] = useState("")
  const [editando, setEditando] = useState<string | null>(null)
  const [erro, setErro] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  const origem = typeof window === "undefined" ? "" : window.location.origin

  async function criar() {
    if (!novoNome.trim()) return
    setSalvando(true)
    setErro("")
    try {
      const res = await fetch("/api/lead-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome.trim() }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível criar.")
        return
      }
      setNovoNome("")
      router.refresh()
    } finally {
      setSalvando(false)
    }
  }

  // Story 75-334 — o construtor já entrega um FormSchema montado; não há mais
  // JSON digitado a mão para dar errado. O servidor segue validando: a tela
  // reduz o erro, ela não substitui a garantia.
  async function salvarSchema(id: string, schema: FormSchema) {
    setSalvando(true)
    setErro("")
    try {
      const res = await fetch("/api/lead-forms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, schema }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        // Aqui chega a mensagem do parseFormSchema: "Pergunta 3 ("prazo"): ..."
        setErro(json.error ?? "Não foi possível salvar.")
        return
      }
      setEditando(null)
      router.refresh()
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(f: FormularioRow) {
    await fetch("/api/lead-forms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, is_active: !f.is_active }),
    })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {podeEditar && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <label className="text-sm font-medium text-stone-700 dark:text-stone-200">
            Novo formulário
          </label>
          <div className="mt-2 flex gap-2">
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex.: Campanha Vind — Agosto"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
            <button
              type="button"
              onClick={() => void criar()}
              disabled={salvando || !novoNome.trim()}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              Criar
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {erro}
        </p>
      )}

      {formularios.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Nenhum formulário ainda. Crie o primeiro acima.
        </p>
      ) : (
        <div className="space-y-3">
          {formularios.map((f) => {
            const link = `${origem}/formulario/${f.token}`
            return (
              <div
                key={f.id}
                className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900 dark:text-stone-100">{f.nome}</p>
                    <p className="mt-0.5 break-all text-xs text-stone-500 dark:text-stone-400">
                      {link}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        f.is_active
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                      }`}
                    >
                      {f.is_active ? "Ativo" : "Inativo"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(link)
                        setCopiado(f.id)
                        setTimeout(() => setCopiado(null), 2000)
                      }}
                      className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                    >
                      {copiado === f.id ? "Copiado!" : "Copiar link"}
                    </button>
                    {podeEditar && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditando(editando === f.id ? null : f.id)
                            setErro("")
                          }}
                          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                        >
                          {editando === f.id ? "Fechar" : "Editar perguntas"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void alternarAtivo(f)}
                          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                        >
                          {f.is_active ? "Desativar" : "Ativar"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editando === f.id && (
                  <div className="mt-4">
                    <ConstrutorPerguntas
                      schemaInicial={schemaSeguro(f.schema)}
                      salvando={salvando}
                      onSalvar={(schema) => void salvarSchema(f.id, schema)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
