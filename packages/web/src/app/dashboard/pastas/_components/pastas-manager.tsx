"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FolderPlus, Copy, Check, ChevronRight, Trash2, Search, Clock, Building2, User, Building, CalendarDays, X, LinkIcon, Ban, RotateCcw, Loader2, CheckCircle2 } from "lucide-react"
import type { PastaStatus } from "@web/lib/pastas/status"
import { filterPastas, distinctValues, hasActiveFilters, EMPTY_FILTERS, type PastaFilters } from "@web/lib/pastas/filter"
import { PastaWizard } from "@web/components/pastas/pasta-wizard"
import { ImobiliariaSelect } from "@web/components/pastas/imobiliaria-select"
import { maskPhoneBR, isValidPhoneBR, isValidEmail, formatPhoneBR, normalizeEmail } from "@web/lib/validation/contato"

interface PastaRow {
  id: string
  nome: string
  tipo: string
  empreendimento: string | null
  corretorNome: string | null
  imobiliaria: string | null
  createdAt: string
  token: string
  status: PastaStatus
  origem: string
  total: number
  entregues: number
  deferidos: number
}

// Story 75-146 — links de auto-cadastro por imobiliária (um link público de criação).
export interface PastaLinkRow {
  id: string
  imobiliaria: string
  token: string
  ativo: boolean
  corretorNome: string | null
  createdAt: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR")
}

// Story 75-134 — selo de status da pasta (Aguardando / Em análise / Concluída).
const STATUS_META: Record<PastaStatus, { label: string; Icon: typeof CheckCircle2; cls: string }> = {
  aguardando: {
    label: "Aguardando",
    Icon: Clock,
    cls: "bg-gray-100 text-gray-500 dark:bg-stone-800 dark:text-stone-400",
  },
  em_analise: {
    label: "Em análise",
    Icon: Search,
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  concluida: {
    label: "Concluída",
    Icon: CheckCircle2,
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
}

function StatusPill({ status }: { status: PastaStatus }) {
  const { label, Icon, cls } = STATUS_META[status]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

// Story 75-146 — selo de origem "auto-cadastro" (pasta criada via link da imobiliária).
function OrigemPill({ p }: { p: PastaRow }) {
  if (p.origem !== "auto_cadastro") return null
  const label = p.imobiliaria ? `Auto-cadastro · ${p.imobiliaria}` : "Auto-cadastro"
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
      <Building2 className="h-3 w-3" />
      {label}
    </span>
  )
}

function pastaSubtitle(p: PastaRow): string {
  if (p.status === "em_analise") return `${p.entregues}/${p.total} entregues · ${p.deferidos}/${p.total} deferidos`
  return `${p.entregues}/${p.total} documentos entregues`
}

const filterSelectCls =
  "rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"

// Story 75-137 — linha de meta com ícones (imobiliária · corretor · empreendimento · data).
function MetaLine({ p }: { p: PastaRow }) {
  const items: { key: string; Icon: typeof Building2; text: string }[] = []
  if (p.imobiliaria) items.push({ key: "imob", Icon: Building2, text: p.imobiliaria })
  if (p.corretorNome) items.push({ key: "corr", Icon: User, text: p.corretorNome })
  if (p.empreendimento) items.push({ key: "emp", Icon: Building, text: p.empreendimento })
  const d = formatDate(p.createdAt)
  if (d) items.push({ key: "date", Icon: CalendarDays, text: d })
  if (items.length === 0) return null
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-stone-400">
      {items.map((it) => (
        <span key={it.key} className="inline-flex min-w-0 items-center gap-1">
          <it.Icon className="h-3 w-3 shrink-0 text-gray-400 dark:text-stone-500" />
          <span className="truncate">{it.text}</span>
        </span>
      ))}
    </p>
  )
}

export function PastasManager({ pastas, links: initialLinks }: { pastas: PastaRow[]; links: PastaLinkRow[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PastaRow | null>(null)

  // Story 75-137 — filtros (client-side).
  const [filters, setFilters] = useState<PastaFilters>(EMPTY_FILTERS)
  const setF = (patch: Partial<PastaFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const empreendimentos = useMemo(() => distinctValues(pastas, "empreendimento"), [pastas])
  const corretores = useMemo(() => distinctValues(pastas, "corretorNome"), [pastas])
  const imobiliarias = useMemo(() => distinctValues(pastas, "imobiliaria"), [pastas])
  const filtered = useMemo(() => filterPastas(pastas, filters), [pastas, filters])
  const active = hasActiveFilters(filters)

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
        <div className="flex items-center gap-2">
          {/* Story 75-148 — gerenciar a base de imobiliárias sem depender do módulo IMOB. */}
          <Link
            href="/dashboard/pastas/imobiliarias"
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            <Building2 className="h-4 w-4" />
            Imobiliárias
          </Link>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            <FolderPlus className="h-4 w-4" />
            Nova pasta
          </button>
        </div>
      </div>

      <LinksSection initialLinks={initialLinks} />

      {pastas.length > 0 && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-stone-500" />
              <input
                value={filters.search}
                onChange={(e) => setF({ search: e.target.value })}
                placeholder="Buscar por cliente, corretor ou imobiliária…"
                className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              />
            </div>
            <select value={filters.status} onChange={(e) => setF({ status: e.target.value as PastaFilters["status"] })} className={filterSelectCls}>
              <option value="">Todos os status</option>
              <option value="aguardando">Aguardando</option>
              <option value="em_analise">Em análise</option>
              <option value="concluida">Concluída</option>
            </select>
            <select value={filters.empreendimento} onChange={(e) => setF({ empreendimento: e.target.value })} className={filterSelectCls}>
              <option value="">Empreendimento</option>
              {empreendimentos.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filters.corretor} onChange={(e) => setF({ corretor: e.target.value })} className={filterSelectCls}>
              <option value="">Corretor</option>
              {corretores.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filters.imobiliaria} onChange={(e) => setF({ imobiliaria: e.target.value })} className={filterSelectCls}>
              <option value="">Imobiliária</option>
              {imobiliarias.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-stone-400">
              De
              <input type="date" value={filters.dateFrom} onChange={(e) => setF({ dateFrom: e.target.value })} className={filterSelectCls} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-stone-400">
              Até
              <input type="date" value={filters.dateTo} onChange={(e) => setF({ dateTo: e.target.value })} className={filterSelectCls} />
            </label>
            <span className="ml-auto text-xs text-gray-500 dark:text-stone-400">
              {active ? `${filtered.length} de ${pastas.length} pastas` : `${pastas.length} pasta${pastas.length === 1 ? "" : "s"}`}
            </span>
            {active && (
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
                <X className="h-3.5 w-3.5" /> Limpar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        {pastas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-stone-500">
            Nenhuma pasta ainda. Crie a primeira e envie o link ao interessado.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-stone-500">
            Nenhuma pasta encontrada com esses filtros.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-stone-800">
            {filtered.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 truncate font-medium text-gray-900 dark:text-stone-100">
                    <span className="truncate">
                      {p.nome}{" "}
                      <span className="text-xs font-normal uppercase text-gray-400 dark:text-stone-500">
                        {p.tipo}
                      </span>
                    </span>
                    <StatusPill status={p.status} />
                    <OrigemPill p={p} />
                  </p>
                  <MetaLine p={p} />
                  <p className="truncate text-xs text-gray-500 dark:text-stone-400">
                    {pastaSubtitle(p)}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCreating(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <PastaWizard
              mode="internal"
              submitUrl="/api/pastas"
              onClose={() => setCreating(false)}
              onInternalDone={() => { setCreating(false); router.refresh() }}
            />
          </div>
        </div>
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

// Story 75-146 — seção de gestão dos links de auto-cadastro (um por imobiliária).
function LinksSection({ initialLinks }: { initialLinks: PastaLinkRow[] }) {
  const [links, setLinks] = useState<PastaLinkRow[]>(initialLinks)
  const [open, setOpen] = useState(false)
  const [imobiliariaId, setImobiliariaId] = useState<string | null>(null)
  const [imobiliariaNome, setImobiliariaNome] = useState<string | null>(null)
  const [corretorNome, setCorretorNome] = useState("")
  const [corretorTelefone, setCorretorTelefone] = useState("")
  const [corretorEmail, setCorretorEmail] = useState("")
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function urlFor(token: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    return `${origin}/pasta/nova/${token}`
  }

  async function copyUrl(token: string) {
    try {
      await navigator.clipboard.writeText(urlFor(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* ignore */ }
  }

  async function createLink() {
    if (!imobiliariaId) { setError("Selecione a imobiliária."); return }
    // Corretor opcional, mas se preenchido precisa ser válido.
    if (corretorTelefone.trim() && !isValidPhoneBR(corretorTelefone)) {
      setError("Telefone do corretor inválido — use DDD + número.")
      return
    }
    if (corretorEmail.trim() && !isValidEmail(corretorEmail)) {
      setError("E-mail do corretor inválido.")
      return
    }
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/pasta-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imobiliaria_id: imobiliariaId,
          imobiliaria: imobiliariaNome,
          corretor_nome: corretorNome.trim(),
          corretor_telefone: corretorTelefone.trim() ? formatPhoneBR(corretorTelefone) : "",
          corretor_email: normalizeEmail(corretorEmail),
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.data) {
        setLinks((prev) => [data.data as PastaLinkRow, ...prev])
        setImobiliariaId(null); setImobiliariaNome(null); setCorretorNome(""); setCorretorTelefone(""); setCorretorEmail("")
        setOpen(false)
      } else {
        setError(data?.error ?? "Não foi possível gerar o link.")
      }
    } catch {
      setError("Não foi possível gerar o link.")
    } finally {
      setCreating(false)
    }
  }

  async function toggleAtivo(row: PastaLinkRow) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/pasta-links/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !row.ativo }),
      })
      if (res.ok) {
        setLinks((prev) => prev.map((l) => (l.id === row.id ? { ...l, ativo: !row.ativo } : l)))
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-gray-400 dark:text-stone-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-stone-100">
            Links de auto-cadastro (imobiliárias)
          </h2>
        </div>
        <button
          onClick={() => { setOpen((o) => !o); setError(null) }}
          className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          {open ? "Fechar" : "Gerar link"}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3 dark:border-stone-800">
          <div className="grid gap-2 sm:grid-cols-2">
            <ImobiliariaSelect
              value={imobiliariaId}
              onChange={(v) => { setImobiliariaId(v?.id ?? null); setImobiliariaNome(v?.nome ?? null) }}
              required
            />
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-stone-400">Corretor (opcional)</span>
              <input value={corretorNome} onChange={(e) => setCorretorNome(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-stone-400">Telefone do corretor (opcional)</span>
              <input inputMode="tel" placeholder="(44) 99999-9999" value={corretorTelefone} onChange={(e) => setCorretorTelefone(maskPhoneBR(e.target.value))} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-stone-400">E-mail do corretor (opcional)</span>
              <input type="email" value={corretorEmail} onChange={(e) => setCorretorEmail(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <div className="mt-3 flex justify-end">
            <button
              onClick={createLink}
              disabled={creating}
              className="flex items-center gap-1.5 rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              Gerar link
            </button>
          </div>
        </div>
      )}

      {links.length > 0 && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-stone-800 dark:border-stone-800">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-gray-800 dark:text-stone-100">
                  <span className="truncate">{l.imobiliaria}</span>
                  {l.ativo ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Ativo</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-stone-800 dark:text-stone-400">Revogado</span>
                  )}
                </p>
                {l.corretorNome && (
                  <p className="truncate text-xs text-gray-400 dark:text-stone-500">Corretor: {l.corretorNome}</p>
                )}
              </div>
              <button
                onClick={() => copyUrl(l.token)}
                disabled={!l.ativo}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                title="Copiar link de auto-cadastro"
              >
                {copied === l.token ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === l.token ? "Copiado" : "Copiar URL"}
              </button>
              <button
                onClick={() => toggleAtivo(l)}
                disabled={busyId === l.id}
                className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 ${l.ativo ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" : "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"}`}
              >
                {busyId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : l.ativo ? <Ban className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {l.ativo ? "Revogar" : "Reativar"}
              </button>
            </li>
          ))}
        </ul>
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
