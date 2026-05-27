import Link from "next/link"
import { redirect } from "next/navigation"
import { Bell, FileText, Camera } from "lucide-react"
import { createClient } from "@web/lib/supabase/server"
import { logout } from "@web/app/login/actions"
import { AnimatedProgressBar } from "./_components/animated-progress-bar"
import { ServicosSection } from "./_components/servicos-section"

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluída",
  pausada: "Pausada",
}

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
    rawMonth.replace(".", "").charAt(0).toUpperCase() +
    rawMonth.replace(".", "").slice(1)
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "Hoje"
  if (diffDays === 1) return "Ontem"
  if (diffDays < 7) return `${diffDays} dias atrás`
  return formatShortDate(dateStr)
}

type Atividade =
  | { tipo: "documento"; id: string; name: string; created_at: string }
  | { tipo: "foto"; id: string; name: string; created_at: string }

export default async function ObraPage({
  params,
}: {
  params: Promise<{ obra_id: string }>
}) {
  const { obra_id } = await params
  const supabase = await createClient()

  const { data: obra } = await supabase
    .from("obras")
    .select(
      "id, name, description, progress_pct, status, expected_delivery_date, current_phase_id"
    )
    .eq("id", obra_id)
    .single()

  if (!obra) redirect("/cliente/sem-obra")

  const [fasesRes, docsRes, fotosRes] = await Promise.all([
    supabase
      .from("obra_fases")
      .select(
        "id, name, description, status, progress_pct, order_index, start_date, end_date"
      )
      .eq("obra_id", obra_id)
      .order("order_index"),
    supabase
      .from("obra_documentos")
      .select("id, name, category, created_at")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("obra_fotos")
      .select("id, name, created_at, storage_path")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false })
      .limit(3),
  ])

  const fases = fasesRes.data ?? []
  const docs = docsRes.data ?? []
  const fotos = fotosRes.data ?? []

  // TAREFA 1 — Fase atual com lógica inteligente de data
  const now = new Date()
  let currentPhase: typeof fases[number] | null = null

  const fasesEmAndamento = fases.filter((f) => f.status === "em_andamento")
  if (fasesEmAndamento.length === 1) {
    currentPhase = fasesEmAndamento[0] ?? null
  } else if (fasesEmAndamento.length > 1) {
    // Pega a que tem end_date mais próximo de hoje (menor diferença positiva)
    const fasesComEndDate = fasesEmAndamento.filter((f) => f.end_date)
    if (fasesComEndDate.length > 0) {
      currentPhase = fasesComEndDate.reduce((best, f) => {
        const diffBest = Math.abs(new Date(best.end_date!).getTime() - now.getTime())
        const diffF = Math.abs(new Date(f.end_date!).getTime() - now.getTime())
        return diffF < diffBest ? f : best
      }) ?? null
    } else {
      currentPhase = fasesEmAndamento[0] ?? null
    }
  } else {
    // Nenhuma em andamento → fase com start_date mais próximo de hoje (prestes a iniciar)
    const fasesComStart = fases.filter(
      (f) => f.start_date && new Date(f.start_date) > now
    )
    if (fasesComStart.length > 0) {
      currentPhase = fasesComStart.reduce((best, f) => {
        const diffBest = Math.abs(new Date(best.start_date!).getTime() - now.getTime())
        const diffF = Math.abs(new Date(f.start_date!).getTime() - now.getTime())
        return diffF < diffBest ? f : best
      }) ?? null
    }
  }

  const statusLabel = STATUS_LABEL[obra.status] ?? obra.status

  const proximosMarcos = fases
    .flatMap((f) => {
      const items: { label: string; date: string }[] = []
      if (f.start_date && new Date(f.start_date) > now) {
        items.push({ label: `Início — ${f.name}`, date: f.start_date })
      }
      if (f.end_date && new Date(f.end_date) > now) {
        items.push({ label: `Conclusão — ${f.name}`, date: f.end_date })
      }
      return items
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 4)

  // TAREFA 3 — Mesclar documentos e fotos em atividades unificadas
  const atividadesDocumentos: Atividade[] = docs.map((d) => ({
    tipo: "documento",
    id: d.id,
    name: d.name,
    created_at: d.created_at,
  }))
  const atividadesFotos: Atividade[] = fotos.map((f) => ({
    tipo: "foto",
    id: f.id,
    name: f.name,
    created_at: f.created_at,
  }))
  const atividades: Atividade[] = [...atividadesDocumentos, ...atividadesFotos]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Mobile header */}
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs text-stone-500">Acompanhamento</p>
            <p className="text-sm font-semibold text-white">{obra.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/cliente/${obra_id}/notificacoes`}
              aria-label="Notificações"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:text-white"
            >
              <Bell className="h-5 w-5" />
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm text-stone-500 transition-colors hover:text-[#F27A5E]"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 lg:py-8">
        {/* Hero section — TAREFA 2: clicável → /fases */}
        <Link
          href={`/cliente/${obra_id}/fases`}
          className="mb-5 block cursor-pointer rounded-2xl border-l-4 border-l-[#F27A5E] bg-stone-900 p-6 ring-1 ring-inset ring-stone-800 transition-all hover:ring-[#F27A5E]/40 lg:p-8"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#F27A5E]">
            Sua Obra
          </p>
          <h1 className="mb-6 text-3xl font-bold text-white lg:text-4xl">
            {obra.name}
          </h1>
          <AnimatedProgressBar pct={obra.progress_pct} className="mb-2.5" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">
              Progresso geral:{" "}
              <span className="font-semibold text-[#F27A5E]">
                {obra.progress_pct}%
              </span>
            </span>
            <span className="text-white/60">
              Entrega prevista:{" "}
              <span className="font-medium text-white">
                {formatShortDate(obra.expected_delivery_date)}
              </span>
            </span>
          </div>
        </Link>

        {/* Stats cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* TAREFA 2: "Fase Atual" clicável */}
          <Link
            href={`/cliente/${obra_id}/fases`}
            className="cursor-pointer rounded-xl border border-stone-800 bg-stone-900 p-4 transition-all hover:ring-1 hover:ring-[#F27A5E]/40"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-500">
              Fase Atual
            </p>
            <p className="truncate text-[17px] font-bold text-white leading-tight">
              {currentPhase?.name ?? "—"}
            </p>
            {currentPhase?.end_date && (
              <p className="mt-1 text-xs font-medium text-white/60">
                Prev. conclusão: {formatShortDate(currentPhase.end_date)}
              </p>
            )}
            {!currentPhase?.end_date && currentPhase && (
              <p className="mt-1 text-xs font-medium text-white/60">
                {FASE_STATUS_LABEL[currentPhase.status] ?? currentPhase.status}
              </p>
            )}
          </Link>

          {/* Progresso — não clicável */}
          <StatCard
            label="Progresso"
            value={`${obra.progress_pct}%`}
            sub={obra.status === "em_andamento" ? "↑ No prazo" : statusLabel}
            subVariant={obra.status === "em_andamento" ? "success" : "muted"}
          />

          {/* "Etapa Atual" clicável */}
          <Link
            href={`/cliente/${obra_id}/fases`}
            className="cursor-pointer rounded-xl border border-stone-800 bg-stone-900 p-4 transition-all hover:ring-1 hover:ring-[#F27A5E]/40"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-500">
              Etapa Atual
            </p>
            <p className="line-clamp-2 text-sm font-bold text-white leading-snug">
              {currentPhase?.description ?? currentPhase?.name ?? statusLabel}
            </p>
            {currentPhase && (
              <div className="mt-1 space-y-0.5">
                <p className="truncate text-[10px] font-medium text-white/50 uppercase tracking-wide">
                  {currentPhase.name}
                </p>
                {currentPhase.end_date && (
                  <p className="text-[10px] font-medium text-[#F27A5E]">
                    Prev. {formatShortDate(currentPhase.end_date)}
                  </p>
                )}
              </div>
            )}
          </Link>

          {/* Entrega Prevista — não clicável */}
          <StatCard
            label="Entrega Prevista"
            value={formatShortDate(obra.expected_delivery_date)}
            sub="Previsão"
            subVariant="highlight"
          />
        </div>

        {/* Serviços */}
        <div className="mb-5">
          <ServicosSection obraId={obra_id} />
        </div>

        {/* Activities + milestones */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Atividades recentes — TAREFA 3 */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
            <h3 className="mb-4 text-sm font-semibold text-white">
              Atividades recentes
            </h3>
            {atividades.length === 0 ? (
              <p className="text-sm text-stone-500">Nenhuma atividade ainda.</p>
            ) : (
              <ul className="space-y-4">
                {atividades.map((ativ) => (
                  <li key={`${ativ.tipo}-${ativ.id}`}>
                    <Link
                      href={
                        ativ.tipo === "documento"
                          ? `/cliente/${obra_id}/documentos`
                          : `/cliente/${obra_id}/fotos`
                      }
                      className="flex items-start gap-3 rounded-lg px-2 -mx-2 transition-colors hover:bg-stone-800/50"
                    >
                      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#F27A5E]/15">
                        {ativ.tipo === "documento" ? (
                          <FileText className="h-4 w-4 text-[#F27A5E]" />
                        ) : (
                          <Camera className="h-4 w-4 text-[#F27A5E]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white leading-snug">
                          {ativ.tipo === "documento" ? "Documento" : "Foto"}{" "}
                          <span className="font-semibold text-white">
                            &ldquo;{ativ.name}&rdquo;
                          </span>{" "}
                          disponibilizado{ativ.tipo === "foto" ? "a" : ""}.
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {formatRelativeDate(ativ.created_at)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Próximos marcos */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
            <h3 className="mb-4 text-sm font-semibold text-white">
              Próximos marcos
            </h3>
            {proximosMarcos.length === 0 ? (
              <p className="text-sm text-stone-500">
                Nenhum marco próximo cadastrado.
              </p>
            ) : (
              <ul className="space-y-2">
                {proximosMarcos.map((marco, idx) => {
                  const borders = [
                    "border-l-[#F27A5E]",
                    "border-l-blue-500",
                    "border-l-green-500",
                    "border-l-purple-500",
                  ]
                  return (
                    <li
                      key={idx}
                      className={`rounded-lg border border-stone-800/60 border-l-4 bg-stone-950/50 px-4 py-3 ${borders[idx % borders.length]}`}
                    >
                      <p className="text-sm font-semibold text-white">
                        {marco.label}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {formatShortDate(marco.date)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  subVariant = "muted",
}: {
  label: string
  value: string
  sub: string
  subVariant?: "muted" | "highlight" | "success"
}) {
  const subClass =
    subVariant === "highlight"
      ? "text-[#F27A5E]"
      : subVariant === "success"
        ? "text-green-400"
        : "text-white/60"

  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900 p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-500">
        {label}
      </p>
      <p className="truncate text-[17px] font-bold text-white leading-tight">
        {value}
      </p>
      {sub && (
        <p className={`mt-1 text-xs font-medium ${subClass}`}>{sub}</p>
      )}
    </div>
  )
}
