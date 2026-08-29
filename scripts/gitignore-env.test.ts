/**
 * Story 900-3b · AC1 — o carrasco do conserto do `.gitignore`.
 *
 * ### Por que este teste existe
 *
 * O conserto da AC1 (remover `.env*` da raiz; acrescentar `!.env.development.example` em
 * `packages/web/.gitignore`) é um conserto de **defeito ativo**, não preparação: antes dele,
 * `.env.example` da raiz **já estava ignorado** e só sobrevivia versionado por ter sido
 * commitado antes de a linha ampla existir. Um defeito que passou meses despercebido é
 * exatamente o que precisa de carrasco em CI — não de um comando rodado uma vez e colado num
 * documento.
 *
 * ### O que este teste NÃO faz
 *
 * Não reimplementa a semântica do `.gitignore`. Isso seria uma segunda fonte de verdade, que
 * diverge do git no dia em que a precedência mudar. Ele invoca **o mesmo instrumento**
 * (`git check-ignore --no-index`) que um humano usaria à mão.
 *
 * ### Três detalhes de instrumento que decidem se a régua vive ou morre
 *
 * 1. **`git check-ignore` tem três saídas, não duas:** `0` (ignorado), `1` (não ignorado) e
 *    `128` (erro fatal — p.ex. rodar fora de um repositório git). Como `execFileSync` lança em
 *    qualquer status ≠ 0, a implementação ingênua (`try { … return true } catch { return
 *    false }`) converte o `128` em "não ignorado" e os dois casos POSITIVOS passariam com o
 *    instrumento quebrado. Por isso aqui se afirma o **status numérico exato**, e um `128`
 *    reprova nomeando-se.
 *
 * 2. **Os dois controles negativos são a guarda de vivacidade do instrumento.** Se o `git`
 *    falhar (`128`), eles também falham — porque não recebem `0` — e denunciam o instrumento,
 *    não o `.gitignore`. Não os remova achando que servem apenas contra vazamento de segredo.
 *
 * 3. **Nunca passar `-v` aqui.** Medido em 2026-08-29 (git 2.50.1): com `--verbose`, o
 *    `check-ignore` sai `0` sempre que **alguma** regra casa — inclusive uma regra de
 *    **negação**. Com `-v`, os quatro caminhos abaixo dão `0,0,0,0` no estado CORRIGIDO, e os
 *    dois casos positivos nunca poderiam alcançar `1`. Sem `-v` o estado corrigido dá
 *    `1,1,0,0`, que é o que este teste afirma.
 *
 * ### Mutações que reprovam (medidas em 2026-08-29)
 *
 * - Reintroduzir `.env*` no `.gitignore` da raiz → o caso `.env.example` sai `0`.
 * - Remover `!.env.development.example` de `packages/web/.gitignore` → o caso
 *   `packages/web/.env.development.example` sai `0`.
 * - Pôr a negação no `.gitignore` da RAIZ em vez do de `packages/web/` (o erro que o `@po`
 *   nomeou em S3) → o caso `packages/web/.env.development.example` continua `0`, porque o
 *   `.gitignore` mais próximo do arquivo vence.
 *
 * As duas primeiras mutações derrubam casos **diferentes**: os dois positivos não são
 * colineares e nenhum dos dois é redundante.
 *
 * Nada aqui exige que os arquivos existam no disco: `git check-ignore --no-index` responde
 * sobre **caminhos**. É por isso que a régua roda no runner de CI, onde nenhum arquivo de
 * valor está presente.
 */

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"

const RAIZ = process.cwd()

/**
 * Devolve o status numérico de `git check-ignore --no-index <caminho>`.
 *
 * Deliberadamente NÃO devolve boolean: um boolean colapsa `1` (não ignorado) e `128` (o git
 * falhou) no mesmo valor, que é o defeito que este teste existe para não ter.
 */
function statusDoCheckIgnore(caminho: string): number {
  try {
    execFileSync("git", ["check-ignore", "--no-index", caminho], {
      cwd: RAIZ,
      stdio: "pipe",
    })
    return 0
  } catch (erro) {
    const status = (erro as { status?: unknown }).status
    if (typeof status !== "number") {
      // Nem sequer chegou a rodar (git ausente do PATH, por exemplo). Isso é falha de
      // instrumento e precisa aparecer como tal, não como "não ignorado".
      throw new Error(
        `git check-ignore não devolveu status numérico para "${caminho}": ${String(erro)}`,
      )
    }
    return status
  }
}

function explicar(caminho: string, esperado: 0 | 1, recebido: number): string {
  const nomes: Record<number, string> = {
    0: "IGNORADO",
    1: "NÃO ignorado",
    128: "ERRO FATAL DO GIT — o instrumento falhou, não o .gitignore",
  }
  return (
    `git check-ignore --no-index ${caminho} (cwd=${RAIZ})\n` +
    `  esperado: ${esperado} (${nomes[esperado]})\n` +
    `  recebido: ${recebido} (${nomes[recebido] ?? "status inesperado"})`
  )
}

describe("Story 900-3b AC1 — .gitignore não pode engolir os arquivos .example", () => {
  // ---- casos POSITIVOS: precisam ser versionáveis -------------------------------------
  it.each([
    [".env.example"],
    ["packages/web/.env.development.example"],
  ])("%s NÃO é ignorado (status 1)", (caminho) => {
    const recebido = statusDoCheckIgnore(caminho)
    expect(recebido, explicar(caminho, 1, recebido)).toBe(1)
  })

  // ---- controles NEGATIVOS: precisam continuar ignorados ------------------------------
  // ...e são, de quebra, a guarda de vivacidade do instrumento (ver cabeçalho, item 2).
  it.each([
    ["packages/web/.env.development"],
    ["packages/web/.env.producao.local"],
  ])("%s continua ignorado (status 0)", (caminho) => {
    const recebido = statusDoCheckIgnore(caminho)
    expect(recebido, explicar(caminho, 0, recebido)).toBe(0)
  })
})
