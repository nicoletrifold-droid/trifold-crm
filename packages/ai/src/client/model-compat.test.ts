import { describe, it, expect } from "vitest"
import { supportsSampling, textoDaResposta, ANTHROPIC_MODELS } from "./anthropic"

/**
 * Story 75-349 — os dois bloqueios que faziam a troca de modelo da Nicole ser uma
 * armadilha armada, congelados em teste.
 *
 * `agent_config.model_primary` e `agent_config.temperature` moram no BANCO. Sem
 * estes testes, a próxima pessoa que "só trocar o modelo na tela" rearma tudo.
 */

describe("75-349 — supportsSampling", () => {
  it("modelo de produção hoje AINDA aceita temperature", () => {
    // Produção em 19/08: claude-sonnet-4-6, temperature 0,70.
    expect(supportsSampling("claude-sonnet-4-6")).toBe(true)
    expect(supportsSampling("claude-opus-4-6")).toBe(true)
    expect(supportsSampling(ANTHROPIC_MODELS.haiku)).toBe(true)
  })

  it("🔥 a geração atual NÃO aceita — mandar temperature é 400", () => {
    expect(supportsSampling("claude-sonnet-5")).toBe(false)
    expect(supportsSampling("claude-opus-5")).toBe(false)
    expect(supportsSampling("claude-opus-4-7")).toBe(false)
    expect(supportsSampling("claude-opus-4-8")).toBe(false)
    expect(supportsSampling("claude-fable-5")).toBe(false)
  })

  it("é lista de PERMISSÃO: modelo desconhecido sai sem temperature", () => {
    // Fail-safe deliberado: o pior caso é uma resposta mais determinística,
    // contra uma conversa que não acontece.
    expect(supportsSampling("claude-modelo-que-nao-existe-ainda")).toBe(false)
    expect(supportsSampling("")).toBe(false)
  })

  it("o modelo `sonnet` da constante compartilhada é da geração nova", () => {
    // Guarda contra regressão silenciosa: se alguém apontar ANTHROPIC_MODELS.sonnet
    // para um modelo com sampling, este teste avisa que a premissa mudou.
    expect(supportsSampling(ANTHROPIC_MODELS.sonnet)).toBe(false)
  })
})

/**
 * O tipo do parâmetro é estreito de propósito (`{ type, text? }`): a função só
 * precisa saber ler texto. Este alias existe para as fixtures poderem carregar o
 * campo `thinking` real de um bloco de raciocínio sem alargar o contrato.
 */
type BlocoDeResposta = { type: string; text?: string; thinking?: string }

describe("75-349 — textoDaResposta", () => {
  it("lê o texto quando o bloco 0 é thinking (era o defeito)", () => {
    const content: BlocoDeResposta[] = [
      { type: "thinking", thinking: "o lead perguntou o preço..." },
      { type: "text", text: "Os valores variam conforme o andar." },
    ]
    expect(textoDaResposta(content)).toBe("Os valores variam conforme o andar.")
  })

  it("concatena múltiplos blocos de texto na ordem", () => {
    const content: BlocoDeResposta[] = [
      { type: "text", text: "Primeiro. " },
      { type: "thinking", thinking: "..." },
      { type: "text", text: "Segundo." },
    ]
    expect(textoDaResposta(content)).toBe("Primeiro. Segundo.")
  })

  it("resposta sem nenhum bloco de texto devolve vazio (e quem chama decide)", () => {
    const soThinking: BlocoDeResposta[] = [{ type: "thinking", thinking: "..." }]
    expect(textoDaResposta(soThinking)).toBe("")
    expect(textoDaResposta([])).toBe("")
  })

  it("caso comum de hoje (um bloco de texto) segue idêntico", () => {
    expect(textoDaResposta([{ type: "text", text: "Oi!" }])).toBe("Oi!")
  })
})
