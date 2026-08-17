/**
 * Story 87-16 (AC9 · T10) — testes do extrator de objetos de banco.
 *
 * As três fixturas abaixo NÃO são decorativas: cada uma é uma das três réguas
 * que foram medidas contra o repositório antes de escolher a que ficou (AC9-A),
 * e cada uma corresponde a uma das mutações isoladas M1/M2/M3 da AC9-E.
 *
 *   M1 — `.from("x")` literal numa linha só  → tem de ENTRAR
 *   M2 — `.rpc(` ⏎ `"x"` multilinha          → tem de ENTRAR (a régua por LINHA
 *        perde 4 de 23 RPCs reais aqui, em silêncio)
 *   M3 — `Buffer.from("x")`                  → NÃO pode entrar (falso positivo)
 *
 * ⚠️ Os nomes de fixtura desta suíte (`tabela_fixture_*`, `rpc_fixture_*`) são,
 * por construção, nomes que o extrator TEM de colher e que a produção TEM de não
 * ter. É por isso que a população varrida pelo script (T11) é só código de
 * produção — `*.test.ts(x)`, `__fixtures__/` e `__mocks__/` ficam fora POR REGRA.
 * Se algum dia alguém "resolver" isso pondo este arquivo numa lista de ignore,
 * é a auto-exceção que esta story proíbe duas vezes (Armadilha 3, Risco 8).
 */
import { describe, it, expect } from "vitest"
import {
  collectReferencedObjects,
  extractReferencedObjects,
  NON_DATABASE_FROM_OWNERS,
} from "./referenced-objects"

describe("extractReferencedObjects", () => {
  it("M1 — colhe `.from(\"…\")` literal de uma linha só, com arquivo:linha", () => {
    const src = ['const x = 1', 'await supabase.from("tabela_fixture_a").select("id")'].join("\n")
    const { references } = extractReferencedObjects(src, "fake/a.ts")

    expect(references).toEqual([
      { name: "tabela_fixture_a", kind: "relation", file: "fake/a.ts", line: 2 },
    ])
  })

  it("M2 — colhe `.rpc(` multilinha; é a diferença entre 23 RPCs e 19", () => {
    // Exatamente a forma dos 4 sítios reais que a régua por LINHA perde:
    // get_analytics_summary, get_system_events_summary, get_whatsapp_cost_summary,
    // get_whatsapp_volume_summary.
    const src = [
      "const { data } = await supabase",
      "  .rpc(",
      '    "rpc_fixture_multilinha",',
      "    { p: 1 }",
      "  )",
    ].join("\n")
    const { references } = extractReferencedObjects(src, "fake/b.ts")

    // Linha 2 = onde o `.rpc(` começa. É o ponteiro que o humano quer no `grep`,
    // não a linha do `await supabase` nem a do literal.
    expect(references).toEqual([
      { name: "rpc_fixture_multilinha", kind: "rpc", file: "fake/b.ts", line: 2 },
    ])
  })

  it("M2 (contraprova) — uma régua por LINHA não acharia o mesmo `.rpc(` multilinha", () => {
    const src = ["await supabase", "  .rpc(", '    "rpc_fixture_multilinha"', "  )"].join("\n")
    const porLinha = src
      .split("\n")
      .flatMap((linha) => [...linha.matchAll(/\.\s*rpc\s*\(\s*["'`]([^"'`\n]+)["'`]/g)])

    expect(porLinha).toHaveLength(0)
    expect(extractReferencedObjects(src, "fake/b.ts").references).toHaveLength(1)
  })

  it("M3 — `Buffer.from(\"…\")` NÃO entra: é dono que não é cliente de banco", () => {
    const src = 'const buf = Buffer.from("tabela_m3_87_16")'
    const { references } = extractReferencedObjects(src, "fake/c.ts")

    expect(references).toEqual([])
  })

  it("M3 (contraprova) — sem a exclusão de dono, o mesmo trecho viraria alvo", () => {
    const src = 'const buf = Buffer.from("tabela_m3_87_16")'
    const semExclusao = [...src.matchAll(/\.\s*from\s*\(\s*["'`]([^"'`\n]+)["'`]/g)].map((m) => m[1])

    expect(semExclusao).toEqual(["tabela_m3_87_16"])
    expect(extractReferencedObjects(src, "fake/c.ts").references).toEqual([])
  })

  it("M1 e M3 no mesmo arquivo: entra só a tabela, o Buffer fica de fora", () => {
    const src = [
      'const buf = Buffer.from("tabela_m3_87_16")',
      'await supabase.from("tabela_fixture_a").select("*")',
    ].join("\n")
    const { references } = extractReferencedObjects(src, "fake/d.ts")

    expect(references.map((r) => r.name)).toEqual(["tabela_fixture_a"])
  })

  it("`Array.from` e amigos ficam de fora — a lista de donos é a régua", () => {
    const src = [
      'Array.from("aaa")',
      'Object.from("bbb")',
      'Set.from("ccc")',
      'Map.from("ddd")',
      'Float32Array.from("eee")',
    ].join("\n")

    expect(extractReferencedObjects(src, "fake/e.ts").references).toEqual([])
    expect(NON_DATABASE_FROM_OWNERS).toContain("Array")
    expect(NON_DATABASE_FROM_OWNERS).toContain("Buffer")
  })

  it("bucket de storage fica fora da população: outro catálogo, outra verdade", () => {
    const src = 'await supabase.storage.from("nicole-media").upload(path, file)'

    expect(extractReferencedObjects(src, "fake/f.ts").references).toEqual([])
    expect(NON_DATABASE_FROM_OWNERS).toContain("storage")
  })

  it("`.from(` sem dono (encadeado) continua entrando", () => {
    const src = 'await createClient(url, key).from("tabela_fixture_encadeada").select("id")'
    const { references } = extractReferencedObjects(src, "fake/g.ts")

    expect(references.map((r) => r.name)).toEqual(["tabela_fixture_encadeada"])
  })

  it("`.from(variavel)` NÃO vira alvo — vai para `skipped` como ponto cego declarado", () => {
    const src = 'await supabase.from(tableName).select("id")'
    const { references, skipped } = extractReferencedObjects(src, "fake/h.ts")

    expect(references).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toBe("nao-literal")
  })

  it("template com interpolação não vira nome de tabela", () => {
    const src = "await supabase.from(`tabela_${sufixo}`).select(\"id\")"
    const { references, skipped } = extractReferencedObjects(src, "fake/i.ts")

    expect(references).toEqual([])
    expect(skipped.some((s) => s.reason === "nome-nao-identificador")).toBe(true)
  })

  it("a linha reportada é a do início do literal, não a do arquivo inteiro", () => {
    const src = ["", "", "", 'await supabase.from("tabela_fixture_a").select("id")'].join("\n")

    expect(extractReferencedObjects(src, "fake/j.ts").references[0].line).toBe(4)
  })
})

describe("collectReferencedObjects", () => {
  it("agrega o mesmo nome de vários arquivos, guardando TODOS os sítios", () => {
    const { objects } = collectReferencedObjects([
      { file: "a.ts", source: 'supabase.from("tabela_fixture_a")' },
      { file: "b.ts", source: '\nsupabase.from("tabela_fixture_a")' },
    ])

    expect(objects).toHaveLength(1)
    expect(objects[0].sites).toEqual([
      { file: "a.ts", line: 1 },
      { file: "b.ts", line: 2 },
    ])
  })

  it("separa relação de RPC com o mesmo nome — catálogos diferentes", () => {
    const { objects } = collectReferencedObjects([
      { file: "a.ts", source: 'supabase.from("homonimo_87_16")\nsupabase.rpc("homonimo_87_16")' },
    ])

    expect(objects.map((o) => o.kind).sort()).toEqual(["relation", "rpc"])
  })

  it("ordena por tipo e nome, para a saída do script ser diffável", () => {
    const { objects } = collectReferencedObjects([
      { file: "a.ts", source: 'supabase.from("zzz_fixture")\nsupabase.from("aaa_fixture")\nsupabase.rpc("mmm_fixture")' },
    ])

    expect(objects.map((o) => `${o.kind}:${o.name}`)).toEqual([
      "relation:aaa_fixture",
      "relation:zzz_fixture",
      "rpc:mmm_fixture",
    ])
  })

  it("lista vazia devolve zero objetos — quem trata isso como erro é o script", () => {
    expect(collectReferencedObjects([]).objects).toEqual([])
  })
})
