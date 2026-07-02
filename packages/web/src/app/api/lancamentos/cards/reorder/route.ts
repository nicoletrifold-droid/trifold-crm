import { NextRequest, NextResponse } from "next/server"
import { lancamentosGuard } from "@web/lib/lancamentos/guard"

// POST /api/lancamentos/cards/reorder — persiste o resultado de um drag-and-drop.
// Body: { columns: { [columnId]: string[] } } — lista ORDENADA de card ids por coluna afetada.
// Story Lançamentos-03.
export async function POST(req: NextRequest) {
  const g = await lancamentosGuard()
  if (g.error) return g.error
  const { admin, appUser } = g

  const body = (await req.json().catch(() => null)) as { columns?: Record<string, string[]> } | null
  const columns = body?.columns
  if (!columns || typeof columns !== "object") {
    return NextResponse.json({ error: "columns obrigatório" }, { status: 400 })
  }

  const updates: PromiseLike<unknown>[] = []
  for (const [columnId, cardIds] of Object.entries(columns)) {
    if (!Array.isArray(cardIds)) continue
    cardIds.forEach((cardId, index) => {
      updates.push(
        admin
          .from("lancamento_cards")
          .update({ column_id: columnId, position: index })
          .eq("id", cardId)
          .eq("org_id", appUser.org_id)
      )
    })
  }
  await Promise.all(updates)
  return NextResponse.json({ ok: true })
}
