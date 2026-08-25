/**
 * Story 900-22 — guarda do painel de plataforma.
 *
 * `/platform` é o painel da Trifold para gerir as empresas CLIENTES. É um segmento
 * top-level, irmão de `/dashboard` e nunca subdiretório dele: a separação física é o que
 * impede um `layout.tsx` mal configurado de expor o plano de plataforma a um usuário comum.
 *
 * A autoridade é `users.is_platform_admin`, a mesma que a função SQL `is_platform_admin()`
 * já usa nas policies das tabelas de custo interno (Epic 78). **Reusar em vez de inventar**
 * é deliberado: um segundo mecanismo de "quem é da plataforma" poderia divergir do primeiro,
 * e divergência em controle de acesso é como se descobre furo tarde demais.
 *
 * Quando a Onda 6 trouxer `platform_admins` com níveis (owner/operator/support), esta função
 * passa a consultar aquela tabela — e o resto do painel não muda.
 */

import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"

export interface PlatformAdmin {
  userId: string
  email: string
  name: string | null
}

/**
 * Devolve o platform admin da sessão, ou **redireciona**.
 *
 * Redireciona para `/dashboard` em vez de mostrar 403: quem não é da plataforma não precisa
 * saber que este painel existe.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) redirect("/login")

  const { data: user } = await supabase
    .from("users")
    .select("id, email, name, is_platform_admin")
    .eq("auth_id", auth.user.id)
    .maybeSingle()

  if (!user?.is_platform_admin) redirect("/dashboard")

  return { userId: user.id, email: user.email, name: user.name }
}

/** Versão para route handlers: devolve `null` em vez de redirecionar. */
export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return null

  const { data: user } = await supabase
    .from("users")
    .select("id, email, name, is_platform_admin")
    .eq("auth_id", auth.user.id)
    .maybeSingle()

  if (!user?.is_platform_admin) return null
  return { userId: user.id, email: user.email, name: user.name }
}
