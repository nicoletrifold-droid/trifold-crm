/**
 * Story 900-63 · AC2/AC3/AC4/AC5 — a régua das duas rotas do logo.
 *
 * ## O que esta régua existe para impedir
 *
 *   1. **Órfão publicamente legível.** `{org_id}/logo.{ext}` NÃO é "um arquivo por empresa": PNG e
 *      JPEG são caminhos diferentes e o `upsert` não substitui o outro. O balde daqui é um
 *      ARMAZENAMENTO DE VERDADE (mapa em memória, `upload` grava, `remove` apaga) exatamente por
 *      isso — um duplo que só REGISTRASSE as chamadas deixaria o carrasco da AC4 verde com os dois
 *      arquivos lá dentro, que é o defeito.
 *   2. **Ordem invertida das duas escritas.** Upload = Storage→RPC; remoção = RPC→Storage. A
 *      inversa da remoção deixaria `logo_url` apontando para um `404` público. Por isso há um LOG
 *      ORDENADO de operações, e não só `toHaveBeenCalled()`: a ordem é a AC, e contagem é cega
 *      para ela.
 *   3. **Escrita disparada com pedido inválido.** Toda saída não-200 é medida JUNTO com a ausência
 *      do upload E da RPC.
 *   4. **Trava otimista ausente virando "salvo".** Sem `expectedUpdatedAt` a proteção que a UI
 *      afirma existir não existe.
 *   5. **Falha virando sucesso.** Um `500` não pode devolver corpo que afirme o que ficou gravado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const guardMock = vi.fn()
vi.mock("@web/lib/tenancy/platform-guard", () => ({
  getPlatformAdmin: () => guardMock(),
}))

const ORG_DA_ROTA = "11111111-1111-1111-1111-111111111111"
const ORG_DO_CORPO = "99999999-9999-9999-9999-999999999999"
const ATOR = "platform-admin-1"
const ATOR_FORJADO = "ator-forjado"
const TRAVA = "2026-09-02T12:00:00.123456+00:00"
const TRAVA_NOVA = "2026-09-02T13:30:00.999999+00:00"
const URL_PUBLICA = "https://exemplo.supabase.co/storage/v1/object/public/org-logos"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// O balde FALSO, que de fato guarda e de fato apaga
// ─────────────────────────────────────────────────────────────────────────────────────────────
/** caminho completo → tipo de conteúdo. É o estado que o carrasco da AC4 conta. */
let balde = new Map<string, string>()
/** A sequência de efeitos, na ordem em que aconteceram. A ORDEM é a AC (item 2 do topo). */
let eventos: string[] = []
let baldePedido: string[] = []
let falhaDeUpload: { message: string } | null = null
let falhaDeList: { message: string } | null = null
let falhaDeRemove: { message: string } | null = null

type RespostaDeRpc = { data: unknown; error: unknown }
let respostaDaRpc: RespostaDeRpc = { data: null, error: null }

const rpcMock = vi.fn<(nome: string, params: Record<string, unknown>) => Promise<RespostaDeRpc>>(
  async () => {
    eventos.push("rpc")
    return respostaDaRpc
  },
)

function baldeFalso(nome: string) {
  baldePedido.push(nome)
  return {
    async upload(caminho: string, _corpo: unknown, opcoes: { contentType: string }) {
      eventos.push(`upload:${caminho}`)
      if (falhaDeUpload) return { data: null, error: falhaDeUpload }
      balde.set(caminho, opcoes.contentType)
      return { data: { path: caminho }, error: null }
    },
    async list(prefixo: string) {
      eventos.push(`list:${prefixo}`)
      if (falhaDeList) return { data: null, error: falhaDeList }
      const nomes = [...balde.keys()]
        .filter((c) => c.startsWith(`${prefixo}/`))
        .map((c) => c.slice(prefixo.length + 1))
      return { data: nomes.map((name) => ({ name })), error: null }
    },
    async remove(caminhos: string[]) {
      eventos.push(`remove:${caminhos.join("|")}`)
      if (falhaDeRemove) return { data: null, error: falhaDeRemove }
      for (const c of caminhos) balde.delete(c)
      return { data: caminhos.map((name) => ({ name })), error: null }
    },
    getPublicUrl(caminho: string) {
      return { data: { publicUrl: `${URL_PUBLICA}/${caminho}` } }
    },
  }
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (nome: string, params: Record<string, unknown>) => rpcMock(nome, params),
    storage: { from: (nome: string) => baldeFalso(nome) },
  }),
}))

import { POST, DELETE, BUCKET_DE_LOGOS } from "./route"

/** O que a migration `254` devolve num sucesso: `RETURNS TABLE` chega como ARRAY pelo PostgREST. */
function retornoDaRpc(sobrescreve: Partial<Record<string, unknown>> = {}) {
  return [
    {
      id: ORG_DA_ROTA,
      logo_url: `${URL_PUBLICA}/${ORG_DA_ROTA}/logo.png`,
      updated_at: TRAVA_NOVA,
      conflito: false,
      ...sobrescreve,
    },
  ]
}

beforeEach(() => {
  rpcMock.mockClear()
  balde = new Map()
  eventos = []
  baldePedido = []
  falhaDeUpload = null
  falhaDeList = null
  falhaDeRemove = null
  guardMock.mockResolvedValue({ userId: ATOR, email: "gage@trifold", name: "Gage" })
  respostaDaRpc = { data: retornoDaRpc(), error: null }
})

function arquivo(tipo: string, bytes = 10, nome = "logo.png") {
  return new File([new Uint8Array(bytes)], nome, { type: tipo })
}

function enviar(
  campos: {
    file?: File | string | null
    expectedUpdatedAt?: string | null
    reason?: string
  } = {},
  id: string = ORG_DA_ROTA,
) {
  const fd = new FormData()
  const f = campos.file === undefined ? arquivo("image/png") : campos.file
  if (f !== null) fd.append("file", f as Blob | string)
  const trava = campos.expectedUpdatedAt === undefined ? TRAVA : campos.expectedUpdatedAt
  if (trava !== null) fd.append("expectedUpdatedAt", trava)
  if (campos.reason !== undefined) fd.append("reason", campos.reason)
  return POST(new Request("http://localhost/x", { method: "POST", body: fd }), {
    params: Promise.resolve({ id }),
  })
}

function remover(corpo: unknown = { expectedUpdatedAt: TRAVA }, id: string = ORG_DA_ROTA) {
  return DELETE(
    new Request("http://localhost/x", { method: "DELETE", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ id }) },
  )
}

/** Só os efeitos que MUDAM estado — a leitura (`list`) não é um efeito. */
const efeitos = () => eventos.filter((e) => !e.startsWith("list:"))

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("vivacidade — o caminho feliz existe e chega até o balde e até a RPC", () => {
  it("POST válido → 200, um objeto no balde, RPC chamada UMA vez com o nome certo", async () => {
    // Sem este controle, todos os `not.toHaveBeenCalled()` abaixo ficariam verdes por um harness
    // que nunca chega na escrita — o vazio aprovaria tudo.
    const res = await enviar()
    expect(res.status).toBe(200)
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.png`])
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock.mock.calls[0]![0]).toBe("org_logo_update_as_platform")
  })

  it("o bucket é `org-logos` — o HÍFEN é o que mantém a régua da 900-22b calada", async () => {
    await enviar()
    expect(BUCKET_DE_LOGOS).toBe("org-logos")
    expect(new Set(baldePedido)).toEqual(new Set(["org-logos"]))
  })
})

describe("AC2 — autorização", () => {
  it("sem platform admin → 403, e NENHUM efeito (nem balde, nem RPC)", async () => {
    guardMock.mockResolvedValue(null)
    const res = await enviar()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "FORBIDDEN" })
    expect(efeitos()).toEqual([])
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("DELETE sem platform admin → 403, e NENHUM efeito", async () => {
    guardMock.mockResolvedValue(null)
    const res = await remover()
    expect(res.status).toBe(403)
    expect(efeitos()).toEqual([])
  })
})

describe("AC3 — validação do arquivo, sempre com a escrita ausente junto", () => {
  const casos: Array<[string, Parameters<typeof enviar>[0], string, number]> = [
    ["Task 7.1 — MIME fora da lista", { file: arquivo("image/gif") }, "TIPO_NAO_SUPORTADO", 422],
    ["SVG (script embutido) não passa", { file: arquivo("image/svg+xml") }, "TIPO_NAO_SUPORTADO", 422],
    [
      "Task 7.2 — acima de 2 MB",
      { file: arquivo("image/png", 2 * 1024 * 1024 + 1) },
      "ARQUIVO_MUITO_GRANDE",
      422,
    ],
    ["nenhum arquivo enviado", { file: null }, "ARQUIVO_OBRIGATORIO", 400],
    ["campo `file` que é texto, não arquivo", { file: "logo.png" }, "ARQUIVO_OBRIGATORIO", 400],
  ]

  for (const [rotulo, campos, codigo, status] of casos) {
    it(`${rotulo} → ${status} ${codigo}, sem upload e sem RPC`, async () => {
      const res = await enviar(campos)
      expect(res.status).toBe(status)
      expect((await res.json()).error).toBe(codigo)
      expect(efeitos()).toEqual([])
      expect(rpcMock).not.toHaveBeenCalled()
    })
  }

  it("exatamente 2 MB PASSA — o limite é `>`, e não `>=`", async () => {
    // Controle negativo do caso acima: sem ele, uma validação que recusasse TUDO deixaria os
    // cinco `it` de cima verdes.
    const res = await enviar({ file: arquivo("image/png", 2 * 1024 * 1024) })
    expect(res.status).toBe(200)
  })

  it("os três tipos da AC1 são aceitos, com a extensão de cada um no caminho", async () => {
    for (const [tipo, ext] of [
      ["image/png", "png"],
      ["image/jpeg", "jpg"],
      ["image/webp", "webp"],
    ] as const) {
      balde = new Map()
      const res = await enviar({ file: arquivo(tipo) })
      expect(res.status, tipo).toBe(200)
      expect([...balde.keys()], tipo).toEqual([`${ORG_DA_ROTA}/logo.${ext}`])
    }
  })
})

describe("AC3 — a trava otimista é obrigatória, e é barrada ANTES de tudo", () => {
  it("`expectedUpdatedAt` ausente → 400, sem upload e sem RPC", async () => {
    const res = await enviar({ expectedUpdatedAt: null })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("EXPECTED_UPDATED_AT_REQUIRED")
    expect(efeitos()).toEqual([])
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("`expectedUpdatedAt` só com espaços → 400, sem upload e sem RPC", async () => {
    const res = await enviar({ expectedUpdatedAt: "   " })
    expect(res.status).toBe(400)
    expect(efeitos()).toEqual([])
  })

  it("DELETE sem `expectedUpdatedAt` → 400, e o balde NÃO é tocado", async () => {
    balde.set(`${ORG_DA_ROTA}/logo.png`, "image/png")
    const res = await remover({})
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.png`])
  })

  it("a trava viaja CRUA para a RPC — sem reformatação por `Date`", async () => {
    // Um round-trip por `Date` perderia os microssegundos, e `IS DISTINCT FROM` passaria a acusar
    // CONFLITO em toda escrita — a feature morreria parecendo funcionar.
    await enviar()
    expect(rpcMock.mock.calls[0]![1].p_expected_updated_at).toBe(TRAVA)
  })
})

describe("AC4 — o órfão publicamente legível", () => {
  it("Task 7.3b (CARRASCO) — sobe PNG, depois JPEG → o prefixo fica com EXATAMENTE 1 objeto", async () => {
    await enviar({ file: arquivo("image/png") })
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.png`])

    respostaDaRpc = {
      data: retornoDaRpc({ logo_url: `${URL_PUBLICA}/${ORG_DA_ROTA}/logo.jpg` }),
      error: null,
    }
    const res = await enviar({ file: arquivo("image/jpeg") })

    expect(res.status).toBe(200)
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.jpg`])
    expect(balde.size).toBe(1)
  })

  it("a purga NÃO apaga o objeto que acabou de ser gravado (mesma extensão duas vezes)", async () => {
    // Controle negativo do carrasco acima: uma purga que apagasse o prefixo inteiro também
    // deixaria "exatamente 1" verde no caso PNG→JPEG, e destruiria o logo no caso PNG→PNG.
    await enviar({ file: arquivo("image/png") })
    const res = await enviar({ file: arquivo("image/png") })
    expect(res.status).toBe(200)
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.png`])
  })

  it("o prefixo de OUTRA empresa não é tocado", async () => {
    balde.set(`${ORG_DO_CORPO}/logo.webp`, "image/webp")
    await enviar({ file: arquivo("image/png") })
    expect([...balde.keys()]).toEqual([`${ORG_DO_CORPO}/logo.webp`, `${ORG_DA_ROTA}/logo.png`])
  })

  it("o `.emptyFolderPlaceholder` do Storage não conta como objeto do logo", async () => {
    balde.set(`${ORG_DA_ROTA}/.emptyFolderPlaceholder`, "application/octet-stream")
    await enviar({ file: arquivo("image/png") })
    expect(eventos.filter((e) => e.startsWith("remove:"))).toEqual([])
  })

  it("upload com `upsert: true` e o `contentType` do arquivo enviado", async () => {
    await enviar({ file: arquivo("image/webp") })
    expect(balde.get(`${ORG_DA_ROTA}/logo.webp`)).toBe("image/webp")
  })
})

describe("AC4 — a ORDEM das duas escritas, medida por sequência e não por contagem", () => {
  it("upload: Storage PRIMEIRO, RPC DEPOIS", async () => {
    await enviar()
    expect(efeitos()).toEqual([`upload:${ORG_DA_ROTA}/logo.png`, "rpc"])
  })

  it("a purga roda DEPOIS da RPC — upload, RPC, purga, nessa ordem", async () => {
    balde.set(`${ORG_DA_ROTA}/logo.jpg`, "image/jpeg")
    await enviar({ file: arquivo("image/png") })
    expect(efeitos()).toEqual([
      `upload:${ORG_DA_ROTA}/logo.png`,
      "rpc",
      `remove:${ORG_DA_ROTA}/logo.jpg`,
    ])
  })

  it("🔴 RPC não-200 NÃO pode ter apagado o objeto antigo — o furo da 1ª correção", async () => {
    // Enquanto a purga rodava ENTRE o upload e a RPC, um `409` de conflito deixava `logo_url`
    // (inalterado, apontando para `logo.jpg`) sobre um objeto que a purga acabara de apagar: o
    // MESMO 404 público que a AC4 proíbe, por outra porta. Nem o carrasco do órfão nem o teste de
    // ordem pegavam — os dois só olham o caminho feliz.
    balde.set(`${ORG_DA_ROTA}/logo.jpg`, "image/jpeg")
    respostaDaRpc = { data: retornoDaRpc({ conflito: true }), error: null }
    const res = await enviar({ file: arquivo("image/png") })
    expect(res.status).toBe(409)
    // Lista FECHADA: o antigo sobreviveu (o furo da 1ª correção) E o novo não foi apagado (o
    // conserto largo-demais). `has()` só via o primeiro lado.
    expect([...balde.keys()], "o objeto que logo_url ainda referencia, e o que este pedido criou")
      .toEqual([`${ORG_DA_ROTA}/logo.jpg`, `${ORG_DA_ROTA}/logo.png`])
    expect(efeitos()).toEqual([`upload:${ORG_DA_ROTA}/logo.png`, "rpc"])
  })

  it("🔴 o mesmo para um erro da RPC (500)", async () => {
    balde.set(`${ORG_DA_ROTA}/logo.jpg`, "image/jpeg")
    respostaDaRpc = { data: null, error: { message: "connection reset" } }
    expect((await enviar({ file: arquivo("image/png") })).status).toBe(500)
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.jpg`, `${ORG_DA_ROTA}/logo.png`])
  })

  it("remoção: RPC PRIMEIRO, Storage DEPOIS — a inversa é PROIBIDA", async () => {
    balde.set(`${ORG_DA_ROTA}/logo.png`, "image/png")
    respostaDaRpc = { data: retornoDaRpc({ logo_url: null }), error: null }
    const res = await remover()
    expect(res.status).toBe(200)
    expect(efeitos()).toEqual(["rpc", `remove:${ORG_DA_ROTA}/logo.png`])
    expect(balde.size).toBe(0)
  })
})

describe("REL-001 — o que sobrou do que ESTE pedido criou (e não só do estado ANTIGO)", () => {
  // A classe que escapou de DUAS rodadas de correção: os caminhos de erro eram exercitados, mas
  // toda asserção herdou do caminho feliz a pergunta "o que sobrou do estado ANTIGO?". Nenhuma
  // perguntava "o que sobrou do que ESTE pedido escreveu?" — invariante de um lado só. Por isso
  // aqui, e daqui para baixo, o balde é medido por LISTA FECHADA (`[...balde.keys()]`) e nunca
  // por `has()`: `has()` é cego para o que sobrou ALÉM do esperado.

  it("🔴 `[id]` que não é UUID → 400 ANTES de tocar o Storage: nada nasce no balde público", async () => {
    // Antes do conserto: o upload roda antes da RPC por desenho, e a existência da empresa só é
    // verificada DENTRO da RPC — então isto gravava `nao-e-uuid/logo.png` num bucket PÚBLICO,
    // sem empresa, fora de qualquer trilha, e sem nenhum upload futuro que o purgasse.
    const res = await enviar({}, "nao-e-uuid")
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("ORG_ID_INVALIDO")
    expect([...balde.keys()]).toEqual([])
    expect(efeitos()).toEqual([])
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("controle da guarda: um UUID de verdade PASSA — ela não pode recusar tudo", async () => {
    // Sem isto, `if (true) return 400` deixaria o teste acima verde e a feature morta.
    expect((await enviar({}, ORG_DA_ROTA)).status).toBe(200)
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.png`])
  })

  it("🔴 `404 ORG_NOT_FOUND` → o objeto que ESTE pedido escreveu sai do balde antes da resposta", async () => {
    // Zero linhas em `organizations` significa que NENHUM `logo_url` aponta para `destino` — e
    // que não haverá "próximo upload" para purgá-lo, porque não há empresa. O docblock afirmava
    // o contrário; esta é a asserção que o transforma em verdade.
    respostaDaRpc = { data: [], error: null }
    const res = await enviar()
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("ORG_NOT_FOUND")
    expect([...balde.keys()]).toEqual([])
    expect(efeitos()).toEqual([
      `upload:${ORG_DA_ROTA}/logo.png`,
      "rpc",
      `remove:${ORG_DA_ROTA}/logo.png`,
    ])
  })

  it("🔴 no `404` some SÓ o destino — o prefixo inteiro NÃO é purgado", async () => {
    // O conserto largo-demais. "Zero linhas" é fato sobre a TABELA, não sobre o balde: se um dia
    // a RPC devolver zero linhas por outro motivo, purgar o prefixo apagaria um objeto vivo que
    // `logo_url` referencia — o 404 público que a AC4 proíbe, de novo por outra porta.
    balde.set(`${ORG_DA_ROTA}/logo.jpg`, "image/jpeg")
    respostaDaRpc = { data: [], error: null }
    expect((await enviar({ file: arquivo("image/png") })).status).toBe(404)
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.jpg`])
  })

  it("🔴 CONTROLE NEGATIVO — no `409` o objeto NOVO **não** é apagado", async () => {
    // O conserto óbvio-e-errado é "purgar em toda falha". Aqui a empresa EXISTE e `logo_url` pode
    // já apontar para o MESMO caminho (PNG sobre PNG): apagar recriaria exatamente o 404 público
    // que a 2ª rodada fechou. Sem este controle, aquele conserto ficaria verde.
    balde.set(`${ORG_DA_ROTA}/logo.jpg`, "image/jpeg")
    respostaDaRpc = { data: retornoDaRpc({ conflito: true }), error: null }
    expect((await enviar({ file: arquivo("image/png") })).status).toBe(409)
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.jpg`, `${ORG_DA_ROTA}/logo.png`])
    expect(efeitos()).toEqual([`upload:${ORG_DA_ROTA}/logo.png`, "rpc"])
  })

  it("🔴 CONTROLE NEGATIVO — no `500` da RPC idem: a empresa existe, o órfão FICA", async () => {
    balde.set(`${ORG_DA_ROTA}/logo.jpg`, "image/jpeg")
    respostaDaRpc = { data: null, error: { message: "connection reset" } }
    expect((await enviar({ file: arquivo("image/png") })).status).toBe(500)
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.jpg`, `${ORG_DA_ROTA}/logo.png`])
    expect(efeitos()).toEqual([`upload:${ORG_DA_ROTA}/logo.png`, "rpc"])
  })
})

describe("falha de escrita NUNCA vira 'salvo'", () => {
  it("upload falhou → 500, RPC NUNCA chamada, e a resposta não afirma nada gravado", async () => {
    falhaDeUpload = { message: "storage indisponível" }
    const res = await enviar()
    expect(res.status).toBe(500)
    expect(rpcMock).not.toHaveBeenCalled()
    const json = await res.json()
    expect(json).not.toHaveProperty("logoUrl")
    expect(json.error).toBe("UPLOAD_FALHOU")
  })

  it("bucket ausente (deploy fora de ordem) → 503, e a mensagem NOMEIA a migration 254", async () => {
    // MEDIDO NA TELA, contra o banco de teste sem a `254`: o Storage volta `"Bucket not found"` e
    // a rota respondia `500` com a frase crua. `500` diz "defeito do servidor"; a causa real é
    // "a migration não subiu", que é acionável e tem dono.
    falhaDeUpload = { message: "Bucket not found" }
    const res = await enviar()
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toBe("BUCKET_NAO_PUBLICADO")
    expect(json.message).toContain("254")
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("controle negativo: outro erro de upload NÃO vira 'bucket ausente'", async () => {
    // Sem isto, um casamento frouxo transformaria toda falha de Storage em "a migration não
    // subiu", escondendo a causa real — o mesmo defeito que o controle da RPC já vigia.
    falhaDeUpload = { message: "Payload too large" }
    const res = await enviar()
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe("UPLOAD_FALHOU")
    expect(json.message).not.toContain("254")
  })

  it("a LISTAGEM da purga falhou → 200 com `arquivoRemovido: false` (não ler ≠ não haver lixo)", async () => {
    falhaDeList = { message: "list falhou" }
    const res = await enviar()
    expect(res.status).toBe(200)
    expect((await res.json()).arquivoRemovido).toBe(false)
  })

  it("a REMOÇÃO da purga falhou → 200 com `arquivoRemovido: false`, e o antigo continua lá", async () => {
    balde.set(`${ORG_DA_ROTA}/logo.jpg`, "image/jpeg")
    falhaDeRemove = { message: "remove falhou" }
    const res = await enviar({ file: arquivo("image/png") })
    expect(res.status).toBe(200)
    expect((await res.json()).arquivoRemovido).toBe(false)
    // O cadastro JÁ aponta para o novo (a RPC passou); o antigo virou órfão público — degradado e
    // REPORTADO, que é o pior caso aceitável. Abortar aqui devolveria o 404 público.
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.jpg`, `${ORG_DA_ROTA}/logo.png`])
  })

  it("POST feliz reporta `arquivoRemovido: true` (controle: não é `false` constante)", async () => {
    expect((await (await enviar()).json()).arquivoRemovido).toBe(true)
  })

  it("Task 7.3c — RPC falha DEPOIS de um upload bem-sucedido → 500, sem afirmar sucesso", async () => {
    respostaDaRpc = { data: null, error: { message: "connection reset" } }
    const res = await enviar()
    expect(res.status).toBe(500)
    const json = await res.json()
    // A ausência é a asserção: um corpo com `logoUrl` seria a rota afirmando o que não gravou.
    expect(json).not.toHaveProperty("logoUrl")
    expect(json.message).toContain("connection reset")
    // A empresa EXISTE (a RPC falhou por transporte, não por ausência de linha): o objeto novo
    // fica no balde sem ninguém apontando para ele, e o próximo upload bem-sucedido o remove pela
    // purga da AC4. Removê-lo aqui é que seria o defeito — `logo_url` pode apontar para ele.
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.png`])
  })

  it("Task 7.3d — `P0024` (trava nula, segunda rede do banco) → 400", async () => {
    respostaDaRpc = { data: null, error: { code: "P0024", message: "trava nula" } }
    const res = await enviar()
    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain("trava nula")
  })

  it("`PGRST202` (deploy fora de ordem) → 503, e a mensagem NOMEIA a migration 254", async () => {
    respostaDaRpc = {
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.org_logo_update_as_platform in the schema cache",
      },
    }
    const res = await enviar()
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.message).toContain("254")
    expect(json.message).not.toContain("schema cache")
    expect(json).not.toHaveProperty("logoUrl")
  })

  it("`42883` (`undefined_function` do Postgres) → o MESMO desfecho", async () => {
    respostaDaRpc = { data: null, error: { code: "42883", message: "function does not exist" } }
    expect((await enviar()).status).toBe(503)
  })

  it("controle negativo: um erro qualquer NÃO é tratado como função ausente", async () => {
    // Sem isto, `naoPublicada = true` para todo mundo passaria — e toda falha viraria "a migration
    // não subiu", escondendo a causa real.
    respostaDaRpc = { data: null, error: { code: "P0024", message: "trava nula" } }
    expect((await (await enviar()).json()).message).not.toContain("254")
  })

  it("DELETE: RPC falhou → o Storage NÃO é tocado (a ordem inversa é o defeito)", async () => {
    balde.set(`${ORG_DA_ROTA}/logo.png`, "image/png")
    respostaDaRpc = { data: null, error: { message: "connection reset" } }
    const res = await remover()
    expect(res.status).toBe(500)
    expect(efeitos()).toEqual(["rpc"])
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.png`])
  })
})

describe("AC5 — os desfechos que a RPC devolve como DADO, não como exceção", () => {
  it("zero linhas → 404 ORG_NOT_FOUND", async () => {
    respostaDaRpc = { data: [], error: null }
    const res = await enviar()
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("ORG_NOT_FOUND")
  })

  it("`conflito=true` → 409 com o valor ATUAL do banco, não o da tela", async () => {
    respostaDaRpc = {
      data: retornoDaRpc({ conflito: true, logo_url: "https://outro/logo.png" }),
      error: null,
    }
    const res = await enviar()
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe("CONFLITO_DE_CONCORRENCIA")
    expect(json.atual.logoUrl).toBe("https://outro/logo.png")
    expect(json.atual.updatedAt).toBe(TRAVA_NOVA)
  })

  it("sucesso: a resposta traz o que a RPC diz ter gravado, não o que a rota pediu", async () => {
    respostaDaRpc = { data: retornoDaRpc({ logo_url: "https://o-que-o-banco-gravou" }), error: null }
    const json = await (await enviar()).json()
    expect(json.logoUrl).toBe("https://o-que-o-banco-gravou")
    // `updatedAt` volta para virar a trava da PRÓXIMA escrita.
    expect(json.updatedAt).toBe(TRAVA_NOVA)
  })

  it("a URL que vai para a RPC é a PÚBLICA do caminho gravado, VERSIONADA pelo conteúdo", async () => {
    await enviar({ file: arquivo("image/jpeg") })
    const enviada = rpcMock.mock.calls[0]![1].p_logo_url as string
    expect(enviada.startsWith(`${URL_PUBLICA}/${ORG_DA_ROTA}/logo.jpg?v=`)).toBe(true)
  })

  it("🔴 PNG por PNG com bytes DIFERENTES manda URL DIFERENTE — senão a tela mostra o antigo", async () => {
    // MEDIDO CONTRA O STORAGE REAL: com a URL crua, trocar um PNG por outro PNG produz a MESMA
    // string, a RPC classifica como no-op (`IS NOT DISTINCT FROM`), `updated_at` não anda, o `?v=`
    // da pré-visualização não anda — e o operador troca o logo vendo o antigo na tela, com 200.
    await enviar({ file: arquivo("image/png", 10) })
    const primeira = rpcMock.mock.calls[0]![1].p_logo_url
    rpcMock.mockClear()
    await enviar({ file: arquivo("image/png", 11) })
    const segunda = rpcMock.mock.calls[0]![1].p_logo_url
    expect(String(primeira).split("?")[0]).toBe(String(segunda).split("?")[0])
    expect(primeira).not.toBe(segunda)
  })

  it("reenviar o arquivo IDÊNTICO manda a MESMA URL — o no-op continua honesto", async () => {
    // Controle do anterior: se a versão fosse `Date.now()`, todo reenvio viraria uma linha de
    // trilha para uma troca que não houve. Hash de conteúdo mantém "nada mudou" = nada mudou.
    await enviar({ file: arquivo("image/png", 10) })
    const primeira = rpcMock.mock.calls[0]![1].p_logo_url
    rpcMock.mockClear()
    await enviar({ file: arquivo("image/png", 10) })
    expect(rpcMock.mock.calls[0]![1].p_logo_url).toBe(primeira)
  })

  it("DELETE manda `p_logo_url: null` — é NULL que significa remoção na RPC", async () => {
    respostaDaRpc = { data: retornoDaRpc({ logo_url: null }), error: null }
    await remover()
    expect(rpcMock.mock.calls[0]![1].p_logo_url).toBeNull()
  })
})

describe("a org vem do PARÂMETRO DE ROTA, e o ator do guard", () => {
  it("um `orgId` no formulário não vence o `[id]` da rota", async () => {
    const fd = new FormData()
    fd.append("file", arquivo("image/png"))
    fd.append("expectedUpdatedAt", TRAVA)
    fd.append("orgId", ORG_DO_CORPO)
    fd.append("p_org_id", ORG_DO_CORPO)
    await POST(new Request("http://localhost/x", { method: "POST", body: fd }), {
      params: Promise.resolve({ id: ORG_DA_ROTA }),
    })
    expect(rpcMock.mock.calls[0]![1].p_org_id).toBe(ORG_DA_ROTA)
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain(ORG_DO_CORPO)
    // E o CAMINHO no balde também é o da rota — senão o arquivo cairia no prefixo da outra.
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.png`])
  })

  it("o ator NÃO pode vir do pedido — é sempre o do `getPlatformAdmin()`", async () => {
    const fd = new FormData()
    fd.append("file", arquivo("image/png"))
    fd.append("expectedUpdatedAt", TRAVA)
    fd.append("p_actor_user_id", ATOR_FORJADO)
    await POST(new Request("http://localhost/x", { method: "POST", body: fd }), {
      params: Promise.resolve({ id: ORG_DA_ROTA }),
    })
    expect(rpcMock.mock.calls[0]![1].p_actor_user_id).toBe(ATOR)
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain(ATOR_FORJADO)
  })

  it("DELETE: um `orgId` no corpo não vence o `[id]` da rota", async () => {
    respostaDaRpc = { data: retornoDaRpc({ logo_url: null }), error: null }
    await remover({ expectedUpdatedAt: TRAVA, orgId: ORG_DO_CORPO, p_actor_user_id: ATOR_FORJADO })
    expect(rpcMock.mock.calls[0]![1].p_org_id).toBe(ORG_DA_ROTA)
    expect(rpcMock.mock.calls[0]![1].p_actor_user_id).toBe(ATOR)
  })
})

describe("`reason` é opcional e vai cru para a trilha", () => {
  it("omitido vira `null`", async () => {
    await enviar()
    expect(rpcMock.mock.calls[0]![1].p_reason).toBeNull()
  })

  it("só espaços vira `null`", async () => {
    await enviar({ reason: "   " })
    expect(rpcMock.mock.calls[0]![1].p_reason).toBeNull()
  })

  it("preenchido chega trimado", async () => {
    await enviar({ reason: "  cliente mandou a marca nova  " })
    expect(rpcMock.mock.calls[0]![1].p_reason).toBe("cliente mandou a marca nova")
  })
})

describe("Task 7.4 — DELETE numa empresa que já não tem logo", () => {
  it("no-op → 200, e a decisão é NÃO responder 404 (o 404 é sobre a EMPRESA)", async () => {
    respostaDaRpc = { data: retornoDaRpc({ logo_url: null }), error: null }
    const res = await remover()
    expect(res.status).toBe(200)
    expect((await res.json()).logoUrl).toBeNull()
  })

  it("Task 7.3e — a RPC é chamada UMA vez; quem não grava trilha para o no-op é ela", async () => {
    // A ausência da linha de trilha é assunto da migration `254` (`IS NOT DISTINCT FROM`), medida
    // no banco. O que a rota tem que garantir é não chamar a RPC duas vezes nem inventar um
    // segundo caminho de escrita para o mesmo gesto.
    respostaDaRpc = { data: retornoDaRpc({ logo_url: null }), error: null }
    await remover()
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it("a purga roda mesmo com `logo_url` já nulo — pode haver órfão de uma falha anterior", async () => {
    balde.set(`${ORG_DA_ROTA}/logo.webp`, "image/webp")
    respostaDaRpc = { data: retornoDaRpc({ logo_url: null }), error: null }
    await remover()
    expect(balde.size).toBe(0)
  })
})

describe("AC4 — o DELETE não afirma mais do que aconteceu", () => {
  it("`remove()` falhou → 200 (o cadastro FOI limpo) com `arquivoRemovido: false`", async () => {
    balde.set(`${ORG_DA_ROTA}/logo.png`, "image/png")
    falhaDeRemove = { message: "remove falhou" }
    respostaDaRpc = { data: retornoDaRpc({ logo_url: null }), error: null }
    const res = await remover()
    expect(res.status).toBe(200)
    expect((await res.json()).arquivoRemovido).toBe(false)
    expect([...balde.keys()]).toEqual([`${ORG_DA_ROTA}/logo.png`])
  })

  it("sucesso → `arquivoRemovido: true` (controle: o campo não é `false` constante)", async () => {
    balde.set(`${ORG_DA_ROTA}/logo.png`, "image/png")
    respostaDaRpc = { data: retornoDaRpc({ logo_url: null }), error: null }
    expect((await (await remover()).json()).arquivoRemovido).toBe(true)
  })
})

describe("AC11 da 900-62, herdada — a rota não abre um segundo lugar onde dado do cliente aparece", () => {
  it("nenhum `console.*` no fonte da rota", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const url = await import("node:url")
    const { linhasDeCodigo } = await import("@web/lib/tenancy/fonte-scan")
    const aqui = path.dirname(url.fileURLToPath(import.meta.url))
    // Só linhas de CÓDIGO: um comentário que cite `console.log` para explicar por que ele não
    // existe não pode acender a régua. O filtro tem ESTADO (comentário de bloco atravessa a
    // quebra de linha), e é por isso que vem de `fonte-scan` e não de um `startsWith` local.
    const linhas = linhasDeCodigo(fs.readFileSync(path.join(aqui, "route.ts"), "utf8"))
    expect(linhas.filter((l) => /\bconsole\s*\./.test(l))).toEqual([])
    // Vivacidade: sem isto, um `filter` que devolvesse `[]` por ter lido o arquivo errado (ou
    // vazio) aprovaria em silêncio.
    expect(linhas.length).toBeGreaterThan(50)
  })
})
