import "server-only"

import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { MARKETING_POST_ROLES } from "@web/lib/marketing/posts"

// Story 75-219 — guard das rotas da aba "Agente" (marketing_posts):
// autenticado + role admin/supervisor (AC2). NÃO usa canAccess("sistema")
// (excluiria supervisor) nem módulo novo na matriz (épico de capabilities vai
// redesenhar isso). marketing_posts tem RLS SEM policies → toda operação na
// tabela usa o admin client; o client do usuário (auth) fica disponível para
// leituras que dependem de RLS/auth.uid() — ex.: RPC creative_performance,
// que é SECURITY INVOKER e devolve 0 linhas silenciosamente via service-role.
export async function marketingGuard() {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error }

  const forbidden = requireRole(auth.appUser, [...MARKETING_POST_ROLES])
  if (forbidden) return { error: forbidden }

  return { admin: createAdminClient(), supabase: auth.supabase, appUser: auth.appUser }
}
