"use client"

import { useState, useRef } from "react"
import { ArrowLeft, ArrowRight, Paperclip, Loader2, Check, Copy } from "lucide-react"
import { titularLabel, type Titular } from "@web/lib/pastas/checklist"

// Story 75-146 — wizard compartilhado de criação de pasta (3 telas), reutilizado pelo
// modal interno do dashboard E pela página pública de auto-cadastro da imobiliária.
//
// Modos:
//   - "internal": imobiliária editável; POST /api/pastas (created_by = usuário logado);
//     ao criar, avança para a Tela 3 (anexar inline + copiar link).
//   - "public":  imobiliária TRAVADA (vem do link); corretor pré-preenchido (editável);
//     POST /api/pasta/nova/[token]; ao criar, redireciona p/ a UI de upload (sem Tela 3).
//
// As telas são IDÊNTICAS nos dois modos (Tela 1 c/ PIX + fluxo; Tela 2 PF/PJ + casado/
// união; Tela 3 docs). Só a imobiliária e o destino do submit/onCreated variam — para
// não regredir o fluxo interno (AC 6).

const inputCls =
  "mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"

// Story 75-126 — preferência de fluxo de pagamento (seção do Termo de Intenção).
const FLUXOS_PAGAMENTO: { value: string; label: string; hint: string }[] = [
  { value: "fluxo_30_70", label: "Fluxo 30/70", hint: "10% ato + 20% em 42 meses + 70% nas chaves" },
  { value: "fluxo_100_obra", label: "Fluxo 100% obra", hint: "10% ato + 42 mensais com a construtora" },
  { value: "plano_safra", label: "Plano Safra", hint: "Semestrais ou condição personalizada" },
  { value: "plano_investidor", label: "Plano Investidor", hint: "À vista ou até 6 parcelas" },
]

export interface SeededDoc {
  id: string
  slug: string
  label: string
  titular: Titular
  situacao: string
}

export interface CreatedPasta {
  id: string
  token: string
  docs: SeededDoc[]
}

export interface PastaWizardProps {
  submitUrl: string
  mode: "internal" | "public"
  /** Público: valor pré-preenchido e TRAVADO da imobiliária (vem do link). */
  lockedImobiliaria?: string
  /** Público: defaults (editáveis) do corretor, vindos do link. */
  corretorDefaults?: { nome?: string; telefone?: string; email?: string }
  /** Interno: botão Cancelar + fechar no backdrop. */
  onClose?: () => void
  /** Interno: "Concluir" na Tela 3. */
  onInternalDone?: () => void
  /** Público: chamado ao criar a pasta (redireciona p/ a UI de upload). */
  onPublicCreated?: (data: CreatedPasta) => void
}

export function PastaWizard({
  submitUrl,
  mode,
  lockedImobiliaria,
  corretorDefaults,
  onClose,
  onInternalDone,
  onPublicCreated,
}: PastaWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Tela 1 — corretor / origem (texto livre, não amarra ao CRM)
  const [corretorNome, setCorretorNome] = useState(corretorDefaults?.nome ?? "")
  const [corretorTelefone, setCorretorTelefone] = useState(corretorDefaults?.telefone ?? "")
  const [corretorEmail, setCorretorEmail] = useState(corretorDefaults?.email ?? "")
  // Público: imobiliária travada no valor do link. Interno: editável.
  const [imobiliaria, setImobiliaria] = useState(lockedImobiliaria ?? "")
  const imobiliariaLocked = mode === "public"
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

  // Tela 3 — pasta criada (só no modo interno; no público redireciona)
  const [created, setCreated] = useState<CreatedPasta | null>(null)
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
      const res = await fetch(submitUrl, {
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
          // Público: o endpoint IGNORA a imobiliária do body e usa a do link.
          imobiliaria: imobiliaria.trim(),
          interessado_telefone: interessadoTelefone.trim(),
          interessado_email: interessadoEmail.trim(),
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.data) {
        if (mode === "public") {
          onPublicCreated?.(data.data as CreatedPasta)
          return
        }
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
    <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl dark:bg-stone-900">
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
            {imobiliariaLocked && (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-500/30 dark:bg-orange-500/10">
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  Cadastro pela imobiliária <strong>{imobiliaria}</strong>
                </p>
              </div>
            )}
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
              <input
                value={imobiliaria}
                onChange={(e) => setImobiliaria(e.target.value)}
                readOnly={imobiliariaLocked}
                disabled={imobiliariaLocked}
                className={`${inputCls} ${imobiliariaLocked ? "cursor-not-allowed bg-gray-50 text-gray-500 dark:bg-stone-800/60 dark:text-stone-400" : ""}`}
              />
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

        {/* ── Tela 3 — Documentos (pasta criada) — só no modo interno ── */}
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
            {onClose ? (
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800">
                Cancelar
              </button>
            ) : (
              <span />
            )}
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
          <button onClick={onInternalDone} className="ml-auto rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700">
            Concluir
          </button>
        )}
      </div>
    </div>
  )
}
