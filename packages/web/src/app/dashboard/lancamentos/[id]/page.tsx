import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { STATUS_LABELS, STATUS_TONE, COR_HEX, type Lancamento } from "@web/lib/lancamentos/lancamentos"

// Épico Lançamentos — Story Lançamentos-02: stub do board de um lançamento.
// O Kanban real (listas + cartões + drag-drop, relocação do imob_*) entra na Story 3.
export const dynamic = "force-dynamic"

export default async function LancamentoBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "lancamentos"))) {
    redirect("/dashboard")
  }
  const { id } = await params

  const admin = createAdminClient()
  const { data } = await admin
    .from("lancamentos")
    .select("*, properties:property_interest_id(name)")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .maybeSingle()

  if (!data) notFound()
  const l = data as Lancamento & { properties?: { name: string | null } | null }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center gap-3" style={{ borderTop: `2px solid ${COR_HEX[l.cor] ?? COR_HEX.coral}`, paddingTop: 14 }}>
        <Link
          href="/dashboard/lancamentos"
          className="grid h-8 w-8 place-items-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </Link>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COR_HEX[l.cor] ?? COR_HEX.coral }} />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-white">{l.nome}</h1>
          {l.properties?.name && (
            <p className="text-sm text-stone-500 dark:text-stone-400">Empreendimento · {l.properties.name}</p>
          )}
        </div>
        <span className={`ml-2 inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_TONE[l.status]}`}>
          {STATUS_LABELS[l.status]}
        </span>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 py-24 text-center dark:border-stone-700">
        <p className="text-sm text-stone-500 dark:text-stone-400">
          O board Kanban deste lançamento será ativado na próxima etapa.
        </p>
      </div>
    </div>
  )
}
