/**
 * Story 87-16 (AC9 · T10) — extrator dos objetos de banco que o código consulta.
 *
 * POR QUE ISTO EXISTE
 *   O MemPalace sobreviveu quatro meses consultando duas tabelas e uma RPC que
 *   nunca foram criadas em produção (`to_regclass` = `null`) — e a suíte verde
 *   o tempo todo. A Story 87-16 enterra as três instâncias; este módulo é a
 *   metade estática da régua que enterra a CLASSE: ele diz QUAIS objetos o
 *   código consulta, para que `scripts/check-db-objects.ts` afirme, contra o
 *   catálogo de produção, que todos existem.
 *
 * O QUE ELE É, E O QUE ELE NÃO É
 *   É função PURA sobre texto: recebe o conteúdo de um arquivo e devolve as
 *   referências com `arquivo:linha`. NÃO lê disco, NÃO abre conexão, NÃO decide
 *   população. Quem varre o disco e escolhe quais arquivos entram é o script
 *   (T11) — e é essa separação que mantém o extrator testável em `vitest` sem
 *   credencial nenhuma.
 *
 * AS TRÊS RÉGUAS QUE FORAM MEDIDAS ANTES DE ESCOLHER (Story 87-16 · AC9-A)
 *   1. regex POR LINHA           → acha 19 RPCs e perde 4 de 23 (17,4 %), porque
 *                                  `supabase.rpc(` ⏎ `"nome"` é multilinha em
 *                                  quatro sítios reais. REJEITADA.
 *   2. regex POR ARQUIVO sem excluir o dono da chamada → colhe `Buffer.from(...)`
 *                                  como se fosse tabela. REJEITADA.
 *   3. regex POR ARQUIVO + exclusão de dono → 117 relações + 23 RPCs = 140.
 *                                  É ESTA.
 *
 *   ⚠️ O parecer do @po dizia 115 + 23 = 138, e a diferença é uma correção, não
 *   uma divergência: ele contou 125 nomes e subtraiu 10 buckets PELO NOME. Dois
 *   desses nomes — `lancamentos` e `pastas` — são bucket E tabela, consultados
 *   por `supabase.from(...)` em código de produção. Subtrair por nome perdia as
 *   duas. Aqui a exclusão é por DONO da chamada (`storage.from(...)`), então
 *   125 − 8 nomes exclusivos de bucket = 117. Medido nas duas réguas.
 *
 * PONTO CEGO DECLARADO (não é cobertura, é declaração)
 *   Chamada cujo argumento é uma VARIÁVEL não é resolvível estaticamente e sai em
 *   `skipped`. Não invente resolução aqui: uma régua que finge cobertura total é
 *   a próxima crença que alguém acredita existir.
 */

/** Como o objeto é consultado — decide em qual catálogo ele é afirmado. */
export type ReferencedObjectKind = "relation" | "rpc"

export interface ObjectReference {
  /** Nome do objeto no schema `public`, exatamente como escrito no código. */
  name: string
  kind: ReferencedObjectKind
  /** Caminho do arquivo, como recebido pelo chamador (não é normalizado aqui). */
  file: string
  /**
   * Linha 1-based do início do MATCH — que é o início da CHAMADA, **não** a linha
   * do literal. Em cadeia multilinha as duas divergem, e são DOIS mecanismos:
   *
   *   - chamada de relação: o regex abre no DONO, então uma cadeia que quebra
   *     entre `await supabase` e a linha seguinte reporta a linha do `await
   *     supabase`. (O grupo de dono existe para a denylist barrar `Buffer`.)
   *   - chamada de RPC: não há grupo de dono, então reporta a linha em que a
   *     chamada abre, não a linha em que o nome aparece.
   *
   * Numa linha só, as duas coincidem.
   *
   * É de propósito — apontar o statement é o que o humano quer ao abrir o
   * arquivo. Mas este docstring dizia *"início do literal"*, e foi por isso que a
   * saída vermelha da AC9 (87-16) saiu `:54`/`:105` enquanto a §AC9-(D) da story
   * previa `:55`/`:106`: o ±1 era do TEXTO, não do código. Numa story cuja tese é
   * *"docstring que mente cria a próxima crença"*, esta linha não podia ficar.
   *
   * ⚠️ E o conserto óbvio deste docstring REPROVA duas réguas desta casa: colar
   * aqui um exemplo com a chamada e o nome entre aspas faz o extrator colher o
   * próprio comentário (este arquivo está na população de produção), e o
   * `db:objects:check` fica vermelho por um nome que só existe em prosa. Medido:
   * `138 alvos, 1 reprovado, EXIT=1`. Por isso os exemplos acima são descritos e
   * não transcritos. Não "resolva" isso com auto-exceção na população.
   */
  line: number
}

export interface SkippedReference {
  kind: ReferencedObjectKind
  /** Trecho cru, para o humano decidir. */
  snippet: string
  file: string
  line: number
  reason: "nao-literal" | "nome-nao-identificador"
}

export interface ExtractionResult {
  references: ObjectReference[]
  skipped: SkippedReference[]
}

/**
 * Donos de `.from(` que NÃO são cliente de banco.
 *
 * `Array`/`Buffer`/`Object`/... são a mutação M3 da AC9: sem esta lista o regex
 * colhe `Buffer.from("nao sou imagem")` como se fosse tabela — 2 nomes falsos
 * medidos hoje, em 3 sítios. M3 tem de sair VERDE.
 *
 * `storage` é a exclusão dos 10 buckets (`nicole-media`, `obra-fotos`, `pastas`,
 * …): eles moram em `storage.buckets`, que é OUTRO catálogo e outro mecanismo.
 * Misturar os dois faria a régua precisar de duas verdades e ela morreria na
 * primeira divergência (AC9-A, decisão escrita).
 */
export const NON_DATABASE_FROM_OWNERS: readonly string[] = [
  "Array",
  "Buffer",
  "Object",
  "Uint8Array",
  "Int8Array",
  "Uint16Array",
  "Int16Array",
  "Uint32Array",
  "Int32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
  "Set",
  "Map",
  "WeakSet",
  "WeakMap",
  "storage",
]

const OWNER_DENYLIST = new Set(NON_DATABASE_FROM_OWNERS)

/** Identificador de relação/função no Postgres, sem aspas. */
const PG_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * `.from(` com literal. O `[\s\S]*?` entre `(` e a aspa é o que faz a régua ser
 * POR ARQUIVO e não por linha — é a única diferença entre achar 23 RPCs e achar
 * 19 (mutação M2).
 */
const FROM_RE = /(?:([A-Za-z_$][\w$]*)\s*)?\.\s*from\s*\(\s*(["'`])([^"'`\n]*)\2/g
const RPC_RE = /\.\s*rpc\s*\(\s*(["'`])([^"'`\n]*)\1/g

/** `.from(` / `.rpc(` cujo argumento NÃO é literal — o ponto cego declarado. */
const FROM_DYNAMIC_RE = /(?:([A-Za-z_$][\w$]*)\s*)?\.\s*from\s*\(\s*([A-Za-z_$][\w$.]*)\s*[),]/g
const RPC_DYNAMIC_RE = /\.\s*rpc\s*\(\s*([A-Za-z_$][\w$.]*)\s*[),]/g

function lineOf(source: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++
  }
  return line
}

/**
 * Extrai as referências a objetos de banco de UM arquivo.
 *
 * @param source conteúdo do arquivo
 * @param file caminho a reportar em `arquivo:linha`
 */
export function extractReferencedObjects(source: string, file: string): ExtractionResult {
  const references: ObjectReference[] = []
  const skipped: SkippedReference[] = []

  for (const match of source.matchAll(FROM_RE)) {
    const owner = match[1]
    const name = match[3]
    if (owner && OWNER_DENYLIST.has(owner)) continue
    const line = lineOf(source, match.index ?? 0)
    if (!PG_IDENTIFIER.test(name)) {
      skipped.push({ kind: "relation", snippet: match[0], file, line, reason: "nome-nao-identificador" })
      continue
    }
    references.push({ name, kind: "relation", file, line })
  }

  for (const match of source.matchAll(RPC_RE)) {
    const name = match[2]
    const line = lineOf(source, match.index ?? 0)
    if (!PG_IDENTIFIER.test(name)) {
      skipped.push({ kind: "rpc", snippet: match[0], file, line, reason: "nome-nao-identificador" })
      continue
    }
    references.push({ name, kind: "rpc", file, line })
  }

  for (const match of source.matchAll(FROM_DYNAMIC_RE)) {
    const owner = match[1]
    if (owner && OWNER_DENYLIST.has(owner)) continue
    skipped.push({
      kind: "relation",
      snippet: match[0],
      file,
      line: lineOf(source, match.index ?? 0),
      reason: "nao-literal",
    })
  }

  for (const match of source.matchAll(RPC_DYNAMIC_RE)) {
    skipped.push({
      kind: "rpc",
      snippet: match[0],
      file,
      line: lineOf(source, match.index ?? 0),
      reason: "nao-literal",
    })
  }

  return { references, skipped }
}

export interface SourceFile {
  file: string
  source: string
}

export interface ReferencedObject {
  name: string
  kind: ReferencedObjectKind
  /** Todos os `arquivo:linha` que consultam este objeto, em ordem de varredura. */
  sites: Array<{ file: string; line: number }>
}

/**
 * Agrega as referências de vários arquivos em objetos distintos, ordenados por
 * nome. Cada objeto carrega TODOS os seus sítios — é o que permite ao script
 * imprimir, para cada ausente, o `grep` que o humano faria a seguir.
 */
export function collectReferencedObjects(files: readonly SourceFile[]): {
  objects: ReferencedObject[]
  skipped: SkippedReference[]
} {
  const byKey = new Map<string, ReferencedObject>()
  const skipped: SkippedReference[] = []

  for (const { file, source } of files) {
    const result = extractReferencedObjects(source, file)
    skipped.push(...result.skipped)
    for (const ref of result.references) {
      const key = `${ref.kind}:${ref.name}`
      const existing = byKey.get(key)
      if (existing) {
        existing.sites.push({ file: ref.file, line: ref.line })
      } else {
        byKey.set(key, { name: ref.name, kind: ref.kind, sites: [{ file: ref.file, line: ref.line }] })
      }
    }
  }

  const objects = [...byKey.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
  )
  return { objects, skipped }
}
