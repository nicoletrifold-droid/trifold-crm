import { describe, it, expect, vi, beforeEach } from "vitest"

// Story 75-282 — o alvo é `findOrCreateCliente`, alcançado via `syncObraClientes`.
// Tudo que fala com a rede (API Sienge) e com o Supabase é fake; o que está sob teste é a
// DECISÃO de casar × criar cliente.

const getAllSalesContracts = vi.fn()
const getCustomerById = vi.fn()
const syncClienteEmail = vi.fn()
const logEvent = vi.fn()
let fake: ReturnType<typeof makeFakeDb>

vi.mock("./client", () => ({
  getAllSalesContracts: (...a: unknown[]) => getAllSalesContracts(...a),
  getCustomerById: (...a: unknown[]) => getCustomerById(...a),
}))
vi.mock("./customer-profile-sync", () => ({
  syncClienteEmail: (...a: unknown[]) => syncClienteEmail(...a),
}))
vi.mock("@web/lib/logger", () => ({
  // `logEvent` recebe UM objeto — spread de unknown[] não bate com a assinatura real.
  logEvent: (params: unknown) => logEvent(params),
}))
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => fake.client,
}))

const { syncObraClientes } = await import("./sync")

const OBRA_ID = "obra-1"
const ORG_ID = "org-1"

interface Row {
  [k: string]: unknown
}

/**
 * Fake do PostgREST que HONRA os filtros — `.eq`, `.in`, `.order`, `.limit`.
 *
 * Os fakes existentes no repo (ex.: `appointments/google-mirror.test.ts`) devolvem o mesmo
 * resultado independente do filtro. Aqui isso invalidaria o teste: a regra sob teste É o
 * filtro (CPF nos dois formatos) e a ordenação (desempate pela linha mais antiga).
 */
function makeFakeDb(tables: Record<string, Row[]>) {
  const inserted: Record<string, Row[]> = {}
  const updated: { table: string; fields: Row }[] = []

  const rowsOf = (table: string): Row[] => {
    tables[table] ??= []
    return tables[table]!
  }

  const client = {
    // `maybeInviteCliente` chama auth.admin.generateLink (best-effort). Stub para o teste
    // exercitar o casamento de cliente sem ruído de exceção no convite de portal.
    auth: {
      admin: {
        generateLink: async () => ({
          data: { user: { id: "auth-new" } },
          error: null,
        }),
        updateUserById: async () => ({ data: null, error: null }),
      },
    },
    from(table: string) {
      return {
        select() {
          const filters: ((r: Row) => boolean)[] = []
          let orderKey: string | null = null
          let orderAsc = true
          let take: number | null = null

          const api = {
            eq(col: string, val: unknown) {
              filters.push((r) => r[col] === val)
              return api
            },
            in(col: string, vals: unknown[]) {
              filters.push((r) => vals.includes(r[col] as never))
              return api
            },
            is(col: string, val: unknown) {
              filters.push((r) => r[col] === val)
              return api
            },
            order(col: string, opts?: { ascending?: boolean }) {
              orderKey = col
              orderAsc = opts?.ascending !== false
              return api
            },
            limit(n: number) {
              take = n
              return api
            },
            get rows(): Row[] {
              let rows = rowsOf(table).filter((r) => filters.every((f) => f(r)))
              if (orderKey) {
                const key = orderKey
                rows = [...rows].sort((a, b) => {
                  const av = String(a[key] ?? "")
                  const bv = String(b[key] ?? "")
                  return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av)
                })
              }
              return take === null ? rows : rows.slice(0, take)
            },
            then(resolve: (v: { data: Row[]; error: null }) => unknown) {
              return Promise.resolve({ data: api.rows, error: null }).then(resolve)
            },
            maybeSingle() {
              const rows = api.rows
              // Comportamento REAL do PostgREST: mais de uma linha → erro PGRST116, não a
              // primeira linha. É esta resposta que o código antigo tratava como "não existe",
              // caindo no INSERT e duplicando o cliente.
              if (rows.length > 1) {
                return Promise.resolve({
                  data: null,
                  error: {
                    code: "PGRST116",
                    message:
                      "JSON object requested, multiple (or no) rows returned",
                  },
                })
              }
              return Promise.resolve({ data: rows[0] ?? null, error: null })
            },
            single() {
              const rows = api.rows
              return Promise.resolve({ data: rows[0] ?? null, error: null })
            },
          }
          return api
        },
        insert(fields: Row) {
          const row = { id: `new-${Math.abs(JSON.stringify(fields).length)}`, ...fields }
          rowsOf(table).push(row)
          ;(inserted[table] ??= []).push(row)
          return {
            select: () => ({
              single: () => Promise.resolve({ data: row, error: null }),
            }),
            then: (resolve: (v: { data: null; error: null }) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
          }
        },
        update(fields: Row) {
          updated.push({ table, fields })
          const api = {
            eq: () => api,
            then: (resolve: (v: { data: null; error: null }) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
          }
          return api
        },
      }
    },
  } as never

  return { client, inserted, updated }
}

function contract(number: string, customerId: number) {
  return {
    id: 1,
    number,
    situation: "Emitido",
    salesContractCustomers: [{ id: customerId, main: true }],
  }
}

function customer(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1521,
    name: "Sônia Berenice Rieiro de Lima",
    cpf: "20736347020",
    email: "sonia_llima@hotmail.com",
    phones: [],
    ...over,
  }
}

function baseTables(clientes: Row[]) {
  return {
    obras: [{ id: OBRA_ID, org_id: ORG_ID, sienge_enterprise_id: 8 }],
    clientes,
    clientes_obras_vinculos: [],
    cliente_obras: [],
    users: [],
  }
}

beforeEach(() => {
  getAllSalesContracts.mockReset()
  getCustomerById.mockReset()
  syncClienteEmail.mockReset()
  logEvent.mockReset()
})

describe("Story 75-282 — casamento cliente Sienge → CRM", () => {
  it("AC1 — CPF mascarado no CRM casa com o CPF limpo do Sienge (não cria duplicata)", async () => {
    fake = makeFakeDb(
      baseTables([
        {
          id: "cli-sonia",
          org_id: ORG_ID,
          nome: "Sonia Berenice Rieiro de Lima",
          cpf: "207.363.470-20", // ← como está hoje em produção
          email: "outro-email@exemplo.com", // e-mail NÃO casa: o CPF tem que resolver
          telefone: null,
          whatsapp: null,
          sienge_customer_id: null,
          created_at: "2026-08-06T14:59:15Z",
        },
      ])
    )
    getAllSalesContracts.mockResolvedValue([contract("VIND-502", 1521)])
    getCustomerById.mockResolvedValue(customer())

    const result = await syncObraClientes(OBRA_ID)

    expect(result.success).toBe(true)
    expect(result.created).toBe(0)
    expect(fake.inserted.clientes ?? []).toHaveLength(0)
    // e carimba o vínculo Sienge que faltava
    expect(fake.updated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "clientes",
          fields: expect.objectContaining({ sienge_customer_id: 1521 }),
        }),
      ])
    )
  })

  it("AC3 — com várias linhas do mesmo sienge_customer_id, casa a MAIS ANTIGA (canônica)", async () => {
    fake = makeFakeDb(
      baseTables([
        {
          id: "cli-maktub-canonica",
          org_id: ORG_ID,
          nome: "MAKTUB",
          cpf: "865.001.559-04", // como está em produção: mascarado
          email: "anicolau0713@gmail.com",
          telefone: null,
          whatsapp: null,
          sienge_customer_id: 1437,
          created_at: "2026-05-27T14:24:51Z",
        },
        {
          id: "cli-maktub-dup-1",
          org_id: ORG_ID,
          nome: "MAKTUB",
          cpf: null,
          email: "anicolau0713@gmail.com",
          telefone: null,
          whatsapp: null,
          sienge_customer_id: 1437,
          created_at: "2026-07-17T17:04:48Z",
        },
        {
          id: "cli-maktub-dup-2",
          org_id: ORG_ID,
          nome: "MAKTUB",
          cpf: null,
          email: "anicolau0713@gmail.com",
          telefone: null,
          whatsapp: null,
          sienge_customer_id: 1437,
          created_at: "2026-07-22T17:39:55Z",
        },
      ])
    )
    getAllSalesContracts.mockResolvedValue([contract("VIND-804", 1437)])
    getCustomerById.mockResolvedValue(
      customer({ id: 1437, name: "MAKTUB", cpf: "865.001.559-04" })
    )

    const result = await syncObraClientes(OBRA_ID)

    expect(result.success).toBe(true)
    expect(fake.inserted.clientes ?? []).toHaveLength(0)
    // o vínculo de obra foi criado para a linha canônica, não para uma duplicata
    expect(fake.inserted.clientes_obras_vinculos?.[0]?.cliente_id).toBe(
      "cli-maktub-canonica"
    )
  })

  it("AC2/AC4 — e-mail apontando para 2 clientes: NÃO cria nada e loga a ambiguidade", async () => {
    fake = makeFakeDb(
      baseTables([
        {
          id: "cli-maktub",
          org_id: ORG_ID,
          nome: "MAKTUB",
          cpf: "865.001.559-04", // mascarado E o Sienge manda limpo…
          email: "anicolau0713@gmail.com",
          telefone: null,
          whatsapp: null,
          sienge_customer_id: null, // …e ainda não há vínculo Sienge
          created_at: "2026-05-27T14:24:51Z",
        },
        {
          id: "cli-alexandre",
          org_id: ORG_ID,
          nome: "Alexandre G. Nicolau",
          cpf: "52723100987",
          email: "anicolau0713@gmail.com", // ← a colisão de 15/07
          telefone: null,
          whatsapp: null,
          sienge_customer_id: null,
          created_at: "2026-07-15T10:32:12Z",
        },
      ])
    )
    getAllSalesContracts.mockResolvedValue([contract("VIND-804", 1437)])
    // CPF do Sienge com dígito diferente do CRM → força a queda no fallback por e-mail,
    // que é justamente onde mora a ambiguidade (o e-mail TEM de ser o compartilhado).
    getCustomerById.mockResolvedValue(
      customer({
        id: 1437,
        name: "MAKTUB",
        cpf: "11122233344",
        email: "anicolau0713@gmail.com",
      })
    )

    const result = await syncObraClientes(OBRA_ID)

    expect(result.success).toBe(true)
    expect(result.created).toBe(0)
    // O comportamento antigo criava um cliente aqui — 4 vezes, em produção.
    expect(fake.inserted.clientes ?? []).toHaveLength(0)
    expect(fake.inserted.clientes_obras_vinculos ?? []).toHaveLength(0)
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "SIENGE_SYNC_AMBIGUOUS_EMAIL",
        level: "warn",
        metadata: expect.objectContaining({
          cliente_ids: expect.arrayContaining(["cli-maktub", "cli-alexandre"]),
        }),
      })
    )
  })

  it("cliente realmente novo continua sendo criado (não travamos o sync)", async () => {
    fake = makeFakeDb(baseTables([]))
    getAllSalesContracts.mockResolvedValue([contract("VIND-502", 1521)])
    getCustomerById.mockResolvedValue(customer())

    const result = await syncObraClientes(OBRA_ID)

    expect(result.success).toBe(true)
    expect(result.created).toBe(1)
    expect(fake.inserted.clientes).toHaveLength(1)
    // CPF gravado só com dígitos
    expect(fake.inserted.clientes?.[0]?.cpf).toBe("20736347020")
  })
})
