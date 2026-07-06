import "server-only"

import { createAdminClient } from "@web/lib/supabase/admin"

const WINDOW_MINUTES = 15
const MAX_ATTEMPTS = 3

/**
 * Throttle do fluxo público de "esqueci minha senha" (Story 75-139, AC4).
 *
 * Consulta a tabela `password_reset_throttle` (migration 161) para o `identifier`
 * (e-mail normalizado lowercase+trim) dentro da janela deslizante de 15 minutos.
 *
 * @returns `true` quando o limite (3/15min) foi atingido — o chamador NÃO deve
 *   gerar link nem enviar e-mail, mas ainda deve responder de forma genérica
 *   (não revela o throttle — anti-enumeração, AC3).
 */
export async function isPasswordResetThrottled(identifier: string): Promise<boolean> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString()
  const { count } = await admin
    .from("password_reset_throttle")
    .select("*", { count: "exact", head: true })
    .eq("identifier", identifier)
    .gte("requested_at", since)
  return (count ?? 0) >= MAX_ATTEMPTS
}

/**
 * Registra uma tentativa de reset não bloqueada por throttle (AC4.3).
 *
 * Falha de registro é silenciada: não deve quebrar o fluxo principal de reset.
 */
export async function recordPasswordResetAttempt(identifier: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("password_reset_throttle")
    .insert({ identifier })
    .then(
      () => {},
      () => {}
    )
}
