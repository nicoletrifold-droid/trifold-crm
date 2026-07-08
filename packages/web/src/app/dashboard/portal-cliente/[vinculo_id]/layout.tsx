import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, Eye } from "lucide-react"
import { requireViewerAccess, getViewerVinculo } from "@web/lib/portal/viewer"
import { ViewerTabNav } from "./_components/viewer-tab-nav"

// Story 78-1 — shell do viewer "ver como cliente". Gate admin/supervisor + visual dark
// (fidelidade ao portal real, sem herdar o tema do dashboard). Somente leitura.
export default async function PortalViewerLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ vinculo_id: string }>
}) {
  const { vinculo_id } = await params
  const { user, admin } = await requireViewerAccess()

  const ctx = await getViewerVinculo(admin, vinculo_id, user.orgId)
  if (!ctx) redirect("/dashboard/portal-cliente")

  const unidadeLabel = ctx.numeroUnidade ? `Unidade ${ctx.numeroUnidade}` : ctx.obra.name

  return (
    <div className="rounded-2xl bg-stone-950 p-4 ring-1 ring-stone-800 lg:p-6">
      {/* Barra de modo visualização */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F27A5E]/30 bg-[#F27A5E]/10 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-[#F27A5E]" />
          <span className="text-stone-300">
            Visualizando como cliente
            {ctx.clienteNome ? (
              <>
                {" — "}
                <span className="font-semibold text-white">{ctx.clienteNome}</span>
              </>
            ) : null}
            <span className="text-stone-500">
              {" "}
              · {ctx.obra.name} · {unidadeLabel}
            </span>
          </span>
        </div>
        <Link
          href="/dashboard/portal-cliente"
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-300 transition-colors hover:bg-stone-800 hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Voltar ao painel
        </Link>
      </div>

      <ViewerTabNav vinculoId={vinculo_id} />

      {children}
    </div>
  )
}
