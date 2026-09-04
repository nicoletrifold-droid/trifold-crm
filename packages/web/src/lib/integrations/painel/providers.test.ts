/**
 * Story 900-51 · QA-900-51-2 — a derivação do tile de WhatsApp, e a allowlist de `config`.
 *
 * O caso central destes testes é o ESTADO REAL DE PRODUÇÃO medido pelo `@qa` em 2026-08-30:
 * `whatsapp_config` com `status='active'` e credencial presente, enquanto
 * `org_integrations.whatsapp` estava `disconnected`. O tile do `/platform` lia a segunda e dizia
 * "Não conectado" sobre um canal no ar. O primeiro `it` abaixo é esse cenário, literal.
 */
import { describe, it, expect } from "vitest"
import {
  chavesDeConfigRecusadas,
  derivarEstadoDoTileWhatsapp,
  DEFINICOES_DE_PROVIDER,
  ehProviderDoPainel,
  ehProviderGravavel,
  montarTilesDoPainel,
  PROVIDERS_DO_PAINEL,
  type LinhaDeIntegracaoDoPainel,
} from "./providers"

describe("derivarEstadoDoTileWhatsapp — a fonte que DECIDE o estado", () => {
  it("o estado de PRODUÇÃO medido pelo @qa: active + phone ⇒ conectado", () => {
    expect(
      derivarEstadoDoTileWhatsapp({
        status: "active",
        phone_number_id: "705929949281618",
        updated_at: "2026-08-01T00:00:00Z",
      }),
    ).toEqual({ status: "active", temSegredo: true, atualizadoEm: "2026-08-01T00:00:00Z" })
  })

  it("linha `inactive` do seed (o estado do banco de teste) ⇒ não conectado", () => {
    expect(derivarEstadoDoTileWhatsapp({ status: "inactive", phone_number_id: null })).toMatchObject(
      { status: "inactive", temSegredo: false },
    )
  })

  it("`active` SEM phone_number_id não conta como conectado", () => {
    // Controle negativo mínimo: um `status` sozinho não decide. Sem isto, a derivação poderia ser
    // `status === "active"` puro e este caso passaria como conectado.
    expect(derivarEstadoDoTileWhatsapp({ status: "active", phone_number_id: null })).toMatchObject({
      status: "inactive",
      temSegredo: false,
    })
  })

  it("org sem linha nenhuma em whatsapp_config ⇒ não conectado, sem estourar", () => {
    expect(derivarEstadoDoTileWhatsapp(null)).toEqual({
      status: "inactive",
      temSegredo: false,
      atualizadoEm: null,
    })
  })
})

describe("catálogo dos 5 tiles", () => {
  it("são CINCO, e `google` não é um deles", () => {
    expect([...PROVIDERS_DO_PAINEL]).toHaveLength(5)
    expect(PROVIDERS_DO_PAINEL).not.toContain("google")
  })

  it("`whatsapp` está no painel mas NÃO grava em org_integrations", () => {
    expect(ehProviderDoPainel("whatsapp")).toBe(true)
    expect(ehProviderGravavel("whatsapp")).toBe(false)
    expect(DEFINICOES_DE_PROVIDER.whatsapp.gravaEmOrgIntegrations).toBe(false)
  })

  it("os 4 graváveis são exatamente os da allowlist positiva da migration 248", () => {
    for (const p of ["meta_ads", "meta_capi", "sienge", "telegram"]) {
      expect(ehProviderGravavel(p), p).toBe(true)
    }
    expect(ehProviderGravavel("google")).toBe(false)
  })
})

describe("allowlist positiva de chaves de `config`", () => {
  it("recusa chave desconhecida e devolve o NOME dela, nunca o valor", () => {
    const recusadas = chavesDeConfigRecusadas("meta_ads", {
      page_id: "1",
      org_id: "vitima",
      token: "SEGREDO-QUE-NAO-PODE-VAZAR",
    })
    expect(recusadas.sort()).toEqual(["org_id", "token"])
    expect(JSON.stringify(recusadas)).not.toContain("SEGREDO")
  })

  it("aceita as chaves legítimas de cada provider", () => {
    expect(chavesDeConfigRecusadas("meta_ads", { page_id: "1" })).toEqual([])
    expect(chavesDeConfigRecusadas("meta_capi", { dataset_id: "d" })).toEqual([])
    expect(chavesDeConfigRecusadas("sienge", { subdomain: "a", usuario: "u" })).toEqual([])
    expect(chavesDeConfigRecusadas("telegram", {})).toEqual([])
  })

  it("`telegram` não aceita chave nenhuma — é bot global (ADR-005)", () => {
    expect(chavesDeConfigRecusadas("telegram", { chat_id: "x" })).toEqual(["chat_id"])
  })
})

describe("montarTilesDoPainel — o estado REAL de produção, reproduzido (QA-900-51-2)", () => {
  /**
   * As 6 linhas de `org_integrations` de produção, medidas em 2026-08-30 pela Management API:
   * todas `disconnected`, todas sem `secret_ref`. É a fixture honesta, não uma conveniente.
   */
  const PRODUCAO_ORG_INTEGRATIONS: LinhaDeIntegracaoDoPainel[] = [
    "whatsapp",
    "meta_ads",
    "meta_capi",
    "sienge",
    "telegram",
    "google",
  ].map((provider) => ({
    provider,
    status: "disconnected",
    config: {},
    secret_ref: null,
    last_error: null,
    last_check_at: null,
    updated_at: null,
  }))

  it("o defeito exato: whatsapp `disconnected` em org_integrations + canal ATIVO ⇒ tile CONECTADO", () => {
    // Este é, literalmente, o estado de produção que o `@qa` mediu. Antes desta correção o tile
    // dizia "Não conectado" sobre um canal no ar — no painel do dono do produto.
    const tiles = montarTilesDoPainel(PRODUCAO_ORG_INTEGRATIONS, {
      status: "active",
      phone_number_id: "705929949281618",
      updated_at: "2026-08-01T00:00:00Z",
    })
    const whatsapp = tiles.find((t) => t.provider === "whatsapp")
    expect(whatsapp).toMatchObject({ status: "active", temSegredo: true })
  })

  it("sem linha ativa em whatsapp_config, o MESMO org_integrations dá tile não conectado", () => {
    // O par do anterior: prova que a resposta vem de `whatsapp_config` e não de um `true` fixo.
    const tiles = montarTilesDoPainel(PRODUCAO_ORG_INTEGRATIONS, null)
    expect(tiles.find((t) => t.provider === "whatsapp")).toMatchObject({
      status: "inactive",
      temSegredo: false,
    })
  })

  it("a linha `whatsapp` de org_integrations é IGNORADA mesmo se alguém a promover à mão", () => {
    // Ela é estruturalmente inescrevível pela aplicação, mas um UPDATE manual no banco existe.
    // Se a montagem voltasse a lê-la, este caso mostraria "Conectado" com o canal fora do ar.
    const comLinhaForjada = PRODUCAO_ORG_INTEGRATIONS.map((l) =>
      l.provider === "whatsapp" ? { ...l, status: "connected", secret_ref: "forjado" } : l,
    )
    expect(montarTilesDoPainel(comLinhaForjada, null)).toContainEqual(
      expect.objectContaining({ provider: "whatsapp", status: "inactive", temSegredo: false }),
    )
  })

  it("os outros 4 tiles continuam vindo de org_integrations, com secret_ref virando booleano", () => {
    const tiles = montarTilesDoPainel(
      PRODUCAO_ORG_INTEGRATIONS.map((l) =>
        l.provider === "sienge"
          ? { ...l, status: "connected", secret_ref: "uuid-do-vault", config: { subdomain: "acme" } }
          : l,
      ),
      null,
    )
    const sienge = tiles.find((t) => t.provider === "sienge")
    expect(sienge).toMatchObject({ status: "connected", temSegredo: true })
    // O ponteiro do Vault não atravessa para a tela em nenhuma forma.
    expect(JSON.stringify(tiles)).not.toContain("uuid-do-vault")
  })

  it("monta os 5 tiles mesmo com org_integrations VAZIO — e `google` não vira tile", () => {
    const tiles = montarTilesDoPainel([], null)
    expect(tiles.map((t) => t.provider)).toEqual([...PROVIDERS_DO_PAINEL])
    expect(tiles.map((t) => t.provider)).not.toContain("google")
  })

  // ── Story 900-61 ──────────────────────────────────────────────────────────────────────────
  it("as 2 colunas do diagnóstico ATRAVESSAM da linha para o tile", () => {
    // A régua da projeção prende o dado ENTRANDO na página; esta prende a FIAÇÃO. Sem ela,
    // trocar `l?.last_error` por `null` na montagem deixa a projeção intacta, o `tsc` em rc=0 e a
    // tela de novo sem motivo nenhum — o defeito inteiro, com tudo verde.
    const tiles = montarTilesDoPainel(
      PRODUCAO_ORG_INTEGRATIONS.map((l) =>
        l.provider === "sienge"
          ? { ...l, status: "error", last_error: "network_error", last_check_at: "2026-09-01T10:00:00Z" }
          : l,
      ),
      null,
    )
    expect(tiles.find((t) => t.provider === "sienge")).toMatchObject({
      ultimoErro: "network_error",
      ultimaChecagem: "2026-09-01T10:00:00Z",
    })
    // E o par negativo: quem não falhou não herda o erro do vizinho.
    expect(tiles.find((t) => t.provider === "telegram")).toMatchObject({
      ultimoErro: null,
      ultimaChecagem: null,
    })
  })

  it("o `/dashboard` não pede as 2 colunas — a ausência delas vira `null`, nunca `undefined`", () => {
    // A projeção do cliente continua a antiga (AC5 só estende a de `/platform`), e a linha chega
    // aqui por um `as unknown as`, que não verifica coluna nenhuma. `undefined` atravessando até o
    // `.tsx` renderizaria "em erro desde undefined" no dia em que alguém trocasse a guarda.
    const semAsColunas = [
      { provider: "sienge", status: "error", config: {}, secret_ref: null, updated_at: null },
    ] as unknown as LinhaDeIntegracaoDoPainel[]
    expect(montarTilesDoPainel(semAsColunas, null).find((t) => t.provider === "sienge")).toMatchObject(
      { ultimoErro: null, ultimaChecagem: null },
    )
  })

  it("o tile de whatsapp nunca declara diagnóstico — a linha dele em org_integrations é ignorada", () => {
    const comErroForjado = PRODUCAO_ORG_INTEGRATIONS.map((l) =>
      l.provider === "whatsapp"
        ? { ...l, status: "error", last_error: "token_invalid", last_check_at: "2026-09-01T10:00:00Z" }
        : l,
    )
    expect(montarTilesDoPainel(comErroForjado, null).find((t) => t.provider === "whatsapp")).toMatchObject(
      { ultimoErro: null, ultimaChecagem: null },
    )
  })
})
