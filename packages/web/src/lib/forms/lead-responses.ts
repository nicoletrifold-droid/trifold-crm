import { createAdminClient } from "@web/lib/supabase/admin"
import { parseFormSchema } from "./schema"
import { formatarRespostas, type RespostaLegivel } from "./format-response"
import { perguntaDeAbandono } from "./response-list"
import type { Respostas } from "./branching"

// Story 75-330 (Epic 89) — AC9: as respostas do formulário na ficha do lead.
//
// Story 75-343 — duas mudanças de contrato, pelas duas razões do Marcos:
//   1. devolve TODAS as respostas do lead (era `.limit(1)`), da mais nova para a
//      mais antiga. Ele pediu o "histórico": um lead pode preencher duas
//      campanhas, e a antiga desaparecia.
//   2. traz `parouEm` — em qual pergunta a pessoa travou. "Não terminou" sozinho
//      não responde "até onde o lead respondeu", que é o que a SDR precisa saber
//      antes de ligar.
//
// `lead_form_responses` tem RLS sem policies (232) → service-role. A tela que
// chama isto já está atrás de autenticação e do gate de leads; aqui o escopo de
// org vai explícito no WHERE.

export interface RespostaDoLead {
  id: string
  formNome: string
  respostas: RespostaLegivel[]
  score: number | null
  preenchidoEm: string | null
  parcial: boolean
  /**
   * Story 75-343 — a pergunta em que a pessoa parou. `null` quando a resposta é
   * completa (não houve abandono) ou quando o schema não sabe dizer.
   */
  parouEm: string | null
  /** Story 75-332 — leitura do Haiku sobre as respostas abertas. */
  resumoIa: string | null
}

/** A linha crua de `lead_form_responses` + o formulário embutido. */
export interface RespostaCruaDoLead {
  id: string
  answers: unknown
  score: number | null
  status: string
  completed_at: string | null
  created_at: string | null
  metadata: unknown
  lead_forms: { nome: string; schema: unknown } | { nome: string; schema: unknown }[] | null
}

/**
 * Linhas cruas → painéis prontos. Função PURA, testável sem banco e sem DOM
 * (o projeto não tem jsdom — mesma decisão da 75-333: a regra sai do JSX).
 *
 * Uma linha é DESCARTADA quando o formulário sumiu do embed, quando o schema
 * está quebrado (formulário editável em produção: schema inválido não pode
 * derrubar a ficha do lead) ou quando nenhuma pergunta foi respondida — painel
 * vazio é pior que painel ausente.
 */
export function mapRespostasDoLead(linhas: RespostaCruaDoLead[]): RespostaDoLead[] {
  const saida: RespostaDoLead[] = []

  for (const linha of linhas) {
    // O embed vem como objeto (1:1 por FK) — mas o PostgREST devolve array em
    // alguns formatos de select; normalizar aqui evita quebrar a ficha.
    const formRaw = linha.lead_forms
    const form = (Array.isArray(formRaw) ? formRaw[0] : formRaw) as
      | { nome: string; schema: unknown }
      | undefined
    if (!form) continue

    let schema
    try {
      schema = parseFormSchema(form.schema)
    } catch {
      continue
    }

    const answers = (linha.answers ?? {}) as Respostas
    const respostas = formatarRespostas(schema, answers)
    if (respostas.length === 0) continue

    const parcial = linha.status !== "completa"

    saida.push({
      id: linha.id,
      formNome: form.nome,
      respostas,
      score: linha.score ?? null,
      preenchidoEm: linha.completed_at ?? linha.created_at ?? null,
      parcial,
      // Só faz sentido em resposta abandonada: `perguntaDeAbandono` devolve a
      // próxima pergunta a mostrar, que numa parcial é onde a pessoa travou.
      parouEm: parcial ? perguntaDeAbandono(schema, answers) : null,
      resumoIa:
        typeof (linha.metadata as Record<string, unknown> | null)?.resumo_ia === "string"
          ? ((linha.metadata as Record<string, unknown>).resumo_ia as string)
          : null,
    })
  }

  return saida
}

/**
 * TODAS as respostas do lead, da mais recente para a mais antiga.
 *
 * A ordem importa: a resposta mais nova é a que descreve o interesse ATUAL, e é
 * a que a SDR precisa ler primeiro.
 */
export async function fetchRespostasDoLead(leadId: string, orgId: string): Promise<RespostaDoLead[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("lead_form_responses")
    .select("id, answers, score, status, completed_at, created_at, metadata, lead_forms(nome, schema)")
    .eq("lead_id", leadId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  return mapRespostasDoLead((data ?? []) as unknown as RespostaCruaDoLead[])
}
