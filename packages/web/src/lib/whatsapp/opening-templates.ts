// Story 75-217 — múltiplos templates de abertura no "Iniciar atendimento".
// A fonte da verdade é a Meta: o menu lista os templates APROVADOS cujo nome
// começa com "abertura_" e cujas variáveis este mapa sabe preencher.
// Template novo = criar na Meta (prefixo `abertura_`) + registrar aqui as
// variáveis; ele aparece no menu sozinho assim que a Meta aprovar.

export type OpeningParamSource = "nome_lead" | "corretor" | "empreendimento"

export const OPENING_TEMPLATE_PARAMS: Record<string, OpeningParamSource[]> = {
  // Story 75-142/75-166 — template original (Olá {{1}}! Aqui é {{2}}... {{3}}...)
  abertura_atendimento_corretor: ["nome_lead", "corretor", "empreendimento"],
  // Story 75-217 — abordagens por contexto (submetidos 24/07, só {{1}} = nome do lead)
  abertura_interesse_prioridades: ["nome_lead"],
  abertura_interesse_status: ["nome_lead"],
}

export const DEFAULT_OPENING_TEMPLATE = "abertura_atendimento_corretor"

export interface OpeningTemplate {
  name: string
  body: string
}

export interface OpeningParamContext {
  nomeLead: string
  corretor: string
  empreendimento: string
}

export function resolveOpeningParams(
  templateName: string,
  ctx: OpeningParamContext,
): string[] | null {
  const spec = OPENING_TEMPLATE_PARAMS[templateName]
  if (!spec) return null
  return spec.map((source) => {
    if (source === "nome_lead") return ctx.nomeLead
    if (source === "corretor") return ctx.corretor
    return ctx.empreendimento
  })
}

// Substitui {{1}}, {{2}}… pelo valor posicional — usado no preview do menu e no
// espelho gravado no histórico (paridade com o que o lead recebe de verdade,
// sem cópia hardcoded que desatualiza — lição da 75-166).
export function renderOpeningBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_match, n: string) => params[Number(n) - 1] ?? "")
}

interface MetaTemplateListItem {
  name?: string
  status?: string
  language?: string
  components?: Array<{ type?: string; text?: string }>
}

export async function listApprovedOpeningTemplates(
  wabaId: string,
  accessToken: string,
): Promise<OpeningTemplate[]> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,status,language,components&limit=100`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) },
  )
  if (!res.ok) {
    throw new Error(`Graph API templates ${res.status}`)
  }
  const json = (await res.json()) as { data?: MetaTemplateListItem[] }

  const out: OpeningTemplate[] = []
  for (const t of json.data ?? []) {
    if (!t.name?.startsWith("abertura_")) continue
    if (t.status !== "APPROVED") continue
    if (t.language && t.language !== "pt_BR") continue
    if (!OPENING_TEMPLATE_PARAMS[t.name]) continue
    const body = t.components?.find((c) => c.type === "BODY")?.text
    if (!body) continue
    out.push({ name: t.name, body })
  }

  // Ordem estável = ordem do mapa (contexto mais comum primeiro).
  const order = Object.keys(OPENING_TEMPLATE_PARAMS)
  out.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
  return out
}
