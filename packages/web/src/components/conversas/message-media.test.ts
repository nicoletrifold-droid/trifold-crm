/**
 * Story 75-85 — MessageMedia. Sem DOM (ambiente node): inspecionamos a árvore de
 * elementos React retornada pelo componente (função pura, sem hooks).
 */
import { describe, it, expect } from "vitest"
import { MessageMedia } from "./message-media"

// Busca recursiva por um elemento de um dado `type` (tag) na árvore.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function find(node: any, tag: string): any {
  if (!node || typeof node !== "object") return null
  if (node.type === tag) return node
  const ch = node.props?.children
  const arr = Array.isArray(ch) ? ch : [ch]
  for (const c of arr) {
    const f = find(c, tag)
    if (f) return f
  }
  return null
}

describe("MessageMedia", () => {
  it("sem media_type e sem url → null", () => {
    expect(MessageMedia({})).toBeNull()
  })

  it("imagem com url → renderiza <img src>", () => {
    const el = MessageMedia({ mediaType: "image", mediaUrl: "https://x/foto.jpg" })
    const img = find(el, "img")
    expect(img).toBeTruthy()
    expect(img.props.src).toBe("https://x/foto.jpg")
  })

  it("imagem SEM url → rótulo, sem <img> quebrado", () => {
    const el = MessageMedia({ mediaType: "image" })
    expect(el).not.toBeNull()
    expect(find(el, "img")).toBeNull()
  })

  it("áudio/voz com url → <audio src>", () => {
    const el = MessageMedia({ mediaType: "voice", mediaUrl: "https://x/a.ogg" })
    const audio = find(el, "audio")
    expect(audio).toBeTruthy()
    expect(audio.props.src).toBe("https://x/a.ogg")
  })

  it("documento com url → link <a href>", () => {
    const el = MessageMedia({ mediaType: "document", mediaUrl: "https://x/d.pdf" })
    const a = find(el, "a")
    expect(a).toBeTruthy()
    expect(a.props.href).toBe("https://x/d.pdf")
  })

  // ---- Story 75-289 (AC4) — mídia que não baixou precisa GRITAR ----------

  // Busca recursiva por texto em qualquer nó da árvore.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function texto(node: any): string {
    if (node === null || node === undefined || typeof node === "boolean") return ""
    if (typeof node === "string" || typeof node === "number") return String(node)
    const ch = node.props?.children
    const arr = Array.isArray(ch) ? ch : [ch]
    return arr.map(texto).join(" ")
  }

  it("75-289: voz que NÃO baixou → aviso explícito, não o rótulo cinza de sempre", () => {
    const el = MessageMedia({ mediaType: "voice", downloadFailed: true })
    const t = texto(el)
    // Antes isto era "🎤 Mensagem de voz" em opacity-70 — indistinguível de
    // "ainda carregando". Era assim que os 2 áudios de 10/08 passaram batidos.
    expect(t).toContain("não foi baixada")
    expect(t).toContain("mensagem de voz")
  })

  it("75-289: sem onRetry (render server) mostra o aviso e orienta, sem botão", () => {
    const el = MessageMedia({ mediaType: "voice", downloadFailed: true })
    expect(find(el, "button")).toBeNull()
    expect(texto(el)).toContain("Abra a conversa")
  })

  it("75-289: com onRetry → botão 'Baixar agora'", () => {
    const el = MessageMedia({ mediaType: "voice", downloadFailed: true, onRetry: () => {} })
    expect(find(el, "button")).toBeTruthy()
    expect(texto(el)).toContain("Baixar agora")
  })

  it("75-289: downloadFailed mas COM url → não acusa falha (baixou numa 2a tentativa)", () => {
    const el = MessageMedia({ mediaType: "voice", mediaUrl: "https://x/a.ogg", downloadFailed: true })
    expect(find(el, "audio")).toBeTruthy()
    expect(texto(el)).not.toContain("não foi baixada")
  })

  it("75-289: imagem/documento que não baixaram usam o rótulo certo", () => {
    expect(texto(MessageMedia({ mediaType: "image", downloadFailed: true }))).toContain("imagem")
    expect(texto(MessageMedia({ mediaType: "document", downloadFailed: true }))).toContain("documento")
  })

  it("75-289: áudio baixado com transcribed=false → avisa que a Nicole não leu", () => {
    const el = MessageMedia({ mediaType: "voice", mediaUrl: "https://x/a.ogg", transcribed: false })
    expect(find(el, "audio")).toBeTruthy() // o corretor ainda ouve
    expect(texto(el)).toContain("Sem transcrição")
    expect(texto(el)).toContain("Nicole")
  })

  it("75-289: transcribed undefined (mensagem legada) NÃO é acusado de falta de transcrição", () => {
    const el = MessageMedia({ mediaType: "voice", mediaUrl: "https://x/a.ogg" })
    expect(texto(el)).not.toContain("Sem transcrição")
  })

  it("75-289: transcribed=true não polui a bolha", () => {
    const el = MessageMedia({ mediaType: "voice", mediaUrl: "https://x/a.ogg", transcribed: true })
    expect(texto(el)).not.toContain("Sem transcrição")
  })
})
