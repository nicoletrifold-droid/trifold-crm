/**
 * Story 90-1 (Epic 90) — contrato de barrel do `@trifold/ai`.
 *
 * Por que este arquivo existe (gate FAIL do @qa, MF-3): o teste do helper mocka
 * `@trifold/ai` INTEIRO com `vi.mock`, o que fabrica todos os símbolos — inclusive
 * um que o módulo real não exportava (`loadMemoryContext`). Resultado: 39 testes
 * verdes conviveram com um import quebrado, que em produção viraria `undefined`,
 * lançaria TypeError e seria engolido pelo fail-open do coach. Falha permanente,
 * invisível.
 *
 * Este teste é a única coisa na suíte que olha o módulo REAL. Nada de `vi.mock`
 * aqui — é justamente o ponto.
 *
 * Se um símbolo novo passar a ser importado de `@trifold/ai` por
 * `generate-suggestion.ts`, acrescente-o à lista abaixo.
 */
import { describe, it, expect } from "vitest"
import * as ai from "@trifold/ai"

/** Exatamente o que `generate-suggestion.ts` importa do barrel. */
const SIMBOLOS_USADOS_PELO_COACH = [
  "createAnthropicClient",
  "detectObjection",
  "draftCoachReply",
  "isCoachEligible",
  "searchKnowledge",
  "buildContextFromRAG",
  "loadMemoryContext",
] as const

describe("@trifold/ai — contrato de barrel (sem mock)", () => {
  it.each(SIMBOLOS_USADOS_PELO_COACH)(
    "exporta %s como função",
    (nome) => {
      expect(typeof (ai as unknown as Record<string, unknown>)[nome]).toBe("function")
    }
  )

  it("a lista de símbolos cobre o que o helper realmente importa", async () => {
    // Guarda contra a lista envelhecer: lê o próprio fonte e confere que todo
    // símbolo do bloco de import de @trifold/ai está declarado acima.
    const fs = await import("node:fs")
    const path = await import("node:path")
    const fonte = fs.readFileSync(
      path.join(import.meta.dirname, "generate-suggestion.ts"),
      "utf8"
    )
    const bloco = fonte.match(/import\s*\{([^}]+)\}\s*from\s*"@trifold\/ai"/)
    const capturado = bloco?.[1]
    expect(capturado).toBeTruthy()

    const importados = (capturado ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^type\s+/, ""))
      .filter((s) => s.length > 0)

    expect([...importados].sort()).toEqual([...SIMBOLOS_USADOS_PELO_COACH].sort())
  })
})
