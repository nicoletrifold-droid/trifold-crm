// Story 78-13 — Testes das funções puras de detecção de falha de coleta persistente
// (sem I/O, sem mock de Supabase). Cobre AC1-AC3 e AC9 no nível de lógica pura:
//   - 3/3 dias com erro → detectado; 2/3 → não; 0 linhas → não;
//   - múltiplos service_id misturados no mesmo array → só o(s) correto(s) no Set;
//   - datas fora dos dias-alvo são ignoradas (defensivo);
//   - alinhamento temporal: diasAlvo = [hoje-1, hoje-2, hoje-3], nunca inclui "hoje" (off-by-one).

import { describe, it, expect } from "vitest"
import {
  CONSECUTIVE_ERROR_THRESHOLD_DAYS,
  subtrairDias,
  diasAlvoConsecutivos,
  detectarFalhaConsecutiva,
  formatDateBr,
  type SnapshotErrorRow,
} from "./collection-health"
import { type SaoPauloDate } from "./reminder-schedule"

const hoje: SaoPauloDate = { y: 2026, m: 7, d: 13 }

describe("subtrairDias — aritmética de calendário via UTC", () => {
  it("subtrai dentro do mês", () => {
    expect(subtrairDias(hoje, 3)).toEqual({ y: 2026, m: 7, d: 10 })
  })
  it("atravessa a virada de mês", () => {
    expect(subtrairDias({ y: 2026, m: 7, d: 2 }, 3)).toEqual({ y: 2026, m: 6, d: 29 })
  })
  it("atravessa a virada de ano", () => {
    expect(subtrairDias({ y: 2026, m: 1, d: 2 }, 3)).toEqual({ y: 2025, m: 12, d: 30 })
  })
})

describe("diasAlvoConsecutivos — janela [hoje-1, hoje-2, hoje-3] (alinhamento temporal)", () => {
  it("retorna os 3 dias anteriores a hoje, NÃO inclui hoje (evita off-by-one)", () => {
    expect(diasAlvoConsecutivos(hoje)).toEqual(["2026-07-12", "2026-07-11", "2026-07-10"])
  })
  it("usa o threshold padrão de 3 dias", () => {
    expect(diasAlvoConsecutivos(hoje)).toHaveLength(CONSECUTIVE_ERROR_THRESHOLD_DAYS)
  })
  it("respeita um threshold customizado (parametrizável para o futuro)", () => {
    expect(diasAlvoConsecutivos(hoje, 2)).toEqual(["2026-07-12", "2026-07-11"])
  })
})

describe("detectarFalhaConsecutiva — por serviço, não global", () => {
  const diasAlvo = diasAlvoConsecutivos(hoje) // ["2026-07-12","2026-07-11","2026-07-10"]

  it("3/3 dias com erro → serviço detectado (AC1)", () => {
    const rows: SnapshotErrorRow[] = [
      { service_id: "svc-a", snapshot_date: "2026-07-12" },
      { service_id: "svc-a", snapshot_date: "2026-07-11" },
      { service_id: "svc-a", snapshot_date: "2026-07-10" },
    ]
    expect(detectarFalhaConsecutiva(rows, diasAlvo)).toEqual(new Set(["svc-a"]))
  })

  it("2/3 dias (falta hoje-2) → NÃO detectado (AC2)", () => {
    const rows: SnapshotErrorRow[] = [
      { service_id: "svc-a", snapshot_date: "2026-07-12" },
      { service_id: "svc-a", snapshot_date: "2026-07-10" },
    ]
    expect(detectarFalhaConsecutiva(rows, diasAlvo).has("svc-a")).toBe(false)
  })

  it("0 linhas → nada detectado (AC3 — ausência de dado ≠ erro)", () => {
    expect(detectarFalhaConsecutiva([], diasAlvo).size).toBe(0)
  })

  it("múltiplos serviços misturados → só o(s) com 3/3 no Set", () => {
    const rows: SnapshotErrorRow[] = [
      // svc-a: 3/3 → detectado
      { service_id: "svc-a", snapshot_date: "2026-07-12" },
      { service_id: "svc-a", snapshot_date: "2026-07-11" },
      { service_id: "svc-a", snapshot_date: "2026-07-10" },
      // svc-b: 2/3 → NÃO
      { service_id: "svc-b", snapshot_date: "2026-07-12" },
      { service_id: "svc-b", snapshot_date: "2026-07-11" },
      // svc-c: 3/3 → detectado
      { service_id: "svc-c", snapshot_date: "2026-07-12" },
      { service_id: "svc-c", snapshot_date: "2026-07-11" },
      { service_id: "svc-c", snapshot_date: "2026-07-10" },
    ]
    expect(detectarFalhaConsecutiva(rows, diasAlvo)).toEqual(new Set(["svc-a", "svc-c"]))
  })

  it("datas fora dos dias-alvo são ignoradas (defensivo)", () => {
    const rows: SnapshotErrorRow[] = [
      { service_id: "svc-a", snapshot_date: "2026-07-12" },
      { service_id: "svc-a", snapshot_date: "2026-07-11" },
      { service_id: "svc-a", snapshot_date: "2026-07-09" }, // fora da janela
      { service_id: "svc-a", snapshot_date: "2026-07-13" }, // "hoje" — não deveria contar
    ]
    // só 2 dos 3 dias-alvo cobertos → não detecta
    expect(detectarFalhaConsecutiva(rows, diasAlvo).has("svc-a")).toBe(false)
  })

  it("dias duplicados no mesmo dia-alvo não inflam a contagem", () => {
    const rows: SnapshotErrorRow[] = [
      { service_id: "svc-a", snapshot_date: "2026-07-12" },
      { service_id: "svc-a", snapshot_date: "2026-07-12" },
      { service_id: "svc-a", snapshot_date: "2026-07-11" },
    ]
    expect(detectarFalhaConsecutiva(rows, diasAlvo).has("svc-a")).toBe(false)
  })

  it("normaliza snapshot_date com sufixo de hora (timestamp)", () => {
    const rows: SnapshotErrorRow[] = [
      { service_id: "svc-a", snapshot_date: "2026-07-12T00:00:00.000Z" },
      { service_id: "svc-a", snapshot_date: "2026-07-11" },
      { service_id: "svc-a", snapshot_date: "2026-07-10" },
    ]
    expect(detectarFalhaConsecutiva(rows, diasAlvo)).toEqual(new Set(["svc-a"]))
  })

  it("diasAlvo vazio → nunca detecta (evita falso positivo por conjunto-vazio)", () => {
    const rows: SnapshotErrorRow[] = [{ service_id: "svc-a", snapshot_date: "2026-07-12" }]
    expect(detectarFalhaConsecutiva(rows, []).size).toBe(0)
  })
})

describe("formatDateBr", () => {
  it("formata ISO → DD/MM/YYYY", () => {
    expect(formatDateBr("2026-07-10")).toBe("10/07/2026")
  })
  it("normaliza timestamp", () => {
    expect(formatDateBr("2026-07-10T12:00:00Z")).toBe("10/07/2026")
  })
})
