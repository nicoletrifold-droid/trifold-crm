import Link from "next/link"
import { redirect } from "next/navigation"
import { Bell, FileText } from "lucide-react"
import { createClient } from "@web/lib/supabase/server"
import { logout } from "@web/app/login/actions"
import { AnimatedProgressBar } from "./_components/animated-progress-bar"

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

  const [fasesRes, docsRes] = await Promise.all([
    supabase
      .from("obra_fases")
      .select(
        "id, name, status, progress_pct, order_index, start_date, end_date"
      )
      .eq("obra_id", obra_id)
      .order("order_index"),
    supabase
      .from("obra_documentos")
      .select("id, name, category, created_at")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  const fases = fasesRes.data ?? []
  const docs = docsRes.data ?? []

  const currentPhase = obra.current_phase_id
    ? fases.find((f) => f.id === obra.current_phase_id)
    : null

  const statusLabel = STATUS_LABEL[obra.status] ?? obra.status

  const now = new Date()
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
        {/* Hero section */}
        <div className="mb-5 rounded-2xl border-l-4 border-l-[#F27A5E] bg-stone-900 p-6 ring-1 ring-inset ring-stone-800 lg:p-8">
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
        </div>

        {/* Stats cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Fase Atual"
            value={currentPhase?.name ?? "—"}
            sub={currentPhase ? (FASE_STATUS_LABEL[currentPhase.status] ?? currentPhase.status) : ""}
          />
          <StatCard
            label="Progresso"
            value={`${obra.progress_pct}%`}
            sub={obra.status === "em_andamento" ? "↑ No prazo" : statusLabel}
            subVariant={obra.status === "em_andamento" ? "success" : "muted"}
          />
          <StatCard
            label="Fase da Obra"
            value={currentPhase?.name ?? statusLabel}
            sub={currentPhase?.status === "em_andamento" ? "Em execução" : (FASE_STATUS_LABEL[currentPhase?.status ?? ""] ?? "")}
          />
          <StatCard
            label="Entrega Prevista"
            value={formatShortDate(obra.expected_delivery_date)}
            sub="Previsão"
            subVariant="highlight"
          />
        </div>

        {/* Activities + milestones */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Atividades recentes */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5">
            <h3 className="mb-4 text-sm font-semibold text-white">
              Atividades recentes
            </h3>
            {docs.length === 0 ? (
              <p className="text-sm text-stone-500">Nenhuma atividade ainda.</p>
            ) : (
              <ul className="space-y-4">
                {docs.map((doc) => (
                  <li key={doc.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#F27A5E]/15">
                      <FileText className="h-4 w-4 text-[#F27A5E]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white leading-snug">
                        Documento{" "}
                        <span className="font-semibold text-white">
                          &ldquo;{doc.name}&rdquo;
                        </span>{" "}
                        disponibilizado.
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {formatRelativeDate(doc.created_at)}
                      </p>
                    </div>
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
