import "server-only"

import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

// Story 75-88 — guard único das rotas do Kanban IMOB: autenticado + admin/supervisor.
// As tabelas imob_* têm RLS sem policy → acesso só via admin client (service-role),
// por isso o gate de role aqui é a fronteira de segurança.
export async function imobGuard() {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error as Response }
  const forbidden = requireRole(auth.appUser, ["admin", "supervisor"])
  if (forbidden) return { error: forbidden as Response }
  return { admin: createAdminClient(), appUser: auth.appUser }
}
