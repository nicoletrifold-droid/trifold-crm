import { NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { getAuthUrl } from "@web/lib/google"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const forbidden = await requireCapability(appUser, "configuracoes.integracoes_gerenciar")
  if (forbidden) return forbidden

  const url = getAuthUrl()
  return NextResponse.redirect(url)
}
