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

/**
 * Story 900-56 (defeito da porta de entrada) — o atalho do CRM para o console `/platform`.
 *
 * ## Por que o item mora aqui, e não dentro do componente da barra lateral
 *
 * `components/layout/sidebar-nav.tsx` é `"use client"`: tudo que está escrito lá viaja para o
 * navegador de TODO usuário logado, platform admin ou não. Se a rota `/platform` fosse um
 * literal dentro do componente, esconder o item de quem não é da plataforma esconderia só o
 * pixel — a string continuaria no bundle, e "descobrir a rota pelo item" é exatamente o que
 * não pode acontecer. Mantendo o par `{href,label}` deste lado (`server-only`), o cliente de
 * um usuário comum não recebe nem o item nem o endereço dele.
 *
 * O `null` é o valor de "não tem atalho" — e não uma string vazia ou um item desabilitado.
 * Um item desabilitado seria a mesma revelação com outra roupa.
 */
export interface AtalhoDoConsole {
  href: string
  label: string
}

const ATALHO_DO_CONSOLE: AtalhoDoConsole = {
  href: "/platform",
  label: "Painel da plataforma",
}

/** O atalho para o console, ou `null` para quem não é platform admin. */
export function atalhoDoConsole(ehPlatformAdmin: boolean): AtalhoDoConsole | null {
  return ehPlatformAdmin ? { ...ATALHO_DO_CONSOLE } : null
}
