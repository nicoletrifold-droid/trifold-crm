"use client"

import { useState } from "react"
import { X } from "lucide-react"
import {
  STATUS_LABELS,
  IMOBILIARIA_STATUS,
  TIPOS_PRODUTO,
  TIPO_PRODUTO_LABELS,
  type Imobiliaria,
  type ImobiliariaStatus,
} from "@web/lib/imob/imobiliarias"

// Story 75-148 — modal de cadastro/edição de imobiliária, EXTRAÍDO do ImobiliariasManager
// para ser reutilizado: (1) na lista do IMOB; (2) na lista dentro de Pastas; (3) inline nos
// fluxos "Nova pasta" e "Gerar link" (botão "+ Cadastrar nova imobiliária"). Cadastro COMPLETO.

type FormState = {
  nome: string; razao_social: string; cnpj: string; creci_juridico: string; telefone: string; email: string
  cidade: string; estado: string; endereco: string; num_corretores: string
  gerente_nome: string; gerente_telefone: string; gerente_email: string
  socio_nome: string; socio_telefone: string; socio_email: string
  tipos_produto: string[]
  contato_nome: string; contato_telefone: string; contato_email: string
  status: ImobiliariaStatus; observacoes: string
}

const EMPTY: FormState = {
  nome: "", razao_social: "", cnpj: "", creci_juridico: "", telefone: "", email: "", cidade: "", estado: "",
  endereco: "", num_corretores: "", gerente_nome: "", gerente_telefone: "", gerente_email: "",
  socio_nome: "", socio_telefone: "", socio_email: "", tipos_produto: [],
  contato_nome: "", contato_telefone: "", contato_email: "", status: "prospeccao", observacoes: "",
}

function toForm(i: Imobiliaria): FormState {
  return {
    nome: i.nome ?? "", razao_social: i.razao_social ?? "", cnpj: i.cnpj ?? "", creci_juridico: i.creci_juridico ?? "",
    telefone: i.telefone ?? "", email: i.email ?? "", cidade: i.cidade ?? "", estado: i.estado ?? "",
    endereco: i.endereco ?? "", num_corretores: i.num_corretores != null ? String(i.num_corretores) : "",
    gerente_nome: i.gerente_nome ?? "", gerente_telefone: i.gerente_telefone ?? "", gerente_email: i.gerente_email ?? "",
    socio_nome: i.socio_nome ?? "", socio_telefone: i.socio_telefone ?? "", socio_email: i.socio_email ?? "",
    tipos_produto: Array.isArray(i.tipos_produto) ? i.tipos_produto : [],
    contato_nome: i.contato_nome ?? "",
    contato_telefone: i.contato_telefone ?? "", contato_email: i.contato_email ?? "",
    status: i.status, observacoes: i.observacoes ?? "",
  }
}

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
const labelCls = "block text-xs font-medium text-gray-500 dark:text-stone-400"

export function ImobiliariaFormModal({
  editing,
  onClose,
  onSaved,
}: {
  /** null = criar; objeto = editar. */
  editing: Imobiliaria | null
  onClose: () => void
  /** Chamado após salvar com a imobiliária persistida (id + campos). */
  onSaved: (imob: Imobiliaria) => void
}) {
  const [form, setForm] = useState<FormState>(editing ? toForm(editing) : EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof FormState>(k: K, v: FormState[K]) { setForm((f) => ({ ...f, [k]: v })) }
  function toggleTipo(t: string) {
    setForm((f) => ({
      ...f,
      tipos_produto: f.tipos_produto.includes(t) ? f.tipos_produto.filter((x) => x !== t) : [...f.tipos_produto, t],
    }))
  }

  async function save() {
    if (!form.nome.trim()) { setError("Nome da imobiliária é obrigatório"); return }
    setSaving(true); setError(null)
    try {
      const url = editing ? `/api/imob/imobiliarias/${editing.id}` : "/api/imob/imobiliarias"
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          num_corretores: form.num_corretores === "" ? null : Number(form.num_corretores),
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; imobiliaria?: Imobiliaria }
      if (!res.ok || !body.imobiliaria) { setError(body.error ?? "Erro ao salvar"); return }
      onSaved(body.imobiliaria)
    } catch {
      setError("Erro de conexão ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-white">
            {editing ? "Editar imobiliária" : "Nova imobiliária"}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Nome da imobiliária *</label>
            <input className={inputCls} value={form.nome} onChange={(e) => set("nome", e.target.value)} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Razão social</label>
            <input className={inputCls} value={form.razao_social} onChange={(e) => set("razao_social", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>CNPJ</label>
            <input className={inputCls} value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>CRECI jurídico</label>
            <input className={inputCls} value={form.creci_juridico} onChange={(e) => set("creci_juridico", e.target.value)} placeholder="CRECI da imobiliária" />
          </div>
          <div>
            <label className={labelCls}>Telefone</label>
            <input className={inputCls} value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>E-mail</label>
            <input className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Cidade</label>
            <input className={inputCls} value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Estado (UF)</label>
            <input className={inputCls} maxLength={2} value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase())} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Endereço</label>
            <input className={inputCls} value={form.endereco} onChange={(e) => set("endereco", e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Nº de corretores na equipe</label>
            <input type="number" min={0} className={inputCls} value={form.num_corretores} onChange={(e) => set("num_corretores", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Nome do gerente</label>
            <input className={inputCls} value={form.gerente_nome} onChange={(e) => set("gerente_nome", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Telefone do gerente</label>
            <input className={inputCls} value={form.gerente_telefone} onChange={(e) => set("gerente_telefone", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>E-mail do gerente</label>
            <input className={inputCls} value={form.gerente_email} onChange={(e) => set("gerente_email", e.target.value)} />
          </div>

          {/* Sócio administrador / proprietário */}
          <div className="sm:col-span-2 mt-1 border-t border-stone-100 pt-3 dark:border-stone-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Sócio administrador / proprietário</p>
          </div>
          <div>
            <label className={labelCls}>Nome do sócio/proprietário</label>
            <input className={inputCls} value={form.socio_nome} onChange={(e) => set("socio_nome", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Telefone do sócio/proprietário</label>
            <input className={inputCls} value={form.socio_telefone} onChange={(e) => set("socio_telefone", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>E-mail do sócio/proprietário</label>
            <input className={inputCls} value={form.socio_email} onChange={(e) => set("socio_email", e.target.value)} />
          </div>

          {/* Tipo de produto (múltipla escolha) */}
          <div className="sm:col-span-2 mt-1 border-t border-stone-100 pt-3 dark:border-stone-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Tipo de produto que trabalha</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TIPOS_PRODUTO.map((t) => {
                const active = form.tipos_produto.includes(t)
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggleTipo(t)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-500/15 dark:text-orange-300"
                        : "border-stone-300 text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                    }`}
                  >
                    {active ? "✓ " : ""}{TIPO_PRODUTO_LABELS[t]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="sm:col-span-2 mt-1 border-t border-stone-100 pt-3 dark:border-stone-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Contato construtora ↔ imobiliária</p>
          </div>
          <div>
            <label className={labelCls}>Nome do contato</label>
            <input className={inputCls} value={form.contato_nome} onChange={(e) => set("contato_nome", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Telefone do contato</label>
            <input className={inputCls} value={form.contato_telefone} onChange={(e) => set("contato_telefone", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>E-mail do contato</label>
            <input className={inputCls} value={form.contato_email} onChange={(e) => set("contato_email", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value as ImobiliariaStatus)}>
              {IMOBILIARIA_STATUS.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Observações</label>
            <textarea rows={3} className={inputCls} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {saving ? "Salvando…" : editing ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  )
}
