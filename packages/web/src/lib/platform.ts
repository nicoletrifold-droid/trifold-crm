// Story 75-314 (F4-1) — permissão de PLATAFORMA (custos/margem da Trifold).
// FORA da matriz de capabilities por design: a matriz é por org, e um admin de
// tenant não pode se autoconceder acesso ao billing interno da plataforma.
// Fonte: users.is_platform_admin (hoje: só marcos@trifold.com.br — mig 228).

import "server-only"

import { createAdminClient } from "@web/lib/supabase/admin"

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("users")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle()
  return (data as { is_platform_admin?: boolean } | null)?.is_platform_admin === true
}
