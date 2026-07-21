import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import {
  createAnthropicClient,
  reviewOutgoingMessage,
  isReviewEligible,
} from "@trifold/ai"

/**
 * POST /api/messages/review — Story 83-1 (Epic 83)
 *
 * Revisão ortográfica de mensagem humana antes do envio (guarda, não trava).
 * Genérica: qualquer usuário ativo que escreve no CRM (chat do lead, portal).
 * FAIL-OPEN por contrato: qualquer falha responde 200 com has_errors=false —
 * o composer NUNCA deixa de enviar por causa da revisão.
 *
 * Body: { text: string }
 * Resposta: { has_errors, corrected, reviewed }
 */
export const maxDuration = 30

const FAIL_OPEN = { has_errors: false, corrected: "", reviewed: false }

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const body = await request.json().catch(() => null)
    const text = typeof body?.text === "string" ? body.text : ""

    if (!text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 })
    }
    if (!isReviewEligible(text)) {
      return NextResponse.json({ ...FAIL_OPEN, corrected: text })
    }

    const anthropic = createAnthropicClient()
    const result = await reviewOutgoingMessage(anthropic, text)

    if (!result) {
      return NextResponse.json({ ...FAIL_OPEN, corrected: text })
    }

    return NextResponse.json({
      has_errors: result.has_errors,
      corrected: result.corrected,
      reviewed: true,
    })
  } catch (err) {
    console.error("[messages/review] fail-open:", err)
    return NextResponse.json(FAIL_OPEN)
  }
}
