/**
 * Story 75-371 — o "Forbidden" que apareceu para o Joabe não pode voltar à tela.
 */
import { describe, it, expect } from "vitest"
import { mensagemDeErroDeEtapa, SEM_PERMISSAO_PIPELINE } from "./mensagem-de-erro"

describe("mensagemDeErroDeEtapa", () => {
  it("403 nunca mostra o 'Forbidden' da API", () => {
    const msg = mensagemDeErroDeEtapa(403, { error: "Forbidden" }, "Erro ao criar etapa.")
    expect(msg).toBe(SEM_PERMISSAO_PIPELINE)
    expect(msg).not.toMatch(/forbidden/i)
  })

  it("403 sem corpo também vira a frase de permissão", () => {
    expect(mensagemDeErroDeEtapa(403, null, "Erro ao criar etapa.")).toBe(SEM_PERMISSAO_PIPELINE)
  })

  it("409 preserva a frase de negócio que a API mandou", () => {
    const daApi = "Esta é a etapa padrão. Eleja outra etapa como padrão antes de excluir."
    expect(mensagemDeErroDeEtapa(409, { error: daApi }, "Erro ao excluir.")).toBe(daApi)
  })

  it("outros status mostram a mensagem da API quando existe", () => {
    expect(mensagemDeErroDeEtapa(400, { error: "name is required" }, "Erro.")).toBe(
      "name is required",
    )
  })

  it("cai no fallback quando a API não manda nada", () => {
    expect(mensagemDeErroDeEtapa(500, {}, "Erro ao salvar.")).toBe("Erro ao salvar.")
    expect(mensagemDeErroDeEtapa(500, { error: "   " }, "Erro ao salvar.")).toBe("Erro ao salvar.")
  })
})
