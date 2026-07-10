import { describe, it, expect } from "vitest"
import { lembreteEventKey } from "./boleto-lembrete-key"

describe("lembreteEventKey", () => {
  it("inclui o userId na chave (o bug era esquecê-lo)", () => {
    const k = lembreteEventKey("venc_hoje", "obra1", "user1", "2026-07-10")
    expect(k).toBe("venc_hoje:obra1:user1:2026-07-10")
    expect(k).toContain("user1")
  })

  it("clientes diferentes na MESMA obra+vencimento geram chaves distintas", () => {
    const a = lembreteEventKey("venc_hoje", "obra1", "userA", "2026-07-10")
    const b = lembreteEventKey("venc_hoje", "obra1", "userB", "2026-07-10")
    expect(a).not.toBe(b) // antes colidiam → só 1 recebia
  })

  it("o mesmo cliente+obra+marco+vencimento gera a MESMA chave (dedup intencional)", () => {
    const a = lembreteEventKey("venc_hoje", "obra1", "user1", "2026-07-10")
    const b = lembreteEventKey("venc_hoje", "obra1", "user1", "2026-07-10")
    expect(a).toBe(b)
  })

  it("marcos diferentes não colidem", () => {
    const venc = lembreteEventKey("venc_hoje", "obra1", "user1", "2026-07-10")
    const atraso = lembreteEventKey("atraso5", "obra1", "user1", "2026-07-10")
    expect(venc).not.toBe(atraso)
  })
})
