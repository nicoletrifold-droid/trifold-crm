"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FolderPlus, Copy, Check, ChevronRight, Trash2, ArrowLeft, ArrowRight, Paperclip, Loader2 } from "lucide-react"
import { titularLabel, type Titular } from "@web/lib/pastas/checklist"

interface PastaRow {
  id: string
  nome: string
  tipo: string
  empreendimento: string | null
  token: string
  total: number
  entregues: number
}

export function PastasManager({ pastas }: { pastas: PastaRow[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PastaRow | null>(null)

  function linkFor(token: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    return `${origin}/pasta/${token}`
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Pastas</h1>
          <p className="text-sm text-gray-500 dark:text-stone-400">
            Documentos dos interessados — envie o link e acompanhe o que já foi entregue.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          <FolderPlus className="h-4 w-4" />
          Nova pasta
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        {pastas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-stone-500">
            Nenhuma pasta ainda. Crie a primeira e envie o link ao interessado.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-stone-800">
            {pastas.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900 dark:text-stone-100">
                    {p.nome}{" "}
                    <span className="text-xs font-normal uppercase text-gray-400 dark:text-stone-500">
                      {p.tipo}
                    </span>
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-stone-400">
                    {p.empreendimento ? `${p.empreendimento} · ` : ""}
                    {p.entregues}/{p.total} documentos entregues
                  </p>
                </div>
                <button
                  onClick={() => copy(p.token)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                  title="Copiar link para o interessado"
                >
                  {copied === p.token ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === p.token ? "Copiado" : "Copiar link"}
                </button>
                <Link
                  href={`/dashboard/pastas/${p.id}`}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10"
                >
                  Abrir <ChevronRight className="h-3.5 w-3.5" />
                </Link>
                <button
                  onClick={() => setDeleteTarget(p)}
                  title="Excluir pasta"
                  className="flex shrink-0 items-center rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-stone-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); router.refresh() }}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          pasta={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function DeleteModal({ pasta, onClose, onDeleted }: { pasta: PastaRow; onClose: () => void; onDeleted: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/pastas/${pasta.id}`, { method: "DELETE" })
      if (res.ok) {
        onDeleted()
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Não foi possível excluir.")
        setLoading(false)
      }
    } catch {
      setError("Não foi possível excluir.")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Excluir pasta</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-stone-400">
          Excluir a pasta de <strong>{pasta.nome}</strong>? Os documentos enviados serão apagados. Esta ação não pode ser desfeita.
        </p>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800">
            Cancelar
          </button>
          <button onClick={confirm} disabled={loading} className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
            {loading ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  "mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"

// Story 75-126 — preferência de fluxo de pagamento (seção do Termo de Intenção).
const FLUXOS_PAGAMENTO: { value: string; label: string; hint: string }[] = [
  { value: "fluxo_30_70", label: "Fluxo 30/70", hint: "10% ato + 20% em 42 meses + 70% nas chaves" },
  { value: "fluxo_100_obra", label: "Fluxo 100% obra", hint: "10% ato + 42 mensais com a construtora" },
  { value: "plano_safra", label: "Plano Safra", hint: "Semestrais ou condição personalizada" },
  { value: "plano_investidor", label: "Plano Investidor", hint: "À vista ou até 6 parcelas" },
]

interface SeededDoc {
  id: string
  slug: string
  label: string
  titular: Titular
  situacao: string
}

// Story 75-123 — "Nova pasta" em wizard progressivo (stepper 3 telas):
//   1) Corretor/origem  2) Comprador  3) Documentos (anexar inline + link).
// A pasta só é criada ao avançar da Tela 2 (POST devolve id/token/docs semeados),
// para que a Tela 3 já consiga anexar contra documentos reais.
function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Tela 1 — corretor / origem (texto livre, não amarra ao CRM)
  const [corretorNome, setCorretorNome] = useState("")
  const [corretorTelefone, setCorretorTelefone] = useState("")
  const [corretorEmail, setCorretorEmail] = useState("")
  const [imobiliaria, setImobiliaria] = useState("")
  const [empreendimento, setEmpreendimento] = useState("")
  const [temPix, setTemPix] = useState(false)
  const [fluxoPagamento, setFluxoPagamento] = useState<string | null>(null)

  // Tela 2 — comprador
  const [nome, setNome] = useState("")
  const [tipo, setTipo] = useState<"pf" | "pj">("pf")
  const [casado, setCasado] = useState(false)
  const [uniaoEstavel, setUniaoEstavel] = useState(false)
  const [interessadoTelefone, setInteressadoTelefone] = useState("")
  const [interessadoEmail, setInteressadoEmail] = useState("")

  // Tela 3 — pasta criada
  const [created, setCreated] = useState<{ id: string; token: string; docs: SeededDoc[] } | null>(null)
  const [docs, setDocs] = useState<SeededDoc[]>([])
  const [busyDocId, setBusyDocId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const link =
    created && typeof window !== "undefined" ? `${window.location.origin}/pasta/${created.token}` : ""

  function next1() {
    if (!corretorNome.trim()) { setError("Informe o nome do corretor."); return }
    setError(null)
    setStep(2)
  }

  async function create() {
    if (!nome.trim()) { setError("Informe o nome do comprador."); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/pastas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          tipo,
          casado,
          uniao_estavel: uniaoEstavel,
          empreendimento: empreendimento.trim(),
          tem_pix: temPix,
          fluxo_pagamento: fluxoPagamento,
          corretor_nome: corretorNome.trim(),
          corretor_telefone: corretorTelefone.trim(),
          corretor_email: corretorEmail.trim(),
          imobiliaria: imobiliaria.trim(),
          interessado_telefone: interessadoTelefone.trim(),
          interessado_email: interessadoEmail.trim(),
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.data) {
        setCreated(data.data)
        setDocs(data.data.docs ?? [])
        setStep(3)
      } else {
        setError(data?.error ?? "Não foi possível criar a pasta.")
      }
    } catch {
      setError("Não foi possível criar a pasta.")
    } finally {
      setLoading(false)
    }
  }

  async function uploadDoc(doc: SeededDoc, file: File) {
    if (!created) return
    setBusyDocId(doc.id)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/pastas/${created.id}/documentos/${doc.id}/upload`, { method: "POST", body: fd })
      if (res.ok) {
        setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, situacao: "entregue" } : d)))
      }
    } finally {
      setBusyDocId(null)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const titulares = [...new Set(docs.map((d) => d.titular))]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && onClose()}>
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho + barra de progresso */}
        <div className="border-b border-gray-100 px-6 pb-4 pt-5 dark:border-stone-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Nova pasta</h2>
            <span className="text-xs text-gray-400 dark:text-stone-500">Etapa {step}/3</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-orange-500" : "bg-gray-200 dark:bg-stone-700"}`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs font-medium text-gray-500 dark:text-stone-400">
            {step === 1 ? "Corretor / origem" : step === 2 ? "Comprador" : "Documentos"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ── Tela 1 — Corretor / origem ── */}
          {step === 1 && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-stone-400">Nome do corretor *</span>
                <input value={corretorNome} onChange={(e) => setCorretorNome(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-stone-400">Telefone do corretor</span>
                <input value={corretorTelefone} onChange={(e) => setCorretorTelefone(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-stone-400">E-mail do corretor</span>
                <input type="email" value={corretorEmail} onChange={(e) => setCorretorEmail(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-stone-400">Imobiliária</span>
                <input value={imobiliaria} onChange={(e) => setImobiliaria(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-stone-400">Empreendimento</span>
                <input value={empreendimento} onChange={(e) => setEmpreendimento(e.target.value)} className={inputCls} />
              </label>
              <div>
                <span className="text-xs text-gray-500 dark:text-stone-400">Fluxo de pagamento <span className="text-gray-400 dark:text-stone-500">(opcional)</span></span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {FLUXOS_PAGAMENTO.map((f) => {
                    const on = fluxoPagamento === f.value
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setFluxoPagamento(on ? null : f.value)}
                        className={`rounded-md border px-3 py-2 text-left ${on ? "border-orange-500 bg-orange-50 dark:border-orange-500 dark:bg-orange-500/10" : "border-gray-200 dark:border-stone-700"}`}
                      >
                        <span className={`block text-sm font-medium ${on ? "text-orange-700 dark:text-orange-300" : "text-gray-700 dark:text-stone-300"}`}>{f.label}</span>
                        <span className="block text-[11px] leading-tight text-gray-400 dark:text-stone-500">{f.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-stone-400">Pagamento</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTemPix(true)}
                    className={`rounded-md border px-3 py-2 text-sm font-medium ${temPix ? "border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500 dark:bg-orange-500/10 dark:text-orange-300" : "border-gray-200 text-gray-600 dark:border-stone-700 dark:text-stone-300"}`}
                  >
                    PIX
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemPix(false)}
                    className={`rounded-md border px-3 py-2 text-sm font-medium ${!temPix ? "border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500 dark:bg-orange-500/10 dark:text-orange-300" : "border-gray-200 text-gray-600 dark:border-stone-700 dark:text-stone-300"}`}
                  >
                    SEM PIX
                  </button>
                </div>
                {temPix && (
                  <p className="mt-1.5 text-[11px] text-gray-400 dark:text-stone-500">
                    Adiciona “Comprovante de pagamento (PIX)” ao checklist.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Tela 2 — Comprador ── */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <span className="text-xs text-gray-500 dark:text-stone-400">Tipo de comprador</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipo("pf")}
                    className={`rounded-md border px-3 py-2 text-sm font-medium ${tipo === "pf" ? "border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500 dark:bg-orange-500/10 dark:text-orange-300" : "border-gray-200 text-gray-600 dark:border-stone-700 dark:text-stone-300"}`}
                  >
                    Pessoa física
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo("pj")}
                    className={`rounded-md border px-3 py-2 text-sm font-medium ${tipo === "pj" ? "border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500 dark:bg-orange-500/10 dark:text-orange-300" : "border-gray-200 text-gray-600 dark:border-stone-700 dark:text-stone-300"}`}
                  >
                    Pessoa jurídica
                  </button>
                </div>
              </div>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-stone-400">
                  {tipo === "pj" ? "Razão social / nome" : "Nome do comprador"} *
                </span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
              </label>
              {tipo === "pf" && (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-stone-300">
                    <input
                      type="checkbox"
                      checked={casado}
                      onChange={(e) => { setCasado(e.target.checked); if (e.target.checked) setUniaoEstavel(false) }}
                    />
                    Casado(a) — inclui documentos do cônjuge
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-stone-300">
                    <input
                      type="checkbox"
                      checked={uniaoEstavel}
                      onChange={(e) => { setUniaoEstavel(e.target.checked); if (e.target.checked) setCasado(false) }}
                    />
                    União estável — inclui docs do(a) companheiro(a) + comprovante de união estável
                  </label>
                </div>
              )}
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-stone-400">Telefone do comprador</span>
                <input value={interessadoTelefone} onChange={(e) => setInteressadoTelefone(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-stone-400">E-mail do comprador</span>
                <input type="email" value={interessadoEmail} onChange={(e) => setInteressadoEmail(e.target.value)} className={inputCls} />
              </label>
            </div>
          )}

          {/* ── Tela 3 — Documentos (pasta criada) ── */}
          {step === 3 && created && (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Pasta criada!</p>
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                  Anexe os documentos agora ou envie o link para o comprador enviar.
                </p>
                <button
                  onClick={copyLink}
                  className="mt-2 flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:bg-transparent dark:text-emerald-300"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado" : "Copiar link do comprador"}
                </button>
              </div>

              {titulares.map((t) => (
                <div key={t}>
                  <p className="mb-1.5 text-xs font-semibold uppercase text-gray-400 dark:text-stone-500">{titularLabel(t)}</p>
                  <ul className="space-y-1.5">
                    {docs.filter((d) => d.titular === t).map((doc) => {
                      const uploaded = doc.situacao !== "pendente"
                      return (
                        <li key={doc.id} className="flex items-center gap-2 rounded-md border border-gray-100 px-2.5 py-1.5 dark:border-stone-800">
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-stone-200">{doc.label}</span>
                          {uploaded && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                          <input
                            ref={(el) => { inputs.current[doc.id] = el }}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(doc, f); e.target.value = "" }}
                          />
                          <button
                            onClick={() => inputs.current[doc.id]?.click()}
                            disabled={busyDocId === doc.id}
                            className="flex shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                          >
                            {busyDocId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                            {uploaded ? "Substituir" : "Anexar"}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>

        {/* Rodapé — navegação */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 dark:border-stone-800">
          {step === 1 && (
            <>
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800">
                Cancelar
              </button>
              <button onClick={next1} className="flex items-center gap-1.5 rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700">
                Avançar <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button onClick={() => { setError(null); setStep(1) }} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>
              <button onClick={create} disabled={loading} className="flex items-center gap-1.5 rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">
                {loading ? "Criando..." : <>Avançar <ArrowRight className="h-4 w-4" /></>}
              </button>
            </>
          )}
          {step === 3 && (
            <button onClick={onCreated} className="ml-auto rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700">
              Concluir
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
