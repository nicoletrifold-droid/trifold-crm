// Pipeline IMOB (2026-08-31) — nome da IMOBILIÁRIA PARCEIRA de um lead do mundo IMOB.
//
// O lead não tem coluna própria de imobiliária: o vínculo real nasce no
// agendamento (`appointments.imobiliaria_id`, carimbado pelo link público em
// /api/agendar/[token], e também pelo agendamento interno quando o gestor
// escolhe a parceira). Quando a visita mais recente conhece a parceira, é ela
// que representa "de quem veio esse lead" — é o que a equipe IMOB precisa ver
// no card e no drawer, no lugar do X/3 de cadastro (inútil no funil IMOB).
//
// `metadata.imobiliaria_nome` é fallback histórico: appointments antigos podem
// ter o nome sem a FK. O nome da TABELA sempre ganha (renomear a imobiliária
// tem que refletir nas telas).

import type { SupabaseClient } from "@supabase/supabase-js"

type ApptRow = {
  lead_id?: string | null
  imobiliaria_id?: string | null
  metadata?: unknown
}

/** Nome gravado em `appointments.metadata.imobiliaria_nome` (fallback), ou null. */
function nomeDoMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  const nome = (metadata as Record<string, unknown>).imobiliaria_nome
  return typeof nome === "string" && nome.trim() ? nome.trim() : null
}

export type VinculoImobiliaria = { imobiliariaId: string | null; nomeMetadata: string | null }

/**
 * Escolhe, por lead, o vínculo com imobiliária do agendamento MAIS RECENTE que
 * conheça a parceira. `rows` deve vir ordenado do mais recente para o mais
 * antigo — a primeira linha útil de cada lead vence.
 */
export function escolherVinculoPorLead(rows: ApptRow[]): Map<string, VinculoImobiliaria> {
  const out = new Map<string, VinculoImobiliaria>()
  for (const row of rows) {
    const leadId = typeof row.lead_id === "string" ? row.lead_id : null
    if (!leadId || out.has(leadId)) continue
    const imobiliariaId = typeof row.imobiliaria_id === "string" ? row.imobiliaria_id : null
    const nomeMetadata = nomeDoMetadata(row.metadata)
    if (!imobiliariaId && !nomeMetadata) continue // agendamento sem parceira: não decide nada
    out.set(leadId, { imobiliariaId, nomeMetadata })
  }
  return out
}

/**
 * Mapa leadId → nome da imobiliária parceira. Best-effort: falha de leitura
 * devolve mapa vazio (a tela some com o rótulo, não quebra).
 *
 * Requer client ADMIN: `imobiliarias` tem RLS habilitado SEM policy (migration
 * 131) — o gate de acesso é o do chamador (página/rota do IMOB).
 */
export async function fetchImobiliariaNomePorLead(
  admin: SupabaseClient,
  orgId: string,
  leadIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(leadIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { data: appts } = await admin
    .from("appointments")
    .select("lead_id, imobiliaria_id, metadata")
    .eq("org_id", orgId)
    .in("lead_id", ids)
    .order("scheduled_at", { ascending: false })

  const vinculos = escolherVinculoPorLead((appts ?? []) as ApptRow[])
  if (vinculos.size === 0) return new Map()

  const imobIds = [...new Set([...vinculos.values()].map((v) => v.imobiliariaId).filter((v): v is string => Boolean(v)))]
  const nomePorId = new Map<string, string>()
  if (imobIds.length > 0) {
    const { data: imobs } = await admin
      .from("imobiliarias")
      .select("id, nome")
      .eq("org_id", orgId)
      .in("id", imobIds)
    for (const row of (imobs ?? []) as Array<{ id: string; nome: string | null }>) {
      if (row.nome) nomePorId.set(row.id, row.nome)
    }
  }

  const out = new Map<string, string>()
  for (const [leadId, v] of vinculos) {
    const nome = (v.imobiliariaId ? nomePorId.get(v.imobiliariaId) : null) ?? v.nomeMetadata
    if (nome) out.set(leadId, nome)
  }
  return out
}
