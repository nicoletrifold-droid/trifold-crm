/**
 * Story 900-22b — AC-B1 e AC-B2: a lista fechada e as duas recusas de `platformQuery()`.
 *
 * As duas checagens existem porque o TypeScript não alcança o caso real: uma tabela que chega
 * por variável (não por literal) satisfaz o tipo e mesmo assim precisa ser barrada. É por isso
 * que os testes de tabela usam `as PlatformReadableTable` — não é gambiarra de teste, é a
 * reprodução exata do caminho que a checagem de runtime existe para fechar.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

interface ChamadaFake {
  metodo: string
  args: unknown[]
}

let chamadas: ChamadaFake[] = []

vi.mock("@web/lib/supabase/admin", () => {
  const builder = {
    select: (...args: unknown[]) => {
      chamadas.push({ metodo: "select", args })
      return builder
    },
    eq: (...args: unknown[]) => {
      chamadas.push({ metodo: "eq", args })
      return builder
    },
  }
  return {
    createAdminClient: () => ({
      from: (...args: unknown[]) => {
        chamadas.push({ metodo: "from", args })
        return builder
      },
    }),
  }
})

import {
  platformQuery,
  PLATFORM_READABLE_TABLES,
  type PlatformReadableTable,
} from "./platform-query"

beforeEach(() => {
  chamadas = []
})

describe("PLATFORM_READABLE_TABLES (AC-B1)", () => {
  // Literal, e por dentro: derivar o esperado de `PLATFORM_READABLE_TABLES` faria este teste
  // montar o esperado a partir da fonte que ele vigia e nunca reprovar a fonte. É por isso que
  // acrescentar uma tabela CUSTA uma linha aqui — e é o ponto: a lista é a única fronteira entre
  // "a Trifold vê o dado do cliente" e "não vê", então crescê-la tem que aparecer em diff.
  //
  // Story 900-51 (AC3) acrescentou DUAS: `org_integrations` (nomeada pela AC3) e
  // `platform_audit_log` (extensão declarada — a trilha da AC2/AC7/AC11 precisa ser lida pelo
  // painel, e a alternativa seria um `.from()` cru dentro de `app/api/platform/**`, que
  // `platform-query-scan.ts` proíbe). QA-900-51-2 acrescentou a terceira, `whatsapp_config`: é a
  // fonte que DECIDE o estado do tile de WhatsApp, e ler `org_integrations` no lugar dela fazia o
  // painel do dono do produto dizer "Não conectado" sobre um canal `active` em produção.
  // Ver o comentário de topo de `platform-query.ts`.
  it("cresce só por decisão explícita — a lista, hoje, é esta", () => {
    expect([...PLATFORM_READABLE_TABLES]).toEqual([
      "organizations",
      "users",
      "org_integrations",
      "platform_audit_log",
      "whatsapp_config",
    ])
  })

  it("carrega o comentário de topo exigido pelo épico — não 'limpar'", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const { fileURLToPath } = await import("node:url")
    const aqui = path.dirname(fileURLToPath(import.meta.url))
    const fonte = fs.readFileSync(path.join(aqui, "platform-query.ts"), "utf8")
    expect(fonte).toMatch(/lista PROVIS[ÓO]RIA/)
  })
})

describe("platformQuery — tabela fora da lista (AC-B2)", () => {
  it("lança para uma tabela que o tipo aceitou mas a lista não contém", () => {
    expect(() => platformQuery("leads" as PlatformReadableTable, "id")).toThrow(
      /fora de PLATFORM_READABLE_TABLES/,
    )
  })

  it("não abre consulta nenhuma quando recusa", () => {
    expect(() => platformQuery("leads" as PlatformReadableTable, "id")).toThrow()
    expect(chamadas).toEqual([])
  })

  it("aceita as tabelas da lista", () => {
    expect(() => platformQuery("organizations", "id, name")).not.toThrow()
    expect(() => platformQuery("users", "id, email")).not.toThrow()
  })
})

describe('platformQuery — recusa de "*" em columns (AC-B2)', () => {
  it('lança para "*" sozinho', () => {
    expect(() => platformQuery("users", "*")).toThrow(/select \*/)
  })

  it('lança para "*" no meio de uma lista de colunas', () => {
    expect(() => platformQuery("users", "id, *, email")).toThrow(/select \*/)
  })

  it("não lança para colunas explícitas", () => {
    expect(() => platformQuery("users", "id, email, auth_id")).not.toThrow()
  })
})

describe("platformQuery — encadeamento e filtro por org", () => {
  it("repassa tabela e colunas para o client", () => {
    platformQuery("organizations", "id, name, slug")
    expect(chamadas).toEqual([
      { metodo: "from", args: ["organizations"] },
      { metodo: "select", args: ["id, name, slug"] },
    ])
  })

  it("aplica .eq(org_id) só quando orgId é passado", () => {
    platformQuery("users", "id", "org-1")
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["org_id", "org-1"] })

    chamadas = []
    platformQuery("users", "id")
    expect(chamadas.some((c) => c.metodo === "eq")).toBe(false)
  })
})
