// Transcrição de áudio (fala → texto) via OpenAI Whisper.
//
// Objetivo: qualquer áudio recebido de lead/cliente vira TEXTO legível por todos os
// usuários do sistema (independe de navegador/aparelho — resolve iPhone/Safari, que não
// tocam OGG/Opus) e alimenta a IA (Nicole) pra ela entender o que foi dito.
//
// DEFENSIVO: nunca lança. Retorna a transcrição ou `null` (falta de chave, erro de rede,
// falha da API) — o chamador decide o fallback (ex.: manter o áudio + rótulo).
//
// Extraído do padrão que já rodava no webhook do Telegram (Whisper `whisper-1`, pt).

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions"
const WHISPER_MODEL = "whisper-1"

export interface TranscribeResult {
  text: string
}

/**
 * Transcreve um buffer de áudio para texto (português).
 *
 * @param buffer   bytes do arquivo de áudio (ArrayBuffer)
 * @param mimeType MIME do áudio (ex.: "audio/ogg"); usado só p/ nomear o Blob
 * @param opts.timeoutMs timeout da chamada ao Whisper (default 30s)
 * @returns o texto transcrito (trim) ou `null` se não foi possível transcrever
 */
export async function transcribeAudio(
  buffer: ArrayBuffer,
  mimeType = "audio/ogg",
  opts: { timeoutMs?: number } = {}
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error("[transcribe] OPENAI_API_KEY ausente — pulando transcrição")
    return null
  }
  if (!buffer || buffer.byteLength === 0) return null

  const ext = (mimeType.split("/")[1] || "ogg").split(";")[0]

  try {
    const formData = new FormData()
    formData.append("file", new Blob([buffer], { type: mimeType }), `audio.${ext}`)
    formData.append("model", WHISPER_MODEL)
    formData.append("language", "pt")

    const res = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => "")
      console.error("[transcribe] Whisper falhou:", res.status, errBody.slice(0, 300))
      return null
    }

    const data = (await res.json()) as Partial<TranscribeResult>
    const text = (data.text ?? "").trim()
    return text || null
  } catch (err) {
    console.error("[transcribe] erro (ignorado):", err)
    return null
  }
}
