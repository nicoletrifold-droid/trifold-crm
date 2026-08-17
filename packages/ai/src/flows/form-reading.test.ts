import { describe, it, expect } from "vitest"
import { validarLeitura } from "./form-reading"

// Story 75-332 — AC2 (fail-open). O que volta do modelo é a fronteira menos
// confiável do sistema: tudo que não for exatamente o formato esperado precisa
// virar "sem leitura", nunca meia-gravação.

describe("validarLeitura", () => {
  it("aceita a forma esperada", () => {
    const r = validarLeitura('{"resumo":"Sai do aluguel em janeiro.","calor":"hot"}', 50)
    expect(r).toEqual({ resumo: "Sai do aluguel em janeiro.", calor: "hot" })
  })

  it("tolera cerca de markdown — o modelo embrulha em ```json com frequência", () => {
    // O `parseEnrichmentResponse` deste mesmo pacote já apanhou disso.
    const r = validarLeitura('```json\n{"resumo":"Quer mudar em março.","calor":"warm"}\n```', 50)
    expect(r).toEqual({ resumo: "Quer mudar em março.", calor: "warm" })
  })

  it("JSON inválido devolve null em vez de estourar", () => {
    expect(validarLeitura("desculpe, não consegui", 50)).toBeNull()
    expect(validarLeitura("", 50)).toBeNull()
    expect(validarLeitura("[]", 50)).toBeNull()
    expect(validarLeitura("null", 50)).toBeNull()
  })

  it("sem resumo não grava nada — é o que o corretor lê", () => {
    expect(validarLeitura('{"resumo":"","calor":"hot"}', 50)).toBeNull()
    expect(validarLeitura('{"resumo":"   ","calor":"hot"}', 50)).toBeNull()
    expect(validarLeitura('{"calor":"hot"}', 50)).toBeNull()
  })

  it("calor fora do enum NÃO descarta o resumo — cai na régua do score", () => {
    // Trocar o resumo (o mais útil) por causa de uma palavra errada no calor
    // (o menos útil) seria o pior negócio possível.
    const quente = validarLeitura('{"resumo":"Tem urgência.","calor":"quentíssimo"}', 90)
    expect(quente).toEqual({ resumo: "Tem urgência.", calor: "hot" }) // 90 → hot

    const frio = validarLeitura('{"resumo":"Só olhando.","calor":null}', 10)
    expect(frio).toEqual({ resumo: "Só olhando.", calor: "cold" }) // 10 → cold
  })

  it("ignora campos extras que o modelo invente", () => {
    const r = validarLeitura(
      '{"resumo":"Ok.","calor":"warm","qualificacao_comercial":"bom","etapa":"Visitou"}',
      50
    )
    // AC6: mesmo se o modelo sugerir, nada além de resumo e calor sai daqui.
    expect(r).toEqual({ resumo: "Ok.", calor: "warm" })
    expect(Object.keys(r!)).toEqual(["resumo", "calor"])
  })
})
