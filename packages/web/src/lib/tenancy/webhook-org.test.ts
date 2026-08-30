/**
 * Story 900-24 · AC10 — Camada A (unitária, sem banco).
 *
 * O instrumento é `__fixtures__/fake-supabase-postgrest.ts`, e a razão de ele existir está lá:
 * o molde de `admin-invite.test.ts` mente em `data` E em `error` nos terminais singulares, o que
 * tornaria o defeito central desta story **insatisfazível por teste**. Aqui há três famílias:
 *
 * 1. **Testes do próprio fake** (Task 10.3) — porque um instrumento sem carrasco é uma alegação.
 * 2. **O legado sob o fake fiel** — a reprodução do bug agudo: com 2 configs `active`, o
 *    `.maybeSingle()` de `webhook/whatsapp/route.ts:394-398` descarta em silêncio.
 * 3. **Propriedades dos 3 resolvers + do dual-run compartilhado.**
 *
 * A mutação #8 ("o caminho novo nunca decide em `both`") NÃO mora aqui: ela é por RECEPTOR, e
 * observa o `orgId` que chega ao PROCESSAMENTO — o que só é observável na suíte que tem o fake da
 * rota. Ver `app/api/webhook/whatsapp/__tests__/route.test.ts`, `lib/meta/process-lead.test.ts`,
 * `app/api/webhooks/landing-page/route.test.ts` e `app/api/telegram/webhook/route.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import {
  criarFakeSupabase,
  resultadoSingular,
  type Linha,
} from "./__fixtures__/fake-supabase-postgrest"

vi.mock("server-only", () => ({}))

const logEventMock = vi.fn()
const logEventOnceMock = vi.fn<(...args: unknown[]) => Promise<{ inserted: boolean }>>(
  async () => ({ inserted: true }),
)
vi.mock("@web/lib/logger", () => ({
  logEvent: (...args: unknown[]) => logEventMock(...args),
  logEventOnce: (...args: unknown[]) => logEventOnceMock(...args),
}))

/** O client que `logOrgUnresolved` cria por dentro (`createAdminClient()`). */
let adminEscritas: Array<{ tabela: string; payload: unknown }> = []
let adminTickDiferido = false
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () =>
    criarFakeSupabase({
      tabelas: { webhook_logs: [] },
      escritas: adminEscritas,
      tickDiferido: adminTickDiferido,
    }),
}))

import {
  CHAVES_IDENTIFICADOR_PERMITIDAS,
  decidirModoRoteamento,
  logOrgResolved,
  logOrgUnresolved,
  resolveOrgByMetaPage,
  resolveOrgByWhatsAppPhone,
  resolveSoleOrg,
} from "./webhook-org"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(tabelas: Record<string, Linha[]>, extras: Record<string, unknown> = {}): any {
  return criarFakeSupabase({ tabelas, ...extras })
}

const CONFIG_A = {
  org_id: "org-A",
  phone_number_id: "PNID-A",
  access_token: "TOKEN-A",
  coexistence_enabled: false,
  status: "active",
}
const CONFIG_B = {
  org_id: "org-B",
  phone_number_id: "PNID-B",
  access_token: "TOKEN-B",
  coexistence_enabled: true,
  status: "active",
}

const ENV_ORIGINAL = process.env.WEBHOOK_ORG_ROUTING

beforeEach(() => {
  vi.clearAllMocks()
  adminEscritas = []
  adminTickDiferido = false
})

afterEach(() => {
  if (ENV_ORIGINAL === undefined) delete process.env.WEBHOOK_ORG_ROUTING
  else process.env.WEBHOOK_ORG_ROUTING = ENV_ORIGINAL
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. O instrumento (Task 10.3) — testes dedicados, não asserções de canto
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("fake fiel ao postgrest-js — os 3 comportamentos que o molde erra", () => {
  it("`maybeSingle()` com 2+ linhas devolve data:null E error PGRSTICO 116/406", async () => {
    const r = await db({ t: [{ id: 1 }, { id: 2 }] }).from("t").select("id").maybeSingle()
    expect(r.data).toBeNull()
    expect(r.error?.code).toBe("PGRST116")
    expect(r.error?.details).toContain("2 rows")
    expect(r.status).toBe(406)
  })

  it("`single()` com 0 linhas devolve data:null E error PGRST116 (`0 rows`)", async () => {
    const r = await db({ t: [] }).from("t").select("id").single()
    expect(r.data).toBeNull()
    expect(r.error?.code).toBe("PGRST116")
    expect(r.error?.details).toContain("0 rows")
    expect(r.status).toBe(406)
  })

  it("`single()` com 2+ linhas devolve data:null E error PGRST116 (`2 rows`)", async () => {
    const r = await db({ t: [{ id: 1 }, { id: 2 }] }).from("t").select("id").single()
    expect(r.data).toBeNull()
    expect(r.error?.code).toBe("PGRST116")
    expect(r.error?.details).toContain("2 rows")
  })

  it("com exatamente 1 linha, os dois terminais devolvem a linha e error:null", async () => {
    const um = await db({ t: [{ id: 1 }] }).from("t").select("id").single()
    const outro = await db({ t: [{ id: 1 }] }).from("t").select("id").maybeSingle()
    expect(um).toMatchObject({ data: { id: 1 }, error: null, status: 200 })
    expect(outro).toMatchObject({ data: { id: 1 }, error: null, status: 200 })
  })

  it("`resultadoSingular` é a fonte única dos dois terminais", () => {
    expect(resultadoSingular([{ id: 1 }]).data).toEqual({ id: 1 })
    expect(resultadoSingular([]).error?.code).toBe("PGRST116")
    expect(resultadoSingular([{ id: 1 }, { id: 2 }]).error?.code).toBe("PGRST116")
  })

  it("`.eq()` FILTRA de verdade (não só registra a chamada)", async () => {
    const r = await db({ t: [{ id: 1, k: "a" }, { id: 2, k: "b" }] })
      .from("t")
      .select("id, k")
      .eq("k", "b")
      .limit(2)
    expect(r.data).toEqual([{ id: 2, k: "b" }])
  })

  it("`.eq()` entende a forma jsonb `coluna->>chave`", async () => {
    const r = await db({
      t: [
        { org_id: "org-A", config: { page_id: "PG-A" } },
        { org_id: "org-B", config: { page_id: "PG-B" } },
      ],
    })
      .from("t")
      .select("org_id")
      .eq("config->>page_id", "PG-B")
      .limit(2)
    expect(r.data).toEqual([{ org_id: "org-B" }])
  })

  it("`.select()` PROJETA as colunas — coluna fora do select não vaza para o resultado", async () => {
    const r = await db({ t: [{ id: 1, segredo: "x" }] }).from("t").select("id").limit(2)
    expect(r.data).toEqual([{ id: 1 }])
    expect((r.data as Linha[])[0]).not.toHaveProperty("segredo")
  })

  it("`.limit(n)` CORTA — 3 linhas com limit(2) devolvem 2", async () => {
    const r = await db({ t: [{ id: 1 }, { id: 2 }, { id: 3 }] }).from("t").select("id").limit(2)
    expect((r.data as Linha[]).length).toBe(2)
  })

  it("`.order()` ORDENA — desc inverte a saída", async () => {
    const r = await db({ t: [{ id: "a" }, { id: "c" }, { id: "b" }] })
      .from("t")
      .select("id")
      .order("id", { ascending: false })
      .limit(3)
    expect(r.data).toEqual([{ id: "c" }, { id: "b" }, { id: "a" }])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. O bug agudo, reproduzido: o LEGADO sob o fake fiel
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("o defeito que esta story existe para fechar", () => {
  /** Cópia literal de `webhook/whatsapp/route.ts:394-398` (o código de antes da 900-24). */
  async function legadoLiteral(cliente: ReturnType<typeof criarFakeSupabase>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = cliente.from("whatsapp_config") as any
    const { data: config } = await query
      .select("org_id, phone_number_id, access_token, coexistence_enabled")
      .eq("status", "active")
      .maybeSingle()
    return config as Linha | null
  }

  it("com UMA org ativa o legado funciona — é por isso que o bug nunca apareceu", async () => {
    const config = await legadoLiteral(criarFakeSupabase({ tabelas: { whatsapp_config: [CONFIG_A] } }))
    expect(config).toMatchObject({ org_id: "org-A" })
  })

  it("com DUAS orgs ativas o legado descarta as duas em silêncio (data:null)", async () => {
    const config = await legadoLiteral(
      criarFakeSupabase({ tabelas: { whatsapp_config: [CONFIG_A, CONFIG_B] } }),
    )
    // Nem `org-A` nem `org-B`: NENHUMA mensagem seria processada, com 200 na resposta.
    expect(config).toBeNull()
  })

  it("o caminho NOVO, no mesmo dado, resolve cada telefone à sua org", async () => {
    const tabelas = { whatsapp_config: [CONFIG_A, CONFIG_B] }
    const a = await resolveOrgByWhatsAppPhone(db(tabelas), "PNID-A")
    const b = await resolveOrgByWhatsAppPhone(db(tabelas), "PNID-B")
    expect(a).toMatchObject({ status: "resolvida", config: { org_id: "org-A" } })
    expect(b).toMatchObject({ status: "resolvida", config: { org_id: "org-B" } })
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. Propriedades dos 3 resolvers
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("resolveOrgByWhatsAppPhone", () => {
  it("telefone inexistente → nenhuma_correspondencia", async () => {
    const r = await resolveOrgByWhatsAppPhone(db({ whatsapp_config: [CONFIG_A] }), "PNID-ZZZ")
    expect(r).toEqual({
      status: "nao_resolvida",
      motivo: "nenhuma_correspondencia",
      quantidadeEncontrada: 0,
    })
  })

  it("telefone null/undefined nem consulta o banco", async () => {
    const fake = criarFakeSupabase({ tabelas: { whatsapp_config: [CONFIG_A] } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await resolveOrgByWhatsAppPhone(fake as any, null)
    expect(r).toMatchObject({ motivo: "nenhuma_correspondencia" })
    expect(fake.chamadas).toHaveLength(0)
  })

  it("2 configs ativas com o MESMO telefone → ambigua, quantidadeEncontrada === 2", async () => {
    const r = await resolveOrgByWhatsAppPhone(
      db({ whatsapp_config: [CONFIG_A, { ...CONFIG_B, phone_number_id: "PNID-A" }] }),
      "PNID-A",
    )
    // `2` e não `1`: prova que não caiu num `.length > 0` frouxo (mutação #6).
    expect(r).toEqual({ status: "nao_resolvida", motivo: "ambigua", quantidadeEncontrada: 2 })
  })

  it("config INATIVA com o telefone certo não resolve (filtro status='active')", async () => {
    const r = await resolveOrgByWhatsAppPhone(
      db({ whatsapp_config: [{ ...CONFIG_A, status: "inactive" }] }),
      "PNID-A",
    )
    expect(r).toMatchObject({ motivo: "nenhuma_correspondencia" })
  })

  it("erro de consulta vira `erro_consulta`, não `nenhuma_correspondencia`", async () => {
    const r = await resolveOrgByWhatsAppPhone(
      db({ whatsapp_config: [CONFIG_A] }, {
        erroPorTabela: { whatsapp_config: { code: "57014", message: "timeout", details: "" } },
      }),
      "PNID-A",
    )
    expect(r).toEqual({
      status: "nao_resolvida",
      motivo: "erro_consulta",
      quantidadeEncontrada: 0,
    })
  })

  it("devolve a LINHA inteira (access_token junto), não só o orgId", async () => {
    const r = await resolveOrgByWhatsAppPhone(db({ whatsapp_config: [CONFIG_A] }), "PNID-A")
    expect(r).toMatchObject({
      status: "resolvida",
      config: {
        org_id: "org-A",
        phone_number_id: "PNID-A",
        access_token: "TOKEN-A",
        coexistence_enabled: false,
      },
    })
  })

  it("usa `.limit(2)` como terminal — nunca `.maybeSingle()`/`.single()`", async () => {
    const fake = criarFakeSupabase({ tabelas: { whatsapp_config: [CONFIG_A] } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await resolveOrgByWhatsAppPhone(fake as any, "PNID-A")
    const metodos = fake.chamadas.map((c) => c.metodo)
    expect(metodos).toContain("limit")
    expect(metodos).not.toContain("maybeSingle")
    expect(metodos).not.toContain("single")
    expect(fake.chamadas.find((c) => c.metodo === "limit")?.args).toEqual([2])
  })
})

describe("resolveOrgByMetaPage", () => {
  // Story 900-51/AC10 — `status` deixou de ser decorativo nesta fixture: o resolver passou a
  // exigir `connected`. Uma fixture sem a coluna esconderia a mudança (todas as linhas casariam
  // `undefined`), então ela é explícita nas duas linhas.
  const INTEG_A = {
    org_id: "org-A",
    provider: "meta_ads",
    status: "connected",
    config: { page_id: "PG-A" },
  }
  const INTEG_B = {
    org_id: "org-B",
    provider: "meta_ads",
    status: "connected",
    config: { page_id: "PG-B" },
  }

  it("cada page_id resolve à sua org", async () => {
    const t = { org_integrations: [INTEG_A, INTEG_B] }
    expect(await resolveOrgByMetaPage(db(t), "PG-A")).toEqual({ status: "resolvida", orgId: "org-A" })
    expect(await resolveOrgByMetaPage(db(t), "PG-B")).toEqual({ status: "resolvida", orgId: "org-B" })
  })

  it("page_id desconhecido → nenhuma_correspondencia", async () => {
    const r = await resolveOrgByMetaPage(db({ org_integrations: [INTEG_A] }), "PG-ZZZ")
    expect(r).toMatchObject({ motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 })
  })

  it("2 orgs com o MESMO page_id → ambigua, quantidadeEncontrada === 2", async () => {
    const r = await resolveOrgByMetaPage(
      db({ org_integrations: [INTEG_A, { ...INTEG_B, config: { page_id: "PG-A" } }] }),
      "PG-A",
    )
    expect(r).toEqual({ status: "nao_resolvida", motivo: "ambigua", quantidadeEncontrada: 2 })
  })

  it("lê `org_integrations` do provider `meta_ads`, nunca `whatsapp_config`", async () => {
    const fake = criarFakeSupabase({ tabelas: { org_integrations: [INTEG_A] } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await resolveOrgByMetaPage(fake as any, "PG-A")
    expect(fake.chamadas.map((c) => c.tabela)).toEqual(
      Array(fake.chamadas.length).fill("org_integrations"),
    )
    expect(fake.chamadas).toContainEqual(
      expect.objectContaining({ metodo: "eq", args: ["provider", "meta_ads"] }),
    )
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // Story 900-51 · AC10/Task 12.4 — a decisão da 900-24 foi REVERTIDA, e estes três testes são
  // o carrasco dela. O teste que existia aqui antes afirmava o oposto ("NÃO filtra status") e foi
  // SUBSTITUÍDO, não deixado ao lado do novo: régua superada por decisão precisa ser reescrita.
  //
  // Os dois primeiros são os dois sentidos que a Task 12.4 exige. O terceiro é o que impede o
  // filtro de morrer num refactor sem ninguém notar — sem ele, apagar a linha `.eq("status", …)`
  // do resolver deixaria os dois primeiros... ainda vermelhos? Não: o primeiro ficaria VERDE
  // (linha connected resolve com ou sem filtro) e só o segundo reprovaria. É por isso que o
  // terceiro afirma a CHAMADA, e não só o resultado.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  it("linha com o page_id certo e `status != 'connected'` NÃO resolve (AC10)", async () => {
    for (const status of ["disconnected", "error"]) {
      const r = await resolveOrgByMetaPage(
        db({ org_integrations: [{ ...INTEG_A, status }] }),
        "PG-A",
      )
      expect(r).toEqual({
        status: "nao_resolvida",
        motivo: "nenhuma_correspondencia",
        quantidadeEncontrada: 0,
      })
    }
  })

  it("linha com o page_id certo e `status = 'connected'` resolve (AC10, sentido oposto)", async () => {
    const r = await resolveOrgByMetaPage(
      db({ org_integrations: [{ ...INTEG_A, status: "connected" }] }),
      "PG-A",
    )
    expect(r).toEqual({ status: "resolvida", orgId: "org-A" })
  })

  it("o filtro de status é EMITIDO na consulta, não obtido por acaso da fixture", async () => {
    const fake = criarFakeSupabase({ tabelas: { org_integrations: [INTEG_A] } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await resolveOrgByMetaPage(fake as any, "PG-A")
    expect(fake.chamadas).toContainEqual(
      expect.objectContaining({ metodo: "eq", args: ["status", "connected"] }),
    )
  })

  it("erro de consulta vira `erro_consulta`", async () => {
    const r = await resolveOrgByMetaPage(
      db({ org_integrations: [INTEG_A] }, {
        erroPorTabela: { org_integrations: { code: "42501", message: "denied", details: "" } },
      }),
      "PG-A",
    )
    expect(r).toMatchObject({ motivo: "erro_consulta" })
  })
})

describe("resolveSoleOrg", () => {
  it("1 org ativa → resolve", async () => {
    const r = await resolveSoleOrg(db({ organizations: [{ id: "org-A", is_active: true }] }))
    expect(r).toEqual({ status: "resolvida", orgId: "org-A" })
  })

  it("0 orgs ativas → nenhuma_correspondencia", async () => {
    const r = await resolveSoleOrg(db({ organizations: [] }))
    expect(r).toMatchObject({ motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 })
  })

  it("2 orgs ativas → ambigua com quantidadeEncontrada === 2 (não escolhe uma)", async () => {
    const r = await resolveSoleOrg(
      db({ organizations: [{ id: "org-A", is_active: true }, { id: "org-B", is_active: true }] }),
    )
    expect(r).toEqual({ status: "nao_resolvida", motivo: "ambigua", quantidadeEncontrada: 2 })
  })

  it("1 ativa + 1 inativa → resolve a ativa (a inativa não conta)", async () => {
    const r = await resolveSoleOrg(
      db({ organizations: [{ id: "org-A", is_active: true }, { id: "org-B", is_active: false }] }),
    )
    expect(r).toEqual({ status: "resolvida", orgId: "org-A" })
  })

  it("erro de consulta vira `erro_consulta`", async () => {
    const r = await resolveSoleOrg(
      db({ organizations: [] }, {
        erroPorTabela: { organizations: { code: "08006", message: "conn", details: "" } },
      }),
    )
    expect(r).toMatchObject({ motivo: "erro_consulta" })
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. Dual-run compartilhado
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("decidirModoRoteamento", () => {
  it("env ausente → `both` (nunca `legacy`/`identifier` silenciosos)", () => {
    delete process.env.WEBHOOK_ORG_ROUTING
    expect(decidirModoRoteamento()).toBe("both")
  })

  it("string vazia → `both`", () => {
    process.env.WEBHOOK_ORG_ROUTING = ""
    expect(decidirModoRoteamento()).toBe("both")
  })

  it("`legacy` e `identifier` explícitos são respeitados", () => {
    process.env.WEBHOOK_ORG_ROUTING = "legacy"
    expect(decidirModoRoteamento()).toBe("legacy")
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    expect(decidirModoRoteamento()).toBe("identifier")
  })

  it("qualquer outra string → `both`, sem lançar (fail-safe)", () => {
    for (const v of ["BOTH", "Legacy", "identifer", "true", "0"]) {
      process.env.WEBHOOK_ORG_ROUTING = v
      expect(decidirModoRoteamento()).toBe("both")
    }
  })
})

describe("logOrgResolved", () => {
  it("é fire-and-forget (`logEvent`), com via/divergiu/receptor no metadata", () => {
    logOrgResolved({ receptor: "whatsapp", via: "legacy", orgId: "org-A", divergiu: true })
    expect(logEventOnceMock).not.toHaveBeenCalled()
    expect(logEventMock).toHaveBeenCalledTimes(1)
    expect(logEventMock.mock.calls[0]![0]).toMatchObject({
      event_type: "WEBHOOK_ORG_RESOLVED",
      category: "webhook",
      org_id: "org-A",
      metadata: { via: "legacy", divergiu: true, receptor: "whatsapp" },
    })
  })

  it("`divergiu: null` no modo identifier puro (não computou o legado)", () => {
    logOrgResolved({ receptor: "meta_ads", via: "identifier", orgId: "org-B", divergiu: null })
    expect(logEventMock.mock.calls[0]![0]).toMatchObject({
      metadata: { via: "identifier", divergiu: null, receptor: "meta_ads" },
    })
  })
})

describe("logOrgUnresolved", () => {
  it("é AGUARDADO (`logEventOnce`), nunca fire-and-forget — é a última escrita antes do 200", async () => {
    await logOrgUnresolved({
      receptor: "whatsapp",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
      identificador: { phone_number_id: "PNID-A" },
      webhookLogsSource: "whatsapp",
    })
    expect(logEventOnceMock).toHaveBeenCalledTimes(1)
    expect(logEventMock).not.toHaveBeenCalled()
    expect(logEventOnceMock.mock.calls[0]![0]).toMatchObject({
      level: "warn",
      event_type: "WEBHOOK_ORG_UNRESOLVED",
      metadata: {
        motivo: "ambigua",
        quantidade_encontrada: 2,
        identificador: { phone_number_id: "PNID-A" },
        receptor: "whatsapp",
      },
    })
  })

  it("grava `webhook_logs` com org_id NULL e o `processing_error` nomeado", async () => {
    await logOrgUnresolved({
      receptor: "meta_ads",
      motivo: "nenhuma_correspondencia",
      quantidadeEncontrada: 0,
      identificador: { page_id: "PG-X" },
      webhookLogsSource: "meta_ads",
    })
    expect(adminEscritas).toContainEqual({
      tabela: "webhook_logs",
      payload: {
        org_id: null,
        source: "meta_ads",
        event_type: "org_unresolved",
        payload: { page_id: "PG-X" },
        processing_error: "org_unresolved:nenhuma_correspondencia",
        processed: true,
      },
    })
  })

  /**
   * Task 5.4 — `landing_page` e `meta_ads` JÁ inserem uma linha de `webhook_logs` antes de
   * resolver a org. Sem o `webhookLogsExistenteId`, a mesma requisição teria DUAS linhas, e
   * "quantas submissões chegaram" passaria a contar errado em silêncio.
   */
  it("com `webhookLogsExistenteId`, ATUALIZA a linha do chamador e NÃO insere outra", async () => {
    const escritasLocais: Array<{ tabela: string; payload: unknown }> = []
    adminEscritas = escritasLocais

    await logOrgUnresolved({
      receptor: "landing_page",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
      identificador: { quantidade_organizacoes_ativas: 2 },
      webhookLogsSource: "landing_page",
      webhookLogsExistenteId: "log-existente-1",
    })

    expect(escritasLocais).toEqual([
      { tabela: "webhook_logs", payload: { processing_error: "org_unresolved:ambigua" } },
    ])
    // Nenhum `org_id`/`event_type`/`payload` — não é linha nova, é a linha do chamador.
    const payload = escritasLocais[0]!.payload as Record<string, unknown>
    expect(payload).not.toHaveProperty("org_id")
    expect(payload).not.toHaveProperty("event_type")
  })

  it("sem `webhookLogsExistenteId` (whatsapp/telegram), INSERE a linha — não há outra", async () => {
    await logOrgUnresolved({
      receptor: "telegram",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
      webhookLogsSource: "other",
    })
    const payload = adminEscritas.find((e) => e.tabela === "webhook_logs")!
      .payload as Record<string, unknown>
    expect(payload).toMatchObject({ org_id: null, event_type: "org_unresolved", processed: true })
  })

  /**
   * ⚠️ ESTE TESTE NÃO É O CARRASCO DA PII — e dizer isso aqui é o ponto.
   *
   * A versão anterior montava o `identificador` no próprio teste e afirmava que as chaves DO
   * LITERAL estavam na allowlist: tautologia. O @qa mediu — acrescentou `telefone_do_lead`,
   * `texto_da_mensagem`, `chat_id`, `email_do_lead` e `nome_do_lead` aos 4 call sites e a suíte
   * ficou **VERDE nos 4**. O que este teste mede, e só isso, é a **segunda barreira**: o filtro de
   * runtime do helper. O carrasco de verdade está nos 4 testes de CALL SITE (um por receptor),
   * que afirmam com `toEqual` o objeto exato que a rota passa.
   */
  it("runtime: chave fora da allowlist é RECUSADA — não vai para system_events nem webhook_logs", async () => {
    await logOrgUnresolved({
      receptor: "whatsapp",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
      // O cast é o cenário que o TIPO não cobre: payload não tipado, `as any`, chamador em JS.
      identificador: {
        phone_number_id: "PNID-A",
        telefone_do_lead: "+5544999990000",
        texto_da_mensagem: "quero comprar",
        nome_do_lead: "Maria",
      } as never,
      webhookLogsSource: "whatsapp",
    })

    const meta = logEventOnceMock.mock.calls[0]![0] as {
      metadata: {
        identificador: Record<string, unknown>
        identificador_chaves_recusadas?: string[]
      }
    }
    // Só a chave permitida sobreviveu.
    expect(meta.metadata.identificador).toEqual({ phone_number_id: "PNID-A" })
    // E o vazamento vira sinal — só os NOMES, nunca os valores (o valor é que é PII).
    expect(meta.metadata.identificador_chaves_recusadas).toEqual([
      "telefone_do_lead",
      "texto_da_mensagem",
      "nome_do_lead",
    ])
    const serializado = JSON.stringify(logEventOnceMock.mock.calls[0]![0])
    expect(serializado).not.toContain("+5544999990000")
    expect(serializado).not.toContain("quero comprar")
    expect(serializado).not.toContain("Maria")

    // Mesma exigência do lado de `webhook_logs.payload`.
    const escrita = adminEscritas.find((e) => e.tabela === "webhook_logs")!
      .payload as Record<string, unknown>
    expect(escrita.payload).toEqual({ phone_number_id: "PNID-A" })
    expect(JSON.stringify(escrita)).not.toContain("+5544999990000")
  })

  it("sem chave recusada, `identificador_chaves_recusadas` NEM APARECE no metadata", async () => {
    await logOrgUnresolved({
      receptor: "meta_ads",
      motivo: "nenhuma_correspondencia",
      quantidadeEncontrada: 0,
      identificador: { page_id: "PG-A" },
      webhookLogsSource: "meta_ads",
    })
    const meta = logEventOnceMock.mock.calls[0]![0] as { metadata: Record<string, unknown> }
    expect(Object.keys(meta.metadata)).toEqual([
      "motivo",
      "quantidade_encontrada",
      "identificador",
      "receptor",
    ])
  })

  it("a allowlist exportada é a fonte única — 3 chaves, todas de identificação da PRÓPRIA org", () => {
    // Literal de propósito: se o esperado saísse da própria constante, o teste montaria o
    // esperado a partir da fonte que vigia e nunca reprovaria uma chave nova acrescentada lá.
    expect([...CHAVES_IDENTIFICADOR_PERMITIDAS]).toEqual([
      "phone_number_id",
      "page_id",
      "quantidade_organizacoes_ativas",
    ])
  })

  /**
   * Condição do AUTO-DECISÃO 1 (parecer @po, item "Julgamentos"): `webhook_logs.source` para o
   * Telegram é `'other'` porque o `CHECK` não tem `'telegram'`. `'other'` sozinho NÃO discrimina
   * receptor — quem carrega isso é `metadata.receptor`, e é isso que este teste trava.
   */
  it("telegram: `source: 'other'` + `metadata.receptor === 'telegram'` (o discriminador real)", async () => {
    await logOrgUnresolved({
      receptor: "telegram",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
      identificador: { quantidade_organizacoes_ativas: 2 },
      webhookLogsSource: "other",
    })
    const evento = logEventOnceMock.mock.calls[0]![0] as {
      source: string
      metadata: { receptor: string }
    }
    expect(evento.metadata.receptor).toBe("telegram")
    expect(evento.source).toBe("api/webhook/telegram")
    const escrita = adminEscritas.find((e) => e.tabela === "webhook_logs")!
      .payload as Record<string, unknown>
    expect(escrita.source).toBe("other")
  })

  /**
   * Carrasco da mutação #5 (corrigido por B5): com o mock resolvendo num TICK POSTERIOR, remover o
   * `await` de dentro de `logOrgUnresolved` deixa a escrita pendente quando o chamador retorna.
   * Com mock síncrono — o padrão do molde — a mutação passaria VERDE.
   */
  it("mutação #5: a promise NÃO está resolvida antes do await (mock em tick diferido)", async () => {
    adminTickDiferido = true
    const p = logOrgUnresolved({
      receptor: "whatsapp",
      motivo: "erro_consulta",
      quantidadeEncontrada: 0,
      webhookLogsSource: "whatsapp",
    })
    // Sem aguardar: se `logOrgUnresolved` NÃO aguardasse por dentro, o chamador já teria
    // retornado aqui e a lambda congelaria com a escrita pendente.
    expect(adminEscritas.filter((e) => e.tabela === "webhook_logs")).toHaveLength(0)
    await p
    expect(adminEscritas.filter((e) => e.tabela === "webhook_logs")).toHaveLength(1)
  })
})
