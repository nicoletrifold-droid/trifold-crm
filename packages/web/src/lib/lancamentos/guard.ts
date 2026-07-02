import "server-only"

import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"

// Épico Lançamentos (Story Lançamentos-01) — guard das rotas do módulo "Lançamentos":
// autenticado + acesso ao módulo "lancamentos" pela matriz de Perfil de Acesso.
// As tabelas lancamento_* (stories seguintes) terão RLS sem policy → acesso só via
// admin client, então este gate é a fronteira de segurança. Espelha o imobGuard.
export async function lancamentosGuard() {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error as Response }

  const allowed = await canAccess(auth.appUser.id, auth.appUser.org_id, "lancamentos")
  if (!allowed) {
    return {
      error: NextResponse.json({ error: "Sem acesso ao módulo Lançamentos" }, { status: 403 }) as unknown as Response,
    }
  }
  return { admin: createAdminClient(), appUser: auth.appUser }
}
