import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  validateChangeReason,
  validatePromptContent,
} from "./agent-prompts"
import { promptParity } from "./agent-prompts-parity"

/**
 * Story 87-1 — as duas metades da governança que dá para testar sem banco:
 * a validação do motivo (AC2) e o selo de paridade (AC6).
 *
 * O selo é testado contra o snapshot REAL commitado, e não contra um fixture, porque o
 * que precisa continuar verdadeiro é que ele concorda com o `npm run prompts:check` —
 * são dois caminhos de código independentes sobre a mesma normalização. Um fixture
 * testaria o selo contra ele mesmo.
 */

const SNAPSHOT_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "ai",
  "src",
  "prompts",
  "_production"
)

function conteudoDoSnapshot(slug: string): string {
  return readFileSync(path.join(SNAPSHOT_DIR, `${slug}.txt`), "utf8")
}

describe("validateChangeReason (AC2)", () => {
  it("rejeita motivo ausente com uma mensagem que explica o porquê", () => {
    const r = validateChangeReason(undefined)
    expect(r.ok).toBe(false)
    // A AC2 exige mensagem ÚTIL: "não gravou" sem explicação é o defeito que ela corrige.
    if (!r.ok) expect(r.error.length).toBeGreaterThan(30)
  })

  it("rejeita string vazia e só-espaços", () => {
    expect(validateChangeReason("").ok).toBe(false)
    expect(validateChangeReason("      ").ok).toBe(false)
  })

  it("rejeita o motivo-alibi (Risco 2: o campo preenchido com '.')", () => {
    expect(validateChangeReason(".").ok).toBe(false)
    expect(validateChangeReason("ok").ok).toBe(false)
    expect(validateChangeReason("a".repeat(MIN_REASON_LENGTH - 1)).ok).toBe(false)
  })

  it("aceita a partir do mínimo e normaliza espaços", () => {
    const r = validateChangeReason("  corrige   o nome do   empreendimento  ")
    expect(r).toEqual({ ok: true, value: "corrige o nome do empreendimento" })
  })

  it("rejeita motivo maior que o teto (uma linha, não um changelog)", () => {
    expect(validateChangeReason("a".repeat(MAX_REASON_LENGTH + 1)).ok).toBe(false)
  })

  it("rejeita tipo não-string (body JSON com número/objeto)", () => {
    expect(validateChangeReason(42).ok).toBe(false)
    expect(validateChangeReason({ motivo: "x" }).ok).toBe(false)
  })
})

describe("validatePromptContent (AC2)", () => {
  it("rejeita vazio e curto demais", () => {
    expect(validatePromptContent("").ok).toBe(false)
    expect(validatePromptContent("curto").ok).toBe(false)
    expect(validatePromptContent(null).ok).toBe(false)
  })

  it("aceita e devolve trimado", () => {
    expect(validatePromptContent("  conteudo de prompt  ")).toEqual({
      ok: true,
      value: "conteudo de prompt",
    })
  })
})

describe("promptParity (AC6)", () => {
  it("diz EM PARIDADE quando o conteúdo é o do snapshot commitado", () => {
    const p = promptParity("off-hours", conteudoDoSnapshot("off-hours"))
    expect(p.status).toBe("em-paridade")
    expect(p.shaBanco).toBe(p.shaSnapshot)
  })

  it("aplica a MESMA normalização do --check: CRLF e espaço nas pontas não são divergência", () => {
    const original = conteudoDoSnapshot("off-hours")
    const comCrlf = "\n  " + original.replace(/\n/g, "\r\n") + "  \n"
    expect(promptParity("off-hours", comCrlf).status).toBe("em-paridade")
  })

  it("diz DIVERGENTE quando uma única palavra muda — o caso 'stand de vendas' → 'sede da Trifold'", () => {
    const editado = conteudoDoSnapshot("off-hours") + "\nlinha nova editada no painel"
    const p = promptParity("off-hours", editado)
    expect(p.status).toBe("divergente")
    expect(p.shaBanco).not.toBe(p.shaSnapshot)
  })

  it("diz FORA DO SNAPSHOT para slug que nunca foi capturado", () => {
    const p = promptParity("slug-que-nao-existe", "qualquer conteudo aqui")
    expect(p.status).toBe("fora-do-snapshot")
    expect(p.shaSnapshot).toBeNull()
  })

  it("conteúdo nulo não explode (linha sem content no banco)", () => {
    expect(promptParity("off-hours", null).status).toBe("divergente")
  })

  it("os 7 slugs do snapshot batem consigo mesmos (o selo não mente por slug)", () => {
    const slugs = [
      "guardrails",
      "handoff-summary",
      "off-hours",
      "property-presentation",
      "qualification-flow",
      "system-personality",
      "visit-scheduling",
    ]
    for (const slug of slugs) {
      expect(promptParity(slug, conteudoDoSnapshot(slug)).status).toBe("em-paridade")
    }
  })
})
