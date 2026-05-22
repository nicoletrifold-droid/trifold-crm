import { createAdminClient } from "@web/lib/supabase/admin"

export interface AuditParams {
  org_id: string
  user_id: string
  user_name: string
  action: string
  entity_type?: string
  entity_id?: string
  entity_name?: string
  obra_id?: string
  metadata?: Record<string, unknown>
  ip_address?: string
}

/**
 * Registra uma ação crítica na tabela `audit_logs`.
 *
 * - Usa `createAdminClient()` (service_role) — bypassa RLS para insert.
 * - Erros são silenciados: falha de auditoria NUNCA quebra a ação principal.
 * - Deve ser chamado APÓS sucesso da operação principal (nunca antes, nunca em erro).
 * - Padrão recomendado: `void logAudit({...})` (fire-and-forget).
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("audit_logs").insert({
      org_id: params.org_id,
      user_id: params.user_id,
      user_name: params.user_name,
      action: params.action,
      entity_type: params.entity_type ?? null,
      entity_id: params.entity_id ?? null,
      entity_name: params.entity_name ?? null,
      obra_id: params.obra_id ?? null,
      metadata: params.metadata ?? {},
      ip_address: params.ip_address ?? null,
    })
  } catch {
    // silently ignore — audit failure must never break the main action
  }
}

/**
 * Extrai IP do request a partir dos headers `x-forwarded-for` ou `x-real-ip`.
 * Retorna `undefined` se nenhum estiver disponível.
 */
export function getRequestIp(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    // x-forwarded-for pode conter múltiplos IPs: "client, proxy1, proxy2"
    return forwarded.split(",")[0]?.trim() || undefined
  }
  return headers.get("x-real-ip") ?? undefined
}
