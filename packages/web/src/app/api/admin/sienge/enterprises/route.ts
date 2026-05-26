import { NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { getEnterprises } from "@web/lib/integrations/sienge/client"

const ALLOWED_ROLES = ["admin", "supervisor"]

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const roleError = requireRole(appUser, ALLOWED_ROLES)
  if (roleError) return roleError

  try {
    const enterprises = await getEnterprises()
    return NextResponse.json({ enterprises })
  } catch (err) {
    console.error(
      "[admin/sienge/enterprises] erro ao listar:",
      err instanceof Error ? err.message : err
    )
    return NextResponse.json(
      { error: "sienge_unavailable" },
      { status: 502 }
    )
  }
}
