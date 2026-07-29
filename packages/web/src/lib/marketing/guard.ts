import "server-only"

import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"

// Story 75-219 — guard das rotas da aba "Agente" (marketing_posts).
// Story 75-229 — gate migrado de `requireRole(["admin","supervisor"])` para o
// sub-módulo "campanhas.agente" na matriz de permissões (canAccess), a mesma
// fonte de verdade da página. marketing_posts tem RLS SEM policies → toda
// operação na tabela usa o admin client; o client do usuário (auth) fica
// disponível para leituras que dependem de RLS/auth.uid() — ex.: RPC
// creative_performance, que é SECURITY INVOKER e devolve 0 linhas
// silenciosamente via service-role.
export async function marketingGuard() {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error }

  const allowed = await canAccess(auth.appUser.id, auth.appUser.org_id, "campanhas.agente")
  if (!allowed) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { admin: createAdminClient(), supabase: auth.supabase, appUser: auth.appUser }
}
