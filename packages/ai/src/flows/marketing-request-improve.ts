import type Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC_MODELS } from "../client/anthropic"
import type { BrandKnowledge } from "./marketing-suggestions"

/**
 * Story 75-294 — "✨ Melhorar meu pedido": pega o texto cru do humano
 * ("story pra investidor batendo na entrega") e devolve um briefing completo e
 * editável, usando o Kit escopado. FAIL-OPEN por contrato: qualquer falha
 * devolve null e o texto original fica como está.
 *
 * Haiku de propósito: é reescrita curta, precisa ser RÁPIDA (o humano está com
 * o modal aberto esperando).
 */

export interface ImproveMarketingRequestInput {
  pedido: string
  empreendimentoNome: string | null
  brands: BrandKnowledge[]
  /** "organico" | "pago" — muda o vocabulário do briefing */
  destino: string
}

const IMPROVE_PROMPT = `Voce e Lidia, agente de marketing da Trifold (construtora de Maringa-PR). Um humano escreveu um pedido de post de forma corrida. Reescreva o pedido como um BRIEFING curto e completo que outro criativo executaria sem perguntar nada.

REGRAS:
- Mantenha TODAS as intencoes e restricoes do pedido original. NAO invente numeros, prazos ou promessas que nao estejam no pedido ou no Kit.
- Estruture em frases diretas (sem markdown, sem bullets): objetivo da peca, publico, angulo/argumento central, o que mostrar na imagem, CTA desejado.
- 3 a 6 frases, portugues do Brasil. Devolva SOMENTE o briefing reescrito, sem preambulo.`

export async function improveMarketingRequest(
  anthropic: Anthropic,
  input: ImproveMarketingRequestInput
): Promise<string | null> {
  try {
    const kit = input.brands
      .map((b) => {
        const parts = [`${b.tipo === "institucional" ? "MARCA" : "EMPREENDIMENTO"}: ${b.nome}`]
        if (b.voz_da_marca) parts.push(`Voz: ${b.voz_da_marca}`)
        if (b.diretrizes) parts.push(`Diretrizes (nunca violar): ${b.diretrizes}`)
        return parts.join(" · ")
      })
      .join("\n")

    const prompt = `${IMPROVE_PROMPT}

DESTINO DA PECA: ${input.destino === "pago" ? "anuncio de trafego pago (Meta Ads)" : "post organico"}
PECA PARA: ${input.empreendimentoNome ?? "institucional (a empresa)"}

KIT (contexto, nao inventar alem dele):
${kit || "sem Kit cadastrado"}

PEDIDO ORIGINAL DO HUMANO:
${input.pedido}`

    const response = await anthropic.messages.create(
      {
        model: ANTHROPIC_MODELS.haiku,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: 20000 }
    )

    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()

    return text.length > 0 ? text : null
  } catch {
    return null
  }
}
