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
let eventos: Array<{
  created_at: string
  message: string
  source?: string
  org_id?: string | null
  /** Story 87-20 — o branch de loop filtra por `event_type` e lê `metadata.conversationId`. */
  event_type?: string
  metadata?: Record<string, unknown>
}> = []
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
        // O fake HONRA a LISTA DE COLUNAS do `.select()` (Story 900-23): sem projetar, uma rota
        // que esquecesse `org_id` no select receberia o campo do fake assim mesmo, e o teste de
        // `orgs_afetadas` passaria verde medindo a fixture, não o código.
        // Story 87-20 — o fake HONRA o `.eq()` também. Antes ele ignorava os filtros e
        // devolvia a lista inteira: a rota tem DUAS consultas a `system_events` (a de
        // `level='error'` da 87-19 e a de `event_type='NICOLE_LOOP_DETECTADO'` desta
        // story), e um fake cego às duas deixaria passar VERDE a remoção de qualquer
        // um dos filtros — a chamada existe, o argumento foi neutralizado.
        select: (colunas: string) => {
          const filtros: Array<[string, unknown]> = []
          const chain = {
            eq: (col: string, val: unknown) => {
              filtros.push([col, val])
              return chain
            },
            gte: (col: string, val: unknown) => {
              filtros.push([col, val])
              return chain
            },
            order: async (_col: string, opts?: { ascending?: boolean }) => {
              const asc = opts?.ascending !== false
              const pedidas = colunas.split(",").map((c) => c.trim())
              const ordenado = eventos
                .filter((linha) =>
                  filtros.every(([col, val]) => {
                    if (col === "created_at") return true // `gte` da janela
                    if (col === "level") return true // toda fixture é `level='error'`
                    return (linha as Record<string, unknown>)[col] === val
                  })
                )
                .slice()
                .sort((a, b) =>
                  asc
                    ? a.created_at.localeCompare(b.created_at)
                    : b.created_at.localeCompare(a.created_at)
                )
                .map((linha) =>
                  Object.fromEntries(
                    Object.entries(linha).filter(([k]) => pedidas.includes(k))
                  )
                )
              return { data: ordenado, error: null }
            },
          }
          return chain
        },
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
const logEventOnceMock = vi.fn(async (p: {
  dedupe_key?: string
  event_type?: string
  org_id?: string
  metadata?: Record<string, unknown>
}) => {
  const k = p.dedupe_key ?? ""
  if (chavesGravadas.has(k)) return { inserted: false }
  chavesGravadas.add(k)
  return { inserted: true }
})
const logEventMock = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (...a: unknown[]) => logEventMock(...a),
  logEventOnce: (p: {
    dedupe_key?: string
    event_type?: string
    org_id?: string
    metadata?: Record<string, unknown>
  }) => logEventOnceMock(p),
}))

/** Args que realmente interessam do envio — o resto do payload é do canal, não da rota. */
interface ArgsAlerta {
  /** Story 87-20 — era `tipo: TipoErroIA`; virou o texto do `{{1}}`, já resolvido. */
  motivo: string
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

import { MOTIVO_POR_TIPO } from "@web/lib/alerts/erro-ia"
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

function evento(
  message: string,
  created_at = "2026-08-28T09:05:41.798Z",
  org_id: string | null = null,
) {
  return { created_at, message, source: "api/webhook/whatsapp", org_id }
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
    // Story 87-20 — o texto do {{1}} continua sendo o MESMO de antes; o que mudou é
    // que quem o resolve é o cron (`MOTIVO_POR_TIPO[tipo]`), não o transporte.
    expect(argsDaChamada()).toMatchObject({ motivo: MOTIVO_POR_TIPO.credito, ocorrencias: 1 })
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
    expect(argsDaChamada()).toMatchObject({ motivo: MOTIVO_POR_TIPO.rate_limit, ocorrencias: 3 })
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Story 900-23 · AC3 — reclassificado como vigia de plataforma
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("900-23 · AC3 — agrega de todas as orgs e DIZ quais foram", () => {
  const ORG_A = "00000000-0000-0000-0000-0000000000a1"
  const ORG_B = "00000000-0000-0000-0000-0000000000b2"

  it("erros de 2 orgs distintas ⇒ UM aviso agregado, com as 2 em metadata.orgs_afetadas", async () => {
    // Antes desta AC o `select` nem trazia `org_id`: o cron lia de todas as orgs e não sabia de
    // quais. Continua sendo UM alerta (a agregação é a razão de ser do cron), mas agora nomeado.
    eventos = [
      evento(ERRO_CREDITO, "2026-08-28T09:05:00.000Z", ORG_A),
      evento(ERRO_CREDITO, "2026-08-28T09:06:00.000Z", ORG_B),
    ]

    const res = await GET(req() as never)
    const body = (await res.json()) as {
      orgsAfetadas: string[]
      porTipo: Record<string, { orgsAfetadas: string[] }>
    }

    expect(alertarMock).toHaveBeenCalledTimes(1) // UM aviso, não dois
    expect([...body.orgsAfetadas].sort()).toEqual([ORG_A, ORG_B])
    expect([...body.porTipo.credito!.orgsAfetadas].sort()).toEqual([ORG_A, ORG_B])

    const alerta = logEventOnceMock.mock.calls
      .map((c) => c[0])
      .find((p) => p.event_type === "NICOLE_HEALTH_ALERTA")!
    expect([...(alerta.metadata!.orgs_afetadas as string[])].sort()).toEqual([ORG_A, ORG_B])
  })

  it("evento sem `org_id` aparece como `desconhecida`, nunca some", async () => {
    eventos = [
      evento(ERRO_CREDITO, "2026-08-28T09:05:00.000Z", null),
      evento(ERRO_CREDITO, "2026-08-28T09:06:00.000Z", ORG_A),
    ]
    const res = await GET(req() as never)
    const body = (await res.json()) as { orgsAfetadas: string[] }
    expect([...body.orgsAfetadas].sort()).toEqual([ORG_A, "desconhecida"])
  })

  it("🔴 os dois logEventOnce do alerta gravam SEM org_id (evento de plataforma, não de tenant)", async () => {
    eventos = [
      evento(ERRO_CREDITO, "2026-08-28T09:05:00.000Z", ORG_A),
      evento(ERRO_CREDITO, "2026-08-28T09:06:00.000Z", ORG_B),
    ]
    await GET(req() as never)

    const alerta = logEventOnceMock.mock.calls
      .map((c) => c[0])
      .find((p) => p.event_type === "NICOLE_HEALTH_ALERTA")!
    expect(alerta.org_id).toBeUndefined()

    // …e o mesmo para o caminho de canal indisponível (AC14).
    logEventOnceMock.mockClear()
    waConfigRow = null
    await GET(req() as never)
    const semCanal = logEventOnceMock.mock.calls
      .map((c) => c[0])
      .find((p) => p.event_type === "NICOLE_HEALTH_SEM_CANAL")!
    expect(semCanal.org_id).toBeUndefined()
    expect([...(semCanal.metadata!.orgs_afetadas as string[])].sort()).toEqual([ORG_A, ORG_B])
  })
})

/**
 * Story 87-20 — o branch NOVO: levar "loop bot-a-bot contido" até uma pessoa, com o
 * endereço da conversa dentro do único parâmetro livre do template aprovado.
 */
describe("Story 87-20 — alerta de loop bot-a-bot (AC10/AC11)", () => {
  // Instantes SINTÉTICOS: só a ordem e a distinção importam para a rota.
  const T_BLOQUEIO = "2020-01-01T00:00:00.000Z"
  const T_MAIS_1MIN = "2020-01-01T00:01:00.000Z"
  const T_MAIS_2MIN = "2020-01-01T00:02:00.000Z"
  // UUIDs SINTÉTICOS. O repositório é público: nenhum identificador de conversa real
  // entra aqui — os rótulos são os mesmos da fixture (`CONV_INCIDENTE`/`CONV_CONTROLE`).
  const CONV_INCIDENTE = "00000000-0000-4000-8000-000000000001"
  const CONV_CONTROLE = "00000000-0000-4000-8000-000000000002"

  /**
   * Uma linha de `system_events` como o webhook a grava no bloqueio.
   *
   * QA-87-20-6 — a fixture carrega `contencao` porque o webhook a grava em TODO
   * `NICOLE_LOOP_DETECTADO` desde `574441ea` (`ResultadoDaContencao`, campo obrigatório
   * e discriminante). Uma fixture sem o campo seria um fake que NÃO reproduz o
   * escritor — e um consumidor que passasse a distinguir os dois estados ficaria
   * medindo o buraco da fixture em vez do código.
   *
   * `"ausente"` existe para o evento PRÉ-deploy, que hoje não existe em produção
   * (medido: zero `NICOLE_LOOP_DETECTADO` no banco) mas cujo tratamento tem de ser
   * fail-closed — ver o teste dedicado abaixo. É um RÓTULO e não `undefined` de
   * propósito: parâmetro com default recebe o default quando o argumento é
   * `undefined`, então `eventoDeLoop(..., undefined)` devolveria uma linha
   * `"aplicada"` e o teste mediria a fixture, não a rota. (Medido: com `undefined`
   * este teste saía verde pelo motivo errado.)
   */
  function eventoDeLoop(
    conversationId: string,
    created_at = T_BLOQUEIO,
    tipo = "encerramento",
    contencao: "aplicada" | "falhou" | "ausente" = "aplicada"
  ) {
    return {
      event_type: "NICOLE_LOOP_DETECTADO",
      created_at,
      // O mesmo par de textos do webhook (`route.ts`), para a fixture não afirmar
      // "Nicole pausada" num evento que diz que a contenção falhou.
      message:
        contencao === "aplicada"
          ? `Loop bot-a-bot contido (${tipo}) — Nicole pausada nesta conversa`
          : `Loop bot-a-bot detectado (${tipo}) — a CONTENCAO FALHOU: a Nicole segue ATIVA nesta conversa`,
      source: "api/webhook/whatsapp",
      org_id: null,
      metadata: {
        tipo,
        ocorrencias: 2,
        conversationId,
        leadId: "lead-1",
        ...(contencao === "ausente" ? {} : { contencao }),
      },
    }
  }

  it("alerta com o LINK da conversa dentro do {{1}}", async () => {
    eventos = [eventoDeLoop(CONV_INCIDENTE)]
    const body = await (await GET(req() as never)).json()

    expect(alertarMock).toHaveBeenCalledTimes(1)
    expect(argsDaChamada().motivo).toBe(
      `loop bot-a-bot detectado — https://crm.trifold.eng.br/dashboard/conversas/${CONV_INCIDENTE}`
    )
    expect(body.alertasDeLoop).toBe(1)
    expect(body.conversasEmLoop).toEqual([CONV_INCIDENTE])
  })

  it("dispara mesmo SEM nenhum erro de API de IA na janela — o branch é independente", async () => {
    eventos = [eventoDeLoop(CONV_INCIDENTE)]
    const body = await (await GET(req() as never)).json()
    // Nenhum `TipoErroIA` foi classificado: sem o branch novo, a rota teria saído no
    // `aAlertar.length === 0` e o loop nunca viraria alerta.
    expect(body.tiposAlertaveis).toEqual([])
    expect(alertarMock).toHaveBeenCalledTimes(1)
  })

  it("dois loops em conversas DIFERENTES viram dois alertas DISTINGUÍVEIS", async () => {
    eventos = [eventoDeLoop(CONV_INCIDENTE), eventoDeLoop(CONV_CONTROLE, T_MAIS_1MIN)]
    await GET(req() as never)

    expect(alertarMock).toHaveBeenCalledTimes(2)
    const motivos = [argsDaChamada(0).motivo, argsDaChamada(1).motivo]
    expect(new Set(motivos).size).toBe(2)
    expect(motivos.some((m) => m.includes(CONV_INCIDENTE))).toBe(true)
    expect(motivos.some((m) => m.includes(CONV_CONTROLE))).toBe(true)
  })

  it("agrega por conversa: 3 bloqueios da MESMA conversa = 1 alerta, com ocorrencias=3", async () => {
    eventos = [
      eventoDeLoop(CONV_INCIDENTE, T_BLOQUEIO),
      eventoDeLoop(CONV_INCIDENTE, T_MAIS_1MIN),
      eventoDeLoop(CONV_INCIDENTE, T_MAIS_2MIN),
    ]
    await GET(req() as never)
    expect(alertarMock).toHaveBeenCalledTimes(1)
    expect(argsDaChamada()).toMatchObject({
      ocorrencias: 3,
      desdeIso: T_BLOQUEIO,
    })
  })

  it("dedup por conversa+hora: a 2ª execução da mesma hora NÃO reenvia", async () => {
    eventos = [eventoDeLoop(CONV_INCIDENTE)]
    await GET(req() as never)
    expect(alertarMock).toHaveBeenCalledTimes(1)

    alertarMock.mockClear()
    const body = await (await GET(req() as never)).json()
    expect(alertarMock).not.toHaveBeenCalled()
    expect(body.dedupPulados).toBe(1)
  })

  it("a `dedupe_key` inclui a CONVERSA — duas conversas não se deduplicam entre si", async () => {
    eventos = [eventoDeLoop(CONV_INCIDENTE), eventoDeLoop(CONV_CONTROLE)]
    await GET(req() as never)
    const chaves = logEventOnceMock.mock.calls
      .map((c) => c[0].dedupe_key)
      .filter((k): k is string => typeof k === "string" && k.startsWith("nicole-loop-alerta:"))
    expect(chaves).toHaveLength(2)
    expect(chaves.some((k) => k.includes(CONV_INCIDENTE))).toBe(true)
    expect(chaves.some((k) => k.includes(CONV_CONTROLE))).toBe(true)
  })

  it("entrega que falha 100% DESFAZ o marcador — o próximo ciclo tenta de novo", async () => {
    alertarMock.mockImplementation(async () => ({ enviados: 0, falhas: 1 }))
    eventos = [eventoDeLoop(CONV_INCIDENTE)]
    const body = await (await GET(req() as never)).json()

    expect(body.entregasFalhas).toBe(1)
    expect(body.alertasDeLoop).toBe(0)
    expect(deletesCompensatorios.some((d) => d.includes(CONV_INCIDENTE))).toBe(true)
  })

  it("`?dry=1` não envia nem grava marcador, mas MOSTRA o loop no summary", async () => {
    eventos = [eventoDeLoop(CONV_INCIDENTE)]
    const body = await (await GET(req("?dry=1") as never)).json()
    expect(alertarMock).not.toHaveBeenCalled()
    expect(body.conversasEmLoop).toEqual([CONV_INCIDENTE])
    expect(body.dryRun).toBe(true)
  })

  it("evento sem `conversationId` no metadata é ignorado — alerta sem endereço não serve", async () => {
    eventos = [
      {
        event_type: "NICOLE_LOOP_DETECTADO",
        created_at: T_BLOQUEIO,
        message: "Loop bot-a-bot contido (encerramento)",
        source: "api/webhook/whatsapp",
        org_id: null,
        metadata: { tipo: "encerramento" },
      },
    ]
    const body = await (await GET(req() as never)).json()
    expect(alertarMock).not.toHaveBeenCalled()
    expect(body.conversasEmLoop).toEqual([])
  })

  /**
   * O carrasco do `.eq("event_type", …)`. Sem ele, QUALQUER evento com um
   * `conversationId` no metadata viraria alerta de loop — e o repo grava vários
   * (`NICOLE_SLOT_MISMATCH`, `NICOLE_HISTORY_TRUNCATED`, …). O alerta pararia de
   * significar "loop" e o admin aprenderia a ignorá-lo.
   */
  it("um evento de OUTRO tipo, com conversationId no metadata, NÃO vira alerta de loop", async () => {
    eventos = [
      {
        event_type: "NICOLE_SLOT_MISMATCH",
        created_at: T_BLOQUEIO,
        message: "Nicole afirmou horário diferente do autorizado",
        source: "ai/pipeline",
        org_id: null,
        metadata: { conversationId: CONV_INCIDENTE },
      },
    ]
    const body = await (await GET(req() as never)).json()
    expect(body.conversasEmLoop).toEqual([])
    expect(alertarMock).not.toHaveBeenCalled()
  })

  it("AC11 — canal indisponível não consome o dedup e registra o loop pendente", async () => {
    waConfigRow = null
    eventos = [eventoDeLoop(CONV_INCIDENTE)]
    const body = await (await GET(req() as never)).json()

    expect(body.skipped).toBe("whatsapp indisponível")
    const semCanal = logEventOnceMock.mock.calls
      .map((c) => c[0])
      .find((p) => p.event_type === "NICOLE_HEALTH_SEM_CANAL")!
    expect(semCanal.metadata!.conversas_em_loop).toEqual([CONV_INCIDENTE])
    // Nenhuma chave de dedup do loop foi gravada: o próximo ciclo tenta de novo.
    expect(
      logEventOnceMock.mock.calls.filter((c) =>
        String(c[0].dedupe_key ?? "").startsWith("nicole-loop-alerta:")
      )
    ).toHaveLength(0)
  })

  it("o branch de erro de API de IA (87-19) continua funcionando ao lado do novo", async () => {
    eventos = [evento(ERRO_CREDITO), eventoDeLoop(CONV_INCIDENTE)]
    const body = await (await GET(req() as never)).json()

    expect(body.tiposAlertaveis).toEqual(["credito"])
    expect(body.alertasDeLoop).toBe(1)
    expect(alertarMock).toHaveBeenCalledTimes(2)
    const motivos = alertarMock.mock.calls.map((c) => c[1].motivo)
    expect(motivos).toContain(MOTIVO_POR_TIPO.credito)
    expect(motivos.some((m) => m.includes(CONV_INCIDENTE))).toBe(true)
  })

  /**
   * QA-87-20-6 — o grito não tinha destinatário.
   *
   * `NICOLE_LOOP_CONTENCAO_FALHOU` sai em `level='error'`, mas o branch de erro deste
   * mesmo cron passa toda mensagem por `classificarErroIA`, que casa 8 assinaturas de
   * erro de API de IA e devolve `null` para a frase do grito — `if (!tipo) continue`,
   * descartado. E o `{{1}}` que chega ao admin era CONSTANTE: a mesma frase quer a
   * Nicole tivesse sido contida, quer a contenção tivesse falhado. A verdade existia só
   * no `metadata` do recibo, e `system_events` não tem tela (QA-87-20-2).
   *
   * Ou seja: o estado em que a máquina NÃO resolveu o problema — o único em que um
   * humano precisa ir pausar à mão — era indistinguível do estado em que ela resolveu.
   * É a mesma família do defeito que a story inteira ataca.
   */
  describe("QA-87-20-6 — o texto do admin distingue contida de NÃO contida", () => {
    it("contenção que FALHOU: o texto DIFERE do da contida e pede ação humana", async () => {
      eventos = [eventoDeLoop(CONV_INCIDENTE, T_BLOQUEIO, "encerramento", "falhou")]
      await GET(req() as never)
      const falhou = argsDaChamada().motivo

      // O MESMO mundo, mudando só a contenção: mesma conversa, mesmo instante, mesmo
      // tipo. Sem esse par, "o texto contém a palavra X" passaria com um texto
      // constante que sempre pede ação humana — o defeito espelhado.
      alertarMock.mockClear()
      chavesGravadas = new Set()
      eventos = [eventoDeLoop(CONV_INCIDENTE, T_BLOQUEIO, "encerramento", "aplicada")]
      await GET(req() as never)
      const aplicada = argsDaChamada().motivo

      expect(falhou).not.toBe(aplicada)
      // Literal, não derivado da fonte: uma régua montada a partir da constante que
      // ela testa não reprova a constante.
      expect(falhou).toContain("CONTENÇÃO FALHOU")
      expect(falhou).toContain("pause a conversa à mão")
      expect(aplicada).not.toContain("à mão")
      // O endereço não pode sumir no caminho ruim — é o caso em que ele mais importa.
      expect(falhou).toContain(CONV_INCIDENTE)
    })

    it("janela MISTA na mesma conversa: UM bloqueio não confirmado já pede ação humana", async () => {
      // Fail-closed na agregação. A pausa é por conversa, não por turno: se qualquer
      // bloqueio da janela não confirmou o `UPDATE`, o admin tem de ir conferir.
      eventos = [
        eventoDeLoop(CONV_INCIDENTE, T_BLOQUEIO, "encerramento", "aplicada"),
        eventoDeLoop(CONV_INCIDENTE, T_MAIS_1MIN, "encerramento", "falhou"),
      ]
      await GET(req() as never)

      expect(alertarMock).toHaveBeenCalledTimes(1)
      expect(argsDaChamada()).toMatchObject({ ocorrencias: 2, desdeIso: T_BLOQUEIO })
      expect(argsDaChamada().motivo).toContain("pause a conversa à mão")
    })

    it("evento SEM `contencao` no metadata não é lido como sucesso", async () => {
      // Ausência não é confirmação. `contencao` é obrigatório desde `574441ea`, então
      // um evento sem ele só pode ser pré-deploy (zero em produção) ou corrompido — e
      // em nenhum dos dois a rota tem base para afirmar que a Nicole foi pausada.
      eventos = [eventoDeLoop(CONV_INCIDENTE, T_BLOQUEIO, "encerramento", "ausente")]
      await GET(req() as never)
      expect(argsDaChamada().motivo).toContain("pause a conversa à mão")
    })
  })
})
