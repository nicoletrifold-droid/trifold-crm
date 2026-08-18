/**
 * Story 75-279 — fake mínimo do PostgREST para exercitar o `processMessage` de
 * ponta a ponta.
 *
 * Por que ele existe: as stories 75-245 e 75-268 mexeram no agendamento da
 * Nicole e passaram por QA com o INSERT em `appointments` **nunca executado** em
 * teste — só as funções puras eram cobertas. O defeito da 75-279 (a cliente ouve
 * "anotado" e nada é gravado) vive exatamente no trecho que ninguém exercitava.
 *
 * Os filtros são aplicados de VERDADE (`eq`, `in`, `gt`, `lt`, `is`, `or`).
 * Um fake que aceita `.eq()` e devolve tudo dá confiança falsa — foi o que
 * aconteceu com o fake da 75-270.
 */

export type Row = Record<string, unknown>

type Pred = (r: Row) => boolean

/** Story 87-8 — o `count` do PostgREST vem ao lado de `data`/`error`. */
export interface FakeResult {
  data: unknown
  error: { message: string } | null
  count?: number
}

let idSeq = 0
const nextId = () => `fake-${++idSeq}`

/** `or("stage_id.is.null,stage_id.not.in.(a,b)")` — só as formas que o código usa. */
function parseOr(expr: string): Pred {
  const parts = expr.split(/,(?![^()]*\))/)
  const preds: Pred[] = parts.map((part) => {
    const isNull = part.match(/^([a-z_]+)\.is\.null$/)
    if (isNull) return (r) => r[isNull[1]!] == null
    // Story 75-340: o guard de "Visita Agendada" virou blocklist (`not.in`).
    const notInList = part.match(/^([a-z_]+)\.not\.in\.\((.*)\)$/)
    if (notInList) {
      const values = notInList[2]!.split(",").map((v) => v.trim().replace(/^"|"$/g, ""))
      return (r) => !values.includes(String(r[notInList[1]!]))
    }
    const inList = part.match(/^([a-z_]+)\.in\.\((.*)\)$/)
    if (inList) {
      const values = inList[2]!.split(",").map((v) => v.trim().replace(/^"|"$/g, ""))
      return (r) => values.includes(String(r[inList[1]!]))
    }
    const eq = part.match(/^([a-z_]+)\.eq\.(.*)$/)
    if (eq) return (r) => String(r[eq[1]!]) === eq[2]
    throw new Error(`fake-supabase: forma de .or() não suportada: "${part}"`)
  })
  return (r) => preds.some((p) => p(r))
}

class FakeQuery implements PromiseLike<FakeResult> {
  private preds: Pred[] = []
  private mode: "select" | "insert" | "update" | "upsert" = "select"
  private payload: Row[] = []
  private onConflict: string | null = null
  private wantSingle = false
  private wantMaybe = false
  private limitN: number | null = null
  /**
   * Story 87-8 — LISTA, não campo único. O PostgREST encadeia `.order()`:
   * `.order("created_at",…).order("id",…)` é `ORDER BY created_at, id`. O fake
   * guardava só o último, então o desempate por `id` da Armadilha 1 APAGARIA a
   * ordenação por `created_at` e o teste da cauda passaria verde por acidente —
   * ordenando por `id`, que nas fixtures é justamente `m1…m25` (lexicográfico:
   * `m1 < m10 < m2`). Um fake que ignora o segundo critério dá confiança falsa,
   * que é o defeito que este arquivo existe para não repetir.
   */
  private orders: Array<{ col: string; asc: boolean }> = []
  /** Story 87-8 — `select("*", { count: "exact", head: true })` da AC4/AC7. */
  private wantCount = false
  private headOnly = false

  constructor(
    private readonly store: Map<string, Row[]>,
    private readonly table: string,
    private readonly log: string[]
  ) {}

  private rows(): Row[] {
    if (!this.store.has(this.table)) this.store.set(this.table, [])
    return this.store.get(this.table)!
  }

  select(_cols?: string, _opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    if (this.mode === "select") this.mode = "select"
    if (_opts?.count) this.wantCount = true
    if (_opts?.head) this.headOnly = true
    return this
  }
  eq(col: string, val: unknown) {
    this.preds.push((r) => r[col] === val)
    return this
  }
  neq(col: string, val: unknown) {
    this.preds.push((r) => r[col] !== val)
    return this
  }
  in(col: string, vals: unknown[]) {
    this.preds.push((r) => vals.includes(r[col]))
    return this
  }
  is(col: string, val: null) {
    this.preds.push((r) => (val === null ? r[col] == null : r[col] === val))
    return this
  }
  or(expr: string) {
    this.preds.push(parseOr(expr))
    return this
  }
  gt(col: string, val: string) {
    this.preds.push((r) => String(r[col]) > val)
    return this
  }
  lt(col: string, val: string) {
    this.preds.push((r) => String(r[col]) < val)
    return this
  }
  gte(col: string, val: string) {
    this.preds.push((r) => String(r[col]) >= val)
    return this
  }
  lte(col: string, val: string) {
    this.preds.push((r) => String(r[col]) <= val)
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending ?? true })
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  single() {
    this.wantSingle = true
    return this
  }
  maybeSingle() {
    this.wantMaybe = true
    return this
  }
  insert(payload: Row | Row[]) {
    this.mode = "insert"
    this.payload = Array.isArray(payload) ? payload : [payload]
    return this
  }
  update(payload: Row) {
    this.mode = "update"
    this.payload = [payload]
    return this
  }
  upsert(payload: Row, opts?: { onConflict?: string }) {
    this.mode = "upsert"
    this.payload = [payload]
    this.onConflict = opts?.onConflict ?? null
    return this
  }

  private matching(): Row[] {
    return this.rows().filter((r) => this.preds.every((p) => p(r)))
  }

  private run(): FakeResult {
    this.log.push(`${this.mode}:${this.table}`)

    if (this.mode === "insert") {
      const created = this.payload.map((p) => ({ id: nextId(), ...p }))
      this.rows().push(...created)
      return this.shape(created)
    }

    if (this.mode === "update") {
      const hit = this.matching()
      for (const r of hit) Object.assign(r, this.payload[0])
      return this.shape(hit)
    }

    if (this.mode === "upsert") {
      const p = this.payload[0]!
      const key = this.onConflict
      const existing = key ? this.rows().find((r) => r[key] === p[key]) : undefined
      if (existing) {
        Object.assign(existing, p)
        return this.shape([existing])
      }
      const created = { id: nextId(), ...p }
      this.rows().push(created)
      return this.shape([created])
    }

    let out = this.matching()
    // Story 87-8 — o `count` é do conjunto FILTRADO, antes do `limit` (é assim
    // no PostgREST). Capturado aqui de propósito: depois do slice ele contaria
    // a janela, não a conversa, e a AC7 publicaria `total_na_conversa: 20`.
    const total = out.length
    if (this.orders.length > 0) {
      out = [...out].sort((a, b) => {
        for (const { col, asc } of this.orders) {
          const av = String(a[col] ?? "")
          const bv = String(b[col] ?? "")
          const c = asc ? av.localeCompare(bv) : bv.localeCompare(av)
          if (c !== 0) return c
        }
        return 0
      })
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN)
    if (this.headOnly) return { data: null, error: null, count: total }
    return { ...this.shape(out), ...(this.wantCount ? { count: total } : {}) }
  }

  private shape(rows: Row[]): FakeResult {
    if (this.wantSingle) {
      // PostgREST devolve ERRO quando .single() não encontra linha — o código de
      // produção depende disso para cair nos defaults.
      if (rows.length !== 1) return { data: null, error: { message: "no rows returned" } }
      return { data: rows[0], error: null }
    }
    if (this.wantMaybe) return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null }
  }

  then<R1 = FakeResult, R2 = never>(
    onfulfilled?: ((v: FakeResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

export interface FakeSupabase {
  from(table: string): FakeQuery
  rpc(name: string, args?: unknown): Promise<FakeResult>
  /** Estado final das tabelas — para asserção depois do turno. */
  table(name: string): Row[]
  /** Sequência de operações executadas ("insert:appointments", …). */
  calls: string[]
}

export function createFakeSupabase(seed: Record<string, Row[]> = {}): FakeSupabase {
  const store = new Map<string, Row[]>()
  for (const [t, rows] of Object.entries(seed)) store.set(t, rows.map((r) => ({ ...r })))
  const calls: string[] = []

  return {
    from: (table: string) => new FakeQuery(store, table, calls),
    rpc: async (name: string) => {
      calls.push(`rpc:${name}`)
      return { data: [], error: null }
    },
    table: (name: string) => store.get(name) ?? [],
    calls,
  }
}
