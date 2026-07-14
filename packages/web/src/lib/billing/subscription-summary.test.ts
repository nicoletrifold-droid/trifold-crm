// Story 78-14 — Testes da função pura de agregação "Total Assinaturas Fixas" (AC15).
// Cobre: soma por moeda; exclusão de excluded_from_subscription_total=true; exclusão de
// expected_amount=null; não-mistura de USD/BRL; ignora linhas não-assinatura-fixa; coerção de
// expected_amount vindo como string numérica (numeric do Postgres via supabase-js).

import { describe, it, expect } from "vitest"
import {
  somarAssinaturasFixasPorMoeda,
  type SubscriptionSummaryRow,
} from "./subscription-summary"

function row(over: Partial<SubscriptionSummaryRow>): SubscriptionSummaryRow {
  return {
    is_fixed_subscription: true,
    excluded_from_subscription_total: false,
    expected_amount: 25,
    currency: "USD",
    ...over,
  }
}

describe("somarAssinaturasFixasPorMoeda", () => {
  it("soma expected_amount por moeda", () => {
    const m = somarAssinaturasFixasPorMoeda([
      row({ expected_amount: 25, currency: "USD" }),
      row({ expected_amount: 20, currency: "USD" }),
      row({ expected_amount: 90, currency: "BRL" }),
    ])
    expect(m.get("USD")).toBe(45)
    expect(m.get("BRL")).toBe(90)
  })

  it("nunca mistura USD com BRL na mesma chave (NFR-7)", () => {
    const m = somarAssinaturasFixasPorMoeda([
      row({ expected_amount: 25, currency: "USD" }),
      row({ expected_amount: 100, currency: "BRL" }),
    ])
    expect(m.get("USD")).toBe(25)
    expect(m.get("BRL")).toBe(100)
    expect(m.size).toBe(2)
  })

  it("exclui linhas com excluded_from_subscription_total=true (anti-dupla contagem, ex.: Vercel)", () => {
    const m = somarAssinaturasFixasPorMoeda([
      row({ expected_amount: 25, currency: "USD" }), // Supabase Pro
      row({ expected_amount: 20, currency: "USD", excluded_from_subscription_total: true }), // Vercel Pro
    ])
    expect(m.get("USD")).toBe(25)
  })

  it("exclui linhas com expected_amount=null (ainda não cadastrado/enriquecido)", () => {
    const m = somarAssinaturasFixasPorMoeda([
      row({ expected_amount: 25, currency: "USD" }),
      row({ expected_amount: null, currency: "USD" }), // Claude Team sem valor manual ainda
    ])
    expect(m.get("USD")).toBe(25)
  })

  it("ignora linhas que não são assinatura fixa (is_fixed_subscription=false)", () => {
    const m = somarAssinaturasFixasPorMoeda([
      row({ expected_amount: 25, currency: "USD" }),
      row({ expected_amount: 999, currency: "USD", is_fixed_subscription: false }), // vencimento avulso 78-8
    ])
    expect(m.get("USD")).toBe(25)
  })

  it("coage expected_amount em string numérica (numeric do Postgres via supabase-js)", () => {
    const m = somarAssinaturasFixasPorMoeda([
      row({ expected_amount: "25.00" as unknown as number, currency: "USD" }),
      row({ expected_amount: "20.50" as unknown as number, currency: "USD" }),
    ])
    expect(m.get("USD")).toBe(45.5)
  })

  it("lista vazia → mapa vazio", () => {
    expect(somarAssinaturasFixasPorMoeda([]).size).toBe(0)
  })
})
