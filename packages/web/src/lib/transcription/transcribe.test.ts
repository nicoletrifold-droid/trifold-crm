import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { transcribeAudio } from "./transcribe"

const buf = () => new TextEncoder().encode("fake-audio-bytes").buffer

describe("transcribeAudio", () => {
  const OLD_KEY = process.env.OPENAI_API_KEY

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test-key"
    vi.restoreAllMocks()
  })
  afterEach(() => {
    process.env.OPENAI_API_KEY = OLD_KEY
  })

  it("retorna null sem OPENAI_API_KEY (não chama a API)", async () => {
    delete process.env.OPENAI_API_KEY
    const fetchMock = vi.spyOn(globalThis, "fetch")
    const r = await transcribeAudio(buf(), "audio/ogg")
    expect(r).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("retorna null com buffer vazio (não chama a API)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    const r = await transcribeAudio(new ArrayBuffer(0), "audio/ogg")
    expect(r).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("retorna o texto transcrito no caso feliz (200)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "  Quero um apê de frente  " }), { status: 200 })
    )
    const r = await transcribeAudio(buf(), "audio/ogg")
    expect(r).toBe("Quero um apê de frente") // trim aplicado
  })

  it("retorna null quando o Whisper responde erro (não-2xx)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 })
    )
    const r = await transcribeAudio(buf(), "audio/ogg")
    expect(r).toBeNull()
  })

  it("retorna null quando o texto vem vazio", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "   " }), { status: 200 })
    )
    const r = await transcribeAudio(buf(), "audio/ogg")
    expect(r).toBeNull()
  })

  it("retorna null (defensivo) quando o fetch lança", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"))
    const r = await transcribeAudio(buf(), "audio/ogg")
    expect(r).toBeNull()
  })
})
