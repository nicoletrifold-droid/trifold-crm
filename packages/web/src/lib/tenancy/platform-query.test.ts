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

/**
 * Story 900-42a (SEC-001) — a recusa de embedding do PostgREST.
 *
 * Por que este bloco existe separado da recusa de `"*"`: são MECANISMOS de vazamento
 * diferentes. `"*"` traz colunas a mais da PRÓPRIA tabela; embedding traz linhas de OUTRA
 * tabela — uma que nem precisa estar em `PLATFORM_READABLE_TABLES`, porque o PostgREST a
 * resolve pela FK `org_id` sem emitir `.from()` nenhum. Medido contra `trifold-crm-dev` em
 * 2026-08-31, antes da correção: `GET /rest/v1/organizations?select=id,leads(name,phone)`
 * devolveu HTTP 200 com 6 linhas de `leads` aninhadas, todas com `phone` não-nulo.
 *
 * As duas direções estão aqui de propósito (recusa E controle negativo). Uma régua que só
 * mede o sentido "lança" fica verde tanto com a guarda certa quanto com uma guarda que recusa
 * tudo — e recusar tudo pararia o painel inteiro.
 */
describe("platformQuery — recusa de embedding em columns (900-42a, SEC-001)", () => {
  it("lança para embedding com colunas nomeadas — a forma que vazava PII de lead", () => {
    expect(() => platformQuery("organizations", "id, leads(name, phone)")).toThrow(/embedding/)
  })

  it('lança para embedding com "*" dentro — o split por vírgula nunca via este token', () => {
    expect(() => platformQuery("organizations", "id, users(*)")).toThrow(/embedding/)
  })

  it("não abre consulta nenhuma quando recusa embedding", () => {
    expect(() => platformQuery("organizations", "id, leads(name, phone)")).toThrow()
    expect(chamadas).toEqual([])
  })

  it("pega o aninhamento em qualquer posição, não só no fim", () => {
    expect(() => platformQuery("organizations", "leads(name), id")).toThrow(/embedding/)
    expect(() => platformQuery("organizations", "id, users(id), name")).toThrow(/embedding/)
  })

  // AC8 — a guarda fecha `(` inteiro, o que também fecha a sintaxe de agregado do PostgREST.
  // Isso não tira capacidade nenhuma: medido em `trifold-crm-dev` em 2026-08-31,
  // `?select=count()` → HTTP 400 `PGRST123` "Use of aggregate functions is not allowed" e
  // `?select=id,users(count)` → HTTP 300 `PGRST201`. Se uma tela futura precisar de contagem, o
  // caminho é `Prefer: count=exact` (2º argumento de `.select()`, ortogonal a `columns`), numa
  // story própria que estenda a assinatura — NUNCA afrouxando esta recusa.
  it("fecha também a sintaxe de agregado, que já vem desligada do servidor (AC8)", () => {
    expect(() => platformQuery("organizations", "count()")).toThrow(/embedding/)
    expect(() => platformQuery("organizations", "id, users(count)")).toThrow(/embedding/)
  })

  // CONTROLE NEGATIVO — o outro sentido da classe de equivalência.
  it("controle negativo: colunas simples da própria tabela continuam passando", () => {
    expect(() => platformQuery("organizations", "id, name, slug")).not.toThrow()
    expect(() => platformQuery("users", "id, email, auth_id")).not.toThrow()
    expect(() => platformQuery("org_integrations", "provider, status")).not.toThrow()
  })

  it("controle negativo: os columns REAIS dos call sites de produção continuam passando", () => {
    // Levantados por `git grep -n "platformQuery(" -- packages/web/src` em 2026-08-31 (13 call
    // sites, 5 arquivos). Se algum destes passar a lançar, é regressão — o painel para.
    const colunasDeProducao = [
      "id",
      "provider, status",
      "id, actor_type, org_id, action, metadata",
      "id, admin_invite_email",
      "id, auth_id, email",
      "id, name, slug, google_oauth_tokens",
      "provider, status, config, secret_ref, updated_at",
      "id, action, actor_type, created_at, metadata",
      "status, phone_number_id, updated_at",
      "id, name, slug, is_active, created_at, admin_invite_email",
      "org_id",
      "org_id, id, auth_id",
    ]
    for (const colunas of colunasDeProducao) {
      expect(() => platformQuery("organizations", colunas)).not.toThrow()
    }
  })
})
