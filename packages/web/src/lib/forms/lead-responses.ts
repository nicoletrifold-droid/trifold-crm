import { createAdminClient } from "@web/lib/supabase/admin"
import { parseFormSchema } from "./schema"
import { formatarRespostas, type RespostaLegivel } from "./format-response"
import type { Respostas } from "./branching"

// Story 75-330 (Epic 89) — AC9: busca a resposta do formulário de um lead, já
// formatada para a ficha.
//
// `lead_form_responses` tem RLS sem policies (232) → service-role. A tela que
// chama isto já está atrás de autenticação e do gate de leads; aqui o escopo de
// org vai explícito no WHERE.

export interface RespostaDoLead {
  formNome: string
  respostas: RespostaLegivel[]
  score: number | null
  preenchidoEm: string | null
  parcial: boolean
}

/**
 * A resposta MAIS RECENTE do lead. Um lead pode preencher mais de uma campanha;
 * a ficha mostra a última, que é a que descreve o interesse atual.
 */
export async function fetchRespostaDoLead(leadId: string, orgId: string): Promise<RespostaDoLead | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("lead_form_responses")
    .select("answers, score, status, completed_at, created_at, lead_forms(nome, schema)")
    .eq("lead_id", leadId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  // O embed vem como objeto (1:1 por FK) — mas o PostgREST devolve array em
  // alguns formatos de select; normalizar aqui evita quebrar a ficha.
  const formRaw = (data as { lead_forms?: unknown }).lead_forms
  const form = (Array.isArray(formRaw) ? formRaw[0] : formRaw) as
    | { nome: string; schema: unknown }
    | undefined
  if (!form) return null

  let schema
  try {
    schema = parseFormSchema(form.schema)
  } catch {
    // Schema quebrado não pode derrubar a ficha do lead — some o painel.
    return null
  }

  const respostas = formatarRespostas(schema, (data.answers ?? {}) as Respostas)
  if (respostas.length === 0) return null

  return {
    formNome: form.nome,
    respostas,
    score: (data.score as number | null) ?? null,
    preenchidoEm: (data.completed_at as string | null) ?? (data.created_at as string | null) ?? null,
    parcial: data.status !== "completa",
  }
}
