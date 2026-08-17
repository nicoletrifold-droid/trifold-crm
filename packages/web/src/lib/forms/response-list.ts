import { parseFormSchema, type FormSchema } from "./schema"
import { proximaPergunta, type Respostas } from "./branching"
import { formatarRespostas, type RespostaLegivel } from "./format-response"

// Story 75-333 (Epic 89) — a base de respostas: completas, parciais e SEM
// CONTATO. Pedido do Marcos: "não posso perder estas informações, pois posso
// fazer uma oferta ativa".
//
// As decisões desta tela — como rotular a linha, em qual pergunta a pessoa
// parou — são função pura aqui, testáveis sem DOM (o projeto não tem jsdom).

/** Como a linha se apresenta na base. */
export type StatusLinha = "completa" | "nao_terminou" | "sem_contato"

export const STATUS_LABELS: Record<StatusLinha, string> = {
  completa: "Completa",
  nao_terminou: "Não terminou",
  sem_contato: "Sem contato",
}

/**
 * Rótulo da linha.
 *
 * `sem_contato` é caso de PRIMEIRA CLASSE, não borda: é a resposta que existe
 * sem lead porque a pessoa nunca deu nome+telefone. Ela é a razão desta tela —
 * e, ao mesmo tempo, a única que NÃO permite oferta ativa. Merece rótulo
 * próprio para que ninguém a confunda com um lead contactável.
 */
export function statusDaLinha(params: { status: string; temLead: boolean }): StatusLinha {
  if (params.status === "completa") return "completa"
  return params.temLead ? "nao_terminou" : "sem_contato"
}

/**
 * Em qual pergunta a pessoa parou.
 *
 * Reusa o `proximaPergunta` da ramificação — a "próxima pergunta a mostrar" é,
 * numa resposta abandonada, exatamente a pergunta em que ela travou. Resposta
 * completa não tem pergunta de abandono (devolve null).
 */
export function perguntaDeAbandono(schema: FormSchema, respostas: Respostas): string | null {
  const proxima = proximaPergunta(schema, respostas)
  return proxima ? proxima.titulo : null
}

export interface LinhaDaBase {
  id: string
  quando: string
  status: StatusLinha
  nome: string | null
  telefone: string | null
  leadId: string | null
  formNome: string
  campanha: string | null
  score: number | null
  /** Onde parou (só para quem não terminou). */
  parouEm: string | null
  respostas: RespostaLegivel[]
}

/** Formato cru vindo do PostgREST — o que a página consulta. */
export interface RespostaCrua {
  id: string
  answers: unknown
  score: number | null
  status: string
  created_at: string
  completed_at: string | null
  metadata: unknown
  lead_id: string | null
  lead_forms: { nome: string; schema: unknown } | { nome: string; schema: unknown }[] | null
  leads: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null
}

/** PostgREST devolve embed como objeto OU array conforme o formato do select. */
function primeiro<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * Monta as linhas da base. Puro: recebe o que veio do banco e devolve o que a
 * tela desenha — nenhuma consulta aqui.
 *
 * Schema quebrado num formulário não derruba a lista inteira: aquela linha
 * aparece sem respostas detalhadas em vez de a tela morrer. Perder a visão de
 * 300 leads porque um formulário tem JSON ruim seria o pior resultado possível.
 */
export function montarLinhas(cruas: RespostaCrua[]): LinhaDaBase[] {
  return cruas.map((c) => {
    const form = primeiro(c.lead_forms)
    const lead = primeiro(c.leads)
    const respostasBrutas = (c.answers ?? {}) as Respostas
    const metadata = (c.metadata ?? {}) as Record<string, unknown>
    const utm = (metadata.utm ?? {}) as Record<string, unknown>

    let schema: FormSchema | null = null
    try {
      schema = form ? parseFormSchema(form.schema) : null
    } catch {
      schema = null
    }

    const status = statusDaLinha({ status: c.status, temLead: c.lead_id !== null })

    return {
      id: c.id,
      quando: c.completed_at ?? c.created_at,
      status,
      nome: lead?.name ?? null,
      telefone: lead?.phone ?? null,
      leadId: c.lead_id,
      formNome: form?.nome ?? "—",
      campanha: typeof utm.utm_campaign === "string" ? utm.utm_campaign : null,
      score: c.score,
      parouEm: status === "completa" || !schema ? null : perguntaDeAbandono(schema, respostasBrutas),
      respostas: schema ? formatarRespostas(schema, respostasBrutas) : [],
    }
  })
}

/**
 * Quantas pessoas pararam em cada pergunta.
 *
 * É o dado que melhora o formulário: se 40% param na pergunta de renda, o
 * problema é a pergunta, não o anúncio. E se o contato está sendo pedido tarde,
 * este ranking denuncia — porque as respostas "sem contato" concentram-se antes
 * dele.
 */
export function abandonoPorPergunta(linhas: LinhaDaBase[]): { pergunta: string; total: number }[] {
  const contagem = new Map<string, number>()
  for (const l of linhas) {
    if (!l.parouEm) continue
    contagem.set(l.parouEm, (contagem.get(l.parouEm) ?? 0) + 1)
  }
  return [...contagem.entries()]
    .map(([pergunta, total]) => ({ pergunta, total }))
    .sort((a, b) => b.total - a.total)
}
