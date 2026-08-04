import { describe, it, expect, vi, afterEach } from "vitest"
import {
  detectMediaRequest,
  detectMaterialRequest,
  selectAssets,
  sendLibraryMediaIfRequested,
  resolveSendableMedia,
  reconcileMediaWithResponse,
  pickPropertyFromText,
  mediaCaption,
  MAX_MEDIA_PER_TURN,
  type MediaAsset,
} from "./send-library-media"

// Acervo espelhando o Vind Residence (pós-curadoria 2026-07-10): 1 planta real,
// 1 fachada, e lazer/localização em `outro` com título descritivo.
const VIND: MediaAsset[] = [
  { id: "planta", title: "Planta", category: "planta", file_url: "u", file_name: "planta.png", file_type: "image" },
  { id: "fachada", title: "Fachada", category: "fachada", file_url: "u", file_name: "fachada.jpg", file_type: "image" },
  { id: "academia", title: "Academia", category: "outro", file_url: "u", file_name: "academia.png", file_type: "image" },
  { id: "brinquedoteca", title: "Brinquedoteca", category: "outro", file_url: "u", file_name: "brinq.png", file_type: "image" },
  { id: "pilates", title: "Pilates", category: "outro", file_url: "u", file_name: "pilates.png", file_type: "image" },
  { id: "piscina", title: "Piscina", category: "outro", file_url: "u", file_name: "piscina.png", file_type: "image" },
  { id: "localizacao", title: "Localização", category: "outro", file_url: "u", file_name: "local.png", file_type: "image" },
]

describe("detectMediaRequest", () => {
  it("AC1 — caso Carlos: pedido educado/implícito dispara", () => {
    // A frase exata que NÃO disparava na Story 75-17.
    const kinds = detectMediaRequest("Se possível mais fotos, metragem e valor.")
    expect(kinds).toContain("generic") // "mais" + "fotos"
    expect(kinds).toContain("planta") // "metragem"
    expect(kinds).toContain("tabela") // "valor"
  })

  it("AC2 — casa tipos específicos", () => {
    expect(detectMediaRequest("me manda a planta?")).toContain("planta")
    expect(detectMediaRequest("como é a fachada do prédio")).toContain("fachada")
    expect(detectMediaRequest("qual a tabela de valores")).toContain("tabela")
    expect(detectMediaRequest("tem foto da piscina?")).toContain("lazer")
    expect(detectMediaRequest("onde fica o empreendimento?")).toContain("localizacao")
  })

  it("tipos específicos disparam mesmo sem verbo de comando", () => {
    expect(detectMediaRequest("e a planta?")).toEqual(["planta"])
    expect(detectMediaRequest("area de lazer")).toEqual(["lazer"])
  })

  it("generic exige sinal de pedido (evita falso positivo)", () => {
    expect(detectMediaRequest("recebi as fotos, obrigado")).toEqual([])
    expect(detectMediaRequest("gostei das fotos")).toEqual([]) // sem sinal de pedido
    expect(detectMediaRequest("pode me mandar as fotos")).toContain("generic")
  })

  it("guarda de negação / já recebido", () => {
    expect(detectMediaRequest("não quero fotos agora")).toEqual([])
    expect(detectMediaRequest("já vi a planta, obrigado")).toEqual([])
    expect(detectMediaRequest("sem fotos por enquanto")).toEqual([])
  })

  it("texto vazio/irrelevante não dispara", () => {
    expect(detectMediaRequest("")).toEqual([])
    expect(detectMediaRequest(null)).toEqual([])
    expect(detectMediaRequest("bom dia, tudo bem?")).toEqual([])
    expect(detectMediaRequest("[Mensagem de voz recebida]")).toEqual([])
  })
})

describe("selectAssets", () => {
  it("AC3 — pedido genérico vira combo curado (fachada + lazer + planta)", () => {
    const chosen = selectAssets(VIND, ["generic"])
    const ids = chosen.map((a) => a.id)
    expect(ids).toContain("fachada")
    expect(ids).toContain("planta")
    // um item de lazer (o primeiro por ordem determinística: Academia)
    expect(ids.some((id) => ["academia", "brinquedoteca", "pilates", "piscina"].includes(id))).toBe(true)
    expect(chosen.length).toBe(3)
  })

  it("AC4 — nunca ultrapassa o teto", () => {
    const chosen = selectAssets(VIND, ["planta", "fachada", "lazer", "localizacao", "generic"])
    expect(chosen.length).toBeLessThanOrEqual(MAX_MEDIA_PER_TURN)
  })

  it("AC2 — pedido específico traz o asset certo", () => {
    expect(selectAssets(VIND, ["planta"]).map((a) => a.id)).toEqual(["planta"])
    expect(selectAssets(VIND, ["localizacao"]).map((a) => a.id)).toEqual(["localizacao"])
    expect(selectAssets(VIND, ["lazer"]).length).toBe(1)
  })

  it("caso Carlos completo → planta + fachada + lazer (tabela inexistente é ignorada)", () => {
    const kinds = detectMediaRequest("Se possível mais fotos, metragem e valor.")
    const chosen = selectAssets(VIND, kinds)
    const ids = chosen.map((a) => a.id)
    expect(chosen.length).toBe(3)
    expect(ids).toContain("planta")
    expect(ids).toContain("fachada")
    expect(ids.some((id) => ["academia", "brinquedoteca", "pilates", "piscina"].includes(id))).toBe(true)
  })

  it("AC7 — não reenvia asset já enviado", () => {
    const chosen = selectAssets(VIND, ["planta"], new Set(["planta"]))
    expect(chosen).toEqual([]) // única planta já foi enviada
  })

  it("não repete o mesmo asset entre tipos", () => {
    const chosen = selectAssets(VIND, ["planta", "planta"])
    expect(chosen.length).toBe(1)
  })

  it("degrada com acervo vazio", () => {
    expect(selectAssets([], ["generic"])).toEqual([])
  })

  it("é determinístico independentemente da ordem de entrada", () => {
    const a = selectAssets(VIND, ["generic"]).map((x) => x.id)
    const b = selectAssets([...VIND].reverse(), ["generic"]).map((x) => x.id)
    expect(a).toEqual(b)
  })
})

// Fake mínimo do admin Supabase: builder encadeável + thenable, por tabela.
function fakeAdmin(config: {
  leadPropertyId?: string | null
  assets?: MediaAsset[]
  sentAssetIds?: string[]
}) {
  const inserts: Array<Record<string, unknown>> = []
  const tables: Record<string, { list?: unknown[]; single?: unknown }> = {
    leads: { single: { property_interest_id: config.leadPropertyId ?? null } },
    agent_media_assets: { list: config.assets ?? [] },
    messages: {
      list: (config.sentAssetIds ?? []).map((id) => ({ metadata: { media_asset_id: id } })),
    },
  }
  function builder(table: string) {
    const b: Record<string, unknown> = {}
    const chain = () => b
    b.select = chain
    b.eq = chain
    b.not = chain
    b.order = chain
    b.limit = chain
    b.maybeSingle = () => Promise.resolve({ data: tables[table]?.single ?? null })
    b.insert = (row: Record<string, unknown>) => {
      inserts.push({ __table: table, ...row })
      return Promise.resolve({ error: null })
    }
    // torna o builder "awaitable" (para os SELECTs sem maybeSingle)
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ data: tables[table]?.list ?? [] })
    return b
  }
  const admin = { from: (t: string) => builder(t) }
  return { admin, inserts }
}

const P_ASSETS: MediaAsset[] = [
  { id: "planta", title: "Planta", category: "planta", file_url: "u1", file_name: "p.png", file_type: "image" },
  { id: "fachada", title: "Fachada", category: "fachada", file_url: "u2", file_name: "f.jpg", file_type: "image" },
  { id: "academia", title: "Academia", category: "outro", file_url: "u3", file_name: "a.png", file_type: "image" },
]

const baseArgs = {
  orgId: "org1",
  leadId: "lead1",
  leadPhone: "5544999999999",
  conversationId: "conv1",
  phoneNumberId: "pn1",
  accessToken: "tok",
}

describe("sendLibraryMediaIfRequested (I/O)", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("Bug C — dedup real: não reenvia asset já enviado; grava log sem org_id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const { admin, inserts } = fakeAdmin({
      leadPropertyId: "P",
      assets: P_ASSETS,
      sentAssetIds: ["fachada"], // Fachada já foi enviada antes
    })
    // "tem mais imagem?" → generic → combo fachada+lazer+planta; fachada dedupada.
    const n = await sendLibraryMediaIfRequested(
      admin as never,
      { ...baseArgs, text: "tem mais alguma imagem que possa me mandar?" }
    )
    expect(n).toBe(2) // academia + planta (fachada excluída)
    const sentIds = inserts.map((r) => (r.metadata as { media_asset_id: string }).media_asset_id)
    expect(sentIds).not.toContain("fachada")
    expect(sentIds.sort()).toEqual(["academia", "planta"])
    // A regressão do org_id: o insert em messages NUNCA pode conter org_id.
    for (const row of inserts) {
      expect(row).not.toHaveProperty("org_id")
      expect(row.role).toBe("assistant")
    }
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("não envia quando não há empreendimento identificado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const { admin, inserts } = fakeAdmin({ leadPropertyId: null, assets: [] })
    const n = await sendLibraryMediaIfRequested(
      admin as never,
      { ...baseArgs, text: "me manda a planta" }
    )
    expect(n).toBe(0)
    expect(inserts).toHaveLength(0)
  })

  it("não faz nada quando não é pedido de mídia", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const { admin } = fakeAdmin({ leadPropertyId: "P", assets: P_ASSETS })
    const n = await sendLibraryMediaIfRequested(admin as never, { ...baseArgs, text: "bom dia" })
    expect(n).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})

// Fake admin por tabela, com suporte a .order (usado por resolveSendableMedia).
function fakeDb(tables: Record<string, { list?: unknown[]; single?: unknown }>) {
  function builder(table: string) {
    const b: Record<string, unknown> = {}
    const chain = () => b
    b.select = chain
    b.eq = chain
    b.not = chain
    b.order = chain
    b.limit = chain
    b.maybeSingle = () => Promise.resolve({ data: tables[table]?.single ?? null })
    b.insert = () => Promise.resolve({ error: null })
    b.then = (resolve: (v: unknown) => void) => resolve({ data: tables[table]?.list ?? [] })
    return b
  }
  return { from: (t: string) => builder(t) } as never
}

const VIND_FULL = [
  { id: "planta", title: "Planta", category: "planta", file_url: "u", file_name: "p.png", file_type: "image", property_id: "vind", property: { name: "Vind Residence" } },
  { id: "fachada", title: "Fachada", category: "fachada", file_url: "u", file_name: "f.jpg", file_type: "image", property_id: "vind", property: { name: "Vind Residence" } },
]

describe("resolveSendableMedia (Story 75-157)", () => {
  it("AC1 — caso Maicon: resolve pelo empreendimento estabelecido no CONTEXTO ('Vind'), sem property_interest_id", async () => {
    const admin = fakeDb({
      leads: { single: { property_interest_id: null } },
      agent_media_assets: { list: VIND_FULL },
      messages: { list: [{ content: "O Vind tem tudo a ver com voce, Maicon!" }] },
      properties: { single: { name: "Vind Residence" } },
    })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "voce tem alguma imagem?",
    })
    expect(r.skipReason).toBeNull()
    expect(r.propertyId).toBe("vind")
    expect(r.propertyName).toBe("Vind Residence")
    expect(r.chosen.length).toBeGreaterThan(0)
  })

  it("usa property_interest_id direto quando presente", async () => {
    const admin = fakeDb({
      leads: { single: { property_interest_id: "vind" } },
      agent_media_assets: { list: VIND_FULL },
      messages: { list: [] },
      properties: { single: { name: "Vind Residence" } },
    })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta",
    })
    expect(r.skipReason).toBeNull()
    expect(r.chosen.some((a) => a.id === "planta")).toBe(true)
  })

  it("ambíguo (Vind E Yarden citados) → NÃO adivinha (no_property)", async () => {
    const MIX = [
      ...VIND_FULL,
      { id: "y1", title: "Fachada Y", category: "fachada", file_url: "u", file_name: "y.jpg", file_type: "image", property_id: "yarden", property: { name: "Yarden" } },
    ]
    const admin = fakeDb({
      leads: { single: { property_interest_id: null } },
      agent_media_assets: { list: MIX },
      messages: { list: [{ content: "vi o Vind e o Yarden" }] },
    })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "quero fotos",
    })
    expect(r.skipReason).toBe("no_property")
    expect(r.chosen).toHaveLength(0)
  })

  it("empreendimento definido mas sem asset ativo → no_assets", async () => {
    const admin = fakeDb({
      leads: { single: { property_interest_id: "vind" } },
      agent_media_assets: { list: [] },
      messages: { list: [] },
    })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta",
    })
    expect(r.skipReason).toBe("no_assets")
    expect(r.propertyId).toBe("vind")
  })

  it("tudo já enviado antes (dedup) → none_selected", async () => {
    const admin = fakeDb({
      leads: { single: { property_interest_id: "vind" } },
      agent_media_assets: { list: VIND_FULL },
      messages: { list: [{ metadata: { media_asset_id: "planta" } }, { metadata: { media_asset_id: "fachada" } }] },
      properties: { single: { name: "Vind Residence" } },
    })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta e a fachada",
    })
    expect(r.skipReason).toBe("none_selected")
  })

  it("sem pedido de material → no_request", async () => {
    const admin = fakeDb({ leads: { single: { property_interest_id: "vind" } }, agent_media_assets: { list: VIND_FULL } })
    const r = await resolveSendableMedia(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "bom dia",
    })
    expect(r.skipReason).toBe("no_request")
    expect(r.chosen).toHaveLength(0)
  })
})

describe("detectMaterialRequest (compat 75-17)", () => {
  it("mantém a semântica de tipo único", () => {
    expect(detectMaterialRequest("me manda a planta")).toBe("planta")
    expect(detectMaterialRequest("tabela de valores")).toBe("tabela")
    expect(detectMaterialRequest("pode mandar fotos")).toBe("qualquer")
    expect(detectMaterialRequest("bom dia")).toBe(null)
  })
})

// ============================================================================
// Story 75-270 — a mídia tem que seguir o empreendimento da FALA
// Incidente Orlice (03/08/2026): lead do Vind, Nicole ofereceu o Yarden e saiu
// a planta do Vind (66,91m² onde o Yarden começa em 79m²).
// ============================================================================

describe("detectMediaRequest — 'na planta' é lançamento, não planta baixa (75-270 AC1)", () => {
  it("🔥 a frase real da Orlice não pede material", () => {
    expect(
      detectMediaRequest(
        "eu tô vendendo a minha casa, daí que eu queria comprar um na planta. Quando tivesse, assim, lançando"
      )
    ).not.toContain("planta")
  })
  it("outras formas do mesmo idioma", () => {
    expect(detectMediaRequest("procuro imóvel na planta")).toEqual([])
    expect(detectMediaRequest("prefiro comprar na planta")).toEqual([])
    expect(detectMediaRequest("ainda na planta é melhor pra mim")).toEqual([])
  })
  it("pedido de verdade continua disparando (nenhuma regressão)", () => {
    expect(detectMediaRequest("me manda a planta")).toContain("planta")
    expect(detectMediaRequest("tem a planta baixa?")).toContain("planta")
    expect(detectMediaRequest("qual a metragem?")).toContain("planta")
    // Mistura: quer lançamento E pede a planta — a segunda menção sobrevive.
    expect(detectMediaRequest("quero comprar na planta, me manda a planta")).toContain("planta")
  })
})

describe("pickPropertyFromText (75-270)", () => {
  const NOMES = new Map([["vind", "Vind Residence"], ["yarden", "Yarden"]])
  it("casa por nome completo e por token distintivo", () => {
    expect(pickPropertyFromText(NOMES, "temos o Yarden Residence, lançamento novo")?.propertyId).toBe("yarden")
    expect(pickPropertyFromText(NOMES, "o Vind tem 2 suítes")?.propertyId).toBe("vind")
  })
  it("não adivinha quando cita os dois, nem quando não cita nenhum", () => {
    expect(pickPropertyFromText(NOMES, "vi o Vind e o Yarden")).toBeNull()
    expect(pickPropertyFromText(NOMES, "qual o valor do apartamento?")).toBeNull()
  })
})

describe("mediaCaption (75-270 AC5)", () => {
  it("prefixa o empreendimento", () => {
    expect(mediaCaption("Planta", "Yarden Residence")).toBe("Yarden Residence — Planta")
  })
  it("não repete quando o título já cita o empreendimento", () => {
    expect(mediaCaption("Planta Yarden Residence", "Yarden Residence")).toBe("Planta Yarden Residence")
  })
  it("sem empreendimento resolvido, devolve só o título", () => {
    expect(mediaCaption("Planta", null)).toBe("Planta")
  })
})

// Story 75-270 — o `fakeDb` acima ignora os `.eq()`, o que serve para os testes
// dele mas não aqui: a reconciliação re-resolve FILTRANDO por property_id, e um
// fake que devolve o acervo inteiro esconderia justamente o bug (mandar asset do
// empreendimento errado). Este fake aplica os `.eq()` cujas colunas existem nas
// linhas — property_id inclusive.
function fakeDbFiltrado(tables: Record<string, { list?: Record<string, unknown>[]; single?: unknown }>) {
  function builder(table: string) {
    const eqs: Array<[string, unknown]> = []
    const b: Record<string, unknown> = {}
    const chain = () => b
    b.select = chain
    b.not = chain
    b.order = chain
    b.limit = chain
    b.eq = (col: string, val: unknown) => {
      eqs.push([col, val])
      return b
    }
    const rows = () => {
      const list = tables[table]?.list ?? []
      return list.filter((row) =>
        eqs.every(([col, val]) => !(col in row) || row[col] === val)
      )
    }
    b.maybeSingle = () => Promise.resolve({ data: tables[table]?.single ?? null })
    b.insert = () => Promise.resolve({ error: null })
    b.then = (resolve: (v: unknown) => void) => resolve({ data: rows() })
    return b
  }
  return { from: (t: string) => builder(t) } as never
}

describe("reconcileMediaWithResponse (75-270 AC3/AC4)", () => {
  const YARDEN_FULL = [
    { id: "y-planta", title: "Planta", category: "planta", file_url: "u", file_name: "yp.png", file_type: "image", property_id: "yarden", property: { name: "Yarden Residence" } },
  ]
  const PRE_VIND = {
    kinds: ["planta" as const],
    propertyId: "vind",
    propertyName: "Vind Residence",
    chosen: [{ id: "planta", title: "Planta", category: "planta", file_url: "u", file_name: "p.png", file_type: "image" }],
    skipReason: null,
  }

  it("🔥 AC3 — a fala pivotou para o Yarden: NÃO manda o asset do Vind", async () => {
    const admin = fakeDbFiltrado({
      agent_media_assets: { list: [...VIND_FULL, ...YARDEN_FULL] },
      leads: { single: { property_interest_id: "vind" } },
      messages: { list: [] },
      properties: { single: { name: "Yarden Residence" } },
    })
    const r = await reconcileMediaWithResponse(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta",
      assistantMessage:
        "Temos o Yarden Residence, que é nosso lançamento mais recente — obras já iniciadas, a partir de 79m².",
      preResolved: PRE_VIND,
    })
    expect(r.chosen.some((a) => a.id === "planta")).toBe(false)
    expect(r.propertyId).toBe("yarden")
  })

  it("AC4 — havendo o material no Yarden, é o do Yarden que sai", async () => {
    const admin = fakeDbFiltrado({
      agent_media_assets: { list: [...VIND_FULL, ...YARDEN_FULL] },
      leads: { single: { property_interest_id: "vind" } },
      messages: { list: [] },
      properties: { single: { name: "Yarden Residence" } },
    })
    const r = await reconcileMediaWithResponse(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta",
      assistantMessage: "Temos o Yarden Residence, obras iniciadas, a partir de 79m². Vale conhecer!",
      preResolved: PRE_VIND,
    })
    expect(r.chosen.map((a) => a.id)).toEqual(["y-planta"])
    expect(r.skipReason).toBeNull()
  })

  it("AC4 — sem o material no empreendimento novo, NÃO envia nada (property_pivot)", async () => {
    const admin = fakeDbFiltrado({
      // Yarden existe no acervo, mas só com fachada — não tem planta.
      agent_media_assets: {
        list: [
          ...VIND_FULL,
          { id: "y-fach", title: "Fachada", category: "fachada", file_url: "u", file_name: "yf.jpg", file_type: "image", property_id: "yarden", property: { name: "Yarden Residence" } },
        ],
      },
      leads: { single: { property_interest_id: "vind" } },
      messages: { list: [] },
      properties: { single: { name: "Yarden Residence" } },
    })
    const r = await reconcileMediaWithResponse(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta",
      assistantMessage: "Temos o Yarden Residence, nosso lançamento mais recente.",
      preResolved: PRE_VIND,
    })
    expect(r.chosen).toHaveLength(0)
    expect(r.skipReason).toBe("property_pivot")
  })

  it("sem pivô (a fala segue no Vind) → devolve a resolução original intacta", async () => {
    const admin = fakeDbFiltrado({
      agent_media_assets: { list: VIND_FULL },
      leads: { single: { property_interest_id: "vind" } },
      messages: { list: [] },
    })
    const r = await reconcileMediaWithResponse(admin, {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta",
      assistantMessage: "O Vind tem 66,91m², com 2 suítes e sacada com churrasqueira.",
      preResolved: PRE_VIND,
    })
    expect(r).toBe(PRE_VIND)
  })

  it("nada seria enviado de qualquer forma → não faz query nem muda nada", async () => {
    const vazio = { ...PRE_VIND, chosen: [], skipReason: "no_assets" as const }
    const r = await reconcileMediaWithResponse(fakeDbFiltrado({}), {
      orgId: "o", leadId: "l", conversationId: "c", text: "me manda a planta",
      assistantMessage: "Temos o Yarden Residence!",
      preResolved: vazio,
    })
    expect(r).toBe(vazio)
  })
})
