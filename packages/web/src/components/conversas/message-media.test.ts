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
})
