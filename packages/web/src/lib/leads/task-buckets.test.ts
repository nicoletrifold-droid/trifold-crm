import { describe, expect, it } from "vitest"

import {
  TASK_FILTER_LABELS,
  TASK_FILTER_VALUES,
  bucketByTaskDue,
  parseTaskFilter,
  taskBucketBoundaries,
  taskFilterLeadIds,
  type PendingTask,
} from "./task-buckets"

// Story 75-298 — fronteiras INJETADAS de propósito: o vitest não executa
// `instrumentation.ts`, logo não herda TZ=America/Sao_Paulo. Um teste que
// dependesse do relógio/fuso da máquina passaria aqui e falharia no CI.
const todayStart = new Date("2026-08-12T00:00:00.000Z")
const tomorrowStart = new Date("2026-08-13T00:00:00.000Z")
const bounds = { todayStart, tomorrowStart }

describe("parseTaskFilter", () => {
  it("aceita só os 4 valores da whitelist", () => {
    expect(parseTaskFilter("atrasadas")).toBe("atrasadas")
    expect(parseTaskFilter("para-hoje")).toBe("para-hoje")
    expect(parseTaskFilter("futuras")).toBe("futuras")
    expect(parseTaskFilter("sem-tarefas")).toBe("sem-tarefas")
  })

  it("recusa vazio, indefinido, caixa errada e lixo (inclusive tentativa de injeção)", () => {
    expect(parseTaskFilter("")).toBeNull()
    expect(parseTaskFilter(undefined)).toBeNull()
    expect(parseTaskFilter(null)).toBeNull()
    expect(parseTaskFilter("ATRASADAS")).toBeNull()
    expect(parseTaskFilter("atrasada")).toBeNull()
    expect(parseTaskFilter("atrasadas,futuras")).toBeNull()
    expect(parseTaskFilter("null")).toBeNull()
  })

  it("todo valor da whitelist tem rótulo em PT", () => {
    for (const v of TASK_FILTER_VALUES) expect(TASK_FILTER_LABELS[v]).toBeTruthy()
  })
})

describe("bucketByTaskDue", () => {
  it("(a) due_at ontem → atrasadas", () => {
    const b = bucketByTaskDue([{ lead_id: "L1", due_at: "2026-08-11T15:00:00.000Z" }], bounds)
    expect([...b.atrasadas]).toEqual(["L1"])
    expect(b.paraHoje.size).toBe(0)
    expect(b.futuras.size).toBe(0)
    expect([...b.comTarefa]).toEqual(["L1"])
  })

  it("(b) due_at hoje 23:00 → para-hoje, NUNCA atrasadas", () => {
    const b = bucketByTaskDue([{ lead_id: "L2", due_at: "2026-08-12T23:00:00.000Z" }], bounds)
    expect([...b.paraHoje]).toEqual(["L2"])
    expect(b.atrasadas.size).toBe(0)
    expect(b.futuras.size).toBe(0)
  })

  it("hoje 00:00 (fronteira inferior, inclusiva) → para-hoje", () => {
    const b = bucketByTaskDue([{ lead_id: "L3", due_at: todayStart.toISOString() }], bounds)
    expect([...b.paraHoje]).toEqual(["L3"])
    expect(b.atrasadas.size).toBe(0)
  })

  it("(c) amanhã 00:00 (fronteira superior, exclusiva) → futuras", () => {
    const b = bucketByTaskDue([{ lead_id: "L4", due_at: tomorrowStart.toISOString() }], bounds)
    expect([...b.futuras]).toEqual(["L4"])
    expect(b.paraHoje.size).toBe(0)
  })

  it("(d) due_at NULL → nenhum balde de vencimento, mas CONTA como 'tem tarefa'", () => {
    const b = bucketByTaskDue([{ lead_id: "L5", due_at: null }], bounds)
    expect(b.atrasadas.size).toBe(0)
    expect(b.paraHoje.size).toBe(0)
    expect(b.futuras.size).toBe(0)
    expect([...b.comTarefa]).toEqual(["L5"])
  })

  it("(e) lead com 2 tarefas em baldes diferentes aparece nos DOIS (RPC usa COUNT(DISTINCT) por balde)", () => {
    const b = bucketByTaskDue(
      [
        { lead_id: "L6", due_at: "2026-08-10T12:00:00.000Z" },
        { lead_id: "L6", due_at: "2026-08-20T12:00:00.000Z" },
      ],
      bounds
    )
    expect(b.atrasadas.has("L6")).toBe(true)
    expect(b.futuras.has("L6")).toBe(true)
    expect(b.paraHoje.has("L6")).toBe(false)
    expect(b.comTarefa.size).toBe(1)
  })

  it("deduplica o mesmo lead com 2 tarefas no MESMO balde", () => {
    const b = bucketByTaskDue(
      [
        { lead_id: "L7", due_at: "2026-08-10T12:00:00.000Z" },
        { lead_id: "L7", due_at: "2026-08-09T12:00:00.000Z" },
      ],
      bounds
    )
    expect(b.atrasadas.size).toBe(1)
    expect(b.comTarefa.size).toBe(1)
  })

  it("lista vazia / null / undefined → 4 conjuntos vazios (nunca explode)", () => {
    for (const input of [[], null, undefined]) {
      const b = bucketByTaskDue(input, bounds)
      expect(b.atrasadas.size + b.paraHoje.size + b.futuras.size + b.comTarefa.size).toBe(0)
    }
  })

  it("due_at inválido não vira 'futura' (guarda defensiva)", () => {
    const b = bucketByTaskDue([{ lead_id: "L8", due_at: "não é data" }], bounds)
    expect(b.futuras.size).toBe(0)
    expect(b.atrasadas.size).toBe(0)
    expect(b.paraHoje.size).toBe(0)
    // Mas continua sendo um lead COM tarefa aberta.
    expect([...b.comTarefa]).toEqual(["L8"])
  })

  it("não confunde leads distintos", () => {
    const tasks: PendingTask[] = [
      { lead_id: "A", due_at: "2026-08-01T00:00:00.000Z" },
      { lead_id: "B", due_at: "2026-08-12T09:00:00.000Z" },
      { lead_id: "C", due_at: "2026-09-01T00:00:00.000Z" },
      { lead_id: "D", due_at: null },
    ]
    const b = bucketByTaskDue(tasks, bounds)
    expect([...b.atrasadas]).toEqual(["A"])
    expect([...b.paraHoje]).toEqual(["B"])
    expect([...b.futuras]).toEqual(["C"])
    expect([...b.comTarefa].sort()).toEqual(["A", "B", "C", "D"])
  })
})

describe("taskFilterLeadIds", () => {
  const buckets = bucketByTaskDue(
    [
      { lead_id: "A", due_at: "2026-08-01T00:00:00.000Z" },
      { lead_id: "B", due_at: "2026-08-12T09:00:00.000Z" },
      { lead_id: "C", due_at: "2026-09-01T00:00:00.000Z" },
      { lead_id: "D", due_at: null },
    ],
    bounds
  )

  it("mapeia cada filtro para o balde certo", () => {
    expect([...taskFilterLeadIds(buckets, "atrasadas")!]).toEqual(["A"])
    expect([...taskFilterLeadIds(buckets, "para-hoje")!]).toEqual(["B"])
    expect([...taskFilterLeadIds(buckets, "futuras")!]).toEqual(["C"])
  })

  it("sem-tarefas devolve null — é EXCLUSÃO de comTarefa, não inclusão", () => {
    expect(taskFilterLeadIds(buckets, "sem-tarefas")).toBeNull()
    expect([...buckets.comTarefa].sort()).toEqual(["A", "B", "C", "D"])
  })
})

describe("taskBucketBoundaries", () => {
  it("todayStart = meia-noite local do `now` recebido; tomorrowStart = +1 dia", () => {
    const now = new Date(2026, 7, 12, 14, 37, 5, 123) // 12/08/2026 14:37 no fuso LOCAL
    const { todayStart: t0, tomorrowStart: t1 } = taskBucketBoundaries(now)
    expect(t0.getHours()).toBe(0)
    expect(t0.getMinutes()).toBe(0)
    expect(t0.getSeconds()).toBe(0)
    expect(t0.getMilliseconds()).toBe(0)
    expect(t0.getDate()).toBe(12)
    expect(t1.getDate()).toBe(13)
    expect(t1.getTime() - t0.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it("não muta o `now` recebido", () => {
    const now = new Date(2026, 7, 12, 14, 37)
    const snapshot = now.getTime()
    taskBucketBoundaries(now)
    expect(now.getTime()).toBe(snapshot)
  })
})
