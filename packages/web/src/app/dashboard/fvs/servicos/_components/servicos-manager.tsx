"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, X, Trash2, ChevronUp, ChevronDown, Pencil } from "lucide-react"
import {
  ITEM_TIPOS, ITEM_TIPO_LABELS, FOTO_CONFIGS, FOTO_CONFIG_LABELS,
  type FvsFichaModelo, type FvsFichaModeloItem, type FvsServico, type FotoConfig, type ItemTipo,
} from "@web/lib/fvs/fvs"

export type ServicoComFicha = {
  servico: FvsServico
  ficha: FvsFichaModelo | null
  itens: FvsFichaModeloItem[]
}

const inputCls = "mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
const labelCls = "block text-xs font-medium text-gray-500 dark:text-stone-400"
const btnPrimary = "inline-flex items-center gap-1.5 rounded-md bg-[#E8856A] px-3 py-2 text-sm font-medium text-white hover:bg-[#d6724f] disabled:opacity-50"

type ItemDraft = { descricao: string; tipo: ItemTipo; unidade: string; tolerancia: string }
const EMPTY_ITEM: ItemDraft = { descricao: "", tipo: "botao", unidade: "", tolerancia: "" }

type FichaDraft = { titulo: string; foto_config: FotoConfig; itens: ItemDraft[] }

export function ServicosManager({ rows }: { rows: ServicoComFicha[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // modal "serviço" (nome)
  const [servicoOpen, setServicoOpen] = useState(false)
  const [servicoEditing, setServicoEditing] = useState<FvsServico | null>(null)
  const [servicoNome, setServicoNome] = useState("")

  // modal "ficha-modelo"
  const [fichaOpen, setFichaOpen] = useState<ServicoComFicha | null>(null)
  const [draft, setDraft] = useState<FichaDraft>({ titulo: "", foto_config: "por_ficha", itens: [EMPTY_ITEM] })

  function openServicoNew() { setServicoEditing(null); setServicoNome(""); setError(null); setServicoOpen(true) }
  function openServicoEdit(s: FvsServico) { setServicoEditing(s); setServicoNome(s.nome); setError(null); setServicoOpen(true) }

  function openFicha(row: ServicoComFicha) {
    setError(null)
    setDraft(
      row.ficha
        ? {
            titulo: row.ficha.titulo,
            foto_config: row.ficha.foto_config,
            itens: row.itens.map((it) => ({
              descricao: it.descricao, tipo: it.tipo,
              unidade: it.unidade ?? "", tolerancia: it.tolerancia ?? "",
            })),
          }
        : { titulo: `FVS — ${row.servico.nome}`, foto_config: "por_ficha", itens: [EMPTY_ITEM] }
    )
    setFichaOpen(row)
  }

  async function saveServico() {
    setSaving(true); setError(null)
    try {
      const url = servicoEditing ? `/api/fvs/servicos/${servicoEditing.id}` : "/api/fvs/servicos"
      const res = await fetch(url, {
        method: servicoEditing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome: servicoNome }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setError(body.error ?? "Erro ao salvar"); return }
      setServicoOpen(false); router.refresh()
    } catch { setError("Erro de conexão") } finally { setSaving(false) }
  }

  async function removeServico() {
    if (!servicoEditing) return
    if (!confirm(`Excluir o serviço "${servicoEditing.nome}"? A ficha-modelo dele vai junto.`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/fvs/servicos/${servicoEditing.id}`, { method: "DELETE" })
      if (res.ok) { setServicoOpen(false); router.refresh() }
    } finally { setSaving(false) }
  }

  function setItem(i: number, patch: Partial<ItemDraft>) {
    setDraft((d) => ({ ...d, itens: d.itens.map((it, j) => (j === i ? { ...it, ...patch } : it)) }))
  }
  function moveItem(i: number, dir: -1 | 1) {
    setDraft((d) => {
      const itens = [...d.itens]
      const j = i + dir
      if (j < 0 || j >= itens.length) return d
      const a = itens[i]
      const b = itens[j]
      if (!a || !b) return d
      itens[i] = b
      itens[j] = a
      return { ...d, itens }
    })
  }
  function removeItem(i: number) {
    setDraft((d) => ({ ...d, itens: d.itens.filter((_, j) => j !== i) }))
  }

  async function saveFicha() {
    if (!fichaOpen) return
    setSaving(true); setError(null)
    try {
      const payloadItens = draft.itens.map((it) => ({
        descricao: it.descricao, tipo: it.tipo, unidade: it.unidade, tolerancia: it.tolerancia,
      }))
      const res = fichaOpen.ficha
        ? await fetch(`/api/fvs/fichas-modelo/${fichaOpen.ficha.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ titulo: draft.titulo, foto_config: draft.foto_config, itens: payloadItens }),
          })
        : await fetch("/api/fvs/fichas-modelo", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              servico_id: fichaOpen.servico.id,
              titulo: draft.titulo, foto_config: draft.foto_config, itens: payloadItens,
            }),
          })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setError(body.error ?? "Erro ao salvar"); return }
      setFichaOpen(null); router.refresh()
    } catch { setError("Erro de conexão") } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Link href="/dashboard/fvs" className="grid h-8 w-8 place-items-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white" aria-label="Voltar">
          <ArrowLeft className="h-[18px] w-[18px]" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Serviços e fichas-modelo</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Serviço novo entra por cadastro. A ficha-modelo é a lista de itens que a vistoria confere.
          </p>
        </div>
        <button onClick={openServicoNew} className={`ml-auto ${btnPrimary}`}>
          <Plus className="h-4 w-4" /> Novo serviço
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
          Nenhum serviço ainda. O piloto começa com <b>Revestimento cerâmico</b> e <b>Hidráulica</b>.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.servico.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-stone-900 dark:text-white">{row.servico.nome}</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  {row.ficha
                    ? `${row.ficha.titulo} · ${row.itens.length} item(ns) · foto: ${FOTO_CONFIG_LABELS[row.ficha.foto_config]}`
                    : "Sem ficha-modelo — a vistoria deste serviço ainda não tem o que conferir"}
                </p>
              </div>
              <button onClick={() => openServicoEdit(row.servico)} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800" aria-label={`Renomear ${row.servico.nome}`}>
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => openFicha(row)} className={btnPrimary}>
                {row.ficha ? "Editar ficha" : "Criar ficha"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Modal serviço */}
      {servicoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setServicoOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-stone-900 dark:text-white">{servicoEditing ? "Renomear serviço" : "Novo serviço"}</h2>
              <button onClick={() => setServicoOpen(false)} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <label className={labelCls}>Nome *</label>
            <input type="text" value={servicoNome} onChange={(e) => setServicoNome(e.target.value)} className={inputCls} placeholder="Revestimento cerâmico" />
            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-5 flex items-center gap-2">
              <button onClick={saveServico} disabled={saving || !servicoNome.trim()} className={btnPrimary}>Salvar</button>
              {servicoEditing && (
                <button onClick={removeServico} disabled={saving} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal ficha-modelo */}
      {fichaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setFichaOpen(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-stone-900 dark:text-white">
                {fichaOpen.ficha ? "Editar ficha-modelo" : "Criar ficha-modelo"} — {fichaOpen.servico.nome}
              </h2>
              <button onClick={() => setFichaOpen(null)} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Título *</label>
                <input type="text" value={draft.titulo} onChange={(e) => setDraft((d) => ({ ...d, titulo: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Foto obrigatória</label>
                <select value={draft.foto_config} onChange={(e) => setDraft((d) => ({ ...d, foto_config: e.target.value as FotoConfig }))} className={inputCls}>
                  {FOTO_CONFIGS.map((f) => <option key={f} value={f}>{FOTO_CONFIG_LABELS[f]}</option>)}
                </select>
                <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">Definição em aberto com o Jonathan — a resposta dele vira este valor.</p>
              </div>
            </div>

            <p className={`${labelCls} mt-4`}>Itens da ficha (na ordem da vistoria)</p>
            <ul className="mt-1 space-y-2">
              {draft.itens.map((it, i) => (
                <li key={i} className="rounded-md border border-stone-200 p-3 dark:border-stone-700">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col">
                      <button onClick={() => moveItem(i, -1)} disabled={i === 0} className="text-stone-400 hover:text-stone-700 disabled:opacity-30 dark:hover:text-stone-200" aria-label="Subir"><ChevronUp className="h-4 w-4" /></button>
                      <button onClick={() => moveItem(i, 1)} disabled={i === draft.itens.length - 1} className="text-stone-400 hover:text-stone-700 disabled:opacity-30 dark:hover:text-stone-200" aria-label="Descer"><ChevronDown className="h-4 w-4" /></button>
                    </div>
                    <div className="grid flex-1 gap-2 sm:grid-cols-2">
                      <input type="text" value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} className={inputCls} placeholder={`Item ${i + 1} — ex.: Prumo da parede`} />
                      <select value={it.tipo} onChange={(e) => setItem(i, { tipo: e.target.value as ItemTipo })} className={inputCls}>
                        {ITEM_TIPOS.map((t) => <option key={t} value={t}>{ITEM_TIPO_LABELS[t]}</option>)}
                      </select>
                      {it.tipo === "medida" && (
                        <>
                          <input type="text" value={it.unidade} onChange={(e) => setItem(i, { unidade: e.target.value })} className={inputCls} placeholder="Unidade — mm, cm/m, %" />
                          <input type="text" value={it.tolerancia} onChange={(e) => setItem(i, { tolerancia: e.target.value })} className={inputCls} placeholder="Tolerância — ex.: ±3 mm em 2 m de régua" />
                        </>
                      )}
                    </div>
                    <button onClick={() => removeItem(i)} disabled={draft.itens.length === 1} className="text-stone-400 hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400" aria-label="Remover item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button onClick={() => setDraft((d) => ({ ...d, itens: [...d.itens, EMPTY_ITEM] }))} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#E8856A] hover:underline">
              <Plus className="h-4 w-4" /> Adicionar item
            </button>

            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-5">
              <button onClick={saveFicha} disabled={saving || !draft.titulo.trim() || draft.itens.some((i) => !i.descricao.trim())} className={btnPrimary}>
                Salvar ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
