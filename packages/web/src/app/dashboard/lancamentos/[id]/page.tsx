import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"
import { STATUS_LABELS, STATUS_TONE, COR_HEX, type Lancamento } from "@web/lib/lancamentos/lancamentos"
import { LancamentoBoard, type BoardColumn } from "../_components/lancamento-board"

// Épico Lançamentos — Story Lançamentos-03: board Kanban de um lançamento (listas + cartões + drag + comentários).
export const dynamic = "force-dynamic"

const DEFAULT_LISTS = ["Backlog", "A fazer", "Em andamento", "Aprovação", "Concluído"]

type ColRow = { id: string; title: string; position: number }
type CardRow = { id: string; column_id: string; title: string; description: string | null; position: number }

export default async function LancamentoBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "lancamentos"))) {
    redirect("/dashboard")
  }
  const { id } = await params
  const admin = createAdminClient()

  const { data: lancData } = await admin
    .from("lancamentos")
    .select("*, properties:property_interest_id(name)")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .maybeSingle()
  if (!lancData) notFound()
  const l = lancData as Lancamento & { properties?: { name: string | null } | null }

  // Colunas do board — semeia as listas padrão no 1º acesso (board vazio).
  let cols = ((
    await admin
      .from("lancamento_columns")
      .select("id, title, position")
      .eq("lancamento_id", id)
      .eq("org_id", user.orgId)
      .order("position", { ascending: true })
  ).data ?? []) as ColRow[]

  if (cols.length === 0) {
    const { data: seeded } = await admin
      .from("lancamento_columns")
      .insert(DEFAULT_LISTS.map((title, position) => ({ org_id: user.orgId, lancamento_id: id, title, position })))
      .select("id, title, position")
    cols = ((seeded ?? []) as ColRow[]).sort((a, b) => a.position - b.position)
  }

  const colIds = cols.map((c) => c.id)
  const cards = colIds.length
    ? (((
        await admin
          .from("lancamento_cards")
          .select("id, column_id, title, description, position")
          .in("column_id", colIds)
          .order("position", { ascending: true })
      ).data ?? []) as CardRow[])
    : []

  const columns: BoardColumn[] = cols.map((c) => ({
    id: c.id,
    title: c.title,
    cards: cards
      .filter((k) => k.column_id === c.id)
      .map((k) => ({ id: k.id, title: k.title, description: k.description })),
  }))

  const cor = COR_HEX[l.cor] ?? COR_HEX.coral

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-3" style={{ borderTop: `2px solid ${cor}`, paddingTop: 14 }}>
        <Link
          href="/dashboard/lancamentos"
          className="grid h-8 w-8 place-items-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </Link>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cor }} />
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

      <LancamentoBoard lancamentoId={id} initialColumns={columns} />
    </div>
  )
}
