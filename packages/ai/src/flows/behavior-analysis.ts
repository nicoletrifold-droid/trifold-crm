import type Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC_MODELS } from "../client/anthropic"

/**
 * Story 82-1 (Epic 82) — Análise de Comportamento IA do lead.
 * Recebe a cronologia única (mensagens, notas, etapas, tarefas, follow-ups,
 * agendamentos e feedbacks de visita, com timestamps) + o bloco de perfil e
 * devolve uma análise estruturada: estágio real percebido, temperatura,
 * sinais, objeções, abordagem e próxima ação.
 *
 * Regras de produto:
 * - A sugestão de estágio é OPINIÃO — a IA nunca move etapa.
 * - Base rasa → análise rasa assumida: `dados_faltando` preenchido, nunca
 *   profundidade inventada.
 */

export interface BehaviorChronologyEvent {
  /** ISO timestamp do evento */
  at: string
  /** Origem legível: "Mensagem (Lead)", "Nota do corretor", "Mudança de etapa"… */
  source: string
  /** Conteúdo/descrição do evento */
  description: string
}

export interface BehaviorAnalysisInput {
  /** Bloco estático: campos do lead + perfil + dados coletados pela Nicole */
  leadProfile: Record<string, unknown>
  /** Nome da etapa atual no funil (ou null) */
  currentStage: string | null
  /** Eventos ordenados do mais antigo ao mais recente */
  chronology: BehaviorChronologyEvent[]
  /** Referência de "agora" (ISO) para raciocínio sobre recência/sumiços */
  now: string
}

export interface BehaviorAnalysisResult {
  estagio_real: string
  temperatura: string
  sinais: string[]
  objecoes: string[]
  como_abordar: string
  proxima_acao: string
  dados_faltando: string[]
  resumo: string
}

const ANALYSIS_PROMPT = `Voce e um analista senior de vendas imobiliarias. Analise o COMPORTAMENTO do lead abaixo a partir da cronologia de eventos (conversas, notas do corretor, mudancas de etapa, tarefas, agendamentos e feedbacks de visita).

O objetivo e responder: qual o estagio REAL deste cliente na jornada de compra e como o corretor deve aborda-lo AGORA.

COMO ANALISAR:
- Comportamento e TEMPO, nao so texto: observe cadencia de resposta, intervalos de silencio, remarcacoes, no-shows, quem falou por ultimo e ha quanto tempo.
- Cruze o que o lead DIZ com o que ele FAZ (ex.: diz que quer comprar mas some apos pergunta de orcamento; remarca visita mas sempre remarca — interesse real com alguma trava).
- Visita marcada/realizada/feedback pos-visita sao os sinais mais fortes — pese-os mais.
- A etapa atual do funil pode estar defasada; sua leitura do estagio real e uma SUGESTAO para o corretor avaliar, nunca uma ordem.

REGRAS OBRIGATORIAS:
- Retorne APENAS JSON valido, sem markdown, sem code blocks.
- NAO invente sinais, objecoes ou conclusoes sem lastro na cronologia. Se a base e rasa (poucos eventos), diga isso no "resumo", seja conservador e preencha "dados_faltando" com o que o corretor deveria registrar/coletar.
- Escreva em portugues do Brasil, direto e acionavel — o leitor e o corretor que vai abordar o lead.
- "proxima_acao" deve ser UMA acao concreta e imediata (o que fazer, por qual canal, quando).

FORMATO DO JSON (todos os campos obrigatorios):
{
  "estagio_real": "estagio percebido do cliente + comparacao curta com a etapa atual do funil",
  "temperatura": "frio | morno | quente — com justificativa curta na mesma string",
  "sinais": ["2 a 4 sinais observados na cronologia, cada um citando o comportamento/data que o sustenta"],
  "objecoes": ["objecoes ditas ou provaveis (marcar as inferidas como 'provavel: ...')"],
  "como_abordar": "tom, canal, argumento e momento sugeridos",
  "proxima_acao": "acao unica, concreta e imediata",
  "dados_faltando": ["o que registrar/perguntar para melhorar a analise; [] se a base ja e rica"],
  "resumo": "2-3 frases de contexto geral"
}`

function formatChronology(events: BehaviorChronologyEvent[]): string {
  if (events.length === 0) return "Nenhum evento registrado."
  return events
    .map((e) => {
      const d = new Date(e.at)
      const stamp = isNaN(d.getTime())
        ? e.at
        : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      return `[${stamp}] ${e.source}: ${e.description}`
    })
    .join("\n")
}

export async function analyzeLeadBehavior(
  anthropic: Anthropic,
  input: BehaviorAnalysisInput
): Promise<BehaviorAnalysisResult | null> {
  const nowStamp = new Date(input.now).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })

  const prompt = `${ANALYSIS_PROMPT}

DATA/HORA ATUAL: ${nowStamp}
ETAPA ATUAL NO FUNIL: ${input.currentStage ?? "Nao informada"}

PERFIL/DADOS DO LEAD:
${JSON.stringify(input.leadProfile, null, 2)}

CRONOLOGIA (${input.chronology.length} eventos, do mais antigo ao mais recente):
${formatChronology(input.chronology)}`

  const response = await anthropic.messages.create(
    {
      model: ANTHROPIC_MODELS.sonnet,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    },
    { timeout: 45000 }
  )

  const firstBlock = response.content[0]
  const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : ""
  return parseBehaviorAnalysis(text)
}

/**
 * Parse defensivo do JSON do modelo. Devolve null em qualquer formato
 * inválido — o chamador NUNCA deve persistir lixo.
 */
export function parseBehaviorAnalysis(text: string): BehaviorAnalysisResult | null {
  try {
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>

    const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []

    if (
      !str(parsed.estagio_real) ||
      !str(parsed.temperatura) ||
      !str(parsed.como_abordar) ||
      !str(parsed.proxima_acao) ||
      !str(parsed.resumo)
    ) {
      return null
    }

    return {
      estagio_real: parsed.estagio_real,
      temperatura: parsed.temperatura,
      sinais: strArr(parsed.sinais),
      objecoes: strArr(parsed.objecoes),
      como_abordar: parsed.como_abordar,
      proxima_acao: parsed.proxima_acao,
      dados_faltando: strArr(parsed.dados_faltando),
      resumo: parsed.resumo,
    }
  } catch {
    return null
  }
}
