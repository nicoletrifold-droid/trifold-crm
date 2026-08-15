/**
 * Handoff flow.
 * Determines when to transfer the conversation to a human broker
 * and generates structured summaries for the handoff.
 */

import type { ConversationRole } from "../chat/conversation-history"

interface HandoffCheckParams {
  qualificationScore: number
  message: string
  conversationState: Record<string, unknown>
}

interface HandoffResult {
  trigger: boolean
  reason?: string
}

/**
 * Story 87-5 (AC6-ii) — o `role` era `string`, e `string` aceita qualquer
 * papel: este consumidor não acendia no `type-check`. Estreitar para o union
 * é SUBTRAÇÃO (não fere a regra de corte da Onda 1) e transforma o compilador
 * numa rede secundária de verdade.
 */
interface HandoffMessage {
  role: ConversationRole
  content: string
}

// Padrões que identificam contatos que NAO são leads de compra.
// Nunca encaminhar para corretor nem distribuir via roleta — Nicole responde
// com o telefone comercial (44) 3222-9698.
// Alta precisão por desenho: só marcamos como não-lead quando o sinal é
// inequívoco. Casos ambíguos (ex.: "tem vaga disponível?") ficam como lead —
// o custo de não distribuir um comprador real é maior que o de distribuir um
// não-lead ocasional. "vaga" sozinha NUNCA marca (é vaga de garagem).
const NON_LEAD_PATTERNS = [
  // Emprego
  /(?:emprego|curr[íi]culo|processo seletivo|recrutamento|contrata[çc][aã]o|\brh\b)/i,
  /oportunidade\s+de\s+(?:trabalho|emprego)/i,
  /vagas?\s+(?:de\s+)?(?:emprego|trabalho)/i,
  /(?:trabalhar|fazer parte)\b.*\b(?:voc[êe]s|equipe|empresa|time)/i,
  // Parceria / fornecedor
  /(?:parceria|fornecedor|fornecimento|proposta comercial|presta[çc][aã]o de servi[çc]o)/i,
  // Mídia / publicidade
  /(?:anunciar|publicidade|patroc[íi]nio)/i,
  /m[íi]dia\s+(?:exterior|externa|paga|out\s?of\s?home|ooh)/i,
]

/**
 * Identifica contatos que NÃO são leads de compra de imóvel — candidatos a
 * vaga, parcerias, fornecedores, propostas de mídia. Usado tanto no handoff
 * (não encaminhar para corretor) quanto na roleta (não distribuir).
 */
export function isNonLeadContact(message: string): boolean {
  return NON_LEAD_PATTERNS.some((pattern) => pattern.test(message))
}

const OUT_OF_SCOPE_PATTERNS = [
  /(?:falar|conversar)\s+(?:com|c\/)\s+(?:um|uma|o|a)?\s*(?:corretor|corretora|pessoa|humano|atendente)/i,
  /(?:preciso|quero|gostaria)\s+(?:de)?\s+(?:ajuda|suporte)\s+(?:humano|real|pessoal)/i,
  /(?:reclamação|reclamacao|problema|erro|bug)/i,
  /(?:financiamento|simulação|simulacao|tabela de preço|tabela de preco|valor exato|preço exato|preco exato)/i,
  /(?:contrato|documentação|documentacao|escritura)/i,
]

const PRICE_SIMULATION_PATTERNS = [
  /(?:preço|preco|valor|quanto custa|quanto é|quanto e|parcela|financ)/i,
  /(?:simulação|simulacao|simular|tabela)/i,
]

/**
 * Determines whether the conversation should be handed off to a human broker.
 *
 * Triggers:
 * - Score >= 70 AND lead asks about prices/simulation
 * - Visit has been scheduled
 * - Lead asks out-of-scope questions (wants human, contract details, complaints)
 */
export function shouldHandoff(params: HandoffCheckParams): HandoffResult {
  const { qualificationScore, message, conversationState } = params
  const lowerMessage = message.toLowerCase()

  // Non-lead contacts (job seekers, partners, vendors) — never hand off to broker
  if (isNonLeadContact(lowerMessage)) {
    return { trigger: false }
  }

  // Visit scheduled is NOT a handoff trigger anymore
  // Nicole continues attending until a broker actually sends a message
  // The follow-up system handles post-visit contact

  // Trigger: High score + price/simulation inquiry
  if (qualificationScore >= 70) {
    for (const pattern of PRICE_SIMULATION_PATTERNS) {
      if (pattern.test(lowerMessage)) {
        return {
          trigger: true,
          reason: `Lead qualificado (score: ${qualificationScore}) solicitando informacoes de preco/simulacao.`,
        }
      }
    }
  }

  // Trigger: Out of scope questions
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(lowerMessage)) {
      return {
        trigger: true,
        reason: "Lead solicitou atendimento fora do escopo da Nicole (corretor humano, contrato, reclamacao, etc.).",
      }
    }
  }

  return { trigger: false }
}

/**
 * Generates a structured summary of the conversation for the broker.
 * Includes all collected data and key conversation highlights.
 *
 * Story 87-5 (AC8) — NÃO-REGRESSÃO, não conserto. A seção `MENSAGENS DO LEAD`
 * filtra `role === "user"`: ela nunca imprimiu fala da Nicole e continua não
 * imprimindo fala do corretor. Com o corretor entrando no histórico, a ÚNICA
 * diferença é `TOTAL DE MENSAGENS`, que passa a contá-lo — e isso é correto:
 * ele É mensagem da conversa. Rotular o autor DENTRO do resumo seria
 * acrescentar conteúdo (comportamento novo) e ficou fora da Onda 1.
 */
export function generateHandoffSummary(
  collectedData: Record<string, unknown>,
  messages: Array<HandoffMessage>
): string {
  const lines: string[] = []

  lines.push("=== RESUMO DO LEAD (HANDOFF) ===")
  lines.push("")

  // Contact data
  lines.push("DADOS DO CONTATO:")
  lines.push(`- Nome: ${collectedData.name ?? "nao informado"}`)
  lines.push(`- Como conheceu: ${collectedData.source ?? "nao informado"}`)
  lines.push("")

  // Interest
  lines.push("INTERESSE:")
  lines.push(`- Empreendimento: ${collectedData.property_interest ?? "nao informado"}`)
  lines.push(`- Quartos: ${collectedData.bedrooms ?? "nao informado"}`)
  lines.push(`- Andar: ${collectedData.floor ?? "nao informado"}`)
  lines.push(`- Vista: ${collectedData.view ?? "nao informado"}`)
  lines.push(`- Vagas: ${collectedData.garages ?? "nao informado"}`)
  lines.push(`- Entrada disponivel: ${formatBoolean(collectedData.has_down_payment)}`)
  lines.push(`- Disponibilidade para visita: ${formatBoolean(collectedData.visit_availability)}`)
  lines.push("")

  // Conversation highlights
  const userMessages = messages.filter((m) => m.role === "user")
  if (userMessages.length > 0) {
    lines.push("MENSAGENS DO LEAD:")
    // Include last 5 user messages for context
    const recentMessages = userMessages.slice(-5)
    for (const msg of recentMessages) {
      const truncated = msg.content.length > 200 ? msg.content.substring(0, 200) + "..." : msg.content
      lines.push(`- "${truncated}"`)
    }
    lines.push("")
  }

  lines.push(`TOTAL DE MENSAGENS: ${messages.length}`)
  lines.push("=== FIM DO RESUMO ===")

  return lines.join("\n")
}

function formatBoolean(value: unknown): string {
  if (value === true) return "sim"
  if (value === false) return "nao"
  return "nao informado"
}
