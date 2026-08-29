/**
 * Story 900-23 · AC10.4 — `trifoldOrgId()` é um literal puro, sem env.
 *
 * A tentação (e o que a v2 da story dizia) era `process.env.DAILY_REPORT_ORG_ID ?? LITERAL`. Isso
 * recria, mais larga, a dependência cruzada que a AC2 fechou: o env var do relatório diário
 * passaria a governar também o destino do Telegram do cron da agenda. O carrasco disso na rota
 * está em `nicole-agenda-reconcile/route.test.ts`; aqui é a garantia no módulo.
 */
import { describe, it, expect, afterEach } from "vitest"

import { trifoldOrgId } from "./trifold-org"

const ORIGINAL = process.env.DAILY_REPORT_ORG_ID

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DAILY_REPORT_ORG_ID
  else process.env.DAILY_REPORT_ORG_ID = ORIGINAL
})

describe("trifoldOrgId", () => {
  it("devolve o id da Trifold", () => {
    expect(trifoldOrgId()).toBe("00000000-0000-0000-0000-000000000001")
  })

  it("NÃO lê DAILY_REPORT_ORG_ID — env de um cron não governa o canal de outro", () => {
    process.env.DAILY_REPORT_ORG_ID = "99999999-9999-9999-9999-999999999999"
    expect(trifoldOrgId()).toBe("00000000-0000-0000-0000-000000000001")
  })
})
