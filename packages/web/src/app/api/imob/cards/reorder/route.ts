import { NextRequest, NextResponse } from "next/server"
import { imobGuard } from "@web/lib/imob/guard"

// POST /api/imob/cards/reorder — persiste o resultado de um drag-and-drop. Story 75-88.
// Body: { columns: { [columnId]: string[] } } — para cada coluna afetada, a lista
// ORDENADA de card ids. Atualiza column_id + position(=index) de cada card.
export async function POST(req: NextRequest) {
  const g = await imobGuard()
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
          .from("imob_cards")
          .update({ column_id: columnId, position: index })
          .eq("id", cardId)
          .eq("org_id", appUser.org_id)
      )
    })
  }
  await Promise.all(updates)
  return NextResponse.json({ ok: true })
}
