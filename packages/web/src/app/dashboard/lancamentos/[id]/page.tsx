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
type CardRow = {
  id: string; column_id: string; title: string; description: string | null; position: number
  due_date: string | null; assignee_id: string | null; labels: string[] | null
  assignee: { name: string | null } | { name: string | null }[] | null
}

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
          .select("id, column_id, title, description, position, due_date, assignee_id, labels, assignee:users!assignee_id(name)")
          .in("column_id", colIds)
          .order("position", { ascending: true })
      ).data ?? []) as CardRow[])
    : []

  // Contadores de checklist/anexos por cartão (para os badges na face).
  const cardIds = cards.map((k) => k.id)
  const [{ data: chkRows }, { data: attRows }] = await Promise.all([
    cardIds.length
      ? admin.from("lancamento_card_checklist").select("card_id, done").in("card_id", cardIds)
      : Promise.resolve({ data: [] as { card_id: string; done: boolean }[] }),
    cardIds.length
      ? admin.from("lancamento_card_attachments").select("card_id").in("card_id", cardIds)
      : Promise.resolve({ data: [] as { card_id: string }[] }),
  ])
  const chkTotal = new Map<string, number>()
  const chkDone = new Map<string, number>()
  for (const r of (chkRows ?? []) as { card_id: string; done: boolean }[]) {
    chkTotal.set(r.card_id, (chkTotal.get(r.card_id) ?? 0) + 1)
    if (r.done) chkDone.set(r.card_id, (chkDone.get(r.card_id) ?? 0) + 1)
  }
  const attCount = new Map<string, number>()
  for (const r of (attRows ?? []) as { card_id: string }[]) {
    attCount.set(r.card_id, (attCount.get(r.card_id) ?? 0) + 1)
  }
  const { data: frnLinkRows } = cardIds.length
    ? await admin.from("lancamento_card_fornecedores").select("card_id").in("card_id", cardIds)
    : { data: [] as { card_id: string }[] }
  const frnCount = new Map<string, number>()
  for (const r of (frnLinkRows ?? []) as { card_id: string }[]) {
    frnCount.set(r.card_id, (frnCount.get(r.card_id) ?? 0) + 1)
  }
  // Lista de fornecedores da org (para o picker do cartão).
  const { data: frnRows } = await admin
    .from("fornecedores")
    .select("id, nome, categoria, status")
    .eq("org_id", user.orgId)
    .order("nome", { ascending: true })
  const fornecedores = (frnRows ?? []) as { id: string; nome: string; categoria: string | null; status: string }[]

  // Responsáveis possíveis: usuários internos (não-cliente) ativos.
  const { data: memberRows } = await admin
    .from("users")
    .select("id, name")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .neq("role", "cliente")
    .order("name", { ascending: true })
  const members = (memberRows ?? []) as { id: string; name: string }[]

  const columns: BoardColumn[] = cols.map((c) => ({
    id: c.id,
    title: c.title,
    cards: cards
      .filter((k) => k.column_id === c.id)
      .map((k) => ({
        id: k.id,
        title: k.title,
        description: k.description,
        due_date: k.due_date,
        assignee_id: k.assignee_id,
        assignee_name: (Array.isArray(k.assignee) ? k.assignee[0]?.name : k.assignee?.name) ?? null,
        labels: Array.isArray(k.labels) ? k.labels : [],
        checklist_total: chkTotal.get(k.id) ?? 0,
        checklist_done: chkDone.get(k.id) ?? 0,
        attachment_count: attCount.get(k.id) ?? 0,
        fornecedor_count: frnCount.get(k.id) ?? 0,
      })),
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

      <LancamentoBoard lancamentoId={id} initialColumns={columns} members={members} fornecedores={fornecedores} />
    </div>
  )
}
