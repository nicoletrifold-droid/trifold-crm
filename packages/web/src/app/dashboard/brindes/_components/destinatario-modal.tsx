"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import type { Destinatario } from "./types"
import { UF_OPTIONS } from "./types"

interface DestinatarioModalProps {
  mode: "create" | "edit"
  destinatario?: Destinatario
  obraOptions: string[]
  onClose: () => void
}

const EMPTY = {
  obra_nome: "", tipo: "mae" as "mae" | "pai" | "outro", nome: "", observacao: "",
  endereco_logradouro: "", endereco_numero: "", endereco_complemento: "",
  endereco_bairro: "", endereco_cidade: "", endereco_estado: "", endereco_cep: "",
  endereco_referencia: "",
}

export function DestinatarioModal({ mode, destinatario, obraOptions, onClose }: DestinatarioModalProps) {
  const router = useRouter()
  const [fields, setFields] = useState({ ...EMPTY })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (destinatario) {
      setFields({
        obra_nome: destinatario.obra_nome,
        tipo: destinatario.tipo,
        nome: destinatario.nome,
        observacao: destinatario.observacao ?? "",
        endereco_logradouro: destinatario.endereco_logradouro ?? "",
        endereco_numero: destinatario.endereco_numero ?? "",
        endereco_complemento: destinatario.endereco_complemento ?? "",
        endereco_bairro: destinatario.endereco_bairro ?? "",
        endereco_cidade: destinatario.endereco_cidade ?? "",
        endereco_estado: destinatario.endereco_estado ?? "",
        endereco_cep: destinatario.endereco_cep ?? "",
        endereco_referencia: destinatario.endereco_referencia ?? "",
      })
    }
  }, [destinatario])

  function set(field: keyof typeof EMPTY, value: string) {
    setFields((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!fields.obra_nome.trim()) { setError("Nome da obra é obrigatório"); return }
    if (!fields.nome.trim()) { setError("Nome é obrigatório"); return }

    setLoading(true)
    setError(null)

    const body: Record<string, string | null> = {
      obra_nome: fields.obra_nome.trim(),
      tipo: fields.tipo,
      nome: fields.nome.trim(),
      observacao: fields.observacao.trim() || null,
      endereco_logradouro: fields.endereco_logradouro.trim() || null,
      endereco_numero: fields.endereco_numero.trim() || null,
      endereco_complemento: fields.endereco_complemento.trim() || null,
      endereco_bairro: fields.endereco_bairro.trim() || null,
      endereco_cidade: fields.endereco_cidade.trim() || null,
      endereco_estado: fields.endereco_estado || null,
      endereco_cep: fields.endereco_cep.trim() || null,
      endereco_referencia: fields.endereco_referencia.trim() || null,
    }

    try {
      const url = mode === "create"
        ? "/api/brindes/destinatarios"
        : `/api/brindes/destinatarios/${destinatario!.id}`
      const method = mode === "create" ? "POST" : "PATCH"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? "Erro ao salvar.")
        return
      }

      onClose()
      router.refresh()
    } catch {
      setError("Erro de rede.")
    } finally {
      setLoading(false)
    }
  }

  const inp = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
  const lbl = "mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300"

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10 dark:bg-black/70">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-stone-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">
            {mode === "create" ? "Novo Destinatário" : "Editar Destinatário"}
          </h2>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Obra <span className="text-red-500">*</span></label>
              <input list="obras-list" value={fields.obra_nome} onChange={(e) => set("obra_nome", e.target.value)}
                required className={inp} placeholder="Nome da obra" />
              <datalist id="obras-list">
                {obraOptions.map((o) => <option key={o} value={o} />)}
              </datalist>
            </div>

            <div>
              <label className={lbl}>Tipo <span className="text-red-500">*</span></label>
              <select value={fields.tipo} onChange={(e) => set("tipo", e.target.value as "mae" | "pai" | "outro")}
                className={inp}>
                <option value="mae">Mãe</option>
                <option value="pai">Pai</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <div>
              <label className={lbl}>Nome <span className="text-red-500">*</span></label>
              <input type="text" value={fields.nome} onChange={(e) => set("nome", e.target.value)}
                required className={inp} placeholder="Nome completo" />
            </div>

            <div className="col-span-2">
              <label className={lbl}>Observação</label>
              <input type="text" value={fields.observacao} onChange={(e) => set("observacao", e.target.value)}
                className={inp} placeholder="Observação de entrega" />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-stone-500">Endereço</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Logradouro</label>
                <input type="text" value={fields.endereco_logradouro} onChange={(e) => set("endereco_logradouro", e.target.value)}
                  className={inp} placeholder="Rua, Av..." />
              </div>
              <div>
                <label className={lbl}>Número</label>
                <input type="text" value={fields.endereco_numero} onChange={(e) => set("endereco_numero", e.target.value)}
                  className={inp} placeholder="123" />
              </div>
              <div>
                <label className={lbl}>Complemento</label>
                <input type="text" value={fields.endereco_complemento} onChange={(e) => set("endereco_complemento", e.target.value)}
                  className={inp} placeholder="Apto, Casa..." />
              </div>
              <div>
                <label className={lbl}>Bairro</label>
                <input type="text" value={fields.endereco_bairro} onChange={(e) => set("endereco_bairro", e.target.value)}
                  className={inp} />
              </div>
              <div>
                <label className={lbl}>CEP</label>
                <input type="text" value={fields.endereco_cep} onChange={(e) => set("endereco_cep", e.target.value)}
                  className={inp} placeholder="00000-000" />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Cidade</label>
                <input type="text" value={fields.endereco_cidade} onChange={(e) => set("endereco_cidade", e.target.value)}
                  className={inp} />
              </div>
              <div>
                <label className={lbl}>Estado</label>
                <select value={fields.endereco_estado} onChange={(e) => set("endereco_estado", e.target.value)} className={inp}>
                  <option value="">UF</option>
                  {UF_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
              <div className="col-span-3">
                <label className={lbl}>Referência</label>
                <input type="text" value={fields.endereco_referencia} onChange={(e) => set("endereco_referencia", e.target.value)}
                  className={inp} placeholder='Ex: "OBRA COMUNIDADE", "SEDE TRIFOLD"' />
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3 dark:border-stone-800">
            <button type="button" onClick={onClose} disabled={loading}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
              {loading ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
