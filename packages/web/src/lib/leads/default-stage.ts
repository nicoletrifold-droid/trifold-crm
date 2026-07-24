import { SupabaseClient } from "@supabase/supabase-js"

// Story 75-218 — etapa default do Kanban (compartilhado entre webhook Meta,
// criação manual de lead e qualquer outro ponto de entrada). Lead sem etapa é
// invisível no Pipeline e nos filtros da listagem — nunca criar com stage null.

const FALLBACK_STAGE_ID = "00000000-0000-0000-0001-000000000001"

export async function getDefaultStageId(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string> {
  const { data } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .single()

  if (data?.id) return data.id

  // Fallback: primeiro estágio por posição
  const { data: firstStage } = await supabase
    .from("kanban_stages")
    .select("id")
    .eq("org_id", orgId)
    .order("position", { ascending: true })
    .limit(1)
    .single()

  return firstStage?.id ?? FALLBACK_STAGE_ID
}
