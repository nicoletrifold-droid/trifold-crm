/**
 * Story 900-24 · AC10 / Task 10.1 — fake de Supabase **fiel ao `@supabase/postgrest-js`**.
 *
 * ## Por que este arquivo existe (e por que não era só copiar o molde)
 *
 * O molde de `lib/tenancy/admin-invite.test.ts:108-116` mente DUAS vezes nos terminais
 * singulares, e o @po mediu as duas rodando o código legado literal de
 * `webhook/whatsapp/route.ts:394-398` contra os dois fakes:
 *
 * ```ts
 * maybeSingle: async () => ({ data: linhas[0] ?? null, error: null })
 * //                                ^ com 2+ linhas devolve "achei a 1ª"   ^ e nunca devolve erro
 * ```
 *
 * | fake | com 2 configs `active` | o bug agudo da 900-24 reproduz? |
 * |---|---|---|
 * | molde `admin-invite.test.ts` | legado processa `org-A` | **não** |
 * | este (fiel ao postgrest-js) | legado descarta em silêncio | **sim** |
 *
 * Comportamento real, lido no pacote instalado (`@supabase/postgrest-js@2.101.1`,
 * `dist/index.cjs:129-140`) e confirmado contra o PostgREST do `trifold-crm-dev` por HTTP
 * (**406**, `PGRST116`):
 *
 * ```
 * linhas.length !== 1  ⇒  { data: null, error: { code: "PGRST116", … }, status: 406 }
 * ```
 *
 * Sob o molde, a asserção central desta story ("o legado NÃO processa quando há 2 orgs") é
 * **insatisfazível**: fica vermelha por causa do instrumento, não do código sob teste. Um fake que
 * corrigisse só `data` também não bastaria — a causa raiz nomeada no Context da story é o `error`
 * DESCARTADO pela desestruturação `const { data } = await …`, e sem `error` no fake essa causa
 * raiz continuaria impossível de reprovar.
 *
 * ## Escopo declarado, não descoberto depois
 *
 * `.maybeSingle()` e `.single()` compartilham {@link resultadoSingular}. A diferença real entre os
 * dois no client de verdade — com **0** linhas, `.maybeSingle()` intercepta o `PGRST116` e devolve
 * `{ data: null, error: null }`, enquanto `.single()` propaga o erro — fica **fora** deste fake de
 * propósito: nenhum dos 3 resolvers da 900-24 usa esses terminais (todos usam `.limit(2)`), e o
 * fake existe para reproduzir o **legado**, não para ser um mock genérico do postgrest-js inteiro.
 * Se um teste futuro precisar da distinção de 0 linhas, resolve-se então — com o caso na mão.
 *
 * ## O que o fake honra de verdade (a lição das fatias anteriores desta onda)
 *
 * Um fake que ignora o `.select()` deixa passar a mutação "tirei a coluna do select"; um que
 * registra `.eq()` sem aplicá-lo é régua estática disfarçada de teste. Aqui:
 * `.select()` **projeta** as colunas pedidas, `.eq()` **filtra** (inclusive na forma
 * `coluna->>chave` de jsonb), `.order()` **ordena** e `.limit()` **corta**.
 */

export type Linha = Record<string, unknown>

export interface ErroPostgrest {
  code: string
  message: string
  details: string
  hint?: string | null
}

export interface RespostaPostgrest {
  data: unknown
  error: ErroPostgrest | null
  status: number
}

/** Uma chamada observada — permite asserção sobre a query, não só sobre o resultado. */
export interface ChamadaRegistrada {
  tabela: string
  metodo: string
  args: unknown[]
}

/**
 * Resultado dos terminais singulares (`.single()` / `.maybeSingle()`), fiel ao postgrest-js.
 *
 * Com exatamente 1 linha devolve a linha. Com 0 ou 2+ devolve `PGRST116`/406 e `data: null` — é
 * esta linha que torna o defeito central da 900-24 REPROVÁVEL por teste.
 */
export function resultadoSingular(linhas: Linha[]): RespostaPostgrest {
  if (linhas.length === 1) return { data: linhas[0]!, error: null, status: 200 }
  const contagem = linhas.length === 0 ? "0 rows" : `${linhas.length} rows`
  return {
    data: null,
    error: {
      code: "PGRST116",
      message: "JSON object requested, multiple (or no) rows returned",
      details: `Results contain ${contagem}, application/vnd.pgrst.object+json requires 1 row`,
      hint: null,
    },
    status: 406,
  }
}

export interface OpcoesFakeSupabase {
  /** Linhas por tabela. Tabela ausente = tabela vazia (nunca `undefined` estourando). */
  tabelas: Record<string, Linha[]>
  /** Força um erro de consulta na tabela indicada — carrasco do ramo `erro_consulta`. */
  erroPorTabela?: Record<string, ErroPostgrest>
  /**
   * Quando `true`, toda resolução acontece num **tick posterior** (`setTimeout(…, 0)`).
   *
   * É o que dá carrasco à mutação #5 (remover o `await` de `logOrgUnresolved`): com mock síncrono
   * — o padrão do molde — a escrita já aconteceu quando a asserção roda, e a mutação passa VERDE.
   * Medido pelo @po na rodada 1 do parecer.
   */
  tickDiferido?: boolean
  /** Coletor de chamadas; o teste passa o próprio array e inspeciona depois. */
  chamadas?: ChamadaRegistrada[]
  /**
   * Escritas (`insert`/`update`) registradas **no momento em que a promise RESOLVE**, nunca na
   * chamada do método. A distinção é o que dá carrasco à mutação #5: registrar na chamada faria a
   * escrita aparecer antes do `await`, e "removi o await" ficaria verde.
   */
  escritas?: Array<{ tabela: string; payload: unknown }>
}

/** Projeta as colunas do `.select()`. `*`/vazio devolve a linha inteira. */
function projetar(linha: Linha, colunas: string | null): Linha {
  if (!colunas || colunas.trim() === "*") return { ...linha }
  const chaves = colunas
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
  const saida: Linha = {}
  for (const chave of chaves) saida[chave] = linha[chave]
  return saida
}

/** `.eq("config->>page_id", v)` — mesma forma que o PostgREST aceita para jsonb. */
function valorDaColuna(linha: Linha, coluna: string): unknown {
  if (coluna.includes("->>")) {
    const [pai, filho] = coluna.split("->>")
    const objeto = linha[pai!.trim()] as Record<string, unknown> | null | undefined
    return objeto?.[filho!.trim()]
  }
  return linha[coluna]
}

export function criarFakeSupabase(opcoes: OpcoesFakeSupabase) {
  const chamadas = opcoes.chamadas ?? []
  const escritas = opcoes.escritas ?? []

  function adiar<T>(valor: T): Promise<T> {
    if (!opcoes.tickDiferido) return Promise.resolve(valor)
    return new Promise<T>((resolve) => setTimeout(() => resolve(valor), 0))
  }

  function from(tabela: string) {
    chamadas.push({ tabela, metodo: "from", args: [tabela] })

    const filtros: Array<[string, unknown]> = []
    let colunas: string | null = null
    let ordem: { coluna: string; ascendente: boolean } | null = null
    let operacao: "select" | "insert" | "update" = "select"
    let payload: unknown = null
    let escritaRegistrada = false

    function selecionadas(): Linha[] {
      let linhas = [...(opcoes.tabelas[tabela] ?? [])]
      for (const [coluna, valor] of filtros) {
        linhas = linhas.filter((l) => valorDaColuna(l, coluna) === valor)
      }
      if (ordem) {
        const { coluna, ascendente } = ordem
        linhas.sort((a, b) => {
          const x = String(a[coluna] ?? "")
          const y = String(b[coluna] ?? "")
          return ascendente ? x.localeCompare(y) : y.localeCompare(x)
        })
      }
      return linhas.map((l) => projetar(l, colunas))
    }

    function erro(): ErroPostgrest | undefined {
      return opcoes.erroPorTabela?.[tabela]
    }

    /**
     * Resolve o resultado e — só então — registra a escrita. É aqui, e não na chamada de
     * `.insert()`, que `escritas` cresce: com `tickDiferido`, quem não aguardar a promise não vê
     * a escrita (carrasco da mutação #5).
     */
    function resolver<T>(valor: T): Promise<T> {
      return adiar(valor).then((v) => {
        if (!escritaRegistrada && (operacao === "insert" || operacao === "update")) {
          escritaRegistrada = true
          escritas.push({ tabela, payload })
        }
        return v
      })
    }

    const builder: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        if (operacao === "select") colunas = (args[0] as string | undefined) ?? null
        chamadas.push({ tabela, metodo: "select", args })
        return builder
      },
      insert: (...args: unknown[]) => {
        operacao = "insert"
        payload = args[0]
        chamadas.push({ tabela, metodo: "insert", args })
        return builder
      },
      update: (...args: unknown[]) => {
        operacao = "update"
        payload = args[0]
        chamadas.push({ tabela, metodo: "update", args })
        return builder
      },
      eq: (...args: unknown[]) => {
        filtros.push([args[0] as string, args[1]])
        chamadas.push({ tabela, metodo: "eq", args })
        return builder
      },
      order: (...args: unknown[]) => {
        const cfg = args[1] as { ascending?: boolean } | undefined
        ordem = { coluna: args[0] as string, ascendente: cfg?.ascending !== false }
        chamadas.push({ tabela, metodo: "order", args })
        return builder
      },
      /**
       * Terminal. É o que os 3 resolvers da 900-24 usam — devolve ARRAY, nunca colapsa em
       * "achei a primeira" nem em `null`.
       */
      limit: (...args: unknown[]) => {
        const teto = args[0] as number
        chamadas.push({ tabela, metodo: "limit", args })
        const e = erro()
        if (e) return resolver({ data: null, error: e, status: 500 })
        return resolver({ data: selecionadas().slice(0, teto), error: null, status: 200 })
      },
      single: (...args: unknown[]) => {
        chamadas.push({ tabela, metodo: "single", args })
        const e = erro()
        if (e) return resolver({ data: null, error: e, status: 500 })
        if (operacao === "insert") return resolver({ data: payload, error: null, status: 201 })
        return resolver(resultadoSingular(selecionadas()))
      },
      maybeSingle: (...args: unknown[]) => {
        chamadas.push({ tabela, metodo: "maybeSingle", args })
        const e = erro()
        if (e) return resolver({ data: null, error: e, status: 500 })
        if (operacao === "insert") return resolver({ data: payload, error: null, status: 201 })
        return resolver(resultadoSingular(selecionadas()))
      },
      /** Cadeias sem terminal (`insert(...)`, `update(...).eq(...)`) são aguardadas direto. */
      then: (
        resolve: (v: RespostaPostgrest) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        const e = erro()
        const resultado: RespostaPostgrest = e
          ? { data: null, error: e, status: 500 }
          : operacao === "select"
            ? { data: selecionadas(), error: null, status: 200 }
            : { data: null, error: null, status: 200 }
        return resolver(resultado).then(resolve, reject)
      },
    }
    return builder
  }

  return { from, chamadas, escritas }
}
