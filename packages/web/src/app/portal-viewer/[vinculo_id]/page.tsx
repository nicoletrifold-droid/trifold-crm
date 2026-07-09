import { redirect } from "next/navigation"
import { FileText, Camera } from "lucide-react"
import { requireViewerAccess, getViewerVinculo } from "@web/lib/portal/viewer"
import { AnimatedProgressBar } from "@web/app/cliente/[obra_id]/_components/animated-progress-bar"

const FASE_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  const day = d.getUTCDate().toString().padStart(2, "0")
  const rawMonth = d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
  const month =
    rawMonth.replace(".", "").charAt(0).toUpperCase() + rawMonth.replace(".", "").slice(1)
  return `${day}/${month}/${d.getUTCFullYear()}`
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr)
  const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "Hoje"
  if (diffDays === 1) return "Ontem"
  if (diffDays < 7) return `${diffDays} dias atrás`
  return formatShortDate(dateStr)
}

interface Fase {
  id: string
  name: string
  description: string | null
  status: string
  start_date: string | null
  end_date: string | null
}

export default async function ViewerInicioPage({
  params,
}: {
  params: Promise<{ vinculo_id: string }>
}) {
  const { vinculo_id } = await params
  const { user, admin } = await requireViewerAccess()

  const ctx = await getViewerVinculo(admin, vinculo_id, user.orgId)
  if (!ctx) redirect("/dashboard/portal-cliente")
  const obra = ctx.obra

  const [fasesRes, docsRes, fotosRes] = await Promise.all([
    admin
      .from("obra_fases")
      .select("id, name, description, status, start_date, end_date")
      .eq("obra_id", obra.id)
      .order("order_index"),
    admin
      .from("obra_documentos")
      .select("id, name, created_at")
      .eq("obra_id", obra.id)
      .order("created_at", { ascending: false })
      .limit(3),
    admin
      .from("obra_fotos")
      .select("id, caption, created_at")
      .eq("obra_id", obra.id)
      .order("created_at", { ascending: false })
      .limit(3),
  ])

  const fases = (fasesRes.data ?? []) as Fase[]
  const docs = docsRes.data ?? []
  const fotos = fotosRes.data ?? []

  const now = new Date()
  const emAndamento = fases.filter((f) => f.status === "em_andamento")
  const currentPhase: Fase | null =
    emAndamento[0] ??
    fases.find((f) => f.start_date && new Date(f.start_date) > now) ??
    null

  // Story 75-1: obra Yarden não exibe % de progresso.
  const hideProgress = obra.name === "Yarden"

  const atividades = [
    ...docs.map((d) => ({ tipo: "documento" as const, id: d.id, name: d.name, created_at: d.created_at })),
    ...fotos.map((f) => ({ tipo: "foto" as const, id: f.id, name: f.caption ?? "Foto", created_at: f.created_at })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  return (
    <div>
      {/* Hero */}
      <div className="mb-5 rounded-2xl border-l-4 border-l-[#F27A5E] bg-stone-900 p-6 ring-1 ring-inset ring-stone-800 lg:p-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#F27A5E]">
          Sua Obra
        </p>
        <h1 className="mb-6 text-3xl font-bold text-white lg:text-4xl">{obra.name}</h1>
        {!hideProgress && <AnimatedProgressBar pct={obra.progress_pct} className="mb-2.5" />}
        <div className={`flex items-center text-sm ${hideProgress ? "justify-end" : "justify-between"}`}>
          {!hideProgress && (
            <span className="text-white/60">
              Progresso geral:{" "}
              <span className="font-semibold text-[#F27A5E]">{obra.progress_pct}%</span>
            </span>
          )}
          <span className="text-white/60">
            Entrega prevista:{" "}
            <span className="font-medium text-white">
              {formatShortDate(obra.expected_delivery_date)}
            </span>
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-500">
            Fase Atual
          </p>
          <p className="truncate text-[17px] font-bold leading-tight text-white">
            {currentPhase?.name ?? "—"}
          </p>
          {currentPhase && (
            <p className="mt-1 text-xs font-medium text-white/60">
              {FASE_STATUS_LABEL[currentPhase.status] ?? currentPhase.status}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-500">
            Etapa Atual
          </p>
          <p className="line-clamp-2 text-sm font-bold leading-snug text-white">
            {currentPhase?.description ?? currentPhase?.name ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-500">
            Entrega Prevista
          </p>
          <p className="truncate text-[17px] font-bold leading-tight text-white">
            {formatShortDate(obra.expected_delivery_date)}
          </p>
          <p className="mt-1 text-xs font-medium text-[#F27A5E]">Previsão</p>
        </div>
      </div>

      {/* Atividades recentes */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">Atividades recentes</h3>
        {atividades.length === 0 ? (
          <p className="text-sm text-stone-500">Nenhuma atividade ainda.</p>
        ) : (
          <ul className="space-y-4">
            {atividades.map((ativ) => (
              <li key={`${ativ.tipo}-${ativ.id}`} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#F27A5E]/15">
                  {ativ.tipo === "documento" ? (
                    <FileText className="h-4 w-4 text-[#F27A5E]" />
                  ) : (
                    <Camera className="h-4 w-4 text-[#F27A5E]" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm leading-snug text-white">
                    {ativ.tipo === "documento" ? "Documento" : "Foto"}{" "}
                    <span className="font-semibold">&ldquo;{ativ.name}&rdquo;</span>{" "}
                    disponibilizado{ativ.tipo === "foto" ? "a" : ""}.
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {formatRelativeDate(ativ.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
