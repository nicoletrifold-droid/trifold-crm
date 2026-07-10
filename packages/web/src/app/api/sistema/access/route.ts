import { NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"

/**
 * Capacidades do usuário na tela Sistema. `full` = acesso total (admin / módulo
 * `sistema`); sub-flags liberam cards específicos para quem tem só o sub-módulo
 * (ex.: supervisor com `sistema.notificacoes-financeiras`).
 */
export async function GET() {
  const user = await getServerUser()
  const [full, notificacoesFinanceiras] = await Promise.all([
    canAccess(user.id, user.orgId, "sistema"),
    canAccess(user.id, user.orgId, "sistema.notificacoes-financeiras"),
  ])
  return NextResponse.json({ full, notificacoesFinanceiras })
}
