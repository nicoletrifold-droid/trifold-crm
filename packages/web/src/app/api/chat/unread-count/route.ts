import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { canAccess } from "@web/lib/permissions"
import { createOrgScopedAdminClient } from "@web/lib/supabase/org-scoped-admin"
import { getChatUnreadCount } from "@web/lib/chat/unread-count"

// Story 75-223 — contagem viva do badge "Chat" (conversas de relacionamento
// não lidas). Mesmo gate do menu/página (canAccess "chat"); admin client pelo
// mesmo motivo do layout (RLS de conversations não libera a gerente-relacionamento).
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (!(await canAccess(auth.appUser.id, auth.appUser.org_id, "chat"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    // Story 900-15: client escopado. `conversations` recebe o filtro de org
    // automaticamente; `messages` não, porque não tem `org_id` (o isolamento dela é
    // via conversation_id) — e o proxy sabe a diferença pelo schema-snapshot.
    const db = createOrgScopedAdminClient(auth.appUser.org_id)
    const count = await getChatUnreadCount(db, auth.appUser.org_id)
    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ error: "unread_count_failed" }, { status: 500 })
  }
}
