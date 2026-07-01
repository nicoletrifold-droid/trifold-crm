import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { ImobBoard, type BoardColumn } from "./_components/imob-board"
import { ImobTabs } from "./_components/imob-tabs"

// Story 75-88 — Kanban IMOB (imobiliárias externas). Board único por org. Só admin/supervisor.
export const dynamic = "force-dynamic"

const DEFAULT_COLUMNS = ["A contatar", "Em negociação", "Visita agendada", "Fechado"]

export default async function ImobPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "imob"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()

  // Carrega colunas; semeia padrões na 1ª vez (board vazio).
  let { data: columns } = await admin
    .from("imob_columns")
    .select("id, title, position")
    .eq("org_id", user.orgId)
    .order("position", { ascending: true })

  if (!columns || columns.length === 0) {
    await admin.from("imob_columns").insert(
      DEFAULT_COLUMNS.map((title, i) => ({ org_id: user.orgId, title, position: i }))
    )
    const reload = await admin
      .from("imob_columns")
      .select("id, title, position")
      .eq("org_id", user.orgId)
      .order("position", { ascending: true })
    columns = reload.data
  }

  const colRows = (columns ?? []) as Array<{ id: string; title: string; position: number }>

  const { data: cards } = await admin
    .from("imob_cards")
    .select("id, column_id, title, description, position")
    .eq("org_id", user.orgId)
    .order("position", { ascending: true })
  const cardRows = (cards ?? []) as Array<{ id: string; column_id: string; title: string; description: string | null; position: number }>

  const initialColumns: BoardColumn[] = colRows.map((c) => ({
    id: c.id,
    title: c.title,
    cards: cardRows
      .filter((card) => card.column_id === c.id)
      .map((card) => ({ id: card.id, title: card.title, description: card.description })),
  }))

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Kanban — IMOB</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Imobiliárias externas — acompanhe a venda dos empreendimentos.
        </p>
      </div>
      <ImobTabs />
      <ImobBoard initialColumns={initialColumns} />
    </div>
  )
}
