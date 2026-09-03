import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import type { OpeningParamContext } from "./opening-templates"
import { OPENING_PRIVILEGED_ROLES } from "./opening-roles"
import { can } from "@web/lib/permissions"
import { resolveCorretorFallbackName } from "@web/lib/tenancy/app-url-fallback"

// Story 75-217 — contexto compartilhado entre o menu de templates de abertura
// (GET opening-templates) e o envio (POST start-whatsapp): carrega o lead com
// as mesmas regras de acesso, monta as variáveis e busca as credenciais.

export interface OpeningContextUser {
  id: string
  org_id: string
  name: string | null
  role: string
}

export type OpeningContextResult =
  | { ok: true; lead: { id: string; name: string | null; phone: string | null }; ctx: OpeningParamContext; waConfig: { phone_number_id: string; access_token: string; waba_id: string | null } }
  | { ok: false; status: number; error: string; message?: string }

// Story 75-267 — a constante mora em opening-roles.ts (módulo client-safe;
// este arquivo importa createAdminClient e não entra em client component).
// Re-export mantém os consumidores server existentes.
export { OPENING_PRIVILEGED_ROLES }

export async function loadOpeningContext(
  leadId: string,
  appUser: OpeningContextUser,
  supabase: SupabaseClient,
): Promise<OpeningContextResult> {
  // 75-310: privilegiado = capability conversas.abrir_template (matriz/exceções).
  const isPrivileged = await can(appUser.id, appUser.org_id, "conversas.abrir_template")
  const db = isPrivileged ? createAdminClient() : supabase

  const { data: lead } = await db
    .from("leads")
    .select("id, name, phone, assigned_broker_id, property_interest:property_interest_id(name)")
    .eq("id", leadId)
    .eq("org_id", appUser.org_id)
    .single()

  if (!lead) {
    return { ok: false, status: 404, error: "LEAD_NOT_FOUND" }
  }
  if (!isPrivileged && lead.assigned_broker_id !== appUser.id) {
    return { ok: false, status: 403, error: "FORBIDDEN", message: "Este lead não está atribuído a você." }
  }

  // Variáveis do template (Meta rejeita parâmetro vazio — fallbacks).
  // Story 75-217: primeiro nome na saudação ("Oi Carina!" em vez de "Oi Carina
  // Jorge | Piercer!"); sem nome, o 👋 lê natural em qualquer template.
  const hasName = (v: unknown): v is { name?: string } => !!v && typeof v === "object"
  const nomeLead = (lead.name as string | null)?.trim().split(/\s+/)[0] || "👋"
  // Story 75-164 — nomeia QUEM ASSUMIU (usuário logado), não o assigned_broker.
  // Story 900-66 (AC5) — o nome real do corretor continua vencendo; o que mudou é só o
  // fallback, que era o literal "Trifold" para QUALQUER org. Com a flag desligada (padrão) a
  // saída é byte a byte a de hoje, inclusive para orgs que não são a Trifold.
  const corretor =
    appUser.name?.trim() ||
    resolveCorretorFallbackName({
      orgId: appUser.org_id,
      flagLigada: process.env["TENANT_FALLBACK_FAIL_CLOSED"] === "true",
    })
  const propRel = Array.isArray(lead.property_interest) ? lead.property_interest[0] : lead.property_interest
  const empreendimento = (hasName(propRel) ? propRel.name : null)?.trim() || "que você procura"

  const admin = createAdminClient()
  const { data: waConfig } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token, waba_id")
    .eq("org_id", appUser.org_id)
    .eq("status", "active")
    .maybeSingle()
  if (!waConfig?.phone_number_id || !waConfig?.access_token) {
    return { ok: false, status: 400, error: "WHATSAPP_CONFIG_MISSING", message: "WhatsApp da empresa não configurado." }
  }

  return {
    ok: true,
    lead: { id: lead.id as string, name: lead.name as string | null, phone: lead.phone as string | null },
    ctx: { nomeLead, corretor, empreendimento },
    waConfig,
  }
}
