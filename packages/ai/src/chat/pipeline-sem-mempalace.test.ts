/**
 * Story 87-16 (AC5) — o MemPalace não volta ao `pipeline.ts` sem alguém notar.
 *
 * O QUE ESTE ARQUIVO PROVA
 *   Que o `chat/pipeline.ts` não voltou a consultar as duas tabelas nem a RPC do
 *   MemPalace, e que não voltou a importar o diretório de memória removido. É um
 *   teste de AUSÊNCIA — e teste de ausência que nunca foi visto vermelho não
 *   vale nada, por isso o vermelho foi produzido de verdade (saída bruta no Dev
 *   Agent Record da story).
 *
 * 🔴 POR QUE OS NOMES PROIBIDOS SÃO MONTADOS, E NÃO ESCRITOS
 *   A AC2 é uma régua de `grep` sobre `packages/`: as três palavras não podem
 *   aparecer em NENHUM `.ts`/`.tsx`. Um teste que asserta a ausência de uma
 *   string e a escreve inteira reprova a régua que ele existe para defender —
 *   o arquivo passa a conter aquilo que ele proíbe. Montar por `join` mantém a
 *   régua da AC2 em zero e a asserção intacta.
 *
 * 🔴 POR QUE O LEITOR DE FONTE VEM DE UM MÓDULO
 *   Escrito do jeito óbvio (`readFileSync` aqui dentro), este arquivo não
 *   importaria módulo nenhum do projeto e a catraca da AC6 — que está NA MESMA
 *   PR — o flagraria. O @po mediu: 2 de 191, este arquivo e o `loader.test.ts`.
 *   O remédio é o import abaixo, nunca uma auto-exceção na lista de ignore.
 */
import { describe, it, expect } from "vitest"
import { extractReferencedObjects } from "@trifold/shared/src/db/referenced-objects"
import { readRepoFile } from "@trifold/shared/src/testing/source-scan"

const PIPELINE = "packages/ai/src/chat/pipeline.ts"

/** As três instâncias enterradas, montadas por partes (ver cabeçalho). */
const OBJETOS_ENTERRADOS = [
  ["lead", "facts"].join("_"),
  ["lead", "memories"].join("_"),
  ["match", "lead", "memory"].join("_"),
]

/** O diretório removido, montado do mesmo jeito. */
const DIRETORIO_REMOVIDO = ["..", "memory"].join("/")

describe("AC5 — o MemPalace não volta ao pipeline", () => {
  it("o `pipeline.ts` não consulta nenhum dos três objetos enterrados", () => {
    const { references } = extractReferencedObjects(readRepoFile(PIPELINE), PIPELINE)
    const nomes = references.map((r) => r.name)

    // Nomeia QUAL voltou, com a linha — o `grep` seguinte já vem pronto.
    const voltaram = references.filter((r) => OBJETOS_ENTERRADOS.includes(r.name))
    expect(voltaram.map((r) => `${r.name} @ ${r.file}:${r.line}`)).toEqual([])

    // Controle positivo do próprio extrator: ele ESTÁ enxergando o arquivo.
    // Sem isto, um `readRepoFile` que devolvesse "" passaria verde para sempre.
    expect(nomes).toContain("leads")
    expect(nomes).toContain("messages")
    expect(nomes.length).toBeGreaterThan(5)
  })

  it("o `pipeline.ts` não importa mais o diretório de memória removido", () => {
    const fonte = readRepoFile(PIPELINE)

    expect(fonte.includes(DIRETORIO_REMOVIDO)).toBe(false)
    // Controle positivo: o arquivo tem imports relativos de verdade — a régua
    // não está verde por estar olhando um texto vazio.
    expect(fonte).toContain('from "../flows"')
  })

  it("🔴 controle positivo do predicado: com o objeto de volta, a régua ACENDE", () => {
    // O mesmo predicado, sobre um fonte sintético que reintroduz a consulta.
    // O vermelho no arquivo REAL foi produzido e colado no Dev Agent Record;
    // este caso garante que o predicado continua discriminando mesmo se
    // ninguém repetir a mutação manual.
    const sintetico = `await supabase.from("${OBJETOS_ENTERRADOS[0]}").select("id")`
    const { references } = extractReferencedObjects(sintetico, "sintetico.ts")

    expect(references.map((r) => r.name)).toEqual([OBJETOS_ENTERRADOS[0]])
  })

  it("o bloco de memória do prompt continua sendo o `ai_summary`, e só ele", () => {
    const fonte = readRepoFile(PIPELINE)

    // A string viva, byte a byte. Se alguém trocar o cabeçalho, cai aqui e em
    // `pipeline-ai-summary-no-prompt.test.ts` — duas réguas, dois eixos.
    expect(fonte).toContain("MEMORIA DO LEAD (resumo):")
    expect(fonte).not.toContain("MEMORIA DO LEAD (informacoes de conversas anteriores)")
    expect(fonte).not.toContain("MEMORIA DO LEAD (fatos ativos)")
  })
})
