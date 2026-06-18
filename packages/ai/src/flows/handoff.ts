/**
 * Handoff flow.
 * Determines when to transfer the conversation to a human broker
 * and generates structured summaries for the handoff.
 */

interface HandoffCheckParams {
  qualificationScore: number
  message: string
  conversationState: Record<string, unknown>
}

interface HandoffResult {
  trigger: boolean
  reason?: string
}

interface HandoffMessage {
  role: string
  content: string
}

// Padrões que identificam contatos que NAO são leads de compra.
// Nunca encaminhar para corretor — Nicole responde com o telefone comercial.
const NON_LEAD_PATTERNS = [
  /(?:vaga|vagas|emprego|trabalhar|curriculo|currículo|seleção|seleçao|processo seletivo|oportunidade de trabalho)/i,
  /(?:parceria|fornecedor|fornecimento|proposta comercial|prestacao de servico|prestação de serviço)/i,
  /(?:anunciar|publicidade|mídia|midia|patrocínio|patrocinio|divulgacao|divulgação)/i,
]

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
  for (const pattern of NON_LEAD_PATTERNS) {
    if (pattern.test(lowerMessage)) {
      return { trigger: false }
    }
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
