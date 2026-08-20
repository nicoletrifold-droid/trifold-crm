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
  /**
   * Story 75-361 — quantas vezes ESTE lead já pediu preço na conversa, incluindo
   * a mensagem atual. Contado pelo pipeline sobre `messages` (`role='user'`), não
   * sobre o histórico de 20 mensagens: o caso que motivou a story se arrasta por
   * semanas e a janela curta esconderia a insistência.
   *
   * Opcional de propósito — ausente = comportamento anterior, byte a byte.
   */
  pedidosDePrecoDoLead?: number
}

interface HandoffResult {
  trigger: boolean
  reason?: string
  /**
   * Story 75-361 — qual gatilho acendeu. O pipeline precisa distinguir
   * `preco_insistencia` dos outros para avisar o corretor UMA vez (os outros
   * gatilhos seguem só registrando o sinal, como sempre).
   */
  motivo?: "preco_qualificado" | "preco_insistencia" | "fora_de_escopo"
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
 * Story 75-361 — o lead está pedindo preço/simulação?
 *
 * Exportada para o pipeline CONTAR os pedidos com a mesma régua que decide o
 * handoff. Reproduzir esses padrões em SQL (`ilike` por termo) seria manter a
 * mesma regra em dois idiomas — a armadilha de
 * `feedback-consultar-fonte-nao-duplicar-constante`. O pipeline traz os textos e
 * conta aqui.
 */
export function ehPedidoDePrecoDoLead(texto: string | null | undefined): boolean {
  if (!texto) return false
  const t = texto.toLowerCase()
  return PRICE_SIMULATION_PATTERNS.some((p) => p.test(t))
}

/**
 * Story 75-361 — a partir de quantos pedidos de preço o lead vira caso de humano.
 *
 * DOIS, por decisão do Marcos (20/08): "escalar na 2ª insistência". Medido em 90
 * dias: 73 conversas chegariam aqui (~0,8/dia), e as 73 têm corretor atribuído —
 * ninguém escala para o vazio.
 */
export const PEDIDOS_DE_PRECO_PARA_ESCALAR = 2

/**
 * Determines whether the conversation should be handed off to a human broker.
 *
 * Triggers:
 * - Score >= 70 AND lead asks about prices/simulation
 * - Visit has been scheduled
 * - Lead asks out-of-scope questions (wants human, contract details, complaints)
 */
export function shouldHandoff(params: HandoffCheckParams): HandoffResult {
  const { qualificationScore, message, conversationState, pedidosDePrecoDoLead } = params
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
          motivo: "preco_qualificado",
        }
      }
    }
  }

  // Story 75-361 — INSISTÊNCIA em preço, independente do score.
  //
  // O gatilho de cima exige `score >= 70`, e é por isso que quase ninguém escalava:
  // medido em 90 dias, **134 conversas** pediram valor e **2** receberam um número.
  // A Nicole respondia "os valores variam conforme o andar…" e REPETIA a mesma
  // frase — até 7 vezes na mesma conversa, inclusive respondendo a "Sim.", "?" e
  // "0k". Nessas 8 piores, 6 leads terminaram em Perdido/Represamento e 4 nunca
  // tiveram uma única fala de corretor. A perda sobe com a repetição: 39,2% sem o
  // muro, 51,7% com um, 59,5% com dois ou mais.
  //
  // Decisão do Marcos (20/08), caminho A: **não muda a política de preço** — a
  // Nicole continua não cotando, porque ela é SDR e o corretor é closer. O que
  // muda é que na segunda insistência entra gente, em vez de disco riscado.
  if (
    typeof pedidosDePrecoDoLead === "number" &&
    pedidosDePrecoDoLead >= PEDIDOS_DE_PRECO_PARA_ESCALAR &&
    ehPedidoDePrecoDoLead(lowerMessage)
  ) {
    return {
      trigger: true,
      reason:
        `Lead pediu preco/simulacao ${pedidosDePrecoDoLead}x nesta conversa e nao recebeu numero. ` +
        `Precisa de corretor: a Nicole nao cota valor.`,
      motivo: "preco_insistencia",
    }
  }

  // Trigger: Out of scope questions
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(lowerMessage)) {
      return {
        trigger: true,
        reason: "Lead solicitou atendimento fora do escopo da Nicole (corretor humano, contrato, reclamacao, etc.).",
        motivo: "fora_de_escopo",
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
