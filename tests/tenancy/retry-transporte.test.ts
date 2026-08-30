/**
 * Story 900-25 — carrasco do `comRetryDeTransporte`.
 *
 * ## Por que este arquivo existe
 *
 * A suíte da Camada B fala com um Supabase remoto, e medi a instabilidade: em 6 execuções
 * consecutivas, **2** morreram com `TypeError: fetch failed` numa leitura de verificação
 * qualquer — nunca a mesma. É transporte: a requisição não chegou a receber resposta.
 *
 * A correção foi repetir **só** esse caso. Mas repetição é a mitigação mais perigosa que existe
 * numa suíte cujo propósito é *não engolir erro de banco*: se ela repetisse um `{ error }` do
 * PostgREST, "o Postgres recusou" viraria "tenta de novo até dar certo" — a classe exata de
 * silêncio que esta onda inteira existe para eliminar.
 *
 * Então o helper precisa de carrasco próprio, e ele não pode depender de credencial nem de rede:
 * as três asserções abaixo rodam **sempre**, com um executor falso que CONTA as tentativas.
 * Depois de ligar o retry, oito execuções seguidas da suíte saíram `20 passed` com **zero**
 * repetições disparadas — ou seja, a rede colaborou e o caminho de repetição não foi exercitado
 * por nenhuma delas. Um mecanismo que só roda quando dá azar, e que só é observado quando dá
 * azar, é indistinguível de um mecanismo quebrado. Estas asserções são a diferença.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { comRetryDeTransporte } from "./support/ambiente"

afterEach(() => {
  vi.restoreAllMocks()
})

/** Executor falso: devolve as respostas na ordem e conta quantas vezes foi chamado. */
function executorFalso(
  respostas: Array<{ data: unknown; error: { message: string; code?: string } | null }>,
) {
  const estado = { chamadas: 0 }
  const executar = async () => {
    const resposta = respostas[Math.min(estado.chamadas, respostas.length - 1)]!
    estado.chamadas++
    return resposta
  }
  return { estado, executar }
}

const ERRO_DE_TRANSPORTE = { message: "TypeError: fetch failed" } // sem `code` — ninguém respondeu
const ERRO_DO_BANCO = { message: 'duplicate key value violates unique constraint "x"', code: "23505" }

describe("`comRetryDeTransporte` — repete transporte, NUNCA resposta do banco", () => {
  it("sucesso de primeira: uma tentativa só, e devolve as linhas", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { estado, executar } = executorFalso([{ data: [{ id: "a" }], error: null }])
    await expect(comRetryDeTransporte(executar, "sucesso")).resolves.toEqual([{ id: "a" }])
    expect(estado.chamadas).toBe(1)
  })

  it("falha de TRANSPORTE seguida de sucesso: repete e devolve o resultado bom", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { estado, executar } = executorFalso([
      { data: null, error: ERRO_DE_TRANSPORTE },
      { data: [{ id: "b" }], error: null },
    ])
    await expect(comRetryDeTransporte(executar, "transporte")).resolves.toEqual([{ id: "b" }])
    expect(estado.chamadas).toBe(2)
  })

  it("falha de TRANSPORTE persistente: exatamente 3 tentativas, depois lança nomeando", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { estado, executar } = executorFalso([{ data: null, error: ERRO_DE_TRANSPORTE }])
    await expect(comRetryDeTransporte(executar, "transporte-persistente")).rejects.toThrow(
      /transporte-persistente falhou — TypeError: fetch failed/,
    )
    expect(estado.chamadas).toBe(3)
  })

  /**
   * A asserção que impede a mitigação de virar um engolidor de erro. `23505` é o Postgres
   * RESPONDENDO — e é literalmente o código que a AC6 desta story afirma. Se o helper o repetisse,
   * a suíte passaria a esconder exatamente o que ela existe para expor.
   */
  it("erro do BANCO (com `code`): UMA tentativa só, sem repetição, lança na hora", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { estado, executar } = executorFalso([{ data: null, error: ERRO_DO_BANCO }])
    await expect(comRetryDeTransporte(executar, "erro-do-banco")).rejects.toThrow(
      /erro-do-banco falhou — duplicate key/,
    )
    expect(estado.chamadas).toBe(1)
    // Nem sequer avisa que "vai repetir": o caminho de repetição não foi tocado.
    expect(aviso).not.toHaveBeenCalled()
  })

  /**
   * Controle negativo do DISCRIMINANTE: uma mensagem de transporte **acompanhada de `code`** é
   * resposta do banco, não transporte. Sem esta asserção, o predicado poderia ser só o regex da
   * mensagem — e um erro do banco cuja mensagem citasse "network" seria repetido.
   */
  it("mensagem de transporte MAS com `code`: não repete — quem manda é o `code`", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { estado, executar } = executorFalso([
      { data: null, error: { message: "fetch failed while reading network stream", code: "PGRST116" } },
    ])
    await expect(comRetryDeTransporte(executar, "hibrido")).rejects.toThrow(/hibrido falhou/)
    expect(estado.chamadas).toBe(1)
    expect(aviso).not.toHaveBeenCalled()
  })
})
