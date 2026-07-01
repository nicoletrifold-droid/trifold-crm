import "server-only"

import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"

// Story 75-88 / 75-93 — guard das rotas do módulo IMOB: autenticado + acesso ao módulo "imob"
// pela matriz de Perfil de Acesso (Story 75-93 — antes era role fixo admin/supervisor).
// As tabelas imob_* têm RLS sem policy → acesso só via admin client, por isso o gate aqui
// é a fronteira de segurança.
export async function imobGuard() {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error as Response }

  const allowed = await canAccess(auth.appUser.id, auth.appUser.org_id, "imob")
  if (!allowed) {
    return {
      error: NextResponse.json({ error: "Sem acesso ao módulo IMOB" }, { status: 403 }) as unknown as Response,
    }
  }
  return { admin: createAdminClient(), appUser: auth.appUser }
}
