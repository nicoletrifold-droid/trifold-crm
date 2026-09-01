/**
 * Story 900-62 · AC1/AC2/AC3/AC5 — a régua da rota que edita os dados de uma empresa.
 *
 * ## O que esta régua existe para impedir
 *
 *   1. **Editar a empresa errada.** A org vem do parâmetro de rota; um `orgId` no corpo não pode
 *      vencer. Nada na resposta de sucesso denunciaria isso.
 *   2. **Escrita disparada com corpo inválido.** Toda saída não-200 é medida JUNTO com a ausência
 *      da RPC — um `400` com o `UPDATE` já disparado é o pior desfecho possível.
 *   3. **`null` chegando ao banco.** `normalizeCpfCnpj("")` devolve `null`, e passar isso adiante
 *      era o gatilho do defeito que o @po mediu na forma antiga da migration (`jsonb_set` STRICT
 *      anulando a coluna `settings` inteira). Os seis parâmetros são medidos um a um.
 *   4. **Trava otimista ausente virando "editado".** Sem `expectedUpdatedAt`, a AC3 é uma
 *      promessa vazia — e uma trava que a AC afirma existir e não existe é pior que trava nenhuma.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const guardMock = vi.fn()
vi.mock("@web/lib/tenancy/platform-guard", () => ({
  getPlatformAdmin: () => guardMock(),
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
const TRAVA = "2026-09-01T12:00:00.123456+00:00"
const CNPJ_VALIDO = "11222333000181"
/** CPF VÁLIDO — o que `cpfCnpjError` aceitaria no campo CNPJ, e `isValidCnpj` recusa. */
const CPF_VALIDO = "52998224725"

/** O que a migration `252` devolve num sucesso: `RETURNS TABLE` chega como ARRAY pelo PostgREST. */
const RETORNO_DA_RPC = [
  {
    id: ORG_DA_ROTA,
    name: "Empresa A — Renomeada",
    slug: "empresa-a-renomeada",
    settings: { city: "Maringá", contato: { nome: "Ana" } },
    updated_at: "2026-09-01T13:30:00.999999+00:00",
    conflito: false,
    slug_em_uso: false,
  },
]

beforeEach(() => {
  rpcMock.mockClear()
  guardMock.mockResolvedValue({ userId: ATOR, email: "gage@trifold", name: "Gage" })
  respostaDaRpc = { data: RETORNO_DA_RPC, error: null }
})

const CORPO_VALIDO = {
  name: "Empresa A — Renomeada",
  slug: "empresa-a-renomeada",
  expectedUpdatedAt: TRAVA,
}

function chamar(corpo: unknown, id: string = ORG_DA_ROTA) {
  return PATCH(
    new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ id }) },
  )
}

describe("vivacidade — o caminho feliz existe e chega até a RPC", () => {
  it("corpo válido → 200 e a RPC foi chamada UMA vez, com o nome certo", () => {
    // Sem este controle, todos os `not.toHaveBeenCalled()` abaixo ficariam verdes por um harness
    // que nunca chega na escrita — o vazio aprovaria tudo.
    return chamar(CORPO_VALIDO).then(async (res) => {
      expect(res.status).toBe(200)
      expect(rpcMock).toHaveBeenCalledTimes(1)
      expect(rpcMock.mock.calls[0]![0]).toBe("org_details_update_as_platform")
    })
  })
})

describe("AC1 — autorização", () => {
  it("Task 6.9 — sem platform admin → 403, e NENHUMA escrita", async () => {
    guardMock.mockResolvedValue(null)
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "FORBIDDEN" })
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe("AC3 — a trava otimista é obrigatória, e é barrada ANTES de tudo", () => {
  it("`expectedUpdatedAt` ausente → 400 EXPECTED_UPDATED_AT_REQUIRED, sem RPC", async () => {
    const res = await chamar({ name: "X", slug: "x" })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("EXPECTED_UPDATED_AT_REQUIRED")
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("`expectedUpdatedAt: null` → 400, e NÃO vira uma escrita sem trava", async () => {
    // Este é o desfecho que a AC13 nomeia como "pior que a feature morta": com `null` chegando à
    // RPC escrita com `<>`, `now() <> NULL` avalia para `NULL`, o `IF` não entra no ramo e o
    // `UPDATE` acontece sem proteção nenhuma. A rota barra aqui; a migration barra com `P0024`.
    const res = await chamar({ ...CORPO_VALIDO, expectedUpdatedAt: null })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("`expectedUpdatedAt` só com espaços → 400, sem RPC", async () => {
    const res = await chamar({ ...CORPO_VALIDO, expectedUpdatedAt: "   " })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("a trava viaja CRUA para a RPC — sem reformatação por `Date`", async () => {
    // Um round-trip por `Date` perderia os microssegundos, e a comparação `IS DISTINCT FROM`
    // passaria a acusar CONFLITO em toda edição — a feature morreria parecendo funcionar.
    await chamar(CORPO_VALIDO)
    expect(rpcMock.mock.calls[0]![1].p_expected_updated_at).toBe(TRAVA)
  })

  it("Task 6.6 — RPC devolve `conflito=true` → 409 com os valores ATUAIS do banco", async () => {
    respostaDaRpc = {
      data: [{ ...RETORNO_DA_RPC[0]!, name: "Nome de Outra Pessoa", conflito: true }],
      error: null,
    }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe("CONFLITO_DE_CONCORRENCIA")
    // Devolver o que o operador DIGITOU aqui seria a tela dizendo "outra pessoa editou" e
    // mostrando o valor dele mesmo.
    expect(json.atual.name).toBe("Nome de Outra Pessoa")
    expect(json.atual.updatedAt).toBe(RETORNO_DA_RPC[0]!.updated_at)
  })
})

describe("AC2 — validação, sempre com a escrita ausente junto", () => {
  const casos: Array<[string, Record<string, unknown>, string]> = [
    ["Task 6.1 — nome vazio", { name: "   " }, "NOME_OBRIGATORIO"],
    ["Task 6.2 — slug com maiúscula", { slug: "Empresa-A" }, "SLUG_INVALIDO"],
    ["Task 6.3 — e-mail inválido", { contatoEmail: "ana" }, "CONTATO_EMAIL_INVALIDO"],
    ["Task 6.4 — telefone curto", { contatoTelefone: "44999" }, "CONTATO_TELEFONE_INVALIDO"],
    ["Task 6.5 — CNPJ com DV errado", { fiscalCnpj: "11222333000182" }, "FISCAL_CNPJ_INVALIDO"],
    ["Task 6.5b — CPF no campo CNPJ", { fiscalCnpj: CPF_VALIDO }, "FISCAL_CNPJ_INVALIDO"],
  ]

  for (const [rotulo, campos, codigo] of casos) {
    it(`${rotulo} → 400 ${codigo}, e a RPC NUNCA é chamada`, async () => {
      const res = await chamar({ ...CORPO_VALIDO, ...campos })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe(codigo)
      expect(rpcMock).not.toHaveBeenCalled()
    })
  }

  it("corpo que não é JSON → 400, sem estourar e sem RPC", async () => {
    const res = await PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: "isto não é json" }),
      { params: Promise.resolve({ id: ORG_DA_ROTA }) },
    )
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe("AC2/AC5 — os argumentos que chegam à RPC", () => {
  it("Task 6.10 — nome/slug crus, contato/fiscal NORMALIZADOS", async () => {
    await chamar({
      ...CORPO_VALIDO,
      name: "  Empresa A — Renomeada  ",
      contatoNome: "  Ana Souza ",
      contatoEmail: "  ANA@Example.COM ",
      contatoTelefone: "44999999999",
      fiscalCnpj: "11.222.333/0001-81",
      fiscalRazaoSocial: "  Empresa A LTDA ",
      fiscalEndereco: " Rua X, 100 ",
      reason: "  corrigindo o cadastro  ",
    })
    const p = rpcMock.mock.calls[0]![1]
    expect(p.p_name).toBe("Empresa A — Renomeada")
    expect(p.p_slug).toBe("empresa-a-renomeada")
    expect(p.p_contato_nome).toBe("Ana Souza")
    expect(p.p_contato_email).toBe("ana@example.com")
    expect(p.p_contato_telefone).toBe("(44) 99999-9999")
    // Só dígitos: a lição da Story 75-282 é gravar cru e mascarar na exibição. Gravar mascarado
    // gerou 19 registros que não casavam com a busca.
    expect(p.p_fiscal_cnpj).toBe(CNPJ_VALIDO)
    expect(p.p_fiscal_razao_social).toBe("Empresa A LTDA")
    expect(p.p_fiscal_endereco).toBe("Rua X, 100")
    expect(p.p_reason).toBe("corrigindo o cadastro")
  })

  it("Task 6.11 — os SEIS campos omitidos → 200, e a RPC recebe STRING VAZIA, nunca `null`", async () => {
    // O carrasco da Task 2.2b. `normalizeCpfCnpj("")` devolve `null`; um `?? ""` removido deixa
    // este `it` vermelho e todos os outros verdes. Sob a forma `jsonb_set` da v0.2, esse `null`
    // apagava `city`/`state`/`materiais_url`/`relatorio_diario_destinatarios` de uma vez.
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(200)
    const p = rpcMock.mock.calls[0]![1]
    for (const chave of [
      "p_contato_nome",
      "p_contato_email",
      "p_contato_telefone",
      "p_fiscal_cnpj",
      "p_fiscal_razao_social",
      "p_fiscal_endereco",
    ]) {
      expect(p[chave], chave).toBe("")
      expect(p[chave], chave).not.toBeNull()
    }
  })

  it("`reason` omitido vira `null` (opcional nesta story, diferente da 900-60)", async () => {
    await chamar(CORPO_VALIDO)
    expect(rpcMock.mock.calls[0]![1].p_reason).toBeNull()
  })
})

describe("a org vem do PARÂMETRO DE ROTA, e o ator do guard", () => {
  it("um `orgId` no corpo não vence o `[id]` da rota", async () => {
    await chamar({ ...CORPO_VALIDO, orgId: ORG_DO_CORPO, p_org_id: ORG_DO_CORPO, id: ORG_DO_CORPO })
    expect(rpcMock.mock.calls[0]![1].p_org_id).toBe(ORG_DA_ROTA)
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain(ORG_DO_CORPO)
  })

  it("o ator NÃO pode vir do corpo — é sempre o do `getPlatformAdmin()`", async () => {
    await chamar({ ...CORPO_VALIDO, p_actor_user_id: "ator-forjado", actorUserId: "ator-forjado" })
    expect(rpcMock.mock.calls[0]![1].p_actor_user_id).toBe(ATOR)
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain("ator-forjado")
  })
})

describe("AC5 — os desfechos que a RPC devolve como DADO, não como exceção", () => {
  it("Task 6.8 — zero linhas → 404 ORG_NOT_FOUND", async () => {
    // A RPC desambigua "não existe" de "conflito" de propósito: são HTTPs diferentes, e um 409
    // aqui mandaria o operador recarregar uma página de uma empresa que não existe.
    respostaDaRpc = { data: [], error: null }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("ORG_NOT_FOUND")
  })

  it("Task 6.7 — `slug_em_uso=true` → 409 SLUG_EM_USO", async () => {
    respostaDaRpc = { data: [{ ...RETORNO_DA_RPC[0]!, slug_em_uso: true }], error: null }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("SLUG_EM_USO")
  })

  it("sucesso: a resposta traz o que a RPC diz ter gravado, não o que a rota pediu", async () => {
    // Pedimos um nome e a RPC (hipoteticamente) reporta outro. Uma rota que ecoasse o corpo
    // mostraria o valor digitado sobre uma linha que ficou diferente.
    respostaDaRpc = {
      data: [{ ...RETORNO_DA_RPC[0]!, name: "O QUE O BANCO GRAVOU" }],
      error: null,
    }
    const json = await (await chamar(CORPO_VALIDO)).json()
    expect(json.name).toBe("O QUE O BANCO GRAVOU")
    // `updatedAt` volta para virar a trava da PRÓXIMA edição.
    expect(json.updatedAt).toBe(RETORNO_DA_RPC[0]!.updated_at)
  })
})

describe("falha de escrita NUNCA vira 'salvo'", () => {
  it("`P0024` (trava nula, segunda rede do banco) → 400", async () => {
    respostaDaRpc = { data: null, error: { code: "P0024", message: "expectedUpdatedAt" } }
    expect((await chamar(CORPO_VALIDO)).status).toBe(400)
  })

  it("erro sem código conhecido → 500, e a resposta não afirma estado nenhum", async () => {
    respostaDaRpc = { data: null, error: { message: "connection reset" } }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(500)
    const json = await res.json()
    // A ausência é a asserção: um corpo com `name` seria a rota afirmando o que não gravou.
    expect(json).not.toHaveProperty("name")
    expect(json.message).toContain("connection reset")
  })

  it("`PGRST202` (deploy fora de ordem) → 503, e a mensagem NOMEIA a migration 252", async () => {
    respostaDaRpc = {
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.org_details_update_as_platform in the schema cache",
      },
    }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.message).toContain("252")
    expect(json.message).not.toContain("schema cache")
    expect(json).not.toHaveProperty("name")
  })

  it("`42883` (`undefined_function` do Postgres) → o MESMO desfecho", async () => {
    respostaDaRpc = { data: null, error: { code: "42883", message: "function does not exist" } }
    const res = await chamar(CORPO_VALIDO)
    expect(res.status).toBe(503)
    expect((await res.json()).message).toContain("252")
  })

  it("controle negativo: um erro qualquer NÃO é tratado como função ausente", async () => {
    // Sem isto, `naoPublicada = true` para todo mundo passaria — e toda falha de escrita viraria
    // "a migration não subiu", escondendo a causa real.
    respostaDaRpc = { data: null, error: { code: "P0024", message: "trava nula" } }
    const json = await (await chamar(CORPO_VALIDO)).json()
    expect(json.message).toContain("trava nula")
    expect(json.message).not.toContain("252")
  })
})

describe("AC11 — a rota não abre um segundo lugar onde dado pessoal aparece", () => {
  it("nenhum `console.*` no fonte da rota", async () => {
    // Régua de forma sobre o próprio arquivo: contato do responsável é dado pessoal (LGPD Art.
    // 5º, I), e os dois únicos lugares onde ele pode existir são `organizations.settings` e
    // `platform_audit_log`. Um `console.error(corpo)` num ramo de falha abriria um terceiro,
    // fora de qualquer política de retenção — e nenhum teste de comportamento o veria.
    const fs = await import("node:fs")
    const path = await import("node:path")
    const url = await import("node:url")
    const aqui = path.dirname(url.fileURLToPath(import.meta.url))
    const fonte = fs.readFileSync(path.join(aqui, "route.ts"), "utf8")
    // Só linhas de CÓDIGO: um comentário que cite `console.log` para explicar por que ele não
    // existe não pode acender a régua.
    const linhasDeCodigo = fonte
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    expect(linhasDeCodigo.filter((l) => /\bconsole\s*\./.test(l))).toEqual([])
    // Vivacidade: sem isto, um `filter` que devolvesse `[]` por ter lido o arquivo errado (ou
    // vazio) aprovaria em silêncio.
    expect(linhasDeCodigo.length).toBeGreaterThan(50)
  })
})
