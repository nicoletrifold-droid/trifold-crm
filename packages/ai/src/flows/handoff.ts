/**
 * Handoff flow.
 * Determines when to transfer the conversation to a human broker
 * and generates structured summaries for the handoff.
 */

import type { ConversationRole } from "../chat/conversation-history"
import { AGENDA_STATE_KEY, parseAgendaState } from "./agenda-state"

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
  lines.push(`- Disponibilidade para visita: ${formatDisponibilidade(collectedData)}`)
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

/**
 * Story 87-12 — o corretor lê a CITAÇÃO do lead, não um booleano que nunca existiu.
 *
 * O que esta função substitui: `formatBoolean(collectedData.visit_availability)`,
 * escrita em 31/03/2026 (`a5e29d70`, commit inicial do arquivo). **Não é regressão
 * da 87-4**: `visit_availability` nunca foi booleano em produção — `jsonb_typeof` =
 * `string` em 56 de 56 linhas (remedido em 16/08). `formatBoolean` devolve
 * "nao informado" para tudo que não é `true`/`false` literal, então a linha era uma
 * CONSTANTE: dos 14 resumos de handoff gravados all-time, 14 dizem "nao informado",
 * `sim` = 0. O que a 87-4 fez foi migrar o fato para `agenda_state` e migrar só UM
 * dos dois leitores humanos (o painel) — este aqui ficou para trás.
 *
 * A regra de admissão é a MESMA do gate de qualificação e do painel:
 * `parseAgendaState`. Não há régua de conteúdo aqui, e não pode haver — quem garante
 * que isto é fala do lead é o TIPO (`origem: "lead"` + `citacao` literal de mensagem
 * `role='user'`, Story 87-4), não o texto. Duas réguas de conteúdo foram contadas
 * sobre as 56 linhas legadas e as duas reprovaram (comprimento `>60`: pega 44, erra 3;
 * procedência por substring: pega 45 e apaga dois fatos verdadeiros).
 *
 * O LEGADO NÃO É LIDO, e não volta como fallback. Três razões, em ordem de peso:
 *  1. Ele não chega: `stripLegacyAgendaKeys` (`chat/pipeline.ts:821`) é incondicional
 *     e roda antes de o `finalData` nascer (`:1298`) e de o resumo ser montado (`:1326`).
 *  2. Se chegasse, imprimi-lo seria PIOR que o defeito: dos 9 handoffs reais com
 *     conteúdo na chave, 8 são fala da própria Nicole. "Imprima o que está lá" teria
 *     transformado um campo inútil num campo mentiroso.
 *  3. Filtrá-lo exigiria a régua que não existe (ver acima).
 * Modo de falha resultante, declarado: se a chave legada reaparecer por um caminho
 * não previsto, a saída é "nao informado" — silêncio, não afirmação falsa.
 *
 * O rótulo "nao e visita marcada" é OBRIGATÓRIO: visita marcada mora em
 * `appointments`. O caso Ronaldo (10/08) é a prova — o sistema RECUSOU o 17:30
 * daquele turno, e a citação continua sendo o que o lead disse.
 *
 * ⚠️ TETO DE VALOR, declarado para que ninguém prometa o contrário: "nao informado"
 * seguirá sendo a saída na maioria dos handoffs, e na maioria deles continuará sendo
 * a saída CERTA. O `agenda_state` tem TTL de 48 h (a fixture da Rita expira em 17/08
 * e aponta para 18/08 — o estado vence ANTES do dia que ele indica) e
 * `writeAgendaState(cd, null)` (`chat/pipeline.ts:1064`) apaga a chave justamente
 * quando a visita é agendada. Esta função compra "o campo PODE informar", não
 * "o campo informa".
 *
 * Sem TTL aqui de propósito: `chat/pipeline.ts:799-803` já apagou o estado vencido
 * antes de o `finalData` nascer. Um `if` de validade aqui seria caminho de decisão
 * duplicado — e exigiria um `now` que tornaria esta função impura e o teste
 * não-determinístico.
 *
 * Lê `citacao` e `data_absoluta`, e SÓ. `ofertas_do_sistema` e `afirmado_pela_nicole`
 * (item W1-2c) são WRITE-ONLY por decisão ratificada — o resumo do corretor é um
 * leitor e não os toca.
 *
 * ⚠️ A `citacao` é ACHATADA EM UMA LINHA, e isto é um desvio deliberado do desenho
 * literal da story. A `citacao` é a mensagem CRUA do lead (`qualification.ts:356`,
 * `chat/pipeline.ts:958` e `:1048` passam a mensagem do turno como `citacao`), e o
 * denominador que importa NÃO é "toda mensagem": é a mensagem que carrega token de
 * dia/hora, porque só ela vira `citacao`. Medido na população INTEIRA em 16/08
 * (1.877 mensagens `role='user'`, sem o teto de 1.000 do PostgREST):
 *
 *   população inteira ......................... 99/1877 alteradas = 5,3 %
 *   com token de dia/hora, régua ESTREITA ....... 3/45  alteradas = 6,7 %
 *      (as `dayKeywords` literais do `qualification.ts:323-337` + hora explícita)
 *   com token de dia/hora, régua LARGA ......... 10/103 alteradas = 9,7 %
 *      (dia sem exigir "-feira" + hora + período — é a régua que pega a citação
 *       REAL da Rita, `"Terça"`, que a estreita perde)
 *
 * Duas réguas, duas contagens, mesma direção: no denominador que de fato vira
 * `citacao` a taxa é MAIOR que na população inteira, não menor. (O @qa mediu 9/110 =
 * 8,2 % com uma terceira régua; o intervalo das três é 6,7–9,7 %.)
 *
 * O bloco `INTERESSE:` é uma tabela de um rótulo por linha; uma citação multilinha
 * parte um campo rotulado ao meio. E o pior caso é PIOR que uma linha a mais: com
 * `\n\n` na citação entra uma LINHA EM BRANCO dentro do bloco — e a linha em branco
 * é o SEPARADOR DE BLOCO deste formato (ver os `lines.push("")` acima). O bloco
 * `INTERESSE:` fecha no meio e o resto da citação vira bloco órfão sem cabeçalho:
 * quebra ESTRUTURAL, não cosmética. Existem em produção: 17 das 1.877 mensagens têm
 * linha em branco, 2 delas dentro da régua larga (ex.: `"15\nAgosto \n2026\n\nSábado…"`).
 * E ela se PROPAGA — o `ai_summary` volta ao contexto da Nicole como fallback de L1
 * (`memory/loader.ts:196-203`), então um resumo com bloco quebrado vira prompt
 * quebrado. É exatamente o "resumo malformado" do gatilho (a) de rollback desta story.
 *
 * O achatamento é do FORMATADOR, não do escritor: o dado gravado continua íntegro
 * para auditoria, e é só a linha do resumo que fica com a forma que ela promete ter.
 * O `.trim()` é INERTE na população de hoje (0 de 1.877 mensagens têm espaço nas
 * bordas) — está aqui como fecho da normalização, não como conserto de caso vivo.
 * *(O bloco `MENSAGENS DO LEAD` também imprime texto cru do lead e já tolera quebras
 * hoje — comportamento anterior a esta story, não tocado. Fica como achado.)*
 */
function formatDisponibilidade(collectedData: Record<string, unknown>): string {
  const st = parseAgendaState(collectedData[AGENDA_STATE_KEY])
  if (!st) return "nao informado"
  const citacao = st.citacao.replace(/\s+/g, " ").trim()
  const dia = st.data_absoluta ? ` (dia ${st.data_absoluta})` : ""
  return `"${citacao}"${dia} - nas palavras do lead, nao e visita marcada`
}
