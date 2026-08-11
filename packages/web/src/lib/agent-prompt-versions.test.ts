import { describe, expect, it } from "vitest"
import {
  VERSOES_POR_SLUG,
  buscarVersoesPorSlug,
  rotuloDeMotivoAusente,
  type ClienteDeVersoes,
  type ClienteFalsoDeVersoes,
  type ConsultaDeVersoes,
  type VersaoDoPrompt,
} from "./agent-prompt-versions"

/**
 * Story 87-1 · AC3 — achado REL-001 do gate: o histórico da tela ficava cego justamente
 * durante um incidente.
 *
 * O caso feliz (as edições distribuídas entre os slugs) passava nas DUAS implementações e
 * por isso não prova nada. O que este arquivo monta é a distribuição DESIGUAL — a noite de
 * correções repetidas em um slug só, o cenário literal da AC3 ("às 23h de um sábado") — e
 * mede as duas: o algoritmo antigo (teto compartilhado de 35 linhas) perde 6 dos 7 slugs
 * nesse fixture; o novo (teto por slug, no banco) não perde nenhum.
 */

const SLUGS = [
  "guardrails",
  "handoff-summary",
  "off-hours",
  "property-presentation",
  "qualification-flow",
  "system-personality",
  "visit-scheduling",
]

const ORG = "org-1"

type Linha = VersaoDoPrompt & { slug: string; org_id: string }

function linha(slug: string, minutoDesdeEpoch: number): Linha {
  return {
    id: `${slug}-${minutoDesdeEpoch}`,
    org_id: ORG,
    slug,
    created_at: new Date(Date.UTC(2026, 7, 8, 0, minutoDesdeEpoch)).toISOString(),
    change_reason: null,
    author_label: "system",
    author_auth_id: null,
    author_user_id: null,
    previous_content: "antes",
    new_content: "depois",
  }
}

/**
 * A noite do incidente: 40 edições seguidas em `guardrails`, e uma edição ANTIGA em cada
 * um dos outros seis. 7 × 5 = 35 — o teto compartilhado da implementação antiga cabe
 * inteiro dentro das 40 do slug barulhento.
 */
function noiteDeIncidente(): Linha[] {
  const antigas = SLUGS.filter((s) => s !== "guardrails").map((slug, i) => linha(slug, i))
  const barulhentas = Array.from({ length: 40 }, (_, i) => linha("guardrails", 100 + i))
  return [...antigas, ...barulhentas]
}

type ConsultaRegistrada = { tabela: string; filtros: Record<string, string>; limite: number }

function bancoFalso(linhas: Linha[]) {
  const consultas: ConsultaRegistrada[] = []

  const client: ClienteFalsoDeVersoes = {
    from(tabela: string) {
      const filtros: Record<string, string> = {}
      let ordenarPor: { coluna: string; ascending: boolean } | null = null

      const chain: ConsultaDeVersoes = {
        eq(coluna: string, valor: string) {
          filtros[coluna] = valor
          return chain
        },
        order(coluna: string, opcoes: { ascending: boolean }) {
          ordenarPor = { coluna, ascending: opcoes.ascending }
          return chain
        },
        limit(n: number) {
          consultas.push({ tabela, filtros: { ...filtros }, limite: n })

          let linhasFiltradas = linhas.filter((l) =>
            Object.entries(filtros).every(
              ([coluna, valor]) => (l as unknown as Record<string, unknown>)[coluna] === valor
            )
          )

          if (ordenarPor) {
            const { coluna, ascending } = ordenarPor
            linhasFiltradas = [...linhasFiltradas].sort((a, b) => {
              const va = String((a as unknown as Record<string, unknown>)[coluna])
              const vb = String((b as unknown as Record<string, unknown>)[coluna])
              return ascending ? va.localeCompare(vb) : vb.localeCompare(va)
            })
          }

          return Promise.resolve({ data: linhasFiltradas.slice(0, n), error: null })
        },
      }

      return { select: () => chain }
    },
  }

  // O duplo implementa o contrato mínimo (`ClienteFalsoDeVersoes`, conferido pelo
  // compilador); o cast é só para caber na assinatura do cliente real do supabase-js.
  return { client: client as unknown as ClienteDeVersoes, consultas, falso: client }
}

/**
 * O algoritmo ANTIGO, reproduzido aqui como CONTROLE — não como código de produção.
 * Sem ele, o fixture poderia passar nas duas implementações e o teste não mediria nada.
 */
async function agrupamentoComTetoCompartilhado(
  supabase: ClienteFalsoDeVersoes,
  orgId: string,
  tetoTotal: number,
  porSlug: number
): Promise<Map<string, VersaoDoPrompt[]>> {
  const { data } = await supabase
    .from("agent_prompt_versions")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(tetoTotal)

  const mapa = new Map<string, VersaoDoPrompt[]>()
  for (const v of (data ?? []) as Linha[]) {
    const lista = mapa.get(v.slug) ?? []
    if (lista.length < porSlug) lista.push(v)
    mapa.set(v.slug, lista)
  }
  return mapa
}

describe("buscarVersoesPorSlug (AC3 · REL-001)", () => {
  it("CONTROLE: com teto compartilhado (35 linhas de todos os slugs), 6 dos 7 slugs somem", async () => {
    const { falso } = bancoFalso(noiteDeIncidente())

    const mapa = await agrupamentoComTetoCompartilhado(
      falso,
      ORG,
      SLUGS.length * VERSOES_POR_SLUG,
      VERSOES_POR_SLUG
    )

    // É este o defeito: os outros seis leem "Sem histórico ainda" — que a tela escreve
    // como "ninguém nunca editou isto", não como "truncado".
    expect(mapa.get("guardrails")).toHaveLength(VERSOES_POR_SLUG)
    for (const slug of SLUGS.filter((s) => s !== "guardrails")) {
      expect(mapa.get(slug) ?? []).toHaveLength(0)
    }
  })

  it("distribuição DESIGUAL: o slug barulhento não come o histórico dos outros seis", async () => {
    const { client } = bancoFalso(noiteDeIncidente())

    const mapa = await buscarVersoesPorSlug(client, ORG, SLUGS)

    expect(mapa.get("guardrails")).toHaveLength(VERSOES_POR_SLUG)
    for (const slug of SLUGS.filter((s) => s !== "guardrails")) {
      expect(mapa.get(slug) ?? []).toHaveLength(1)
    }
  })

  it("as 5 do slug barulhento são as MAIS RECENTES, em ordem decrescente", async () => {
    const { client } = bancoFalso(noiteDeIncidente())

    const versoes = (await buscarVersoesPorSlug(client, ORG, SLUGS)).get("guardrails") ?? []

    expect(versoes.map((v) => v.id)).toEqual([
      "guardrails-139",
      "guardrails-138",
      "guardrails-137",
      "guardrails-136",
      "guardrails-135",
    ])
  })

  it("o teto é do BANCO e é por slug: uma consulta por slug, limit 5, filtrada por org", async () => {
    const { client, consultas } = bancoFalso(noiteDeIncidente())

    await buscarVersoesPorSlug(client, ORG, SLUGS)

    expect(consultas).toHaveLength(SLUGS.length)
    for (const consulta of consultas) {
      expect(consulta.tabela).toBe("agent_prompt_versions")
      expect(consulta.limite).toBe(VERSOES_POR_SLUG)
      expect(consulta.filtros.org_id).toBe(ORG)
      expect(SLUGS).toContain(consulta.filtros.slug)
    }
    expect(new Set(consultas.map((c) => c.filtros.slug)).size).toBe(SLUGS.length)
  })

  it("slug sem nenhuma edição volta lista vazia (e a tela pode dizer 'sem histórico' sem mentir)", async () => {
    const { client } = bancoFalso([linha("guardrails", 1)])

    const mapa = await buscarVersoesPorSlug(client, ORG, ["guardrails", "off-hours"])

    expect(mapa.get("guardrails")).toHaveLength(1)
    expect(mapa.get("off-hours")).toEqual([])
  })

  it("outra org não vaza para o histórico desta (o filtro de org vai na consulta)", async () => {
    const deOutraOrg = { ...linha("guardrails", 9), org_id: "org-2" }
    const { client } = bancoFalso([deOutraOrg, linha("guardrails", 1)])

    const mapa = await buscarVersoesPorSlug(client, ORG, ["guardrails"])

    expect(mapa.get("guardrails")?.map((v) => v.id)).toEqual(["guardrails-1"])
  })

  it("slug repetido na lista não vira consulta repetida", async () => {
    const { client, consultas } = bancoFalso([linha("guardrails", 1)])

    await buscarVersoesPorSlug(client, ORG, ["guardrails", "guardrails"])

    expect(consultas).toHaveLength(1)
  })
})

/**
 * REQ-001 — a tela não pode afirmar procedência que a linha não sabe. O caso que a
 * implementação cria sozinha: dois motivos idênticos seguidos pelo painel (ou uma
 * integração que mande sempre o mesmo `motivo` no `PUT`) gravam `change_reason` nulo, mas
 * COM autor identificado.
 */
describe("rotuloDeMotivoAusente (REQ-001)", () => {
  it("com autor identificado, NÃO diz que a escrita veio de fora do painel", () => {
    const rotulo = rotuloDeMotivoAusente({
      author_auth_id: "auth-1",
      author_user_id: "user-1",
    })

    expect(rotulo).toBe("motivo não registrado nesta edição")
    expect(rotulo).not.toMatch(/painel|fora/i)
  })

  it("basta UM dos dois ids para o autor contar como identificado", () => {
    // `auth.uid()` e `public_user_id()` são IDs diferentes e o lookup do nome pode falhar
    // sem que a autoria deixe de existir (a função do trigger protege cada lookup).
    expect(
      rotuloDeMotivoAusente({ author_auth_id: "auth-1", author_user_id: null })
    ).toBe("motivo não registrado nesta edição")
    expect(
      rotuloDeMotivoAusente({ author_auth_id: null, author_user_id: "user-1" })
    ).toBe("motivo não registrado nesta edição")
  })

  it("sem autor nenhum, a anomalia continua dita — a fuga tem de ficar visível (Risco 4)", () => {
    expect(rotuloDeMotivoAusente({ author_auth_id: null, author_user_id: null })).toBe(
      "sem motivo — escrita sem autor identificado"
    )
  })
})
