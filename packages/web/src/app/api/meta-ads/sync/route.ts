import { NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function POST() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const roleError = requireRole(auth.appUser, ["admin"])
  if (roleError) return roleError

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  const cronUrl = `${base}/api/cron/meta-sync-entities`

  // Fire-and-forget — retorna imediatamente sem aguardar conclusão do sync
  fetch(cronUrl, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    signal: AbortSignal.timeout(5000),
  }).catch(() => {})

  return NextResponse.json({ triggered: true })
}
