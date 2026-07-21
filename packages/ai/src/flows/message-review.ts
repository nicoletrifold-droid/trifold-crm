import type Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC_MODELS } from "../client/anthropic"

/**
 * Story 83-1 (Epic 83) — Revisão ortográfica de mensagem humana ANTES do envio.
 * Guarda, não trava: quem chama trata null/erro como "envia sem revisão"
 * (fail-open). Regra de produto: MUDANÇA MÍNIMA — corrige erro claro, nunca
 * formaliza nem reescreve o tom de WhatsApp.
 */

export interface MessageReviewResult {
  has_errors: boolean
  corrected: string
}

const REVIEW_PROMPT = `Voce e um revisor de mensagens de WhatsApp/chat de uma equipe de vendas e atendimento imobiliario brasileira.

Sua UNICA tarefa: corrigir erros CLAROS de ortografia, acentuacao, concordancia e digitacao na mensagem abaixo.

NAO ALTERE (mesmo que "melhorasse" o texto):
- tom informal e coloquial (a mensagem e de WhatsApp, informalidade e intencional)
- abreviacoes intencionais: vc, tb, blz, pq, obg, hj, msg e similares
- girias e expressoes regionais
- emojis e pontuacao expressiva (!!, ?!, ...)
- nomes proprios de pessoas, empreendimentos e lugares
- numeros, valores, datas, horarios, links e telefones
- quebras de linha e formatacao

NAO reescreva frases, NAO formalize, NAO acrescente nem remova conteudo. Mudanca minima.

Retorne APENAS JSON valido, sem markdown:
{"has_errors": true|false, "corrected": "a mensagem INTEGRAL corrigida (identica ao original se has_errors=false)"}

Se nao houver erro CLARO, has_errors=false. Na duvida, NAO corrija.`

/** Elegibilidade: mensagens triviais não valem uma chamada de IA. */
export function isReviewEligible(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 8) return false
  // precisa ter letras (só emoji/números/link não se revisa)
  if (!/[a-záéíóúâêôãõàçüA-ZÁÉÍÓÚÂÊÔÃÕÀÇÜ]{3,}/.test(trimmed)) return false
  return true
}

export async function reviewOutgoingMessage(
  anthropic: Anthropic,
  text: string
): Promise<MessageReviewResult | null> {
  const response = await anthropic.messages.create(
    {
      model: ANTHROPIC_MODELS.haiku,
      max_tokens: 1400,
      messages: [
        { role: "user", content: `${REVIEW_PROMPT}\n\nMENSAGEM:\n${text}` },
      ],
    },
    { timeout: 6000 }
  )

  // Lição 82-4: nunca ler content[0] — concatenar só os blocos de texto.
  const raw = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
  return parseMessageReview(raw, text)
}

/**
 * Parse defensivo. Normalizações anti-ruído:
 * - corrected vazio ou igual ao original → has_errors=false (nunca sugerir à toa)
 * - qualquer formato inválido → null (fail-open no chamador)
 */
export function parseMessageReview(
  raw: string,
  original: string
): MessageReviewResult | null {
  try {
    let cleaned = raw.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim()
    if (!cleaned.startsWith("{")) {
      const start = cleaned.indexOf("{")
      const end = cleaned.lastIndexOf("}")
      if (start === -1 || end <= start) return null
      cleaned = cleaned.slice(start, end + 1)
    }
    const parsed = JSON.parse(cleaned) as Record<string, unknown>

    if (typeof parsed.has_errors !== "boolean" || typeof parsed.corrected !== "string") {
      return null
    }

    const corrected = parsed.corrected
    const meaningful =
      parsed.has_errors && corrected.trim().length > 0 && corrected.trim() !== original.trim()

    return {
      has_errors: meaningful,
      corrected: meaningful ? corrected : original,
    }
  } catch {
    return null
  }
}
