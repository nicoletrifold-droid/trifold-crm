/**
 * Story 83-2 (Epic 83) — helper CLIENT da revisão ortográfica de saída.
 * Devolve o texto corrigido quando a IA achou erro claro, ou null para
 * "envia como está" (sem erro, trivial, falha ou timeout — fail-open).
 */

const REVIEW_TIMEOUT_MS = 8000

export async function reviewOutgoing(text: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS)
  try {
    const res = await fetch("/api/messages/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as {
      has_errors?: boolean
      corrected?: string
    } | null
    if (!data?.has_errors || typeof data.corrected !== "string") return null
    const corrected = data.corrected.trim()
    if (!corrected || corrected === text.trim()) return null
    return corrected
  } catch {
    return null // fail-open: revisão nunca impede o envio
  } finally {
    clearTimeout(timer)
  }
}
