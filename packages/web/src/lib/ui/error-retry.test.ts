// Story 75-299 — AC2b. ⚠️ O nome TEM de terminar em `.test.ts`: `vitest.config.ts`
// inclui só `packages/web/src/**/*.test.ts`, então um `.test.tsx` passaria "verde" por
// nunca ter sido executado (cobertura falsa).

import { describe, it, expect, vi } from "vitest"
import { pickRetry } from "./error-retry"

describe("pickRetry", () => {
  it("usa `unstable_retry` quando o runtime a fornece (é ela que RE-BUSCA)", () => {
    const unstable_retry = vi.fn()
    const reset = vi.fn()

    pickRetry({ unstable_retry, reset })()

    expect(unstable_retry).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })

  it("cai para `reset` quando `unstable_retry` não existe (upgrade do Next renomeia/remove a prop)", () => {
    const reset = vi.fn()

    // Exatamente o que o runtime injetaria: `undefined`. O `tsc` NÃO denuncia isso em
    // `error.tsx` (o Next não gera validador para esse arquivo) — quem segura é o
    // fallback abaixo.
    pickRetry({ unstable_retry: undefined, reset })()

    expect(reset).toHaveBeenCalledTimes(1)
  })

  it("cai para `reset` também quando a prop nem é passada", () => {
    const reset = vi.fn()

    pickRetry({ reset })()

    expect(reset).toHaveBeenCalledTimes(1)
  })

  it("devolve a própria referência, não um wrapper (o botão não perde identidade entre renders)", () => {
    const unstable_retry = () => {}
    const reset = () => {}

    expect(pickRetry({ unstable_retry, reset })).toBe(unstable_retry)
    expect(pickRetry({ reset })).toBe(reset)
  })
})
