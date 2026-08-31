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
import { comRetryDeTransporte, contarComRetryDeTransporte } from "./support/ambiente"

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

/**
 * Carrasco do QA-900-25-1 — o 17º instrumento cego, e o único desta onda que veio de **limite de
 * transporte**, não de lógica.
 *
 * `max_rows = 1000` no PostgREST: contar com `select("id").length` **satura**. O `@qa` simulou o
 * teto e mostrou que, saturado, o canário fica VERDE sob a mutação que ele existe para pegar
 * (`3 failed` sem teto → `2 failed` com teto, a AC14 saindo da lista dos vermelhos).
 *
 * O conserto estrutural é `count: "exact", head: true`. O carrasco contra a REGRESSÃO é o
 * `count === null`: qualquer volta para um `select()` de linhas devolve `count: null`, e o helper
 * lança. Sem esta asserção, a reversão seria silenciosa — e silenciosa é como o defeito nasceu.
 */
function executorDeContagem(
  respostas: Array<{ count: number | null; error: { message: string; code?: string } | null }>,
) {
  const estado = { chamadas: 0 }
  const executar = async () => {
    const resposta = respostas[Math.min(estado.chamadas, respostas.length - 1)]!
    estado.chamadas++
    return resposta
  }
  return { estado, executar }
}

describe("`contarComRetryDeTransporte` — contagem agregada, com carrasco contra a saturação", () => {
  it("devolve o `count` agregado, numa tentativa só", async () => {
    const { estado, executar } = executorDeContagem([{ count: 1234, error: null }])
    await expect(contarComRetryDeTransporte(executar, "contagem")).resolves.toBe(1234)
    expect(estado.chamadas).toBe(1)
  })

  it("`count: 0` é resposta válida — não pode virar erro nem `null`", async () => {
    const { executar } = executorDeContagem([{ count: 0, error: null }])
    await expect(contarComRetryDeTransporte(executar, "zero")).resolves.toBe(0)
  })

  /**
   * A asserção que impede a volta do defeito: `select("id")` (sem `count`) devolve `count: null`.
   * Ela é o motivo de este helper existir separado do `comRetryDeTransporte`.
   */
  it("`count: null` (alguém voltou a contar linhas) LANÇA nomeando a saturação", async () => {
    const { estado, executar } = executorDeContagem([{ count: null, error: null }])
    await expect(contarComRetryDeTransporte(executar, "regressao")).rejects.toThrow(
      /não devolveu `count`[\s\S]*max_rows/,
    )
    expect(estado.chamadas).toBe(1)
  })

  it("falha de TRANSPORTE na contagem: repete e devolve o `count` bom", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { estado, executar } = executorDeContagem([
      { count: null, error: ERRO_DE_TRANSPORTE },
      { count: 7, error: null },
    ])
    await expect(contarComRetryDeTransporte(executar, "transporte-contagem")).resolves.toBe(7)
    expect(estado.chamadas).toBe(2)
  })

  it("erro do BANCO na contagem: uma tentativa só, sem repetição", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { estado, executar } = executorDeContagem([{ count: null, error: ERRO_DO_BANCO }])
    await expect(contarComRetryDeTransporte(executar, "banco-contagem")).rejects.toThrow(
      /banco-contagem falhou — duplicate key/,
    )
    expect(estado.chamadas).toBe(1)
    expect(aviso).not.toHaveBeenCalled()
  })
})
