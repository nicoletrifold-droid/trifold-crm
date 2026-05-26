import type Anthropic from "@anthropic-ai/sdk"

/**
 * Updates the lead's running summary/memory after each interaction.
 * Uses Haiku (fast, cheap) to analyze the latest messages and update
 * the summary with new personal info, preferences, and context.
 *
 * This gives Nicole "memory" without loading full chat history every time.
 */
export async function updateLeadMemory(params: {
  anthropic: Anthropic
  currentSummary: string | null
  userMessage: string
  assistantMessage: string
  collectedData: Record<string, unknown>
}): Promise<string> {
  const { anthropic, currentSummary, userMessage, assistantMessage, collectedData } = params

  const prompt = `Atualize o resumo de um lead imobiliario.

RESUMO ATUAL:
${currentSummary || "Primeiro contato."}

DADOS COLETADOS:
${JSON.stringify(collectedData, null, 2)}

ULTIMA INTERACAO:
Lead: "${userMessage}"
Nicole: "${assistantMessage}"

REGRAS OBRIGATORIAS:
- Maximo 3 a 4 frases curtas (NUNCA mais que 80 palavras)
- Texto corrido, sem markdown, sem listas, sem bullet points
- Foque em: quem e o lead, o que quer, preferencias do imovel, proximo passo
- Incorpore informacao nova e mantenha as anteriores relevantes
- Se nao houver info nova, retorne o resumo atual sem mudancas
- NUNCA ultrapasse 80 palavras`

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    })

    const firstBlock = response.content[0]
    return firstBlock && firstBlock.type === "text"
      ? firstBlock.text
      : currentSummary ?? ""
  } catch (error) {
    console.error("Error updating lead memory:", error)
    return currentSummary ?? ""
  }
}
