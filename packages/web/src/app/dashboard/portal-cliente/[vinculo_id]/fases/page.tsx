import { redirect } from "next/navigation"
import { requireViewerAccess, getViewerVinculo } from "@web/lib/portal/viewer"
import { FasesList } from "@web/app/cliente/[obra_id]/_components/fases-list"

export default async function ViewerFasesPage({
  params,
}: {
  params: Promise<{ vinculo_id: string }>
}) {
  const { vinculo_id } = await params
  const { user, admin } = await requireViewerAccess()

  const ctx = await getViewerVinculo(admin, vinculo_id, user.orgId)
  if (!ctx) redirect("/dashboard/portal-cliente")
  const obra = ctx.obra

  const { data: fases } = await admin
    .from("obra_fases")
    .select("id, name, status, progress_pct, order_index, start_date, end_date")
    .eq("obra_id", obra.id)
    .order("order_index")

  const hideProgress = obra.name === "Yarden"

  return (
    <div>
      {!hideProgress && (
        <div className="mb-6 rounded-2xl border border-stone-800 bg-stone-900 p-5">
          <h2 className="mb-3 text-base font-semibold text-white">Cronograma da obra</h2>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-white/60">Progresso geral</span>
            <span className="font-semibold text-[#F27A5E]">{obra.progress_pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-stone-800">
            <div
              className="h-2 rounded-full bg-[#F27A5E] transition-all"
              style={{ width: `${obra.progress_pct}%` }}
            />
          </div>
        </div>
      )}

      <FasesList fases={fases ?? []} currentPhaseId={obra.current_phase_id} />
    </div>
  )
}
