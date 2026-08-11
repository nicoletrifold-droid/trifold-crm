import "server-only"

import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"

// Módulo FVS (Story 75-293) — guard das rotas do módulo "Vistorias":
// autenticado + acesso ao módulo "fvs" pela matriz de Perfil de Acesso.
// As tabelas fvs_* têm RLS sem policy → acesso só via admin client, então este
// gate é a fronteira de segurança. Espelha o lancamentosGuard / imobGuard.
export async function fvsGuard() {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error as Response }

  const allowed = await canAccess(auth.appUser.id, auth.appUser.org_id, "fvs")
  if (!allowed) {
    return {
      error: NextResponse.json({ error: "Sem acesso ao módulo Vistorias" }, { status: 403 }) as unknown as Response,
    }
  }
  return { admin: createAdminClient(), appUser: auth.appUser }
}
