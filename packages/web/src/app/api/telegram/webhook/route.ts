import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import type { MediaBlock } from "@trifold/ai"
import { getTelegramFileUrl, downloadFileAsBase64 } from "@trifold/bot"
import { logEvent } from "@web/lib/logger"

export const maxDuration = 60

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/jpg",
])

function prepareTextForTTS(text: string): string {
  let result = text

  // Primeiro: expandir abreviações com regex replace functions
  result = result
    .replace(/\b(\d{1,2})h\s?às\s?(\d{1,2})h/gi, (_: string, a: string, b: string) => `${numberToWords(a)} às ${numberToWords(b)}`)
    .replace(/\b(\d{1,2})h(\d{2})/gi, (_: string, h: string, m: string) => `${numberToWords(h)} e ${numberToWords(m)}`)
    .replace(/\b(\d{1,2})h\b/gi, (_: string, h: string) => `${numberToWords(h)} horas`)
    .replace(/\bdas\s+(\d{1,2})\s+às\s+(\d{1,2})/gi, (_: string, a: string, b: string) => `das ${numberToWords(a)} às ${numberToWords(b)}`)
    .replace(/(\d+)\s?m[²2]/gi, (_: string, n: string) => `${numberToWords(n)} metros quadrados`)
    .replace(/\b(\d+)%/gi, (_: string, n: string) => `${numberToWords(n)} por cento`)
    .replace(/R\$\s?/gi, "")

  // Expandir com substituições estáticas
  const expansions: [RegExp, string][] = [
    // Datas/anos
    [/\b2029\b/g, "dois mil e vinte e nove"],
    [/\b2027\b/g, "dois mil e vinte e sete"],
    [/\b2028\b/g, "dois mil e vinte e oito"],
    [/\b2026\b/g, "dois mil e vinte e seis"],
    // Endereços
    [/\b1337\b/g, "mil trezentos e trinta e sete"],
    [/\b547\b/g, "quinhentos e quarenta e sete"],
    [/\b168\b/g, "cento e sessenta e oito"],
    // Metragens
    [/\b83,66\b/g, "oitenta e três"],
    [/\b79,81\b/g, "quase oitenta"],
    [/\b66,91\b/g, "quase sessenta e sete"],
    // Abreviações — TODAS devem ser expandidas antes do TTS
    [/\bAv\b\.?\s?/gi, "Avenida "],
    [/\bR\b\.\s?/gi, "Rua "],
    [/\bn[°ºo]\s?/gi, "número "],
    [/\bDr\b\.?\s?/gi, "Doutor "],
    [/\bProf\b\.?\s?/gi, "Professor "],
    [/\bseg\b/gi, "segunda"],
    [/\bsex\b/gi, "sexta"],
    [/\bsáb\b/gi, "sábado"],
    [/\bdom\b/gi, "domingo"],
    [/\bmin\b/gi, "minutos"],
    [/\bkm\b/gi, "quilômetros"],
    [/\betc\b\.?/gi, "etcétera"],
  ]

  for (const [pattern, replacement] of expansions) {
    if (typeof replacement === "string") {
      result = result.replace(pattern, replacement)
    } else {
      result = result.replace(pattern, replacement as (...args: string[]) => string)
    }
  }

  // Tornar coloquial
  result = result
    .replace(/\bpara o\b/gi, "pro")
    .replace(/\bpara a\b/gi, "pra")
    .replace(/\bpara\b/gi, "pra")
    .replace(/\bnão é\b/gi, "né")
    .replace(/\bao meio dia\b/gi, "ao meio-dia")
    .replace(/\bsegunda a sexta\b/gi, "segunda à sexta")

  // Sem SSML breaks — Gigi pausa naturalmente pela pontuação

  // Limitar tamanho (áudio longo fica monótono)
  if (result.length > 500) {
    const sentences = result.split(/[.!]/).filter(s => s.trim())
    result = sentences.slice(0, 4).join(". ") + "."
  }

  return result.trim()
}

function numberToWords(n: string | number): string {
  const num = typeof n === "string" ? parseInt(n, 10) : n
  const words: Record<number, string> = {
    0: "zero", 1: "uma", 2: "duas", 3: "três", 4: "quatro", 5: "cinco",
    6: "seis", 7: "sete", 8: "oito", 9: "nove", 10: "dez",
    11: "onze", 12: "doze", 13: "treze", 14: "quatorze", 15: "quinze",
    16: "dezesseis", 17: "dezessete", 18: "dezoito", 19: "dezenove",
    20: "vinte", 30: "trinta", 40: "quarenta", 48: "quarenta e oito",
    50: "cinquenta", 60: "sessenta", 67: "sessenta e sete", 80: "oitenta",
  }
  if (words[num]) return words[num]
  if (num < 100) {
    const tens = Math.floor(num / 10) * 10
    const ones = num % 10
    return (words[tens] ?? String(tens)) + (ones ? " e " + (words[ones] ?? String(ones)) : "")
  }
  return String(num)
}

function fixAccents(text: string): string {
  const replacements: [RegExp, string][] = [
    [/\bvoce\b/gi, "você"],
    [/\bnao\b/gi, "não"],
    [/\btambem\b/gi, "também"],
    [/\besta\b/gi, "está"],
    [/\bsera\b/gi, "será"],
    [/\bimovel\b/gi, "imóvel"],
    [/\bimoveis\b/gi, "imóveis"],
    [/\bproximo\b/gi, "próximo"],
    [/\bhorario\b/gi, "horário"],
    [/\bhorarios\b/gi, "horários"],
    [/\bvisao\b/gi, "visão"],
    [/\bpadrao\b/gi, "padrão"],
    [/\bvalorizacao\b/gi, "valorização"],
    [/\blocalizacao\b/gi, "localização"],
    [/\binformacao\b/gi, "informação"],
    [/\binformacoes\b/gi, "informações"],
    [/\bcondicoes\b/gi, "condições"],
    [/\bcondicao\b/gi, "condição"],
    [/\bopcoes\b/gi, "opções"],
    [/\bopcao\b/gi, "opção"],
    [/\bprevisao\b/gi, "previsão"],
    [/\bchurrasqueira\b/gi, "churrasqueira"],
    [/\bMaringa\b/g, "Maringá"],
    [/\bItorobo\b/gi, "Itororó"],
    [/\bItoboro\b/gi, "Itororó"],
    [/\bvoces\b/gi, "vocês"],
    [/\bja\b/gi, "já"],
    [/\bate\b/gi, "até"],
    [/\bso\b/gi, "só"],
    [/\bpos\b/gi, "pós"],
    [/\bpre\b/gi, "pré"],
    [/\bcafe\b/gi, "café"],
    [/\bserio\b/gi, "sério"],
    [/\botimo\b/gi, "ótimo"],
    [/\botima\b/gi, "ótima"],
    [/\bincrivel\b/gi, "incrível"],
    [/\bpossivel\b/gi, "possível"],
    [/\bacessivel\b/gi, "acessível"],
    [/\bcomodo\b/gi, "cômodo"],
    [/\banimo\b/gi, "ânimo"],
    [/\barea\b/gi, "área"],
    [/\bareas\b/gi, "áreas"],
    [/\bsuite\b/gi, "suíte"],
    [/\bsuites\b/gi, "suítes"],
    [/\bai\b/gi, "aí"],
    [/\bduvida\b/gi, "dúvida"],
    [/\bduvidas\b/gi, "dúvidas"],
    [/\bpratico\b/gi, "prático"],
    [/\bunico\b/gi, "único"],
    [/\bunica\b/gi, "única"],
    [/\bproprio\b/gi, "próprio"],
    [/\bpropria\b/gi, "própria"],
    [/\bnecessario\b/gi, "necessário"],
    [/\bnecessaria\b/gi, "necessária"],
    [/\bdisponivel\b/gi, "disponível"],
    [/\bdisponiveis\b/gi, "disponíveis"],
    [/\bla\b/g, "lá"],
    [/\bpe\b/g, "pé"],
  ]

  let result = text
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement)
  }
  return result
}

async function sendTypingAction(chatId: string): Promise<void> {
  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
      signal: AbortSignal.timeout(10000),
    }
  ).catch(() => {})
}

function calculateTypingDelay(text: string): number {
  // Simulate human typing: ~40-60 chars per second + base delay
  const charDelay = Math.min(text.length * 25, 3000) // max 3s per paragraph
  const baseDelay = 800 + Math.random() * 400 // 800-1200ms base
  return Math.round(baseDelay + charDelay)
}

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(30000),
    }
  ).catch(() => {})
}

// If Telegram is not configured, return 404
export async function POST(request: NextRequest) {
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Validate webhook secret (always required when configured)
  const secret = request.headers.get("x-telegram-bot-api-secret-token")
  if (!TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 })
  }
  if (secret !== TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const message = body.message
  if (!message) {
    return NextResponse.json({ status: "ok" })
  }

  const chatId = String(message.chat.id)
  const from = `tg:${chatId}`

  // Determine message content and media
  let text: string = message.text ?? ""
  let mediaBlock: MediaBlock | undefined
  let mediaMetadata: { media_type?: string; media_url?: string } = {}

  // Handle voice messages — transcribe with OpenAI Whisper
  if (message.voice) {
    const fileId = message.voice.file_id as string
    console.log("Voice message received, file_id:", fileId)

    const fileUrl = await getTelegramFileUrl(TELEGRAM_BOT_TOKEN, fileId)
    console.log("File URL:", fileUrl ? "got URL" : "FAILED to get URL")

    const openaiKey = process.env.OPENAI_API_KEY
    console.log("OpenAI key:", openaiKey ? "present (" + openaiKey.slice(0, 10) + "...)" : "MISSING")

    if (fileUrl && openaiKey) {
      try {
        const audioRes = await fetch(fileUrl, { signal: AbortSignal.timeout(30000) })
        console.log("Audio download:", audioRes.ok ? "OK" : "FAILED " + audioRes.status)
        const audioBuffer = await audioRes.arrayBuffer()
        console.log("Audio size:", audioBuffer.byteLength, "bytes")

        const formData = new FormData()
        formData.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "voice.ogg")
        formData.append("model", "whisper-1")
        formData.append("language", "pt")

        const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: formData,
          signal: AbortSignal.timeout(30000),
        })

        console.log("Whisper response:", whisperRes.status)

        if (whisperRes.ok) {
          const whisperData = await whisperRes.json() as { text: string }
          text = whisperData.text || "[Áudio não reconhecido]"
          console.log("Transcribed:", text)
        } else {
          const errBody = await whisperRes.text()
          console.error("Whisper error:", errBody)
          text = "Recebi seu audio mas nao consegui ouvir direito. Pode me escrever por texto?"
        }
      } catch (err) {
        console.error("Voice processing error:", err)
        text = "Recebi seu audio mas nao consegui ouvir direito. Pode me escrever por texto?"
      }
    } else {
      text = text || "Recebi seu audio mas nao consegui ouvir direito. Pode me escrever por texto?"
    }
    mediaMetadata = { media_type: "voice" }
  }

  // Handle photo messages
  if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
    const largestPhoto = message.photo[message.photo.length - 1]
    const fileId = largestPhoto.file_id as string

    const fileUrl = await getTelegramFileUrl(TELEGRAM_BOT_TOKEN, fileId)
    if (fileUrl) {
      const fileData = await downloadFileAsBase64(fileUrl)
      if (fileData) {
        mediaBlock = {
          type: "image",
          base64: fileData.base64,
          mimeType: fileData.mimeType,
        }
        mediaMetadata = { media_type: "image", media_url: fileUrl }
      }
    }
    text = text || message.caption || "O que voce acha desta imagem?"
  }

  // Handle document messages
  if (message.document) {
    const doc = message.document
    const fileId = doc.file_id as string
    const mimeType = (doc.mime_type as string) || "application/octet-stream"

    const fileUrl = await getTelegramFileUrl(TELEGRAM_BOT_TOKEN, fileId)
    if (fileUrl) {
      const fileData = await downloadFileAsBase64(fileUrl)
      if (fileData) {
        if (IMAGE_MIME_TYPES.has(mimeType)) {
          mediaBlock = {
            type: "image",
            base64: fileData.base64,
            mimeType: fileData.mimeType,
          }
          mediaMetadata = { media_type: "image", media_url: fileUrl }
        } else if (mimeType === "application/pdf") {
          mediaBlock = {
            type: "document",
            base64: fileData.base64,
            mimeType: fileData.mimeType,
          }
          mediaMetadata = { media_type: "document", media_url: fileUrl }
        } else {
          mediaMetadata = { media_type: "document", media_url: fileUrl }
        }
      }
    }
    text = text || message.caption || "Recebi um documento."
  }

  // If no text and no media content, skip
  if (!text && !mediaBlock) {
    return NextResponse.json({ status: "ok" })
  }

  const supabase = createAdminClient()

  try {
    // Get org (use first org for staging)
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .single()

    if (!org) {
      return NextResponse.json({ status: "ok" })
    }

    const orgId = org.id

    // Find or create lead
    let { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("phone", from)
      .eq("org_id", orgId)
      .single()

    if (!lead) {
      const { data: defaultStage } = await supabase
        .from("kanban_stages")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_default", true)
        .single()

      const userName = [
        message.from?.first_name,
        message.from?.last_name,
      ]
        .filter(Boolean)
        .join(" ") || null

      const { data: newLead } = await supabase
        .from("leads")
        .insert({
          org_id: orgId,
          phone: from,
          name: userName,
          channel: "telegram",
          source: "telegram",
          stage_id: defaultStage?.id,
        })
        .select("id")
        .single()

      lead = newLead
    }

    if (!lead) {
      return NextResponse.json({ status: "ok" })
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id, is_ai_active")
      .eq("lead_id", lead.id)
      .eq("status", "active")
      .single()

    if (!conversation) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          org_id: orgId,
          lead_id: lead.id,
          channel: "telegram",
          is_ai_active: true,
        })
        .select("id, is_ai_active")
        .single()

      conversation = newConv
    }

    if (!conversation) {
      return NextResponse.json({ status: "ok" })
    }

    // Save incoming message
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
      metadata: {
        telegram_message_id: message.message_id,
        ...mediaMetadata,
      },
    })

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id)

    // Process with Nicole AI
    if (conversation.is_ai_active) {
      // Show typing while Nicole thinks
      await sendTypingAction(chatId)

      try {
        const { processMessage, createAnthropicClient } = await import("@trifold/ai")

        const anthropic = createAnthropicClient()

        const aiStart = Date.now()
        const response = await processMessage({
          supabase,
          anthropic,
          conversationId: conversation.id,
          message: text,
          orgId,
          mediaBlock,
          onEvent: (event) => logEvent({
            ...event,
            category: event.category as "bot" | "ai" | "webhook" | "auth" | "cron" | "system",
            source: "ai/pipeline",
            org_id: orgId,
            metadata: { ...event.metadata, conversation_id: conversation.id, lead_id: lead.id },
          }),
        })
        const aiDuration = Date.now() - aiStart

        // AC11: Log mensagem processada com tempo
        logEvent({
          level: "info",
          category: "bot",
          event_type: "MESSAGE_PROCESSED",
          message: `Telegram message processed in ${aiDuration}ms`,
          metadata: {
            channel: "telegram",
            message_type: mediaMetadata.media_type ?? "text",
            response_time_ms: aiDuration,
            conversation_id: conversation.id,
            lead_id: lead.id,
          },
          source: "api/telegram/webhook",
          org_id: orgId,
        })

        console.log("Nicole response:", response ? response.slice(0, 80) + "..." : "EMPTY")

        // Strip markdown and fix common missing accents
        const cleanResponse = fixAccents(
          response
            .replace(/\*\*/g, "")
            .replace(/\*/g, "")
            .replace(/^#{1,6}\s+/gm, "")
            .replace(/^[-*]\s+/gm, "")
            .replace(/`/g, "")
        )

        // Split response into paragraphs and send each as separate message
        const paragraphs = cleanResponse
          .split(/\n\n+/)
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 0)

        // If lead sent voice, respond with voice — UNLESS response contains address/link (send text instead)
        const elevenLabsKey = process.env.ELEVENLABS_API_KEY
        const openaiKey = process.env.OPENAI_API_KEY
        const hasAddress = /\b(Av\.|Avenida|Rua|R\.)\b/i.test(cleanResponse) ||
          /\d{3,5}/.test(cleanResponse) ||
          /Vila|Jardim|Gleba|Marumby/i.test(cleanResponse)
        const respondWithVoice = mediaMetadata.media_type === "voice" && (elevenLabsKey || openaiKey) && !hasAddress
        let voiceSent = false

        if (respondWithVoice) {
          await sendTypingAction(chatId)
          try {
            let audioBuffer: ArrayBuffer | null = null

            if (elevenLabsKey) {
              // ElevenLabs TTS — Rachel voice with natural settings
              const ttsText = prepareTextForTTS(cleanResponse)
              const ttsRes = await fetch(
                "https://api.elevenlabs.io/v1/text-to-speech/jBpfuIE2acCO8z3wKNLl?output_format=mp3_44100_128",
                {
                  method: "POST",
                  headers: {
                    "xi-api-key": elevenLabsKey,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    text: ttsText,
                    model_id: "eleven_turbo_v2_5",
                    voice_settings: {
                      stability: 0.10,
                      similarity_boost: 0.75,
                      style: 0.85,
                      use_speaker_boost: true,
                    },
                  }),
                  signal: AbortSignal.timeout(30000),
                }
              )
              if (ttsRes.ok) {
                audioBuffer = await ttsRes.arrayBuffer()
              } else {
                console.error("ElevenLabs error:", await ttsRes.text())
              }
            }

            // Fallback to OpenAI TTS if ElevenLabs failed or unavailable
            if (!audioBuffer && openaiKey) {
              const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${openaiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "tts-1-hd",
                  voice: "nova",
                  input: cleanResponse,
                  response_format: "opus",
                }),
                signal: AbortSignal.timeout(30000),
              })
              if (ttsRes.ok) audioBuffer = await ttsRes.arrayBuffer()
            }

            if (audioBuffer) {
              const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" })
              const formData = new FormData()
              formData.append("chat_id", chatId)
              formData.append("voice", audioBlob, "response.ogg")

              await fetch(
                `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`,
                { method: "POST", body: formData, signal: AbortSignal.timeout(30000) }
              ).catch(() => {})
              voiceSent = true
            }
          } catch (ttsErr) {
            console.error("TTS error:", ttsErr)
          }
        }

        // Always send text if voice wasn't sent (fallback)
        if (!voiceSent) {
          for (let i = 0; i < paragraphs.length; i++) {
            await sendTypingAction(chatId)
            const delay = calculateTypingDelay(paragraphs[i])
            await new Promise((r) => setTimeout(r, delay))
            await sendTelegramMessage(chatId, paragraphs[i])
          }
        }
      } catch (aiError) {
        // AC10: Log erro de AI
        logEvent({
          level: "error",
          category: "bot",
          event_type: "AI_PROCESSING_ERROR",
          message: `AI processing failed: ${aiError instanceof Error ? aiError.message : String(aiError)}`,
          metadata: {
            channel: "telegram",
            conversation_id: conversation.id,
            lead_id: lead.id,
            error: aiError instanceof Error ? aiError.stack : String(aiError),
          },
          source: "api/telegram/webhook",
          org_id: orgId,
        })
        // Send fallback message
        await sendTelegramMessage(
          chatId,
          "Oi! Tive um probleminha tecnico. Pode repetir sua mensagem?"
        )
      }
    }

    return NextResponse.json({ status: "ok" })
  } catch (error) {
    logEvent({
      level: "error",
      category: "webhook",
      event_type: "WEBHOOK_ERROR",
      message: `Telegram webhook error: ${error instanceof Error ? error.message : String(error)}`,
      metadata: { error: error instanceof Error ? error.stack : String(error) },
      source: "api/telegram/webhook",
    })
    return NextResponse.json({ status: "ok" })
  }
}
