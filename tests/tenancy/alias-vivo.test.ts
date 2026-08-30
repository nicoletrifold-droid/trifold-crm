/**
 * Story 900-25 · AC3, Task 3.5 — a verificação executável que o `@po` exigiu (D1).
 *
 * A guarda de destino de toda a Camada B (`confirmarDestinoDeTeste`) depende de um import que,
 * medido pelo `@po` na rodada 1, **não resolvia**:
 *
 *     Error: Cannot find package '@trifold/shared/constants/supabase-refs'
 *            imported from .../tests/tenancy-probe/probe.test.ts
 *
 * Uma guarda que não importa é uma guarda que não existe — e o modo de falha é o pior possível:
 * o erro aparece na PRIMEIRA asserção de banco, longe da causa, parecendo problema de rede.
 *
 * Este arquivo prova, **antes de qualquer asserção de banco**, que:
 *   1. o subpath `@trifold/shared/constants/supabase-refs` resolve sob esta config;
 *   2. a função importada é a REAL (`ehRefDeProducao` reconhece o ref de produção de verdade e
 *      recusa o de teste) — não um stub que devolve `true` para tudo.
 *
 * ⚠️ Ele NÃO tem `describe.skipIf`: não precisa de credencial nenhuma. É de propósito — é a única
 * asserção desta suíte que roda mesmo num ambiente sem `.env.teste`, e é ela que impede que
 * `pnpm test:tenancy` sem credencial seja indistinguível de `pnpm test:tenancy` com o `include`
 * quebrado (os dois sairiam `0 passed`).
 */
import { describe, it, expect } from "vitest"
import {
  ehRefDeProducao,
  ehRefDeTeste,
  extrairRefDeUrlSupabase,
} from "@trifold/shared/constants/supabase-refs"

describe("AC3/Task 3.5 — o alias de `@trifold/shared` resolve, e a função é a real", () => {
  it("`ehRefDeProducao` reconhece o ref de PRODUÇÃO", () => {
    expect(ehRefDeProducao("dsopqkqjkmhytudaaolv")).toBe(true)
  })

  /**
   * Controle negativo: sem ele, um stub `() => true` passaria na asserção acima. As duas juntas
   * exigem que a função DISCRIMINE, que é a propriedade da qual a guarda depende.
   */
  it("`ehRefDeProducao` recusa o ref de TESTE, e `ehRefDeTeste` o aceita", () => {
    expect(ehRefDeProducao("xnxvygyfyyyzwhiuoehz")).toBe(false)
    expect(ehRefDeTeste("xnxvygyfyyyzwhiuoehz")).toBe(true)
  })

  it("`extrairRefDeUrlSupabase` normaliza a caixa (o furo do PR #524)", () => {
    expect(extrairRefDeUrlSupabase("https://DSOPQKQJKMHYTUDAAOLV.supabase.co")).toBe(
      "dsopqkqjkmhytudaaolv",
    )
    expect(extrairRefDeUrlSupabase("nao-e-url-supabase")).toBeNull()
  })
})
