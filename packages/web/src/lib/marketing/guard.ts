import "server-only"

import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { can } from "@web/lib/permissions"

// Story 75-219 — guard das rotas da aba "Agente" (marketing_posts).
// Story 75-301 (Perfis de Acesso 2.0, piloto F3): o gate deixou de ser lista de
// roles (MARKETING_POST_ROLES = admin/supervisor/social-media) e passou a ser a
// capability `marketing.gerenciar` — seed da mig 225 espelha EXATAMENTE aqueles
// 3 roles (diff conferido), e exceções individuais passam a valer.
// marketing_posts tem RLS SEM policies → toda operação na tabela usa o admin
// client; o client do usuário (auth) fica disponível para leituras que dependem
// de RLS/auth.uid() — ex.: RPC creative_performance, que é SECURITY INVOKER e
// devolve 0 linhas silenciosamente via service-role.
export async function marketingGuard() {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error }

  const allowed = await can(auth.appUser.id, auth.appUser.org_id, "marketing.gerenciar")
  if (!allowed) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { admin: createAdminClient(), supabase: auth.supabase, appUser: auth.appUser }
}
