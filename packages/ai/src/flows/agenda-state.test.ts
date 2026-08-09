/**
 * Story 87-4 — o módulo do estado de agenda, testado isolado (T1).
 *
 * Aqui não há pipeline nem banco: só a forma do objeto, a validade e os
 * filtros. O comportamento fim a fim vive em `chat/pipeline-agenda-state.test.ts`.
 */
import { describe, it, expect } from "vitest"
import {
  AGENDA_STATE_KEY,
  LEGACY_AGENDA_KEYS,
  TTL_AGENDA_STATE_HORAS,
  buildAgendaState,
  isAgendaStateExpired,
  readAgendaState,
  writeAgendaState,
  stripLegacyAgendaKeys,
  isPendencia,
  omitAgendaKeys,
  omitLegacyAgendaKeys,
  hasAgendaFact,
  type AgendaState,
} from "./agenda-state"

const ANCORA = new Date("2026-08-10T12:00:00Z")

function estado(extra: Partial<Parameters<typeof buildAgendaState>[0]> = {}): AgendaState {
  return buildAgendaState({ citacao: "pode ser sábado às 10h", now: ANCORA, fonte: "mencao", ...extra })
}

describe("buildAgendaState — âncora e validade", () => {
  it("grava a âncora do turno e deriva a validade dela (não do relógio de leitura)", () => {
    const st = estado({ dataAbsoluta: "2026-08-15", hora: 10, minuto: 0 })
    expect(st.origem).toBe("lead")
    expect(st.ancorado_em).toBe("2026-08-10T12:00:00.000Z")
    expect(st.expira_em).toBe("2026-08-12T12:00:00.000Z")
    expect(TTL_AGENDA_STATE_HORAS).toBe(48)
  })

  it("a citação é truncada — auditoria, não arquivo de conversa", () => {
    const st = estado({ citacao: "a".repeat(500) })
    expect(st.citacao.length).toBe(280)
  })

  it("os campos reservados do W1-2c NÃO são escritos por esta story", () => {
    // Eles existem no TIPO para que o executor do W1-2c passe a escrever em
    // campos que já existem, em vez de reabrir o formato. Ninguém escreve hoje.
    const st = estado()
    expect(st.ofertas_do_sistema).toBeUndefined()
    expect(st.afirmado_pela_nicole).toBeUndefined()
  })
})

describe("fonte — a distinção que as quatro chaves carregavam (revisão pós-gate)", () => {
  it("`pendencia` é o que nós perguntamos; `mencao` é texto solto", () => {
    expect(isPendencia(estado({ fonte: "pendencia" }))).toBe(true)
    expect(isPendencia(estado({ fonte: "mencao" }))).toBe(false)
    expect(isPendencia(null)).toBe(false)
  })

  it("FAIL-CLOSED: estado gravado ANTES desta revisão (sem `fonte`) é lido como `mencao`", () => {
    // Há estados em voo em produção sem o campo. Lê-los como pendência deixaria
    // uma menção antiga mover uma visita marcada — exatamente o B1. A leitura
    // conservadora é a que NÃO mexe em visita real.
    const semFonte = { ...estado(), fonte: undefined } as unknown
    const lido = readAgendaState({ [AGENDA_STATE_KEY]: semFonte }, ANCORA).state!
    expect(lido.fonte).toBe("mencao")
    expect(isPendencia(lido)).toBe(false)
  })

  it("valor inválido em `fonte` também cai em `mencao`", () => {
    const lixo = { ...estado(), fonte: "pendência" } as unknown // com acento: não é o literal
    expect(readAgendaState({ [AGENDA_STATE_KEY]: lixo }, ANCORA).state!.fonte).toBe("mencao")
  })
})

describe("isAgendaStateExpired — a fronteira do TTL", () => {
  const st = estado()
  it("47h59 vale", () => {
    expect(isAgendaStateExpired(st, new Date("2026-08-12T11:59:00Z"))).toBe(false)
  })
  it("o instante exato de expira_em ainda vale", () => {
    expect(isAgendaStateExpired(st, new Date("2026-08-12T12:00:00Z"))).toBe(false)
  })
  it("48h01 não vale", () => {
    expect(isAgendaStateExpired(st, new Date("2026-08-12T12:01:00Z"))).toBe(true)
  })
  it("validade ilegível conta como expirado — sem âncora não é estado, é lixo", () => {
    expect(isAgendaStateExpired({ ...st, expira_em: "amanhã" }, ANCORA)).toBe(true)
  })
})

describe("readAgendaState — o que NÃO é estado de agenda", () => {
  const cases: Array<[string, unknown]> = [
    ["ausente", undefined],
    ["a string crua do formato antigo", "sexta-feira às 15h"],
    ["array", []],
    ["sem citação", { origem: "lead", ancorado_em: "x", expira_em: "y" }],
    ["citação vazia", { citacao: "   ", origem: "lead", ancorado_em: "x", expira_em: "y" }],
    ["origem diferente de lead", { citacao: "oi", origem: "nicole", ancorado_em: "x", expira_em: "y" }],
    ["sem âncora", { citacao: "oi", origem: "lead" }],
  ]
  for (const [nome, raw] of cases) {
    it(`${nome} → null, sem explodir`, () => {
      expect(readAgendaState({ [AGENDA_STATE_KEY]: raw }, ANCORA).state).toBeNull()
    })
  }

  it("`data_absoluta` fora de YYYY-MM-DD é descartada (não vira parse)", () => {
    const st = { ...estado(), data_absoluta: "sábado que vem" } as unknown
    expect(readAgendaState({ [AGENDA_STATE_KEY]: st }, ANCORA).state!.data_absoluta).toBeNull()
  })

  it("expirado devolve state null E sinaliza `expired` — para o chamador apagar e logar", () => {
    const r = readAgendaState({ [AGENDA_STATE_KEY]: estado() }, new Date("2026-08-13T00:00:00Z"))
    expect(r.state).toBeNull()
    expect(r.expired).toBe(true)
  })
})

describe("writeAgendaState / stripLegacyAgendaKeys", () => {
  it("escrever null APAGA a chave (o estado morto não fica de reserva)", () => {
    const cd: Record<string, unknown> = { [AGENDA_STATE_KEY]: estado() }
    writeAgendaState(cd, null)
    expect(cd).not.toHaveProperty(AGENDA_STATE_KEY)
  })

  it("o strip devolve exatamente quais chaves morreram — é o metadata do evento da AC8", () => {
    const cd: Record<string, unknown> = {
      name: "Ana",
      visit_availability: "sexta às 15h",
      visit_pending_hour: 15,
    }
    expect(stripLegacyAgendaKeys(cd)).toEqual(["visit_availability", "visit_pending_hour"])
    expect(cd).toEqual({ name: "Ana" })
  })

  it("sem resíduo, o strip não mexe em nada e devolve vazio", () => {
    const cd: Record<string, unknown> = { name: "Ana" }
    expect(stripLegacyAgendaKeys(cd)).toEqual([])
    expect(cd).toEqual({ name: "Ana" })
  })

  it("as quatro chaves legadas são exatamente estas", () => {
    expect([...LEGACY_AGENDA_KEYS]).toEqual([
      "visit_availability", "visit_pending_date", "visit_pending_hour", "visit_pending_minute",
    ])
  })
})

describe("omitAgendaKeys / omitLegacyAgendaKeys — os filtros do cron (AC8-b)", () => {
  const bruto = {
    name: "Ana", bedrooms: 2, profissao: "professora",
    visit_availability: "sábado", visit_pending_date: "2026-08-15",
    [AGENDA_STATE_KEY]: estado(),
  }

  it("omitAgendaKeys tira legado E agenda_state, sem mutar a entrada", () => {
    const out = omitAgendaKeys(bruto)
    expect(out).toEqual({ name: "Ana", bedrooms: 2, profissao: "professora" })
    expect(bruto).toHaveProperty(AGENDA_STATE_KEY) // não mutou
  })

  it("omitLegacyAgendaKeys PRESERVA o agenda_state vivo", () => {
    const out = omitLegacyAgendaKeys(bruto)
    expect(out).toHaveProperty(AGENDA_STATE_KEY)
    expect(out).not.toHaveProperty("visit_availability")
  })
})

describe("hasAgendaFact — o adaptador do peso 20 (AC6)", () => {
  it("formato novo conta", () => {
    expect(hasAgendaFact({ [AGENDA_STATE_KEY]: estado() })).toBe(true)
  })
  it("formato antigo ainda conta enquanto não for descartado", () => {
    expect(hasAgendaFact({ visit_availability: "sexta às 15h" })).toBe(true)
    expect(hasAgendaFact({ visit_availability: true })).toBe(true)
  })
  it("vazio não conta", () => {
    expect(hasAgendaFact({})).toBe(false)
    expect(hasAgendaFact({ visit_availability: "" })).toBe(false)
    expect(hasAgendaFact({ visit_availability: null })).toBe(false)
  })
  it("objeto malformado no lugar do estado não conta (não é estado, é lixo)", () => {
    expect(hasAgendaFact({ [AGENDA_STATE_KEY]: { citacao: "oi" } })).toBe(false)
  })
})
