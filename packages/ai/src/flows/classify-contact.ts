/**
 * Classificação de contato: lead de compra vs. não-lead.
 *
 * Usado na PRIMEIRA mensagem de um contato novo, ANTES de distribuir pela
 * roleta. Substitui a decisão por palavra-chave (frágil) por uma combinação
 * de fast-path de keyword + classificação por IA (Haiku), que entende casos
 * sutis (ex.: pitch profissional de candidato a emprego sem palavra óbvia).
 *
 * Princípio da assimetria: não distribuir um comprador real é pior que
 * distribuir um não-lead ocasional. Por isso, QUALQUER falha resolve para
 * `isLead: true` (default seguro).
 */
import type Anthropic from "@anthropic-ai/sdk"
import { isNonLeadContact } from "./handoff"

export type ContactCategory =
  | "lead"
  | "cliente_existente"
  | "emprego"
  | "parceria"
  | "fornecedor"
  | "midia"
  | "outro"

export interface ContactClassification {
  isLead: boolean
  category: ContactCategory
  reason: string
}

const CLASSIFY_PROMPT = `Voce classifica a PRIMEIRA mensagem de um contato novo no WhatsApp de uma incorporadora que vende apartamentos (Trifold Engenharia).

Decida se o contato e um LEAD (potencial comprador) ou NAO-LEAD.

LEAD = qualquer pessoa interessada em comprar, conhecer, visitar ou saber sobre os apartamentos/empreendimentos. Inclui perguntas sobre preco, plantas, vaga de garagem, andar, financiamento, localizacao, agendar visita. NA DUVIDA, e LEAD.

CLIENTE_EXISTENTE = a pessoa indica claramente que JA E CLIENTE da Trifold: ja comprou / ja tem um imovel, apartamento ou OBRA com a gente; fala da SUA obra/unidade; pergunta sobre o ANDAMENTO da construcao dela, fotos/documentos/boleto da obra dela; menciona contrato/financiamento JA firmado; ou responde que sim, ja e cliente. NAO confundir com quem quer COMPRAR (esse e LEAD). So marque cliente_existente com sinal EXPLICITO de que ja e cliente.

NAO-LEAD = contatos que NAO querem comprar imovel:
- "emprego": busca vaga de trabalho, envio de curriculo, quer fazer parte da equipe, oferece experiencia profissional para ajudar a empresa
- "parceria": proposta de parceria comercial
- "fornecedor": fornecedor ou prestador de servico oferecendo algo
- "midia": venda de publicidade, midia, anuncio, patrocinio
- "outro": claramente fora do escopo de compra de imovel

ATENCAO CRITICA: a palavra "vaga" sozinha quase sempre significa VAGA DE GARAGEM, que e interesse de COMPRA (LEAD). So e "emprego" quando o contexto e trabalho/curriculo/contratacao.

Responda APENAS com JSON valido, sem markdown, sem code blocks:
{"is_lead": true, "category": "lead", "reason": "motivo curto em portugues"}`

/**
 * Classifica a intenção de um contato novo. Retorna sempre um resultado
 * (nunca lança) — em caso de erro, default seguro `isLead: true`.
 */
export async function classifyContactIntent(
  anthropic: Anthropic,
  message: string,
  opts?: { hasDocument?: boolean }
): Promise<ContactClassification> {
  // Fast-path: keyword inequívoca de não-lead → não gasta chamada de LLM.
  if (isNonLeadContact(message)) {
    return {
      isLead: false,
      category: "outro",
      reason: "Palavra-chave de não-lead detectada (fast-path).",
    }
  }

  // Mensagem vazia/curtíssima sem documento → trata como lead (default seguro).
  const trimmed = message?.trim() ?? ""
  if (trimmed.length === 0 && !opts?.hasDocument) {
    return { isLead: true, category: "lead", reason: "Sem texto para classificar." }
  }

  const docNote = opts?.hasDocument
    ? "\n\n[O contato anexou um documento (possivel curriculo, proposta ou portfolio).]"
    : ""

  const prompt = `${CLASSIFY_PROMPT}

Mensagem do contato:
"${trimmed}"${docNote}`

  try {
    const response = await anthropic.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: 15000 }
    )

    const firstBlock = response.content[0]
    const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : ""
    return parseContactClassification(text)
  } catch {
    // Falha de rede/timeout/API → nunca bloquear um comprador real.
    return { isLead: true, category: "lead", reason: "Falha na classificação; default seguro." }
  }
}

const VALID_CATEGORIES: ContactCategory[] = [
  "lead",
  "cliente_existente",
  "emprego",
  "parceria",
  "fornecedor",
  "midia",
  "outro",
]

/**
 * Parseia o JSON do Haiku tolerando markdown/code blocks. Em qualquer
 * inconsistência, default seguro `isLead: true`.
 */
export function parseContactClassification(text: string): ContactClassification {
  try {
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim()
    const parsed = JSON.parse(cleaned)

    if (typeof parsed.is_lead !== "boolean") {
      return { isLead: true, category: "lead", reason: "Resposta inválida; default seguro." }
    }

    const category: ContactCategory = VALID_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : parsed.is_lead
        ? "lead"
        : "outro"

    return {
      isLead: parsed.is_lead,
      category,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    }
  } catch {
    return { isLead: true, category: "lead", reason: "Parse falhou; default seguro." }
  }
}
