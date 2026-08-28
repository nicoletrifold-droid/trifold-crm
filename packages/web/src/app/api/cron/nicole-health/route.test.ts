/**
 * Story 87-19 — testes do cron vigia da Nicole.
 *
 * O que se prova aqui: auth, kill-switches, os limiares por tipo (AC1-AC3), o
 * falso-positivo que NÃO alerta (AC4), o dedup que não reenvia (AC5), o canal
 * indisponível que não consome o dedup (AC14) e o `?dry=1` sem efeito colateral.
 *
 * ⚠️ Honestidade sobre o alcance: estes testes provam o CONTRATO da rota. A
 * atomicidade real do dedup é do índice `ux_system_events_dedupe_key` no Postgres
 * (migration 218) — aqui ele é simulado por um Set. Ler estes verdes como
 * "concorrência coberta" seria erro.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

/** Linhas que a query de `system_events` devolve no teste corrente. */
let eventos: Array<{ created_at: string; message: string; source?: string }> = []
/** Linha de `whatsapp_config`; null = canal indisponível (AC14). */
let waConfigRow: unknown = {
  phone_number_id: "1109406868918759",
  access_token: "tok",
  status: "active",
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      if (tabela === "whatsapp_config") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: waConfigRow }) }) }),
        }
      }
      // system_events: select().eq().gte().order()
      // O fake HONRA o .order(): sem isso, o teste da "primeira ocorrência" passaria
      // mesmo que a rota não ordenasse — bastaria o array de entrada já vir ordenado.
      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              order: async (_col: string, opts?: { ascending?: boolean }) => {
                const asc = opts?.ascending !== false
                const ordenado = [...eventos].sort((a, b) =>
                  asc
                    ? a.created_at.localeCompare(b.created_at)
                    : b.created_at.localeCompare(a.created_at)
                )
                return { data: ordenado, error: null }
              },
            }),
          }),
        }),
        // Compensação do dedup quando a entrega falha 100%.
        delete: () => ({
          eq: (_c1: string, v1: string) => ({
            eq: (_c2: string, v2: string) => {
              chavesGravadas.delete(v2)
              deletesCompensatorios.push(`${v1}|${v2}`)
              return Promise.resolve({ error: null })
            },
          }),
        }),
      }
    },
  }),
}))

/** Chaves removidas pela compensação de entrega falha. */
let deletesCompensatorios: string[] = []
/** Chaves de dedup já "no banco" — a 2ª tentativa da mesma chave leva 23505. */
let chavesGravadas = new Set<string>()
const logEventOnceMock = vi.fn(async (p: { dedupe_key?: string; event_type?: string }) => {
  const k = p.dedupe_key ?? ""
  if (chavesGravadas.has(k)) return { inserted: false }
  chavesGravadas.add(k)
  return { inserted: true }
})
const logEventMock = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (...a: unknown[]) => logEventMock(...a),
  logEventOnce: (p: { dedupe_key?: string; event_type?: string }) => logEventOnceMock(p),
}))

/** Args que realmente interessam do envio — o resto do payload é do canal, não da rota. */
interface ArgsAlerta {
  tipo: string
  ocorrencias: number
  desdeIso: string
  telefones: string[]
}
const alertarMock = vi.fn(async (_admin: unknown, _params: ArgsAlerta) => ({
  enviados: 1,
  falhas: 0,
}))
vi.mock("@web/lib/alerts/admin-whatsapp", async (original) => {
  const real = await original<typeof import("@web/lib/alerts/admin-whatsapp")>()
  return {
    ...real,
    alertarAdminWhatsApp: (admin: unknown, params: ArgsAlerta) => alertarMock(admin, params),
  }
})

/** Os params da N-ésima chamada do alerta, sem `!` espalhado pelos testes. */
function argsDaChamada(n = 0): ArgsAlerta {
  const chamada = alertarMock.mock.calls[n]
  if (!chamada) throw new Error(`alertarAdminWhatsApp não foi chamado ${n + 1}x`)
  return chamada[1]
}

import { GET } from "./route"

const SECRET = "segredo-de-teste"

const ERRO_CREDITO =
  'WhatsApp webhook async error: 400 {"type":"error","error":{"type":"invalid_request_error",' +
  '"message":"Your credit balance is too low to access the Anthropic API."}}'
const ERRO_RATE = '429 {"type":"error","error":{"type":"rate_limit_error","message":"..."}}'
const ERRO_ALHEIO = 'WhatsApp API 400: {"error":{"message":"(#80007) rate limit hit"}}'

function req(query = ""): Request {
  return new Request(`https://x.test/api/cron/nicole-health${query}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  })
}

function evento(message: string, created_at = "2026-08-28T09:05:41.798Z") {
  return { created_at, message, source: "api/webhook/whatsapp" }
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  process.env.ALERTA_SISTEMA_PHONES = "5544999761478"
  delete process.env.ALERTA_SISTEMA_OFF
  eventos = []
  chavesGravadas = new Set()
  deletesCompensatorios = []
  alertarMock.mockImplementation(async () => ({ enviados: 1, falhas: 0 }))
  waConfigRow = { phone_number_id: "1", access_token: "t", status: "active" }
  alertarMock.mockClear()
  logEventOnceMock.mockClear()
  logEventMock.mockClear()
})

afterEach(() => {
  delete process.env.CRON_SECRET
  delete process.env.ALERTA_SISTEMA_PHONES
})

describe("guards (AC9/AC10)", () => {
  it("sem CRON_SECRET → 503 e não consulta nada", async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req() as never)
    expect(res.status).toBe(503)
    expect(logEventOnceMock).not.toHaveBeenCalled()
  })

  it("authorization errado → 401", async () => {
    const r = new Request("https://x.test/api/cron/nicole-health", {
      headers: { authorization: "Bearer errado" },
    })
    expect((await GET(r as never)).status).toBe(401)
  })

  it("ALERTA_SISTEMA_OFF=1 → skipped sem consultar", async () => {
    process.env.ALERTA_SISTEMA_OFF = "1"
    eventos = [evento(ERRO_CREDITO)]
    const body = await (await GET(req() as never)).json()
    expect(body.skipped).toBe("desligado")
    expect(alertarMock).not.toHaveBeenCalled()
  })

  it("env de telefones vazia → skipped explícito, nunca ok silencioso", async () => {
    process.env.ALERTA_SISTEMA_PHONES = ""
    eventos = [evento(ERRO_CREDITO)]
    const body = await (await GET(req() as never)).json()
    expect(body.skipped).toBe("sem destinatário")
    expect(alertarMock).not.toHaveBeenCalled()
  })
})

describe("limiares por tipo (AC1-AC3)", () => {
  it("1 erro de crédito já alerta (AC1)", async () => {
    eventos = [evento(ERRO_CREDITO)]
    const body = await (await GET(req() as never)).json()
    expect(body.alertasEnviados).toBe(1)
    expect(alertarMock).toHaveBeenCalledTimes(1)
    expect(argsDaChamada()).toMatchObject({ tipo: "credito", ocorrencias: 1 })
  })

  it("2 rate limits NÃO alertam (AC3)", async () => {
    eventos = [evento(ERRO_RATE), evento(ERRO_RATE)]
    const body = await (await GET(req() as never)).json()
    expect(body.alertasEnviados).toBe(0)
    expect(alertarMock).not.toHaveBeenCalled()
  })

  it("3 rate limits alertam (AC3)", async () => {
    eventos = [evento(ERRO_RATE), evento(ERRO_RATE), evento(ERRO_RATE)]
    const body = await (await GET(req() as never)).json()
    expect(body.alertasEnviados).toBe(1)
    expect(argsDaChamada()).toMatchObject({ tipo: "rate_limit", ocorrencias: 3 })
  })

  it("usa a PRIMEIRA ocorrência da janela como 'desde'", async () => {
    eventos = [
      evento(ERRO_CREDITO, "2026-08-28T09:00:00.000Z"),
      evento(ERRO_CREDITO, "2026-08-28T09:05:41.798Z"),
    ]
    await GET(req() as never)
    expect(argsDaChamada()).toMatchObject({
      desdeIso: "2026-08-28T09:00:00.000Z",
      ocorrencias: 2,
    })
  })
})

describe("falso positivo (AC4)", () => {
  it("erro da Graph API do WhatsApp não dispara nada", async () => {
    eventos = [evento(ERRO_ALHEIO), evento(ERRO_ALHEIO), evento(ERRO_ALHEIO)]
    const body = await (await GET(req() as never)).json()
    expect(body.alertasEnviados).toBe(0)
    expect(body.eventosLidos).toBe(3)
    expect(alertarMock).not.toHaveBeenCalled()
  })

  it("janela sem erro nenhum devolve ok sem tocar o canal", async () => {
    const body = await (await GET(req() as never)).json()
    expect(body.ok).toBe(true)
    expect(body.alertasEnviados).toBe(0)
    expect(logEventOnceMock).not.toHaveBeenCalled()
  })
})

describe("dedup (AC5)", () => {
  it("duas execuções na mesma hora enviam UMA vez só", async () => {
    eventos = [evento(ERRO_CREDITO)]

    const p1 = await (await GET(req() as never)).json()
    const p2 = await (await GET(req() as never)).json()

    expect(p1.alertasEnviados).toBe(1)
    expect(p2.alertasEnviados).toBe(0)
    expect(p2.dedupPulados).toBe(1)
    expect(alertarMock).toHaveBeenCalledTimes(1)
  })

  it("a chave de dedup separa por tipo e carrega a hora", async () => {
    eventos = [evento(ERRO_CREDITO)]
    await GET(req() as never)
    const chave = String(logEventOnceMock.mock.calls[0]?.[0].dedupe_key ?? "")
    expect(chave).toMatch(/^nicole-health:credito:\d{4}-\d{2}-\d{2}T\d{2}$/)
  })
})

describe("canal indisponível (AC14)", () => {
  it("sem whatsapp_config: não envia E não consome o dedup", async () => {
    waConfigRow = null
    eventos = [evento(ERRO_CREDITO)]

    const body = await (await GET(req() as never)).json()

    expect(body.skipped).toBe("whatsapp indisponível")
    expect(alertarMock).not.toHaveBeenCalled()
    // O ponto do AC14 é preciso: nenhum MARCADOR de alerta pode ter sido gravado,
    // senão o alerta some pela hora inteira sem ninguém ter sido avisado. O log de
    // diagnóstico `NICOLE_HEALTH_SEM_CANAL` pode (e deve) ser gravado.
    const marcadores = logEventOnceMock.mock.calls.filter(
      (c) => c[0].event_type === "NICOLE_HEALTH_ALERTA"
    )
    expect(marcadores).toHaveLength(0)
    expect(logEventOnceMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "NICOLE_HEALTH_SEM_CANAL" })
    )
  })
})

describe("entrega falha desfaz o dedup (achado do CodeRabbit no PR #519)", () => {
  it("quando NINGUÉM recebe, o marcador é removido para retentar em 10 min", async () => {
    eventos = [evento(ERRO_CREDITO)]
    // É o cenário real enquanto o template estiver PENDING na Meta: 400 em todo envio.
    alertarMock.mockImplementation(async () => ({ enviados: 0, falhas: 1 }))

    const body = await (await GET(req() as never)).json()

    expect(body.entregasFalhas).toBe(1)
    expect(body.alertasEnviados).toBe(0)
    expect(deletesCompensatorios).toHaveLength(1)
    expect(deletesCompensatorios[0]).toContain("nicole-health:credito:")
  })

  it("o ciclo seguinte volta a tentar — o silêncio não persiste", async () => {
    eventos = [evento(ERRO_CREDITO)]
    alertarMock.mockImplementation(async () => ({ enviados: 0, falhas: 1 }))
    await GET(req() as never) // 1º ciclo: falha e compensa

    // Template aprovado no meio do caminho: o 2º ciclo TEM de conseguir alertar.
    alertarMock.mockImplementation(async () => ({ enviados: 1, falhas: 0 }))
    const body = await (await GET(req() as never)).json()

    expect(body.alertasEnviados).toBe(1)
    expect(body.dedupPulados).toBe(0)
  })

  it("entrega parcial (1 de 2) NÃO desfaz o dedup", async () => {
    eventos = [evento(ERRO_CREDITO)]
    alertarMock.mockImplementation(async () => ({ enviados: 1, falhas: 1 }))

    const body = await (await GET(req() as never)).json()

    expect(body.alertasEnviados).toBe(1)
    expect(body.entregasFalhas).toBe(0)
    expect(deletesCompensatorios).toHaveLength(0)
  })
})

describe("dry run (AC9)", () => {
  it("?dry=1 calcula mas não envia nem grava marcador", async () => {
    eventos = [evento(ERRO_CREDITO)]
    const body = await (await GET(req("?dry=1") as never)).json()

    expect(body.dryRun).toBe(true)
    expect(body.tiposAlertaveis).toEqual(["credito"])
    expect(body.alertasEnviados).toBe(0)
    expect(alertarMock).not.toHaveBeenCalled()
    expect(logEventOnceMock).not.toHaveBeenCalled()
  })
})
