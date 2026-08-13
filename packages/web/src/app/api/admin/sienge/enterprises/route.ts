import { NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { getEnterprises } from "@web/lib/integrations/sienge/client"


export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const roleError = await requireCapability(appUser, "obras.sienge_gerenciar")
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
