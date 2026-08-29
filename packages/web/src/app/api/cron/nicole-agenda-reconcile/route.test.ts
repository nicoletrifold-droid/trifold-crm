/**
 * Story 87-3 + 87-6 — testes do cron de reconciliação fala × banco.
 *
 * O módulo puro (`packages/ai/src/flows/agenda-reconcile.ts`) já é testado no
 * pacote `ai`. Aqui prova-se só o que é da camada web: auth, `?dry=1` sem efeito
 * colateral, a REIVINDICAÇÃO (87-6: quem grava a linha é quem alerta), o recibo
 * AGUARDADO, o `dedupe_key`, e o alerta que NOMEIA o lead com o deep link.
 *
 * ⚠️ Honestidade sobre o alcance (AC4 da 87-6): estes testes provam o CONTRATO —
 * a rota não alerta quando `inserted` é falso, e a resposta não sai antes da
 * escrita completar. **Não provam a atomicidade**: não há índice único aqui. A
 * atomicidade é a prova `BEGIN…ROLLBACK` no banco real (AC1-b). Ler estes verdes
 * como "concorrência coberta" seria exatamente o erro que a AC4 proíbe.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const telegramMock = vi.fn()
vi.mock("@web/lib/telegram", () => ({
  sendTelegramAdminAlert: (...a: unknown[]) => telegramMock(...a),
}))

type EventoEscrito = {
  level: string
  category: string
  event_type: string
  message: string
  source?: string
  org_id?: string
  dedupe_key?: string
  metadata?: Record<string, unknown>
}

/** Chaves já "no banco" — o segundo insert da mesma chave leva `23505`. */
let chavesGravadas = new Set<string>()
/** Eventos cuja escrita COMPLETOU. Comparado com o momento do response. */
let completados: EventoEscrito[] = []
/** Quando true, a escrita só completa num macrotask (simula o Postgres real). */
let escritaLenta = true

/**
 * A chave de unicidade do fake. Reproduz os DOIS índices da migration 218:
 * `dedupe_key` (índice B) e `metadata.message_id` do alerta (índice A).
 */
function chaveDe(p: EventoEscrito): string | null {
  if (p.dedupe_key) return `${p.event_type}|${p.dedupe_key}`
  if (p.event_type === "NICOLE_AFIRMACAO_SEM_LASTRO" && p.metadata?.message_id) {
    return `${p.event_type}|mid:${String(p.metadata.message_id)}`
  }
  return null // sem chave: nenhum índice o alcança, sempre insere
}

/**
 * Geração do teste corrente. Sem isto, uma escrita ÓRFÃ (a que o `void` deixa
 * pendente) completa DEPOIS do fim do teste e cai no array do teste SEGUINTE —
 * que então passa por acidente. Foi o que aconteceu na primeira rodada da
 * mutação M1: o teste do `await` ficou verde herdando o recibo perdido do teste
 * anterior. Um fake que aceita escrita fora do tempo do teste dá confiança falsa.
 */
let geracao = 0

const logEventOnceMock = vi.fn(async (p: EventoEscrito) => {
  const minhaGeracao = geracao
  if (escritaLenta) await new Promise((r) => setTimeout(r, 5))
  if (minhaGeracao !== geracao) return { inserted: false } // órfã: o teste já acabou
  const k = chaveDe(p)
  if (k !== null && chavesGravadas.has(k)) return { inserted: false }
  if (k !== null) chavesGravadas.add(k)
  completados.push(p)
  return { inserted: true }
})

const logEventMock = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (...a: unknown[]) => logEventMock(...a),
  logEventOnce: (p: EventoEscrito) => logEventOnceMock(p),
}))

/** Story 900-23 — o client CRU só serve para listar `organizations` ativas. */
let orgsAtivas: Array<{ id: string; name: string }> = []
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          resolve({ data: orgsAtivas, error: null }),
      }
      return api
    },
  }),
}))

/** O client escopado que o helper entrega ao callback — carrega o org de quem o pediu. */
vi.mock("@web/lib/supabase/org-scoped-admin", () => ({
  createOrgScopedAdminClient: (orgId: string) => ({ __org: orgId, from: () => ({}) }),
}))

const alerta = (sufixo: string) => ({
  lead_id: `lead-${sufixo}`,
  lead_nome: sufixo === "celia" ? "Célia" : "Ronaldo",
  conversation_id: `c-${sufixo}`,
  message_id: `m-${sufixo}`,
  falado_em_brt: "2026-06-28 10:37",
  afirmado_para_brt: "2026-07-04 09:00",
  dia_afirmado_brt: "2026-07-04",
  trecho: "Perfeito! Agendei sua visita para este sábado às 9h.",
})

const RELATORIO = {
  unidade: "fala" as const,
  janela: { desde: "2026-06-08T00:00:00.000Z", ate: "2026-08-07T00:00:00.000Z", dias: 60 },
  total_disparos: 30,
  descartes: { ligacao: 1, transicao_humana: 0, data_invalida: 0 },
  lembrete: 5,
  denominador: 24,
  com_lastro: 3,
  reparo_humano: 9,
  sem_lastro: 12,
  lastro_pct: 12.5,
  lastro_frouxo_pct: 50,
  lastro_frouxo_rotulo: "NÃO é lastro — inclui conserto humano posterior",
  sensibilidade: {
    ordem_normativa: { com_lastro: 3, lembrete: 5, denominador: 24, lastro_pct: 12.5 },
    lembrete_primeiro: { com_lastro: 0, lembrete: 8, denominador: 21, lastro_pct: 0 },
  },
  mensagens_lidas: 1157,
  linhas: [],
  alertas: [alerta("celia")],
}

let relatorio: typeof RELATORIO = RELATORIO
/** Relatório por org — quando ausente, cai em `relatorio`. Fixture de duas empresas. */
let relatorioPorOrg: Record<string, typeof RELATORIO> = {}
let reconciliarErro: Error | null = null
/** Orgs cujo `reconciliarAgenda` lança. Vazio = ninguém falha. */
let orgsQueFalham = new Set<string>()

const reconciliarMock = vi.fn(
  async (_supabase: unknown, opts: { desde: Date; ate: Date; orgId?: string | null }) => {
    const orgId = opts.orgId ?? ""
    if (reconciliarErro && (orgsQueFalham.size === 0 || orgsQueFalham.has(orgId))) {
      throw reconciliarErro
    }
    if (orgsQueFalham.has(orgId)) throw new Error(`falha sintética em ${orgId}`)
    return relatorioPorOrg[orgId] ?? relatorio
  }
)
vi.mock("@trifold/ai", async () => {
  // `diaBrt` é o de VERDADE — é a convenção de dia do relatório, e é ela que
  // define o "um por dia" do `dedupe_key`. Reimplementá-la no teste faria o
  // teste concordar consigo mesmo e divergir da produção por 3 horas de fuso.
  const actual = await vi.importActual<typeof import("@trifold/ai")>("@trifold/ai")
  return {
    ...actual,
    reconciliarAgenda: (...a: Parameters<typeof reconciliarMock>) => reconciliarMock(...a),
  }
})

const { GET } = await import("./route")
const { diaBrt } = await import("@trifold/ai")

const ORG = "00000000-0000-0000-0000-000000000001"
const ORG_B = "00000000-0000-0000-0000-0000000000b2"

/** As duas orgs da fixture multi-tenant. */
const DUAS_ORGS = [
  { id: ORG, name: "Trifold" },
  { id: ORG_B, name: "Empresa B" },
]

type ItemOrg = Record<string, unknown> & { orgId: string; ok: boolean }
type Corpo = {
  ok?: boolean
  dry?: boolean
  total?: number
  sucesso?: number
  falha?: number
  resultados: ItemOrg[]
}
const itemDa = (corpo: Corpo, orgId: string) => corpo.resultados.find((r) => r.orgId === orgId)!

function req(qs = "", auth = "Bearer segredo") {
  return new Request(`https://x.test/api/cron/nicole-agenda-reconcile${qs}`, {
    headers: auth ? { authorization: auth } : {},
  }) as unknown as Parameters<typeof GET>[0]
}

const recibos = () => completados.filter((e) => e.event_type === "NICOLE_LASTRO_DIARIO")
const doTipo = (t: string) => completados.filter((e) => e.event_type === t)

beforeEach(() => {
  geracao++
  process.env.CRON_SECRET = "segredo"
  delete process.env.DAILY_REPORT_ORG_ID
  relatorio = RELATORIO
  relatorioPorOrg = {}
  orgsQueFalham = new Set()
  orgsAtivas = [{ id: ORG, name: "Trifold" }]
  reconciliarErro = null
  chavesGravadas = new Set()
  completados = []
  escritaLenta = true
  telegramMock.mockClear()
  logEventMock.mockClear()
  logEventOnceMock.mockClear()
  reconciliarMock.mockClear()
})

describe("cron nicole-agenda-reconcile", () => {
  it("401 sem o Bearer do CRON_SECRET", async () => {
    const res = await GET(req("", "Bearer errado"))
    expect(res.status).toBe(401)
    expect(reconciliarMock).not.toHaveBeenCalled()
  })

  it("AC4-(ii) da 87-3 — ?dry=1 NÃO emite evento nem alerta (corpo POR ORG, R4)", async () => {
    const res = await GET(req("?days=60&dry=1"))
    const body = (await res.json()) as Corpo
    expect(body.dry).toBe(true)
    // ⚠️ FORMA mudou (R3/R4 da 900-23): não existe "dry run de todas as orgs num JSON só". A
    // garantia — dry não tem efeito colateral — é a mesma.
    expect(itemDa(body, ORG).dry).toBe(true)
    expect(itemDa(body, ORG).lastro_pct).toBe(12.5)
    // O modo em que o baseline é produzido não pode ter efeito colateral DE DOMÍNIO.
    expect(logEventOnceMock).not.toHaveBeenCalled()
    expect(telegramMock).not.toHaveBeenCalled()
    // O `logEvent` que sobra é a contabilidade do helper (CRON_*), nunca um evento da Nicole.
    expect(logEventMock.mock.calls.map((c) => (c[0] as EventoEscrito).event_type)).toEqual([
      "CRON_ORG_PROCESSADA",
      "CRON_RESUMO",
    ])
  })

  it("emite o evento por caso, o recibo com o número, e o alerta nomeado", async () => {
    const res = await GET(req())
    const body = (await res.json()) as Corpo
    expect(itemDa(body, ORG).alertas_novos).toBe(1)

    const tipos = completados.map((e) => e.event_type)
    expect(tipos).toContain("NICOLE_AFIRMACAO_SEM_LASTRO")
    expect(tipos).toContain("NICOLE_LASTRO_DIARIO")

    const resumo = recibos()[0]!
    expect(resumo.metadata!.unidade).toBe("fala")
    expect(resumo.metadata!.lastro_pct).toBe(12.5)
    expect(resumo.metadata!.denominador).toBe(24)
    expect(resumo.metadata!.lembrete).toBe(5)
    expect(resumo.metadata!.sensibilidade).toEqual(RELATORIO.sensibilidade)
    expect(resumo.metadata!.alertas_novos).toBe(1)

    // O alerta NOMEIA o lead, a data, o horário afirmado e traz o deep link.
    expect(telegramMock).toHaveBeenCalledTimes(1)
    const msg = String(telegramMock.mock.calls[0]![0])
    expect(msg).toContain("Célia")
    expect(msg).toContain("2026-07-04 09:00")
    expect(msg).toContain("/dashboard/leads/lead-celia")
    expect(itemDa(body, ORG).avisos_despachados).toBe(1)
  })

  it("🔴 87-6 — o RECIBO é aguardado: a resposta não sai antes da escrita completar", async () => {
    // ESTE é o conserto principal. Em 10/08 11:38 UTC o recibo da primeira
    // invocação foi PERDIDO — era a última escrita antes do `NextResponse.json`
    // e o `logEvent` fire-and-forget não segura a lambda. O fake completa a
    // escrita só num macrotask, que é o comportamento do banco de verdade.
    const res = await GET(req())
    expect(res.status).toBe(200)
    // Se o `await` sumir, `completados` está vazio neste ponto.
    expect(recibos()).toHaveLength(1)
    expect(doTipo("NICOLE_AFIRMACAO_SEM_LASTRO")).toHaveLength(1)
  })

  it("🔴 87-6/AC5 — o recibo carrega `dedupe_key = lastro:{org}:{dia_brt}:{dias}d`", async () => {
    await GET(req())
    const hoje = diaBrt(new Date())
    expect(recibos()[0]!.dedupe_key).toBe(`lastro:${ORG}:${hoje}:1d`)
  })

  it("🔴 87-6/AC5 — o dia da chave é BRT, não UTC (e as duas discordam às 23h)", async () => {
    // Sem esta fixture o teste anterior não distingue `diaBrt` de
    // `toISOString().slice(0,10)`: eles concordam em 21 das 24 horas. Às 23h BRT
    // já é o dia seguinte em UTC — duas definições de "dia" fariam o dedupe
    // evaporar por 3 h todo dia, e a rodada das 11:38 UTC nunca revelaria isso.
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      vi.setSystemTime(new Date("2026-08-11T02:00:00.000Z")) // = 2026-08-10 23:00 BRT
      await GET(req())
      expect(recibos()[0]!.dedupe_key).toBe(`lastro:${ORG}:2026-08-10:1d`)
    } finally {
      vi.useRealTimers()
    }
  })

  it("🔴 87-6/AC5-(ii) — duas rodadas da janela padrão no mesmo dia ⇒ UM recibo", async () => {
    await GET(req())
    await GET(req())
    expect(recibos()).toHaveLength(1)
    // As duas rodadas TENTARAM: o dedupe é do banco, não de um `if` na rota.
    const tentativas = logEventOnceMock.mock.calls.filter(
      (c) => c[0].event_type === "NICOLE_LASTRO_DIARIO"
    )
    expect(tentativas).toHaveLength(2)
  })

  it("🔴 87-6/AC5-(iii) — a rodada retroativa `?days=60` NÃO é engolida pela diária", async () => {
    await GET(req())
    await GET(req("?days=60"))
    expect(recibos()).toHaveLength(2)
    const chaves = recibos().map((e) => e.dedupe_key)
    const hoje = diaBrt(new Date())
    expect(chaves).toEqual([`lastro:${ORG}:${hoje}:1d`, `lastro:${ORG}:${hoje}:60d`])
  })

  it("🔴 87-6/AC3 — o aviso só sai para quem REIVINDICOU", async () => {
    relatorio = { ...RELATORIO, alertas: [alerta("celia"), alerta("ronaldo")] }
    // O Ronaldo já está no banco: a outra invocação ganhou a corrida por ele.
    chavesGravadas.add("NICOLE_AFIRMACAO_SEM_LASTRO|mid:m-ronaldo")

    const res = await GET(req())
    const body = (await res.json()) as Corpo

    expect(itemDa(body, ORG).alertas_novos).toBe(1)
    expect(itemDa(body, ORG).alertas_deduplicados).toBe(1)
    expect(itemDa(body, ORG).avisos_despachados).toBe(1)
    expect(telegramMock).toHaveBeenCalledTimes(1)
    expect(String(telegramMock.mock.calls[0]![0])).toContain("Célia")
    // E o recibo publica o número dos REIVINDICADOS, não o dos candidatos.
    expect(recibos()[0]!.metadata!.alertas_novos).toBe(1)
  })

  it("AC4-(i) da 87-3 — a segunda rodada do mesmo dia NÃO duplica evento nem alerta", async () => {
    await GET(req())
    expect(telegramMock).toHaveBeenCalledTimes(1)
    telegramMock.mockClear()

    const res = await GET(req())
    const body = (await res.json()) as Corpo
    expect(itemDa(body, ORG).alertas_novos).toBe(0)
    expect(itemDa(body, ORG).alertas_deduplicados).toBe(1)
    expect(telegramMock).not.toHaveBeenCalled()
    expect(doTipo("NICOLE_AFIRMACAO_SEM_LASTRO")).toHaveLength(1)
  })

  it("🔴 87-6 — o `source` segue a convenção `api/cron/…` do resto do projeto", async () => {
    // A divergência (`cron/…`) já fez concluir, por `source like 'cron/%'`, que
    // nenhum cron grava evento. Em produção: 5.790 linhas `api/cron/followup`
    // contra 2 `cron/nicole-agenda-reconcile` (medido 10/08/2026).
    await GET(req())
    const fontes = new Set(completados.map((e) => e.source))
    expect([...fontes]).toEqual(["api/cron/nicole-agenda-reconcile"])
  })

  it("🔴 87-6 — falha de execução emite NICOLE_LASTRO_FALHA ANTES do 500", async () => {
    // Sem esta linha, um dia com falha é indistinguível de um dia em que o
    // agendador não disparou: 500 no log da Vercel e zero linha no banco.
    reconciliarErro = new Error("timeout lendo messages")
    const res = await GET(req("?days=7"))
    // Com 1 org ativa e ela falhando: `sucesso === 0 && total === 1` ⇒ 500 por
    // `statusHttpParaResumo` — o mesmo status que esta AC sempre exigiu.
    expect(res.status).toBe(500)
    // ⚠️ FORMA mudou (R3 da 900-23): era `toEqual({ error: "..." })` sobre o corpo inteiro. A
    // garantia — a mensagem de erro REAL chega ao corpo da resposta — é a mesma.
    const body = (await res.json()) as Corpo
    expect(itemDa(body, ORG).ok).toBe(false)
    expect(itemDa(body, ORG).erro).toBe("timeout lendo messages")

    const falha = doTipo("NICOLE_LASTRO_FALHA")
    expect(falha).toHaveLength(1)
    expect(falha[0]!.level).toBe("error")
    expect(falha[0]!.message).toBe("timeout lendo messages")
    expect(falha[0]!.source).toBe("api/cron/nicole-agenda-reconcile")
    expect(falha[0]!.metadata!.dias).toBe(7)
  })

  it("87-6 — o teto de avisos continua valendo e o excedente vira UMA mensagem", async () => {
    relatorio = {
      ...RELATORIO,
      alertas: Array.from({ length: 12 }, (_, i) => alerta(`l${i}`)),
    }
    const res = await GET(req())
    const body = (await res.json()) as Corpo
    expect(itemDa(body, ORG).alertas_novos).toBe(12)
    // 10 nominais + 1 de resumo do excedente.
    expect(telegramMock).toHaveBeenCalledTimes(11)
    expect(itemDa(body, ORG).avisos_despachados).toBe(11)
    expect(String(telegramMock.mock.calls[10]![0])).toContain("+2 casos sem lastro")
  })

  it("?days é limitado e a janela é passada ao módulo", async () => {
    await GET(req("?days=9999"))
    const arg = reconciliarMock.mock.calls[0]![1]
    const dias = Math.round((arg.ate.getTime() - arg.desde.getTime()) / 86400_000)
    expect(dias).toBe(180) // MAX_DIAS
  })

  it("🔴 87-6 — nenhum evento da Nicole sai por `logEvent` fire-and-forget", async () => {
    // ⚠️ FORMA mudou (900-23): `forEachActiveOrg` emite a própria contabilidade (`CRON_*`) por
    // `logEvent`. A garantia da 87-6 — os eventos da NICOLE são aguardados, via `logEventOnce` —
    // é a mesma, e é isto que a asserção mede agora.
    await GET(req())
    const tipos = logEventMock.mock.calls.map((c) => (c[0] as EventoEscrito).event_type)
    expect(tipos.filter((t) => t.startsWith("NICOLE_"))).toEqual([])
    expect(tipos).toEqual(["CRON_ORG_PROCESSADA", "CRON_RESUMO"])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Story 900-23 — duas organizações reais
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("900-23 — o cron roda para todas as orgs ativas", () => {
  beforeEach(() => {
    orgsAtivas = DUAS_ORGS
  })

  it("cada org é reconciliada com o PRÓPRIO orgId — nunca as duas com o mesmo", async () => {
    await GET(req())
    const idsPassados = reconciliarMock.mock.calls.map((c) => c[1].orgId)
    expect(idsPassados).toEqual([ORG, ORG_B])
    expect(new Set(idsPassados).size).toBe(2)
  })

  it("🔴 R5 — `dedupe_key` distinta por org: a org B não é suprimida como duplicata da A", async () => {
    await GET(req())
    const hoje = diaBrt(new Date())
    expect(recibos().map((e) => e.dedupe_key)).toEqual([
      `lastro:${ORG}:${hoje}:1d`,
      `lastro:${ORG_B}:${hoje}:1d`,
    ])
    // As duas escritas COMPLETARAM: se a chave não embutisse o org, a segunda levaria 23505.
    expect(recibos()).toHaveLength(2)
  })

  it("🔴 C5 — ZERO dado da org B no Telegram; o caso dela continua indo para system_events", async () => {
    // O corpo do alerta nomeia o lead, cita o trecho da conversa e traz o deep link. O canal é
    // `TELEGRAM_ADMIN_CHAT_ID`: um chat só, global, da Trifold.
    relatorioPorOrg = {
      [ORG]: { ...RELATORIO, alertas: [alerta("celia")] },
      [ORG_B]: { ...RELATORIO, alertas: [alerta("ronaldo")] },
    }

    const res = await GET(req())
    const body = (await res.json()) as Corpo

    // A Trifold continua despachando como hoje — sem este lado, uma mutação que simplesmente
    // DESLIGASSE o Telegram passaria neste teste.
    expect(telegramMock).toHaveBeenCalledTimes(1)
    const enviadas = telegramMock.mock.calls.map((c) => String(c[0]))
    expect(enviadas[0]).toContain("Célia")

    // Nada da org B: nem nome de lead, nem trecho, nem deep link.
    for (const msg of enviadas) {
      expect(msg).not.toContain("Ronaldo")
      expect(msg).not.toContain("lead-ronaldo")
    }
    expect(itemDa(body, ORG_B).avisos_despachados).toBe(0)
    expect(itemDa(body, ORG_B).avisos_suprimidos_canal_global).toBe(1)

    // …mas o caso da org B ESTÁ gravado, com o org_id dela — o dado não se perde, só não vai
    // para um canal que não é dela.
    const semLastro = doTipo("NICOLE_AFIRMACAO_SEM_LASTRO")
    expect(semLastro.map((e) => e.org_id)).toEqual([ORG, ORG_B])
    expect(semLastro.find((e) => e.org_id === ORG_B)!.metadata!.lead_name).toBe("Ronaldo")
  })

  it("🔴 AC10.4 — DAILY_REPORT_ORG_ID apontando para outra org NÃO muda o destino do Telegram", async () => {
    // Se `trifoldOrgId()` lesse essa env, apontar o RELATÓRIO DIÁRIO para a org B redirecionaria,
    // em silêncio, o Telegram do cron da AGENDA. É a dependência cruzada que a AC2 fechou.
    process.env.DAILY_REPORT_ORG_ID = ORG_B
    relatorioPorOrg = {
      [ORG]: { ...RELATORIO, alertas: [alerta("celia")] },
      [ORG_B]: { ...RELATORIO, alertas: [alerta("ronaldo")] },
    }

    await GET(req())

    expect(telegramMock).toHaveBeenCalledTimes(1)
    expect(String(telegramMock.mock.calls[0]![0])).toContain("Célia")
    expect(String(telegramMock.mock.calls[0]![0])).not.toContain("Ronaldo")
  })
})

describe("900-23 · C4 — o NICOLE_LASTRO_FALHA sobrevive à migração", () => {
  it("org que falha emite NICOLE_LASTRO_FALHA com o org_id dela, e não derruba a vizinha", async () => {
    orgsAtivas = DUAS_ORGS
    orgsQueFalham = new Set([ORG_B])

    const res = await GET(req("?days=7"))
    const body = (await res.json()) as Corpo

    const falha = doTipo("NICOLE_LASTRO_FALHA")
    expect(falha).toHaveLength(1)
    expect(falha[0]!.org_id).toBe(ORG_B)
    expect(falha[0]!.level).toBe("error")
    expect(falha[0]!.metadata!.dias).toBe(7)

    // C6 — 2 orgs, 1 falha ⇒ 200, e o corpo diz QUAL falhou.
    expect(res.status).toBe(200)
    expect(itemDa(body, ORG).ok).toBe(true)
    expect(itemDa(body, ORG_B).ok).toBe(false)
    expect(itemDa(body, ORG_B).org).toBe("Empresa B")
  })
})

describe("900-23 · C6 — Propriedade 5 amarrada na rota", () => {
  it("2 orgs, AMBAS falham ⇒ 500", async () => {
    orgsAtivas = DUAS_ORGS
    orgsQueFalham = new Set([ORG, ORG_B])
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(doTipo("NICOLE_LASTRO_FALHA")).toHaveLength(2)
  })

  it("ZERO orgs ativas ⇒ 200, zero callbacks, zero eventos", async () => {
    orgsAtivas = []
    const res = await GET(req())
    const body = (await res.json()) as Corpo
    expect(res.status).toBe(200)
    expect(body.total).toBe(0)
    expect(reconciliarMock).not.toHaveBeenCalled()
    expect(completados).toEqual([])
  })
})
