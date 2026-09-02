/**
 * Story 900-60 · AC1/AC2/AC4/AC5/AC7/AC10 — a régua da rota que pausa e retoma uma empresa.
 *
 * ## O que esta régua existe para impedir
 *
 * É a primeira mutação nova do console. As três coisas que, se saírem erradas, saem erradas em
 * silêncio:
 *
 *   1. **Pausar a empresa errada.** A org vem do parâmetro de rota; um `orgId` no corpo não
 *      pode vencer. Nada na resposta de sucesso denunciaria isso.
 *   2. **"Salvo" sobre escrita que não aconteceu.** Toda saída não-200 é medida junto com a
 *      ausência da RPC — porque `400` com o `UPDATE` já disparado é o pior desfecho possível.
 *   3. **Confundir "não consegui ler" com "não existe".** São dois HTTPs diferentes de
 *      propósito: um 404 sobre uma leitura que falhou manda o operador procurar a empresa em
 *      vez de procurar a rede.
 *
 * ## `orgs_ativas_depois` (AC10) vem da RPC, não da rota
 *
 * O fake devolve um número que a rota não teria como calcular sozinha. Se alguém trocar o campo
 * por uma contagem local — que sofreria o corte de 1000 linhas do PostgREST e mediria um instante
 * diferente do `UPDATE` — a asserção fica vermelha com o número na mensagem.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const guardMock = vi.fn()
vi.mock("@web/lib/tenancy/platform-guard", () => ({
  getPlatformAdmin: () => guardMock(),
}))

/** O que a leitura de `organizations` devolve neste teste. */
type RespostaDeLeitura = { data: unknown; error: unknown }
let leitura: RespostaDeLeitura = { data: null, error: null }

/** Toda chamada a `platformQuery`, com a tabela, as colunas e os `.eq()` aplicados. */
interface LeituraRegistrada {
  tabela: string
  colunas: string
  terceiroArgumento: unknown
  eq: Array<[string, unknown]>
}
const leiturasRegistradas: LeituraRegistrada[] = []

vi.mock("@web/lib/tenancy/platform-query", () => ({
  platformQuery: (tabela: string, colunas: string, orgId?: string) => {
    const registro: LeituraRegistrada = { tabela, colunas, terceiroArgumento: orgId, eq: [] }
    leiturasRegistradas.push(registro)
    const cadeia = {
      eq: (coluna: string, valor: unknown) => {
        registro.eq.push([coluna, valor])
        return cadeia
      },
      maybeSingle: async () => leitura,
    }
    return cadeia
  },
}))

type ParamsDeRpc = Record<string, unknown>
type RespostaDeRpc = { data: unknown; error: unknown }
let respostaDaRpc: RespostaDeRpc = { data: null, error: null }
const rpcMock = vi.fn<(nome: string, params: ParamsDeRpc) => Promise<RespostaDeRpc>>(
  async () => respostaDaRpc,
)
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (nome: string, params: ParamsDeRpc) => rpcMock(nome, params),
  }),
}))

import { PATCH } from "./route"

const ORG_DA_ROTA = "org-da-rota"
const ORG_DO_CORPO = "org-de-outra-empresa"
const ATOR = "platform-admin-1"

/** O que a migration `251` devolve num sucesso — e o `7` é o número que a rota não calcula. */
const RETORNO_DA_RPC = {
  is_active: false,
  is_active_anterior: true,
  orgs_ativas_depois: 7,
  action: "organization.deactivated",
}

beforeEach(() => {
  rpcMock.mockClear()
  leiturasRegistradas.length = 0
  guardMock.mockResolvedValue({ userId: ATOR, email: "gage@trifold", name: "Gage" })
  leitura = { data: { id: ORG_DA_ROTA, name: "Empresa A — Teste" }, error: null }
  respostaDaRpc = { data: RETORNO_DA_RPC, error: null }
})

function chamar(corpo: unknown, id: string = ORG_DA_ROTA) {
  return PATCH(
    new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ id }) },
  )
}

const CORPO_VALIDO = { isActive: false, reason: "cliente pediu pausa no contrato" }

describe("vivacidade — o caminho feliz existe e chega até a RPC", () => {
  it("corpo válido → 200 e a RPC foi chamada UMA vez", async () => {
    // Sem este controle, todas as asserções de `rpcMock).not.toHaveBeenCalled()` abaixo ficariam
    // verdes por um harness que nunca chega na escrita — o vazio aprovaria tudo.
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock.mock.calls[0]![0]).toBe("organization_set_active_as_platform")
  })
})

describe("AC1 — autorização e validação, SEM efeito nenhum", () => {
  it("sem platform admin → 403, e nem a leitura nem a escrita acontecem", async () => {
    guardMock.mockResolvedValue(null)
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "FORBIDDEN" })
    expect(leiturasRegistradas).toEqual([])
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("`reason` só com espaços → 400 e NENHUM UPDATE disparado", async () => {
    const res = await chamar({ isActive: false, reason: "   \n\t  " })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("MOTIVO_OBRIGATORIO")
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("`reason` ausente → 400 e NENHUM UPDATE disparado", async () => {
    const res = await chamar({ isActive: false })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("`reason` não-string (número) → 400: `123` não é um motivo", async () => {
    const res = await chamar({ isActive: false, reason: 123 })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("`isActive` ausente → 400, e NÃO pausa por coerção", async () => {
    // `Boolean(undefined)` é `false`. Uma rota que coagisse em vez de checar o tipo pausaria
    // uma empresa por causa de um corpo malformado — e responderia 200.
    const res = await chamar({ reason: "motivo qualquer" })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("IS_ACTIVE_INVALIDO")
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("`isActive` como string `\"false\"` → 400", async () => {
    // `Boolean("false")` é `true`: coerção aqui RETOMARIA uma empresa que o operador quis pausar.
    const res = await chamar({ isActive: "false", reason: "motivo qualquer" })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("corpo que não é JSON → 400, sem estourar", async () => {
    const res = await PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: "isto não é json" }),
      { params: Promise.resolve({ id: ORG_DA_ROTA }) },
    )
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe("a org vem do PARÂMETRO DE ROTA, nunca do corpo", () => {
  it("um `orgId` no corpo não vence o `[id]` da rota", async () => {
    await chamar({ ...CORPO_VALIDO, orgId: ORG_DO_CORPO, p_org_id: ORG_DO_CORPO, id: ORG_DO_CORPO })
    expect(rpcMock.mock.calls[0]![1].p_org_id).toBe(ORG_DA_ROTA)
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain(ORG_DO_CORPO)
  })

  it("a leitura é `organizations` filtrada por `id`, não por `org_id`", async () => {
    // `platformQuery(tabela, colunas, orgId)` aplica `.eq("org_id", orgId)` — e `organizations`
    // não tem `org_id`, tem `id`. Passar o terceiro argumento aqui devolveria zero linhas SEMPRE,
    // e a rota responderia 404 para toda empresa que existe.
    await chamar(CORPO_VALIDO)
    expect(leiturasRegistradas).toHaveLength(1)
    const [q] = leiturasRegistradas
    expect(q!.tabela).toBe("organizations")
    expect(q!.terceiroArgumento).toBeUndefined()
    expect(q!.eq).toEqual([["id", ORG_DA_ROTA]])
  })

  it("a projeção não pede coluna nenhuma além do necessário, e não aninha", async () => {
    // `(` no `columns` é embedding do PostgREST, que a `900-42a` fechou por vazar PII de lead.
    await chamar(CORPO_VALIDO)
    expect(leiturasRegistradas[0]!.colunas).not.toContain("(")
  })
})

describe("as duas ausências de linha são desfechos DIFERENTES", () => {
  it("org inexistente (`data: null`, `error: null`) → 404 e NENHUM UPDATE", async () => {
    leitura = { data: null, error: null }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("ORG_NOT_FOUND")
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("leitura que FALHOU (`error` presente) → 503, nunca 404, e NENHUM UPDATE", async () => {
    // Este é o carrasco de "não conseguir ler ≠ não existe". Um 404 aqui diria "essa empresa
    // não existe" sobre uma empresa que existe: o operador iria procurá-la em vez de procurar a
    // rede. Mutante que remove o ramo do erro: este teste fica vermelho e o de cima continua
    // verde — os conjuntos de morte são disjuntos.
    leitura = { data: null, error: { message: "timeout" } }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe("LEITURA_FALHOU")
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe("AC2/AC4/AC5 — os argumentos da RPC", () => {
  it("pausar: `p_is_active: false`, motivo TRIMADO, ator do guard", async () => {
    await chamar({ isActive: false, reason: "  cliente inadimplente  " })
    const params = rpcMock.mock.calls[0]![1]
    expect(params.p_is_active).toBe(false)
    expect(params.p_reason).toBe("cliente inadimplente")
    expect(params.p_actor_user_id).toBe(ATOR)
  })

  it("AC5 — retomar usa a MESMA rota, com `p_is_active: true`", async () => {
    respostaDaRpc = {
      data: { ...RETORNO_DA_RPC, is_active: true, action: "organization.activated" },
      error: null,
    }
    const res = await chamar({ isActive: true, reason: "contrato regularizado" })
    expect(res.status).toBe(200)
    expect(rpcMock.mock.calls[0]![1].p_is_active).toBe(true)
    expect((await res.json()).action).toBe("organization.activated")
  })

  it("o ator NÃO pode vir do corpo — é sempre o do `getPlatformAdmin()`", async () => {
    await chamar({ ...CORPO_VALIDO, p_actor_user_id: "ator-forjado", actorUserId: "ator-forjado" })
    expect(rpcMock.mock.calls[0]![1].p_actor_user_id).toBe(ATOR)
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain("ator-forjado")
  })
})

describe("AC10 — a trilha registra o efeito colateral, e a resposta o devolve", () => {
  it("`orgsAtivasDepois` vem do RETORNO da RPC, não de uma contagem da rota", async () => {
    // O `7` não é derivável de nada que a rota tenha em mãos. Trocar este campo por uma contagem
    // local — que sofreria o corte de 1000 linhas do PostgREST e mediria um instante diferente do
    // `UPDATE` — reprova aqui com o número na mensagem.
    const json = await (await chamar(CORPO_VALIDO)).json()
    expect(json.orgsAtivasDepois).toBe(7)
    expect(json.isActiveAnterior).toBe(true)
    expect(json.action).toBe("organization.deactivated")
  })

  it("a rota NÃO repete o que pediu: `isActive` vem do que a RPC diz ter gravado", async () => {
    // Pedimos `false` e a RPC (hipoteticamente) reporta `true`. Uma rota que ecoasse o corpo
    // diria `false` e o operador veria "pausada" sobre uma empresa que continua rodando.
    respostaDaRpc = { data: { ...RETORNO_DA_RPC, is_active: true }, error: null }
    const json = await (await chamar({ isActive: false, reason: "m" })).json()
    expect(json.isActive).toBe(true)
  })
})

describe("AC7 — falha de escrita NUNCA vira 'salvo'", () => {
  it("`P0021` (motivo vazio, segunda rede do banco) → 400", async () => {
    respostaDaRpc = { data: null, error: { code: "P0021", message: "motivo obrigatório" } }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(400)
  })

  it("`P0022` (org sumiu entre a leitura e a escrita) → 404", async () => {
    respostaDaRpc = { data: null, error: { code: "P0022", message: "organização não existe" } }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(404)
  })

  it("erro sem código conhecido → 500, e a resposta não afirma estado nenhum", async () => {
    respostaDaRpc = { data: null, error: { message: "connection reset" } }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(500)
    const json = await res.json()
    // A ausência é a asserção: um corpo com `isActive` seria a rota afirmando o que não gravou.
    expect(json).not.toHaveProperty("isActive")
    expect(json.message).toContain("connection reset")
  })

  it("`P0023` (UPDATE afetou ≠ 1 linha) → 500, não 400: não é erro do operador", async () => {
    respostaDaRpc = { data: null, error: { code: "P0023", message: "afetou 0 linhas" } }
    expect((await chamar(CORPO_VALIDO)).status).toBe(500)
  })

  // QA-900-60-2 — deploy fora de ordem (código antes da migration `251`). Sem esta rede o
  // desfecho é um 500 genérico numa tela que parece pronta, e o jargão do PostgREST sobre
  // "schema cache" não diz ao operador o que fazer.
  it("`PGRST202` (função ausente no schema cache) → 503, e a mensagem NOMEIA a migration", async () => {
    respostaDaRpc = {
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.organization_set_active_as_platform in the schema cache",
      },
    }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.message).toContain("251")
    expect(json.message).not.toContain("schema cache")
    // A resposta continua não afirmando estado nenhum: nada foi gravado.
    expect(json).not.toHaveProperty("isActive")
  })

  it("`42883` (`undefined_function` do Postgres) → o MESMO desfecho", async () => {
    respostaDaRpc = { data: null, error: { code: "42883", message: "function does not exist" } }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(503)
    expect((await res.json()).message).toContain("251")
  })

  it("controle negativo: um erro qualquer NÃO é tratado como função ausente", async () => {
    // Sem isto, `naoPublicada = true` para todo mundo passaria — e toda falha de escrita viraria
    // "a migration não subiu", escondendo a causa real.
    respostaDaRpc = { data: null, error: { code: "P0023", message: "afetou 0 linhas" } }
    const json = await (await chamar(CORPO_VALIDO)).json()
    expect(json.message).toContain("afetou 0 linhas")
    expect(json.message).not.toContain("251")
  })
})
