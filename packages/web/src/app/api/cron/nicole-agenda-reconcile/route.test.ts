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

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({}) }),
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
let reconciliarErro: Error | null = null

const reconciliarMock = vi.fn(
  async (_supabase: unknown, _opts: { desde: Date; ate: Date; orgId?: string | null }) => {
    if (reconciliarErro) throw reconciliarErro
    return relatorio
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

  it("AC4-(ii) da 87-3 — ?dry=1 NÃO emite evento nem alerta", async () => {
    const res = await GET(req("?days=60&dry=1"))
    const body = await res.json()
    expect(body.dry).toBe(true)
    expect(body.lastro_pct).toBe(12.5)
    // O modo em que o baseline é produzido não pode ter efeito colateral.
    expect(logEventOnceMock).not.toHaveBeenCalled()
    expect(logEventMock).not.toHaveBeenCalled()
    expect(telegramMock).not.toHaveBeenCalled()
  })

  it("emite o evento por caso, o recibo com o número, e o alerta nomeado", async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(body.alertas_novos).toBe(1)

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
    expect(body.avisos_despachados).toBe(1)
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
    const body = await res.json()

    expect(body.alertas_novos).toBe(1)
    expect(body.alertas_deduplicados).toBe(1)
    expect(body.avisos_despachados).toBe(1)
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
    const body = await res.json()
    expect(body.alertas_novos).toBe(0)
    expect(body.alertas_deduplicados).toBe(1)
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
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "timeout lendo messages" })

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
    const body = await res.json()
    expect(body.alertas_novos).toBe(12)
    // 10 nominais + 1 de resumo do excedente.
    expect(telegramMock).toHaveBeenCalledTimes(11)
    expect(body.avisos_despachados).toBe(11)
    expect(String(telegramMock.mock.calls[10]![0])).toContain("+2 casos sem lastro")
  })

  it("?days é limitado e a janela é passada ao módulo", async () => {
    await GET(req("?days=9999"))
    const arg = reconciliarMock.mock.calls[0]![1]
    const dias = Math.round((arg.ate.getTime() - arg.desde.getTime()) / 86400_000)
    expect(dias).toBe(180) // MAX_DIAS
  })

  it("🔴 87-6 — a rota não usa mais `logEvent` fire-and-forget", async () => {
    await GET(req())
    expect(logEventMock).not.toHaveBeenCalled()
  })
})
