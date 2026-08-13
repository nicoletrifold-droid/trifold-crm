"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Pencil, Plus, Trash2, Eye, FileText, Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { FotoUploadForm } from "./foto-upload-form"
import { FotoDeleteButton } from "./foto-delete-button"
import { FotoEditModal } from "./foto-edit-modal"
import { FotoExclusaoRequestModal } from "./foto-exclusao-request-modal"
import { DocUploadForm } from "./doc-upload-form"
import { DocDeleteButton } from "./doc-delete-button"
import { FaseCreateForm } from "./fase-create-form"
import { FaseEditModal } from "./fase-edit-modal"
import { AdminChatFeed } from "./admin-chat-feed"
import { ClientesTab } from "./clientes-tab"
import { AprovacoesTab, type AprovacaoItem } from "./aprovacoes-tab"
import { groupFotosByFaseOrder } from "@web/lib/obra-fotos-grouping"

interface Fase {
  id: string
  name: string
  description: string | null
  status: string
  progress_pct: number
  order_index: number
  start_date: string | null
  end_date: string | null
  expected_start_date: string | null
  expected_end_date: string | null
}

interface Foto {
  id: string
  storage_path: string
  caption: string | null
  taken_at: string | null
  fase_id: string | null
  created_at: string
}

interface Documento {
  id: string
  name: string
  filename: string
  category: string
  file_size_bytes: number | null
  created_at: string
  cliente_obra_id?: string | null
}

interface DocDestinatario {
  id: string
  label: string
}

interface Mensagem {
  id: string
  content: string | null
  message_type: string
  storage_path: string | null
  sender_type: string
  sender_display_name: string | null
  cliente_id: string | null
  created_at: string
}

interface Cliente {
  id: string
  clienteId: string
  name: string
  email: string
  cpf: string | null
  is_primary: boolean
  numero_unidade: string | null
  sienge_customer_id: number | null
  created_at?: string | null // data do vínculo (Story 75-211)
}

interface ObraDetailTabsProps {
  obraId: string
  adminName: string
  fases: Fase[]
  fotos: Foto[]
  documentos: Documento[]
  mensagens: Mensagem[]
  clientes: Cliente[]
  docDestinatarios?: DocDestinatario[]
  supabaseUrl: string
  userRole: string
  /** can("obras.aprovar_uploads") */
  canAprovarUploads: boolean
  /** can("obras.fotos_apagar") — botões de exclusão direta */
  canApagarDireto: boolean
  initialAprovacoes: AprovacaoItem[]
  initialTab?: string
}

type Tab = "fases" | "fotos" | "documentos" | "mensagens" | "clientes" | "aprovacoes"

const FASE_STATUS_BADGE: Record<string, string> = {
  pendente: "bg-gray-100 text-gray-600 dark:bg-stone-700/50 dark:text-stone-300",
  a_iniciar: "bg-gray-100 text-gray-600 dark:bg-stone-700/50 dark:text-stone-300",
  em_andamento: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  pausada: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  concluida: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
}

const FASE_STATUS_LABEL: Record<string, string> = {
  pendente: "PENDENTE",
  a_iniciar: "A INICIAR",
  em_andamento: "EM EXECUÇÃO",
  pausada: "PAUSADA",
  concluida: "CONCLUÍDA",
}

// Story 75-211 — busca insensível a acento/caixa
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

type DocSort = "recentes" | "antigos" | "nome"

const DOC_SORT_OPTIONS: { value: DocSort; label: string }[] = [
  { value: "recentes", label: "Mais recentes" },
  { value: "antigos", label: "Mais antigos" },
  { value: "nome", label: "Nome (A–Z)" },
]

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const STATUS_OPTIONS = [
  { value: "a_iniciar", label: "A iniciar" },
  { value: "em_andamento", label: "Em execução" },
  { value: "pausada", label: "Pausada" },
  { value: "concluida", label: "Concluída" },
]

const GROUP_COLORS = [
  { bubble: "bg-orange-500 text-white", header: "bg-orange-50", headerText: "text-orange-700", border: "border-orange-200", bars: ["bg-orange-500", "bg-orange-400", "bg-orange-600", "bg-orange-300"] },
  { bubble: "bg-blue-500 text-white", header: "bg-blue-50", headerText: "text-blue-700", border: "border-blue-200", bars: ["bg-blue-500", "bg-blue-400", "bg-blue-600", "bg-blue-300"] },
  { bubble: "bg-emerald-600 text-white", header: "bg-emerald-50", headerText: "text-emerald-700", border: "border-emerald-200", bars: ["bg-emerald-500", "bg-emerald-400", "bg-emerald-600", "bg-emerald-300"] },
  { bubble: "bg-purple-500 text-white", header: "bg-purple-50", headerText: "text-purple-700", border: "border-purple-200", bars: ["bg-purple-500", "bg-purple-400", "bg-purple-600", "bg-purple-300"] },
  { bubble: "bg-teal-500 text-white", header: "bg-teal-50", headerText: "text-teal-700", border: "border-teal-200", bars: ["bg-teal-500", "bg-teal-400", "bg-teal-600", "bg-teal-300"] },
  { bubble: "bg-rose-500 text-white", header: "bg-rose-50", headerText: "text-rose-700", border: "border-rose-200", bars: ["bg-rose-500", "bg-rose-400", "bg-rose-600", "bg-rose-300"] },
  { bubble: "bg-indigo-500 text-white", header: "bg-indigo-50", headerText: "text-indigo-700", border: "border-indigo-200", bars: ["bg-indigo-500", "bg-indigo-400", "bg-indigo-600", "bg-indigo-300"] },
  { bubble: "bg-amber-500 text-white", header: "bg-amber-50", headerText: "text-amber-700", border: "border-amber-200", bars: ["bg-amber-500", "bg-amber-400", "bg-amber-600", "bg-amber-300"] },
] as const

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function buildFaseGroups(fases: Fase[]): [string, Fase[]][] {
  const sorted = [...fases].sort((a, b) => {
    const aConc = a.status === "concluida"
    const bConc = b.status === "concluida"
    // Concluídas sempre no topo
    if (aConc !== bConc) return aConc ? -1 : 1
    if (aConc && bConc) {
      // Entre concluídas: a que terminou mais recentemente vem primeiro
      if (!a.end_date && !b.end_date) return 0
      if (!a.end_date) return 1
      if (!b.end_date) return -1
      return new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
    }
    // Entre não-concluídas: a que começa mais cedo vem primeiro
    if (!a.start_date && !b.start_date) return a.order_index - b.order_index
    if (!a.start_date) return 1
    if (!b.start_date) return -1
    return new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  })
  const groups: [string, Fase[]][] = []
  const idx = new Map<string, number>()
  for (const fase of sorted) {
    if (!idx.has(fase.name)) {
      idx.set(fase.name, groups.length)
      groups.push([fase.name, []])
    }
    groups[idx.get(fase.name)!]![1].push(fase)
  }
  return groups
}

function AddEtapaInlineForm({
  obraId,
  faseName,
  onDone,
}: {
  obraId: string
  faseName: string
  onDone: () => void
}) {
  const router = useRouter()
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("a_iniciar")
  const [progressPct, setProgressPct] = useState(0)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/fases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: faseName,
          description: description.trim() || null,
          status,
          progress_pct: progressPct,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? "Erro ao criar etapa")
      }
      router.refresh()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar etapa")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-100 bg-gray-50 p-4 dark:border-stone-800 dark:bg-stone-800/30">
      <div className="space-y-2">
        <div>
          <label className="mb-1 flex items-center gap-0.5 text-[11px] font-medium text-gray-500 dark:text-stone-400">
            Etapa <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            placeholder="Etapa"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            max={100}
            value={progressPct}
            placeholder="% progresso"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setProgressPct(Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0)
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          />
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-300">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving || !description.trim()}
          className="flex-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Adicionar"}
        </button>
      </div>
    </form>
  )
}

function FaseItem({
  fase,
  obraId,
  barColor = "bg-orange-500",
}: {
  fase: Fase
  obraId: string
  barColor?: string
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`Excluir a fase "${fase.name}"?`)) return
    try {
      const res = await fetch(
        `/api/admin/obras/${obraId}/fases/${fase.id}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao excluir")
      }
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao excluir fase")
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {fase.description && (
              <p className="truncate text-sm font-medium text-gray-800 dark:text-stone-200">
                {fase.description}
              </p>
            )}
            <span
              className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                FASE_STATUS_BADGE[fase.status] ?? "bg-gray-100 text-gray-600 dark:bg-stone-700/50 dark:text-stone-300"
              }`}
            >
              {FASE_STATUS_LABEL[fase.status] ?? fase.status.toUpperCase()}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-stone-700">
              <div
                className={`h-1.5 rounded-full transition-all ${barColor}`}
                style={{ width: `${fase.progress_pct ?? 0}%` }}
              />
            </div>
            <span className="w-8 flex-shrink-0 text-right text-xs text-gray-500 dark:text-stone-400">
              {fase.progress_pct ?? 0}%
            </span>
          </div>
          {(fase.start_date || fase.end_date) && (
            <p className="mt-1 text-xs text-gray-400 dark:text-stone-500">
              {fase.start_date ? formatDate(fase.start_date) : "—"}
              {" → "}
              {fase.end_date ? formatDate(fase.end_date) : "—"}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            onClick={() => setEditOpen(true)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-stone-500 dark:hover:bg-red-500/15 dark:hover:text-red-300"
            title="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {editOpen && (
        <FaseEditModal
          obraId={obraId}
          fase={fase}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  )
}

export function ObraDetailTabs({
  obraId,
  adminName,
  fases,
  fotos,
  documentos,
  mensagens,
  clientes,
  docDestinatarios = [],
  supabaseUrl,
  userRole,
  canAprovarUploads,
  canApagarDireto,
  initialAprovacoes,
  initialTab,
}: ObraDetailTabsProps) {
  // 75-308: decisões server-resolved via props (aba/fila = aprovar_uploads;
  // exclusão direta = fotos_apagar). mostraPendentes segue por role: é FLUXO
  // (quem envia vê os próprios pendentes), não autorização.
  // Story 75-176 — quem sobe via FILA DE APROVAÇÃO (não publica direto) vê os
  // próprios uploads pendentes/rejeitados inline nas abas Fotos/Documentos, com
  // selo "Aguardando aprovação". São os mesmos roles que caem na fila no upload:
  // `obras` E `gerente-relacionamento` (a Samara). Antes só cobria `obras`.
  const mostraPendentes = userRole === "obras" || userRole === "gerente-relacionamento"

  // Story 75-3: fotos publicadas agrupadas por fase, na sequência das fases (order_index).
  const fotoGroups = groupFotosByFaseOrder(fotos, fases)

  // Story 75-6: mapa vínculo → rótulo para o selo de destinatário dos documentos.
  const destinatarioLabel = new Map(docDestinatarios.map((d) => [d.id, d.label]))

  // initialTab vem da URL (?tab=aprovacoes) — validado contra o tipo Tab
  const validTabs: Tab[] = ["fases", "fotos", "documentos", "mensagens", "clientes", "aprovacoes"]
  const resolvedInitialTab: Tab =
    initialTab && validTabs.includes(initialTab as Tab)
      ? (initialTab as Tab)
      : "fases"

  const [tab, setTab] = useState<Tab>(resolvedInitialTab)
  const [aprovacoes, setAprovacoes] = useState<AprovacaoItem[]>(initialAprovacoes)

  // Story 75-228: o upload termina com router.refresh(), que re-renderiza o server
  // component e manda initialAprovacoes novo — mas este componente client continua
  // montado e o useState congela o array antigo (foto recém-enviada "sumia" até F5;
  // com zero fotos publicadas caía no empty state "Nenhuma foto ainda").
  // Sincroniza o estado sempre que a prop mudar; exclusões locais também chegam
  // frescas do servidor no refresh seguinte.
  useEffect(() => {
    setAprovacoes(initialAprovacoes)
  }, [initialAprovacoes])
  const [addingEtapaToGroup, setAddingEtapaToGroup] = useState<string | null>(null)

  // Documentos — visualização com signed URL
  const [viewingDocId, setViewingDocId] = useState<string | null>(null)
  const [viewErrorDoc, setViewErrorDoc] = useState<{ docId: string; message: string } | null>(null)

  // Story 75-211 — busca, categoria e ordenação dos documentos
  const [docBusca, setDocBusca] = useState("")
  const [docCategoria, setDocCategoria] = useState("")
  const [docSort, setDocSort] = useState<DocSort>("recentes")

  async function handleViewDoc(docId: string) {
    setViewingDocId(docId)
    setViewErrorDoc(null)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/documentos/${docId}/signed-url`)
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar link")
      window.open(data.url, "_blank")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar link"
      setViewErrorDoc({ docId, message })
      setTimeout(() => setViewErrorDoc(null), 4000)
    } finally {
      setViewingDocId(null)
    }
  }

  // Autor desfaz o próprio envio pendente (ou dispensa um rejeitado da tela).
  const [deletingAprovacaoId, setDeletingAprovacaoId] = useState<string | null>(null)

  async function handleDeleteAprovacao(item: AprovacaoItem) {
    const msg =
      item.tipo === "exclusao_foto"
        ? item.status === "pendente"
          ? "Cancelar o pedido de exclusão desta foto? A foto continua publicada."
          : "Remover este aviso da lista?"
        : item.status === "pendente"
          ? "Excluir este envio? Ele sai da fila de aprovação e o arquivo é descartado."
          : "Remover este item rejeitado da lista?"
    if (!window.confirm(msg)) return
    setDeletingAprovacaoId(item.id)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/aprovacoes/${item.id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Erro ao excluir envio")
      }
      setAprovacoes((prev) => prev.filter((i) => i.id !== item.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao excluir envio")
    } finally {
      setDeletingAprovacaoId(null)
    }
  }

  // Fotos — lightbox
  const [lightboxFoto, setLightboxFoto] = useState<Foto | null>(null)
  const [editingFoto, setEditingFoto] = useState<Foto | null>(null)
  const [excluindoFotoId, setExcluindoFotoId] = useState<string | null>(null)

  useEffect(() => {
    if (!lightboxFoto) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxFoto(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightboxFoto])

  // Uploads pendentes/rejeitados do role obras nas abas fotos/documentos.
  // 'exclusao_foto' (pedido de exclusão) entra no bloco de fotos para o autor
  // poder acompanhar/cancelar o pedido e ver o motivo se for recusado.
  const pendenteFotos = mostraPendentes
    ? aprovacoes.filter((a) => a.tipo === "foto" || a.tipo === "exclusao_foto")
    : []
  const pendenteDocumentos = mostraPendentes
    ? aprovacoes.filter((a) => a.tipo === "documento")
    : []

  // Story 75-211 — busca/categoria/ordenação aplicadas no cliente (volume pequeno).
  // Categorias do seletor = as que existem nos docs da obra (publicados + pendentes).
  const docCategorias = [
    ...new Set([
      ...documentos.map((d) => d.category).filter(Boolean),
      ...pendenteDocumentos
        .map((p) => (p.metadata as { category?: string }).category ?? "")
        .filter(Boolean),
    ]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"))

  const docQ = norm(docBusca.trim())
  const docFiltroAtivo = docQ.length > 0 || docCategoria !== ""

  const documentosVisiveis = documentos
    .filter((d) => {
      if (docCategoria && d.category !== docCategoria) return false
      if (!docQ) return true
      if (norm(d.name).includes(docQ)) return true
      if (norm(d.filename).includes(docQ)) return true
      const label = d.cliente_obra_id ? destinatarioLabel.get(d.cliente_obra_id) : null
      return !!label && norm(label).includes(docQ)
    })
    .sort((a, b) => {
      if (docSort === "nome") return a.name.localeCompare(b.name, "pt-BR")
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return docSort === "antigos" ? diff : -diff
    })

  const pendenteDocumentosVisiveis = pendenteDocumentos.filter((item) => {
    const meta = item.metadata as { name?: string; category?: string }
    if (docCategoria && (meta.category ?? "") !== docCategoria) return false
    if (!docQ) return true
    const nome = meta.name ?? item.storage_path.split("/").pop() ?? ""
    return norm(nome).includes(docQ)
  })

  const totalPendentes = aprovacoes.filter((a) => a.status === "pendente").length

  const tabs: { key: Tab; label: string }[] = [
    { key: "fases", label: `Fases (${fases.length})` },
    { key: "fotos", label: `Fotos (${fotos.length})` },
    { key: "documentos", label: `Documentos (${documentos.length})` },
    { key: "mensagens", label: "Mensagens" },
    { key: "clientes", label: `Clientes (${clientes.length})` },
    ...(canAprovarUploads
      ? [
          {
            key: "aprovacoes" as Tab,
            label: totalPendentes > 0 ? `Aprovações (${totalPendentes})` : "Aprovações",
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-stone-800 dark:bg-stone-800/50">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === key
                  ? "bg-white text-gray-900 shadow-sm dark:bg-stone-900 dark:text-stone-100"
                  : "text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Fases tab */}
      {tab === "fases" && (
        <div className="space-y-4">
          <FaseCreateForm obraId={obraId} />

          <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            {fases.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-stone-400">
                Nenhuma fase criada.
              </p>
            ) : (
              <div className="space-y-3">
                {buildFaseGroups(fases).map(([groupName, groupFases], groupIdx) => {
                  const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length]!
                  const isAdding = addingEtapaToGroup === groupName
                  return (
                    <div
                      key={groupName}
                      className={`overflow-hidden rounded-lg border ${color.border}`}
                    >
                      <div className={`flex items-center justify-between px-4 py-2.5 ${color.header}`}>
                        <span className={`text-sm font-semibold ${color.headerText}`}>
                          {groupName}
                        </span>
                        <div className="flex items-center gap-2">
                          {groupFases.length > 1 && (
                            <span className="text-xs text-gray-400 dark:text-stone-500">
                              {groupFases.length} etapas
                            </span>
                          )}
                          <button
                            onClick={() =>
                              setAddingEtapaToGroup(isAdding ? null : groupName)
                            }
                            className={`rounded-full p-1 ${color.headerText} hover:bg-black/10`}
                            title="Adicionar etapa"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="divide-y divide-gray-100 bg-white dark:divide-stone-800 dark:bg-stone-900">
                        {groupFases.map((fase, subIdx) => (
                          <FaseItem
                            key={fase.id}
                            fase={fase}
                            obraId={obraId}
                            barColor={color.bars[subIdx % color.bars.length]}
                          />
                        ))}
                        {isAdding && (
                          <AddEtapaInlineForm
                            obraId={obraId}
                            faseName={groupName}
                            onDone={() => setAddingEtapaToGroup(null)}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Fotos tab */}
      {tab === "fotos" && (
        <div className="space-y-6">
          <FotoUploadForm obraId={obraId} fases={fases} />

          <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
              Fotos ({fotos.length + (mostraPendentes ? pendenteFotos.length : 0)})
            </h2>
            {fotos.length === 0 && pendenteFotos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm text-gray-500 dark:text-stone-400">Nenhuma foto ainda.</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-stone-500">
                  Use o formulário acima para adicionar fotos.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Fotos pendentes/rejeitadas do autor PRIMEIRO (Story 75-228: acima da dobra) */}
                {mostraPendentes && pendenteFotos.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
                      Aguardando aprovação
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {pendenteFotos.map((item) => {
                  const isPendente = item.status === "pendente"
                  const isRejeitado = item.status === "rejeitado"
                  const isExclusao = item.tipo === "exclusao_foto"
                  const meta = item.metadata as { caption?: string }
                  return (
                    <div
                      key={item.id}
                      className={`relative overflow-hidden rounded-lg border ${
                        isPendente
                          ? "border-yellow-300 dark:border-yellow-700/50"
                          : "border-red-300 dark:border-red-700/50"
                      }`}
                    >
                      <div className={`relative aspect-square w-full bg-gray-100 dark:bg-stone-800 ${isPendente ? "opacity-50" : "opacity-40"}`}>
                        {item.signed_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.signed_url}
                            alt={meta.caption ?? "Foto pendente"}
                            className={`h-full w-full object-cover ${isRejeitado ? "grayscale" : ""}`}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <span className="text-xs text-gray-400 dark:text-stone-500">Sem preview</span>
                          </div>
                        )}
                        {/* Badge de status */}
                        <span
                          className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            isPendente
                              ? "bg-yellow-400/90 text-yellow-900"
                              : "bg-red-500/90 text-white"
                          }`}
                        >
                          {isExclusao
                            ? isPendente
                              ? "Exclusão solicitada"
                              : "Exclusão recusada"
                            : isPendente
                              ? "Aguardando aprovação"
                              : "Rejeitado"}
                        </span>
                      </div>
                      {meta.caption && (
                        <p className="truncate px-2 py-1.5 text-xs text-gray-700 dark:text-stone-300">
                          {meta.caption}
                        </p>
                      )}
                      {isRejeitado && item.motivo_rejeicao && (
                        <p className="px-2 pb-1.5 text-[10px] text-red-600 dark:text-red-400">
                          Motivo: {item.motivo_rejeicao}
                        </p>
                      )}
                      <div className="flex items-center justify-end gap-1 border-t border-gray-100 px-1 py-1 dark:border-stone-800">
                        {item.signed_url && (
                          <button
                            onClick={() => window.open(item.signed_url!, "_blank")}
                            className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                            title="Visualizar foto"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAprovacao(item)}
                          disabled={deletingAprovacaoId === item.id}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          title={
                            isExclusao
                              ? isPendente
                                ? "Cancelar pedido de exclusão"
                                : "Remover aviso"
                              : isPendente
                                ? "Excluir envio"
                                : "Remover da lista"
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                    </div>
                  </div>
                )}
                {/* Fotos publicadas, agrupadas por fase na sequência das fases (Story 75-3) */}
                {fotoGroups.map((group) => (
                  <div key={group.faseId ?? "sem-fase"}>
                    <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
                      {group.faseName}
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium normal-case text-gray-600 dark:bg-stone-800 dark:text-stone-300">
                        {group.fotos.length}
                      </span>
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {group.fotos.map((foto) => {
                  const url = `${supabaseUrl}/storage/v1/object/public/obra-fotos/${foto.storage_path}`
                  return (
                    <div
                      key={foto.id}
                      className="group relative cursor-pointer overflow-hidden rounded-lg border border-gray-200 dark:border-stone-800"
                      onClick={() => setLightboxFoto(foto)}
                    >
                      <div className="relative aspect-square w-full bg-gray-100 dark:bg-stone-800">
                        <Image
                          src={url}
                          alt={foto.caption ?? "Foto da obra"}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                        {/* Story 75-13 — editar legenda/fase (livre p/ todos os perfis) */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingFoto(foto) }}
                          title="Editar foto"
                          aria-label="Editar foto"
                          className="absolute left-1.5 top-1.5 z-10 rounded-full bg-black/55 p-1.5 text-white hover:bg-black/75"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {/* Botão de exclusão apenas para admin/supervisor (direto) */}
                        {canApagarDireto && (
                          <FotoDeleteButton obraId={obraId} fotoId={foto.id} />
                        )}
                        {/* Story 75-14 — obras solicita exclusão (com motivo → aprovação) */}
                        {mostraPendentes && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExcluindoFotoId(foto.id) }}
                            title="Solicitar exclusão"
                            aria-label="Solicitar exclusão"
                            className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/55 p-1.5 text-white hover:bg-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {foto.caption && (
                        <p className="truncate px-2 py-1.5 text-xs text-gray-700 dark:text-stone-300">
                          {foto.caption}
                        </p>
                      )}
                    </div>
                  )
                })}
                    </div>
                  </div>
                ))}

              </div>
            )}
          </section>
        </div>
      )}

      {/* Documentos tab */}
      {tab === "documentos" && (
        <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
              Adicionar documento
            </h2>
            <DocUploadForm obraId={obraId} destinatarios={docDestinatarios} />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
              Documentos (
              {docFiltroAtivo
                ? `${documentosVisiveis.length + pendenteDocumentosVisiveis.length} de ${
                    documentos.length + pendenteDocumentos.length
                  }`
                : documentos.length + pendenteDocumentos.length}
              )
            </h2>
            {/* Story 75-211 — busca + categoria + ordenação */}
            {(documentos.length > 0 || pendenteDocumentos.length > 0) && (
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-stone-500" />
                  <input
                    type="text"
                    placeholder="Buscar por nome do documento ou destinatário..."
                    value={docBusca}
                    onChange={(e) => setDocBusca(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-8 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                  />
                  {docBusca && (
                    <button
                      type="button"
                      onClick={() => setDocBusca("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:text-stone-500 dark:hover:text-stone-300"
                      title="Limpar busca"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <select
                  value={docCategoria}
                  onChange={(e) => setDocCategoria(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  title="Filtrar por categoria"
                >
                  <option value="">Todas as categorias</option>
                  {docCategorias.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <select
                  value={docSort}
                  onChange={(e) => setDocSort(e.target.value as DocSort)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  title="Ordenar por"
                >
                  {DOC_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {documentos.length === 0 && pendenteDocumentos.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-stone-400">
                Nenhum documento enviado ainda.
              </p>
            ) : documentosVisiveis.length === 0 && pendenteDocumentosVisiveis.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-stone-400">
                Nenhum documento encontrado para o filtro.
              </p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-stone-800">
                {/* Documentos publicados */}
                {documentosVisiveis.map((doc) => (
                  <div key={doc.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-stone-100">
                          {doc.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-stone-400">
                          {doc.category} · {formatBytes(doc.file_size_bytes)} ·{" "}
                          {formatDate(doc.created_at)}
                        </p>
                        {/* Story 75-6: destinatário (geral x exclusivo) */}
                        {doc.cliente_obra_id ? (
                          <span className="mt-1 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                            Exclusivo: {destinatarioLabel.get(doc.cliente_obra_id) ?? "cliente/unidade"}
                          </span>
                        ) : (
                          <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-stone-700/50 dark:text-stone-400">
                            Geral
                          </span>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button
                          onClick={() => handleViewDoc(doc.id)}
                          disabled={viewingDocId === doc.id}
                          className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                          title="Visualizar documento"
                        >
                          {viewingDocId === doc.id ? (
                            <span className="block h-4 w-4 animate-pulse rounded-full bg-gray-300 dark:bg-stone-600" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                        {/* Botão de exclusão apenas para admin/supervisor */}
                        {canApagarDireto && (
                          <DocDeleteButton obraId={obraId} docId={doc.id} />
                        )}
                      </div>
                    </div>
                    {viewErrorDoc?.docId === doc.id && (
                      <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                        {viewErrorDoc.message}
                      </p>
                    )}
                  </div>
                ))}

                {/* Documentos pendentes/rejeitados do próprio usuário obras */}
                {mostraPendentes && pendenteDocumentosVisiveis.map((item) => {
                  const isPendente = item.status === "pendente"
                  const isRejeitado = item.status === "rejeitado"
                  const meta = item.metadata as {
                    name?: string
                    category?: string
                    file_size_bytes?: number
                    cliente_obra_id?: string | null
                  }
                  return (
                    <div key={item.id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className={`min-w-0 flex-1 ${isPendente ? "opacity-60" : "opacity-50"}`}>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-stone-500" />
                            <p className={`truncate text-sm font-medium ${isRejeitado ? "line-through text-gray-500 dark:text-stone-500" : "text-gray-900 dark:text-stone-100"}`}>
                              {meta.name ?? item.storage_path.split("/").pop()}
                            </p>
                            <span
                              className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                isPendente
                                  ? "bg-yellow-400/90 text-yellow-900"
                                  : "bg-red-500/90 text-white"
                              }`}
                            >
                              {isPendente ? "Aguardando aprovação" : "Rejeitado"}
                            </span>
                          </div>
                          {meta.category && (
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-stone-400">
                              {meta.category} · {formatBytes(meta.file_size_bytes ?? null)}
                            </p>
                          )}
                          {/* Destinatário (geral x exclusivo) — mesmo selo dos publicados */}
                          {meta.cliente_obra_id ? (
                            <span className="mt-1 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                              Exclusivo: {destinatarioLabel.get(meta.cliente_obra_id) ?? "cliente/unidade"}
                            </span>
                          ) : (
                            <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-stone-700/50 dark:text-stone-400">
                              Geral
                            </span>
                          )}
                          {isRejeitado && item.motivo_rejeicao && (
                            <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">
                              Motivo: {item.motivo_rejeicao}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1">
                          {item.signed_url && (
                            <button
                              onClick={() => window.open(item.signed_url!, "_blank")}
                              className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                              title="Visualizar documento"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteAprovacao(item)}
                            disabled={deletingAprovacaoId === item.id}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                            title={isPendente ? "Excluir envio" : "Remover da lista"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Mensagens tab */}
      {tab === "mensagens" && (
        <div className="h-[560px] overflow-hidden rounded-lg border border-gray-200 dark:border-stone-800">
          <AdminChatFeed
            obraId={obraId}
            adminName={adminName}
            clientes={clientes.map((c) => ({ id: c.id, name: c.name }))}
            initialMensagens={mensagens}
          />
        </div>
      )}

      {/* Clientes tab */}
      {tab === "clientes" && (
        <ClientesTab obraId={obraId} clientes={clientes} />
      )}

      {/* Aprovações tab — apenas admin/supervisor */}
      {tab === "aprovacoes" && canAprovarUploads && (
        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
            Uploads aguardando aprovação
          </h2>
          <AprovacoesTab obraId={obraId} items={aprovacoes} setItems={setAprovacoes} />
        </section>
      )}

      {/* Lightbox de fotos */}
      {lightboxFoto && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxFoto(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${supabaseUrl}/storage/v1/object/public/obra-fotos/${lightboxFoto.storage_path}`}
            alt={lightboxFoto.caption ?? "Foto da obra"}
            className="max-h-[90vh] max-w-[90vw] rounded object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {lightboxFoto.caption && (
            <p className="mt-3 text-sm text-white/80">{lightboxFoto.caption}</p>
          )}
        </div>
      )}

      {/* Story 75-13 — modal de edição de foto (legenda + fase) */}
      {editingFoto && (
        <FotoEditModal
          obraId={obraId}
          foto={{ id: editingFoto.id, caption: editingFoto.caption ?? null, fase_id: editingFoto.fase_id ?? null }}
          fases={fases.map((f) => ({ id: f.id, name: f.name }))}
          onClose={() => setEditingFoto(null)}
        />
      )}

      {/* Story 75-14 — modal de pedido de exclusão (perfil obras) */}
      {excluindoFotoId && (
        <FotoExclusaoRequestModal
          obraId={obraId}
          fotoId={excluindoFotoId}
          onClose={() => setExcluindoFotoId(null)}
        />
      )}
    </div>
  )
}
