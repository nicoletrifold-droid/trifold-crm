/**
 * Story 87-3 — testes da reconciliação fala × banco.
 *
 * Cada teste aqui existe por um modo de falha MEDIDO em produção, não por
 * simetria de cobertura. Os que carregam a marca `VERMELHO:` no comentário
 * documentam qual mutação da implementação os faz falhar — e o vermelho
 * correspondente está colado no Dev Agent Record da story. Um teste de
 * instrumento de medição que não prova o que quebra quando o instrumento é
 * desmontado não prova nada.
 */
import { describe, it, expect } from "vitest"
import {
  classificarFala,
  reconciliarAgenda,
  parseTimestamptz,
  ehCompromissoDeLigacao,
  formatarBrt,
  JANELA_MESMO_TURNO_MIN,
  JANELA_CLASSIFICACAO_MIN,
  type AppointmentDoLead,
} from "./agenda-reconcile"
import { createFakeSupabase } from "../chat/__fixtures__/fake-supabase"
import type { SupabaseClient } from "@supabase/supabase-js"

const iso = (s: string) => new Date(s)

function appt(over: Partial<AppointmentDoLead> & { id: string }): AppointmentDoLead {
  return {
    scheduled_at: iso("2026-08-01T13:00:00.000Z"),
    created_at: iso("2026-08-01T00:00:00.000Z"),
    created_by: "nicole",
    status: "scheduled",
    ...over,
  }
}

// ---------------------------------------------------------------------------
// AC2 — a âncora é o instante da fala, nunca o relógio da rodada
// ---------------------------------------------------------------------------

describe("AC2 — âncora temporal", () => {
  const FALA_CELIA = "Perfeito! Agendei sua visita para este sábado às 9h."

  it("resolve 'este sábado' contra faladoEm, não contra o relógio de hoje", () => {
    // Fala real da Célia: 28/06 13:37 BRT (domingo) → sábado seguinte = 04/07.
    const celia = classificarFala({
      falaId: "m-celia",
      conteudo: FALA_CELIA,
      faladoEm: iso("2026-06-28T16:37:00.000Z"),
      appointmentsDoLead: [],
    })
    expect(celia.afirmou?.toISOString()).toBe("2026-07-04T12:00:00.000Z") // 04/07 09:00 BRT

    // A MESMA fala, dita em 07/08 (sexta) → sábado seguinte = 08/08.
    const hoje = classificarFala({
      falaId: "m-hoje",
      conteudo: FALA_CELIA,
      faladoEm: iso("2026-08-07T13:00:00.000Z"),
      appointmentsDoLead: [],
    })
    expect(hoje.afirmou?.toISOString()).toBe("2026-08-08T12:00:00.000Z") // 08/08 09:00 BRT

    // VERMELHO: com `now = new Date()` dentro de classificarFala, as duas falas
    // resolvem para o MESMO sábado e a primeira asserção falha. 25 dos 30
    // disparos de 60 dias mudam de valor — 83% do baseline.
    expect(celia.afirmou?.toISOString()).not.toBe(hoje.afirmou?.toISOString())
  })

  it("data com mês escrito não salta de ano quando ancorada na fala", () => {
    // Ailton, 31/07 01:17 UTC. Com o relógio de hoje, "1º de agosto" já passou no
    // ano e o parseDay joga para 2027 — o erro de âncora tem DOIS sinais.
    const r = classificarFala({
      falaId: "m-ailton",
      conteudo: "Sua visita está confirmada para sábado, 1º de agosto, às 9h.",
      faladoEm: iso("2026-07-31T01:17:00.000Z"),
      appointmentsDoLead: [],
    })
    expect(r.afirmou?.toISOString()).toBe("2026-08-01T12:00:00.000Z")
    expect(r.afirmou?.getUTCFullYear()).toBe(2026)
  })
})

// ---------------------------------------------------------------------------
// AC2-b — Invalid Date é falha explícita, nunca sem_lastro
// ---------------------------------------------------------------------------

describe("AC2-b — timestamptz cru e Invalid Date", () => {
  it("parseTimestamptz normaliza as duas grafias que o Postgres devolve", () => {
    // Forma de texto do psql (espaço + offset de 2 dígitos).
    expect(parseTimestamptz("2026-06-28 13:37:40.123+00")?.toISOString()).toBe(
      "2026-06-28T13:37:40.123Z"
    )
    // Forma ISO-ish com offset de 2 dígitos — esta É Invalid Date no `new Date()`
    // do V8 (medido, Node 25): o `T` manda o parser pelo caminho ISO estrito, onde
    // `+00` não é offset legal. É o furo que a AC2-b existe para fechar.
    expect(Number.isFinite(new Date("2026-06-28T13:37:40.123+00").getTime())).toBe(false)
    expect(parseTimestamptz("2026-06-28T13:37:40.123+00")?.toISOString()).toBe(
      "2026-06-28T13:37:40.123Z"
    )
    // E a forma que o PostgREST devolve de fato.
    expect(parseTimestamptz("2026-06-28T13:37:40.123+00:00")?.toISOString()).toBe(
      "2026-06-28T13:37:40.123Z"
    )
  })

  it("faladoEm não-finito vira descarte data_invalida — nunca sem_lastro", () => {
    const cru = "2026-06-28T13:37:40.123+00" // string CRUA, sem normalizar
    const faladoEm = new Date(cru)
    expect(Number.isFinite(faladoEm.getTime())).toBe(false)

    const r = classificarFala({
      falaId: "m-invalida",
      conteudo: "Perfeito! Agendei sua visita para este sábado às 9h.",
      faladoEm,
      appointmentsDoLead: [],
    })

    // VERMELHO: sem a guarda `ehDataValida(faladoEm)`, a detectAffirmedSlot
    // devolve um Date INVÁLIDO (não null), `afirmou !== null` é true, toda
    // distância vira NaN, a fala cai em `sem_lastro` e o job publica
    // lastro_pct: 0 com a AC1 e a AC2-(ii) VERDES. 0% é perfeitamente estável.
    expect(r.descarte).toBe("data_invalida")
    expect(r.balde).toBeNull()
    expect(r.balde).not.toBe("sem_lastro")
    expect(r.disparou).toBe(true) // conta no denominador — o contador tem de aparecer
  })

  it("afirmou nunca carrega NaN adiante", () => {
    const r = classificarFala({
      falaId: "m-nan",
      conteudo: "Te espero sábado às 9h.",
      faladoEm: new Date(NaN),
      appointmentsDoLead: [],
    })
    expect(r.afirmou).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC3-(i-b) — a PRECEDÊNCIA dos baldes é AC, não detalhe de implementação
// ---------------------------------------------------------------------------

describe("AC3-(i-b) — precedência dos baldes", () => {
  // Wilson (medido): appointment `created_by='nicole'` inserido 0,16 s ANTES de a
  // fala ser persistida em `messages`. Vale para os 6 appointments da Nicole do
  // projeto (Δ de 0,09 s a 0,87 s) — `created_at < faladoEm` é VERDADE para todo
  // candidato a lastro.
  const WILSON = {
    falaId: "m-wilson",
    conteudo: "Perfeito! Sua visita está agendada para amanhã às 10h.",
    faladoEm: iso("2026-07-15T18:12:22.656Z"),
    appointmentsDoLead: [
      appt({
        id: "a-wilson",
        scheduled_at: iso("2026-07-16T13:00:00.000Z"), // 16/07 10:00 BRT
        created_at: iso("2026-07-15T18:12:22.497Z"), // 0,159 s ANTES da fala
        created_by: "nicole",
      }),
    ],
  }

  it("com_lastro é alcançável: o INSERT 0,16 s ANTES da fala é o MESMO turno", () => {
    const r = classificarFala(WILSON)
    expect(r.balde).toBe("com_lastro")
    expect(r.appointmentId).toBe("a-wilson")
    expect(r.divergenciaMin).toBe(0)
  })

  it("VERMELHO: avaliando lembrete primeiro, o mesmo caso vira lembrete", () => {
    // Este é o vermelho mais importante da story: com `lembrete` testado antes,
    // `com_lastro` fica VAZIO POR CONSTRUÇÃO e o instrumento publica 0% para
    // sempre — com AC1, AC2, AC2-b e AC4 todas verdes. Não há nada anômalo para
    // alguém estranhar: o JSON sai bem formado, com 30 disparos e um zero.
    const r = classificarFala({ ...WILSON, ordemBaldes: "lembrete_primeiro" })
    expect(r.balde).toBe("lembrete")
    expect(r.balde).not.toBe("com_lastro")
  })

  it("appointment da Nicole criado 3 dias antes é lembrete, não lastro", () => {
    // A janela é BILATERAL e CURTA (±15 min), não "qualquer coisa criada antes".
    const r = classificarFala({
      ...WILSON,
      appointmentsDoLead: [
        appt({
          id: "a-velho",
          scheduled_at: iso("2026-07-16T13:00:00.000Z"),
          created_at: iso("2026-07-12T18:12:22.000Z"), // 3 dias antes da fala
          created_by: "nicole",
        }),
      ],
    })
    // VERMELHO: removendo a janela `JANELA_MESMO_TURNO_MIN` da regra de
    // com_lastro, este caso vira `com_lastro` e infla o lastro com lembretes.
    expect(r.balde).toBe("lembrete")
    expect(JANELA_MESMO_TURNO_MIN).toBe(15)
  })

  it("o Δ real máximo medido (12,8 min do Ailton) cabe na janela de 15 min", () => {
    const r = classificarFala({
      falaId: "m-ailton-corretiva",
      conteudo: "Corrigindo: sua visita é sábado, 1º de agosto, às 10h.",
      faladoEm: iso("2026-07-31T01:18:20.000Z"),
      appointmentsDoLead: [
        appt({
          id: "a-ailton",
          scheduled_at: iso("2026-08-01T13:00:00.000Z"), // 01/08 10:00 BRT
          created_at: iso("2026-07-31T01:05:32.367Z"), // 12,8 min antes
          created_by: "nicole",
        }),
      ],
    })
    expect(r.balde).toBe("com_lastro")
  })
})

// ---------------------------------------------------------------------------
// AC1-a — o Ailton não pode ser engolido: DUAS janelas
// ---------------------------------------------------------------------------

describe("AC1-a — as duas janelas (classificação ±30 min · relatório ±24 h)", () => {
  it("appointment a 60 min continua sem_lastro, com divergencia_min = 60", () => {
    const r = classificarFala({
      falaId: "m-ailton-0117",
      conteudo: "Sua visita está confirmada para sábado, 1º de agosto, às 9h.",
      faladoEm: iso("2026-07-31T01:17:00.000Z"),
      appointmentsDoLead: [
        appt({
          id: "a-ailton",
          scheduled_at: iso("2026-08-01T13:00:00.000Z"), // 10:00 BRT — ela afirmou 9h
          created_at: iso("2026-07-31T01:05:32.367Z"),
          created_by: "nicole",
        }),
      ],
    })

    // O balde NÃO pode mudar por causa da janela de relatório. Uma janela de
    // classificação frouxa (±60 min, "existe appointment por perto") reproduz a
    // cegueira da detectSlotMismatch com mais código.
    expect(r.balde).toBe("sem_lastro")
    expect(r.appointmentId).toBeNull()
    // …e a linha do relatório ainda assim diz de quanto foi o erro.
    expect(r.divergenciaMin).toBe(60)
    expect(r.appointmentIdProximo).toBe("a-ailton")
    expect(JANELA_CLASSIFICACAO_MIN).toBe(30)
  })

  it("appointment a mais de 24 h não preenche divergencia_min", () => {
    const r = classificarFala({
      falaId: "m-longe",
      conteudo: "Te espero sábado, 1º de agosto, às 9h.",
      faladoEm: iso("2026-07-31T01:17:00.000Z"),
      appointmentsDoLead: [
        appt({ id: "a-longe", scheduled_at: iso("2026-08-05T13:00:00.000Z") }),
      ],
    })
    expect(r.balde).toBe("sem_lastro")
    expect(r.divergenciaMin).toBeNull()
    expect(r.appointmentIdProximo).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC1-b — a Silvana NÃO pode aparecer, e o mecanismo é testado
// ---------------------------------------------------------------------------

describe("AC1-b — discriminador visita × ligação", () => {
  const SILVANA = {
    falaId: "m-silvana",
    conteudo: "Combinado! Segunda-feira às 9h o corretor te liga.",
    faladoEm: iso("2026-07-25T02:41:00.000Z"), // 24/07 23:41 BRT
    appointmentsDoLead: [] as AppointmentDoLead[],
  }

  it("a fala da Silvana é descartada como ligação e não classifica", () => {
    const r = classificarFala(SILVANA)
    // VERMELHO: removendo PADROES_LIGACAO do módulo, este mesmo teste devolve
    // `balde: "sem_lastro"` — alerta nomeado, no primeiro dia de operação, sobre
    // o ÚNICO caso que a AC1-b promete excluir. Ela pediu ligação, a ligação
    // aconteceu (lead_tasks action_type='ligacao', completed_at 27/07 09:39).
    expect(r.descarte).toBe("ligacao")
    expect(r.balde).toBeNull()
    expect(r.balde).not.toBe("sem_lastro")
    // A detectAffirmedSlot CONTINUA disparando nela — o OUT da story está de pé.
    // Quem descarta é o módulo, não a função compartilhada.
    expect(r.afirmou).not.toBeNull()
    expect(r.disparou).toBe(true)
  })

  it("precedência: ligação + visita na mesma frase NÃO é descartada", () => {
    const r = classificarFala({
      falaId: "m-precedencia",
      conteudo: "Te ligo para confirmar a visita de sábado às 10h.",
      faladoEm: iso("2026-07-15T18:00:00.000Z"),
      appointmentsDoLead: [],
    })
    // Sem esta precedência, um compromisso REAL de visita sumiria do relatório.
    expect(r.descarte).toBeNull()
    expect(r.balde).toBe("sem_lastro")
  })

  it("ehCompromissoDeLigacao cobre as variações escritas na story", () => {
    expect(ehCompromissoDeLigacao("o corretor te liga amanhã às 9h")).toBe(true)
    expect(ehCompromissoDeLigacao("o corretor vai te ligar segunda às 9h")).toBe(true)
    expect(ehCompromissoDeLigacao("vou te ligar amanhã às 10h")).toBe(true)
    expect(ehCompromissoDeLigacao("te ligo amanhã às 10h")).toBe(true)
    expect(ehCompromissoDeLigacao("faremos uma ligação amanhã às 10h")).toBe(true)
    expect(ehCompromissoDeLigacao("te ligamos amanhã às 10h")).toBe(true)
    expect(ehCompromissoDeLigacao("te retorno por telefone amanhã às 10h")).toBe(true)
    expect(ehCompromissoDeLigacao("entro em contato por telefone amanhã às 10h")).toBe(true)
    // Precedência de visita ganha sempre.
    expect(ehCompromissoDeLigacao("te ligo para confirmar a visita de sábado")).toBe(false)
    expect(ehCompromissoDeLigacao("te ligo, e te espero no stand às 10h")).toBe(false)
    // Fala normal de agenda não é engolida pela lista.
    expect(ehCompromissoDeLigacao("Sua visita está agendada para amanhã às 10h")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC3-(iii) e AC3-(iv) — o par de filtros e o balde `lembrete`
// ---------------------------------------------------------------------------

describe("AC3-(iii) — o par de filtros do com_lastro", () => {
  it("admin criando 3 h DEPOIS da fala é reparo_humano, não lastro", () => {
    // Valnira (medido): fala 04/08 00:09 UTC, admin criou 04/08 11:21.
    const r = classificarFala({
      falaId: "m-valnira",
      conteudo: "A quinta-feira às 10h está confirmada.",
      faladoEm: iso("2026-08-04T00:09:00.000Z"),
      appointmentsDoLead: [
        appt({
          id: "a-valnira",
          scheduled_at: iso("2026-08-06T13:00:00.000Z"), // 06/08 10:00 BRT
          created_at: iso("2026-08-04T11:21:00.000Z"), // 11 h DEPOIS da fala
          created_by: "admin",
        }),
      ],
    })
    // VERMELHO: com a regra ingênua ("existe appointment perto do horário
    // afirmado"), este caso — e Sueli e Maria Oliveira junto — viram com_lastro,
    // e os TRÊS incidentes que motivaram os dois epics contariam como sucesso.
    expect(r.balde).toBe("reparo_humano")
    expect(r.appointmentId).toBe("a-valnira")
    expect(r.appointmentStatus).toBe("scheduled")
  })

  it("VERMELHO do filtro de AUTOR: broker no mesmo turno é reparo, não lastro", () => {
    // Isola o filtro `created_by='nicole'`: sem ele, este caso (humano criando
    // 1 min depois, dentro da janela de 15 min) vira com_lastro.
    const r = classificarFala({
      falaId: "m-broker-turno",
      conteudo: "Perfeito! Sua visita está agendada para amanhã às 10h.",
      faladoEm: iso("2026-07-15T18:12:22.656Z"),
      appointmentsDoLead: [
        appt({
          id: "a-broker",
          scheduled_at: iso("2026-07-16T13:00:00.000Z"),
          created_at: iso("2026-07-15T18:13:22.000Z"), // 1 min DEPOIS, mas humano
          created_by: "broker",
        }),
      ],
    })
    expect(r.balde).toBe("reparo_humano")
    expect(r.balde).not.toBe("com_lastro")
  })

  it("cancelled e no_show CONTAM — o status vai na linha, não na régua", () => {
    // 34 das 63 appointments do período são no_show/cancelled. Excluí-las
    // derrubaria Helena, Miriam, Andréia, André e Valnira — que têm appointment
    // no horário EXATO — para sem_lastro, inflando o alarme com casos que
    // funcionaram. A pergunta da métrica é "quando ela falou, existia a linha?".
    for (const status of ["cancelled", "no_show", "completed", "confirmed"]) {
      const r = classificarFala({
        falaId: `m-status-${status}`,
        conteudo: "Perfeito! Sua visita está agendada para amanhã às 10h.",
        faladoEm: iso("2026-07-15T18:12:22.656Z"),
        appointmentsDoLead: [
          appt({
            id: `a-${status}`,
            scheduled_at: iso("2026-07-16T13:00:00.000Z"),
            created_at: iso("2026-07-15T18:12:22.497Z"),
            created_by: "nicole",
            status,
          }),
        ],
      })
      expect(r.balde).toBe("com_lastro")
      expect(r.appointmentStatus).toBe(status)
    }
  })
})

describe("AC3-(iv) — o balde lembrete", () => {
  it("Edicleia: appointment do corretor criado 19 min ANTES da fala é lembrete", () => {
    // Medido: fala 06/08 18:32 "sua visita já está marcada para amanhã, às 15h";
    // appointment broker criado 06/08 18:13. NINGUÉM CONSERTOU NADA — é lembrete
    // de visita marcada no fluxo normal, o sistema FUNCIONANDO.
    const r = classificarFala({
      falaId: "m-edicleia",
      conteudo: "Oi Edicleia! Sua visita já está marcada para amanhã, às 15h.",
      faladoEm: iso("2026-08-06T21:32:00.000Z"), // 18:32 BRT
      appointmentsDoLead: [
        appt({
          id: "a-edicleia",
          scheduled_at: iso("2026-08-07T18:00:00.000Z"), // 07/08 15:00 BRT
          created_at: iso("2026-08-06T21:13:00.000Z"), // 19 min ANTES da fala
          created_by: "broker",
        }),
      ],
    })
    // VERMELHO: removendo o balde, este caso vira `reparo_humano` ("um humano
    // leu a conversa e consertou. NÃO é lastro"), ENTRA no denominador e derruba
    // o lastro_pct. É viés na direção da decisão que a métrica alimenta — e um
    // lastro subcontado ENCOLHE a v1 do Epic 88, que é falha silenciosa.
    expect(r.balde).toBe("lembrete")
    expect(r.appointmentId).toBe("a-edicleia")
  })
})

// ---------------------------------------------------------------------------
// Integração com o harness (AC3-ii, AC4-iii/iv, AC5)
// ---------------------------------------------------------------------------

const ORG = "org-1"

function seedBase() {
  return {
    leads: [
      { id: "lead-ailton", name: "Ailton", org_id: ORG },
      { id: "lead-celia", name: "Célia", org_id: ORG },
      { id: "lead-edicleia", name: "Edicleia", org_id: ORG },
      { id: "lead-silvana", name: "Silvana", org_id: ORG },
    ],
    conversations: [
      { id: "c-ailton", lead_id: "lead-ailton", org_id: ORG },
      { id: "c-celia", lead_id: "lead-celia", org_id: ORG },
      { id: "c-edicleia", lead_id: "lead-edicleia", org_id: ORG },
      { id: "c-silvana", lead_id: "lead-silvana", org_id: ORG },
    ],
    appointments: [
      {
        id: "a-ailton",
        lead_id: "lead-ailton",
        org_id: ORG,
        scheduled_at: "2026-08-01T13:00:00.000Z",
        created_at: "2026-07-31T01:05:32.367Z",
        created_by: "nicole",
        status: "scheduled",
      },
      {
        id: "a-edicleia",
        lead_id: "lead-edicleia",
        org_id: ORG,
        scheduled_at: "2026-08-07T18:00:00.000Z",
        created_at: "2026-08-06T21:13:00.000Z",
        created_by: "broker",
        status: "scheduled",
      },
    ],
    messages: [
      // Ailton — as duas falas de 31/07, um minuto uma da outra.
      {
        id: "m-ailton-0117",
        conversation_id: "c-ailton",
        role: "assistant",
        content: "Sua visita está confirmada para sábado, 1º de agosto, às 9h.",
        metadata: {},
        created_at: "2026-07-31T01:17:00.000Z",
      },
      {
        id: "m-ailton-0118",
        conversation_id: "c-ailton",
        role: "assistant",
        content: "Corrigindo: sua visita é sábado, 1º de agosto, às 10h.",
        metadata: {},
        created_at: "2026-07-31T01:18:20.000Z",
      },
      // Célia — zero appointments, até hoje.
      {
        id: "m-celia",
        conversation_id: "c-celia",
        role: "assistant",
        content: "Perfeito! Agendei sua visita para este sábado às 9h.",
        metadata: {},
        created_at: "2026-06-28T16:37:00.000Z",
      },
      // Edicleia — lembrete.
      {
        id: "m-edicleia",
        conversation_id: "c-edicleia",
        role: "assistant",
        content: "Oi Edicleia! Sua visita já está marcada para amanhã, às 15h.",
        metadata: {},
        created_at: "2026-08-06T21:32:00.000Z",
      },
      // Silvana — ligação, descartada.
      {
        id: "m-silvana",
        conversation_id: "c-silvana",
        role: "assistant",
        content: "Combinado! Segunda-feira às 9h o corretor te liga.",
        metadata: {},
        created_at: "2026-07-25T02:41:00.000Z",
      },
      // Fala do corretor gravada como assistant (metadata.is_transition).
      {
        id: "m-transicao",
        conversation_id: "c-celia",
        role: "assistant",
        content: "Oi! Sou o Marcos. Te espero amanhã às 16h no stand.",
        metadata: { is_transition: true, broker_id: "u-1" },
        created_at: "2026-07-02T14:00:00.000Z",
      },
      // Fala do CORRETOR — role='broker' não entra na régua.
      {
        id: "m-broker",
        conversation_id: "c-celia",
        role: "broker",
        content: "Te espero amanhã às 17h.",
        metadata: {},
        created_at: "2026-07-03T14:00:00.000Z",
      },
      // Fala sem afirmação de slot — não é disparo.
      {
        id: "m-neutra",
        conversation_id: "c-celia",
        role: "assistant",
        content: "Oi! Que bom te ver por aqui. Posso te ajudar?",
        metadata: {},
        created_at: "2026-07-04T14:00:00.000Z",
      },
    ],
  }
}

async function rodar() {
  const fake = createFakeSupabase(seedBase())
  const rel = await reconciliarAgenda(fake as unknown as SupabaseClient, {
    desde: iso("2026-06-10T00:00:00.000Z"),
    ate: iso("2026-08-09T00:00:00.000Z"),
    orgId: ORG,
  })
  return { fake, rel }
}

describe("reconciliarAgenda — relatório", () => {
  it("AC3-ii — unidade declarada e o denominador fecha a identidade", async () => {
    const { rel } = await rodar()
    expect(rel.unidade).toBe("fala")
    const somaDescartes =
      rel.descartes.ligacao + rel.descartes.transicao_humana + rel.descartes.data_invalida
    // Se `lembrete` entrar no denominador, esta asserção fica vermelha.
    expect(rel.denominador).toBe(rel.total_disparos - somaDescartes - rel.lembrete)
    expect(rel.denominador).toBe(rel.com_lastro + rel.reparo_humano + rel.sem_lastro)
  })

  it("classifica os quatro baldes e conta os descartes", async () => {
    const { rel } = await rodar()
    const balde = (id: string) => rel.linhas.find((l) => l.message_id === id)?.balde
    const descarte = (id: string) => rel.linhas.find((l) => l.message_id === id)?.descarte

    expect(balde("m-ailton-0117")).toBe("sem_lastro")
    expect(balde("m-ailton-0118")).toBe("com_lastro")
    expect(balde("m-celia")).toBe("sem_lastro")
    expect(balde("m-edicleia")).toBe("lembrete")
    expect(descarte("m-silvana")).toBe("ligacao")
    expect(descarte("m-transicao")).toBe("transicao_humana")

    expect(rel.descartes.ligacao).toBe(1)
    expect(rel.descartes.transicao_humana).toBe(1)
    expect(rel.descartes.data_invalida).toBe(0)
    expect(rel.lembrete).toBe(1)

    // `role='broker'` e fala sem afirmação não entram no denominador.
    expect(rel.linhas.some((l) => l.message_id === "m-broker")).toBe(false)
    expect(rel.linhas.some((l) => l.message_id === "m-neutra")).toBe(false)
  })

  it("AC3-(i-b)(c) — publica o número nas DUAS leituras, lado a lado", async () => {
    const { rel } = await rodar()
    expect(rel.sensibilidade.ordem_normativa.lastro_pct).toBe(rel.lastro_pct)
    // Com `lembrete` primeiro, o com_lastro do Ailton é engolido: o INSERT dele
    // é 12,8 min ANTERIOR à fala corretiva. A diferença entre os dois números é
    // o tamanho da armadilha, e ela fica publicada em vez de virar uma pergunta
    // que ninguém faz.
    expect(rel.sensibilidade.lembrete_primeiro.com_lastro).toBe(0)
    expect(rel.sensibilidade.lembrete_primeiro.lastro_pct).toBe(0)
    expect(rel.sensibilidade.ordem_normativa.com_lastro).toBe(1)
    expect(rel.lastro_pct).toBeGreaterThan(0)
  })

  it("AC3-v — o status do appointment aparece por linha", async () => {
    const { rel } = await rodar()
    expect(rel.linhas.find((l) => l.message_id === "m-ailton-0118")?.status).toBe("scheduled")
    expect(rel.linhas.find((l) => l.message_id === "m-edicleia")?.status).toBe("scheduled")
  })

  it("AC1 — a linha traz nome, ids, BRT, trecho e horário afirmado", async () => {
    const { rel } = await rodar()
    const celia = rel.linhas.find((l) => l.message_id === "m-celia")!
    expect(celia.lead_nome).toBe("Célia")
    expect(celia.lead_id).toBe("lead-celia")
    expect(celia.conversation_id).toBe("c-celia")
    expect(celia.falado_em_brt).toBe("2026-06-28 13:37")
    expect(celia.afirmado_para_brt).toBe("2026-07-04 09:00")
    expect(celia.trecho).toContain("este sábado às 9h")
  })
})

describe("AC4 — o alerta tem unidade lead+dia e não se contradiz", () => {
  it("(iii) ZERO alertas para o Ailton — a fala corretiva suprime a anterior", async () => {
    const { rel } = await rodar()
    // VERMELHO: sem a supressão, o time recebe "o Ailton está sem lastro" ao lado
    // de "o Ailton tem lastro" no mesmo push, e para de ler no terceiro dia.
    expect(rel.alertas.filter((a) => a.lead_id === "lead-ailton")).toHaveLength(0)
  })

  it("(iv) as DUAS linhas continuam no relatório e no denominador", async () => {
    const { rel } = await rodar()
    const suprimida = rel.linhas.find((l) => l.message_id === "m-ailton-0117")!
    expect(suprimida.balde).toBe("sem_lastro")
    expect(suprimida.alerta_suprimido).toBe(true)
    expect(suprimida.suprimido_por_message_id).toBe("m-ailton-0118")
    // Suprimir a LINHA maquiaria o lastro_pct para cima — o erro simétrico ao
    // que a AC3 combate.
    expect(rel.sem_lastro).toBeGreaterThanOrEqual(1)
  })

  it("um alerta por lead+dia, e ele nomeia o lead", async () => {
    const { rel } = await rodar()
    const celia = rel.alertas.filter((a) => a.lead_id === "lead-celia")
    expect(celia).toHaveLength(1)
    expect(celia[0]!.lead_nome).toBe("Célia")
    expect(celia[0]!.afirmado_para_brt).toBe("2026-07-04 09:00")
    // A Silvana NÃO aparece — ela pediu ligação, e a ligação aconteceu.
    expect(rel.alertas.some((a) => a.lead_id === "lead-silvana")).toBe(false)
  })
})

describe("AC5 — read-only, provado", () => {
  it("a reconciliação só emite select — nenhum insert/update", async () => {
    const { fake } = await rodar()
    expect(fake.calls.length).toBeGreaterThan(0)
    // Allowlist: só `select:` é permitido. Qualquer insert/update em
    // appointments, leads, conversations, conversation_state ou messages
    // quebra aqui.
    const proibidas = fake.calls.filter((c) => !c.startsWith("select:"))
    expect(proibidas).toEqual([])
  })
})

describe("formatarBrt", () => {
  it("reporta em BRT (UTC-3 fixo), que é a convenção do relatório", () => {
    expect(formatarBrt(iso("2026-06-24T00:11:00.000Z"))).toBe("2026-06-23 21:11")
  })
})
