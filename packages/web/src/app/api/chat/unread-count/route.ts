import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { canAccess } from "@web/lib/permissions"
import { createAdminClient } from "@web/lib/supabase/admin"
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
    const count = await getChatUnreadCount(createAdminClient(), auth.appUser.org_id)
    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ error: "unread_count_failed" }, { status: 500 })
  }
}
