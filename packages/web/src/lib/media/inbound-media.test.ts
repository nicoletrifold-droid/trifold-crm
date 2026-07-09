import { describe, it, expect, vi } from "vitest"
import { uploadInboundMedia } from "./inbound-media"
import type { SupabaseClient } from "@supabase/supabase-js"

function makeAdmin(opts: { uploadError?: { message: string } | null; publicUrl?: string }) {
  const from = vi.fn(() => ({
    upload: vi.fn().mockResolvedValue({ error: opts.uploadError ?? null }),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: opts.publicUrl ?? "https://cdn/x.ogg" } })),
  }))
  return { storage: { from } } as unknown as SupabaseClient
}

const buf = () => new TextEncoder().encode("x").buffer

describe("uploadInboundMedia", () => {
  it("sobe o arquivo e devolve a URL pública no caso feliz", async () => {
    const admin = makeAdmin({ publicUrl: "https://cdn/audio.ogg" })
    const url = await uploadInboundMedia(admin, buf(), "audio/ogg", "lead-1")
    expect(url).toBe("https://cdn/audio.ogg")
  })

  it("retorna null (defensivo) quando o upload falha", async () => {
    const admin = makeAdmin({ uploadError: { message: "boom" } })
    const url = await uploadInboundMedia(admin, buf(), "audio/ogg", "lead-1")
    expect(url).toBeNull()
  })
})
