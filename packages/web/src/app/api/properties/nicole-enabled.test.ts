/**
 * Story 87-13 — AC2, AC6 e AC7: o switch, no SERVIDOR.
 *
 * Nenhuma AC desta story é "existe no painel". Tudo aqui é verificado contra a
 * RESPOSTA HTTP, que é o efeito. (Regra da §10 do Epic 87.)
 *
 * ⚠️ POR QUE AS FIXTURES USAM `is_active: true` EM TODOS OS QUATRO
 * ----------------------------------------------------------------
 * Tanto o `GET` quanto a cadeia do `UPDATE` do `PATCH` carregam
 * `.eq("is_active", true)`. Enquanto Japura e Solum estiverem soft-deletados pelo
 * paliativo de 10/08 — isto é, do passo 1 ao passo 4 do deploy —, um `PATCH` sobre
 * eles devolve **404, não 422**: a linha nem é alcançada pela validação. Quem
 * fosse conferir a AC6 por chamada ad-hoc a produção antes do passo 4 leria o 404
 * como defeito da implementação. A régua é o teste de rota; a conferência em
 * produção só passa a ser possível depois da 224, e é bônus.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { createFakeSupabase, type FakeSupabase, type Row } from "@trifold/ai/src/chat/__fixtures__/fake-supabase"

vi.mock("server-only", () => ({}))

const ORG = "00000000-0000-0000-0000-000000000001"
const VIND = "00000000-0000-0000-0004-000000000001"
const JAPURA = "fcbd2a01-7c59-48b0-8e88-f5a68f4970cd"

let fake: FakeSupabase
let papel = "admin"

vi.mock("@web/lib/api-auth", async () => {
  // 75-306: o gate virou requireCapability (matriz). O espírito da decisão 2 do
  // @po da 87-13 se mantém: a DECISÃO não é mockada como constante — ela vem do
  // SEED do registro (a fonte da verdade do modelo novo), variando por `papel`.
  const { CAPABILITY_SEED } = await vi.importActual<
    typeof import("@web/lib/capabilities")
  >("@web/lib/capabilities")
  return {
    requireCapability: async (
      appUser: { role: string },
      capability: keyof typeof CAPABILITY_SEED
    ) => {
      const allowed =
        appUser.role === "admin" ||
        (CAPABILITY_SEED[capability] as readonly string[]).includes(appUser.role)
      return allowed
        ? null
        : new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    },
    requireAuth: async () => ({
      appUser: { org_id: ORG, role: papel, id: "u1" },
      supabase: fake,
    }),
  }
})

import { PATCH } from "./[id]/route"
import { POST } from "./route"
import { MINIMOS_BLOQUEANTES, MINIMOS_NICOLE } from "@web/lib/nicole-minimos"
// Story 87-14 (AC1) — a tabela de papéis vem do REGISTRO, nunca de uma lista de
// nomes digitada à mão: papel novo no registro tem de QUEBRAR o teste, não passar
// despercebido.
import { KNOWN_ROLES, CAPABILITY_SEED } from "@web/lib/capabilities"

/**
 * Cadastro de produção reduzido ao que os mínimos leem. `is_active: true` nos
 * quatro (ver o cabeçalho). `nicole_enabled: false` no Vind DE PROPÓSITO: a
 * AC6-(ii) precisa de uma TRANSIÇÃO que passa, não de um no-op que devolve 200
 * porque a checagem nem rodou.
 */
function seed(): Record<string, Row[]> {
  return {
    properties: [
      {
        id: VIND,
        org_id: ORG,
        name: "Vind Residence",
        slug: "vind-residence",
        status: "selling",
        address: "Rua Jose Pereira da Costa, 547",
        concept: "Apartamento boutique",
        delivery_date: "2027-06-30",
        total_units: 48,
        is_active: true,
        nicole_enabled: false,
      },
      {
        id: JAPURA,
        org_id: ORG,
        name: "Japura",
        slug: "japura",
        status: "planning",
        address: "A definir",
        concept: null,
        delivery_date: null,
        total_units: null,
        is_active: true,
        nicole_enabled: false,
      },
    ],
    typologies: [
      { id: "t1", property_id: VIND, name: "2 Suites" },
      // Japura: ZERO tipologias — é o `B1`, o único bloqueio.
    ],
    agent_media_assets: [
      { id: "a1", property_id: VIND, is_active: true },
    ],
  }
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/properties/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function patch(id: string, body: unknown) {
  const res = await PATCH(req(body) as never, { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

function linha(id: string): Row {
  return fake.table("properties").find((p) => p.id === id)!
}

beforeEach(() => {
  fake = createFakeSupabase(seed())
  papel = "admin"
})

// ────────────────────────────────────────────────────────────────────────────
// AC2 — cadastrar NÃO liga
// ────────────────────────────────────────────────────────────────────────────

describe("AC2 — cadastrar não liga (provado pela API, não pela tela)", () => {
  it("POST com `nicole_enabled: true` no corpo cria o registro DESLIGADO", async () => {
    const res = await POST(
      new Request("http://localhost/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Empreendimento Novo",
          city: "Maringa",
          state: "PR",
          address: "Rua Nova, 1",
          nicole_enabled: true, // ← ignorado POR CONSTRUÇÃO
        }),
      }) as never
    )

    expect(res.status).toBe(201)
    const criado = fake.table("properties").find((p) => p.name === "Empreendimento Novo")!
    // O campo não está na lista de campos do INSERT; no banco, o `default false`
    // da coluna faz o resto. Aqui o fake não aplica defaults — a asserção certa é
    // que o valor do corpo NÃO CHEGOU ao INSERT.
    expect(criado.nicole_enabled).toBeUndefined()
    expect(criado.is_active).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC6 — os mínimos bloqueiam no SERVIDOR, e a lista do que falta volta
// ────────────────────────────────────────────────────────────────────────────

describe("AC6 — o bloqueio é do servidor, fail-closed, sem override", () => {
  it("(i) ligar o Japura ⇒ 422 com `missing: ['tipologias']` — UM item, não dois", async () => {
    const { status, json } = await patch(JAPURA, { nicole_enabled: true })

    expect(status).toBe(422)
    // 🔴 Lista EXATA, nunca `toContain`: com `toContain(["tipologias"])` este caso
    // passaria verde se o `B2` (`total_units`) tivesse ficado como bloqueio — e é
    // exatamente essa a mudança que a decisão 1 do @po precisa fixar.
    expect(json.missing).toEqual(["tipologias"])
    expect(json.faltando).toEqual(["Pelo menos uma tipologia cadastrada"])
    // Os avisos VOLTAM juntos, e não bloqueiam nada.
    expect(json.avisos).toEqual(["total_de_unidades", "midias", "endereco", "conceito_e_entrega"])
    expect(linha(JAPURA).nicole_enabled).toBe(false)
  })

  it("(ii) o mesmo PATCH sobre o Vind ⇒ 200 e o campo grava", async () => {
    const { status } = await patch(VIND, { nicole_enabled: true })
    expect(status).toBe(200)
    expect(linha(VIND).nicole_enabled).toBe(true)
  })

  it("(iii) DESLIGAR nunca é bloqueado, nem com o cadastro vazio", async () => {
    // A válvula: nada que este código faça pode impedir alguém de calar a Nicole.
    linha(JAPURA).nicole_enabled = true
    const { status } = await patch(JAPURA, { nicole_enabled: false })
    expect(status).toBe(200)
    expect(linha(JAPURA).nicole_enabled).toBe(false)
  })

  it("(iv) a checagem roda SÓ na transição false → true", async () => {
    // Já ligado, cadastro incompleto, PATCH de outro campo ⇒ 200.
    linha(JAPURA).nicole_enabled = true
    const semTocar = await patch(JAPURA, { name: "Japura II" })
    expect(semTocar.status).toBe(200)

    // E reenviar o valor ATUAL também não dispara nada (é o que a tela faz).
    const reenvio = await patch(JAPURA, { nicole_enabled: true })
    expect(reenvio.status).toBe(200)
  })

  it("papel: `obras` pode editar o empreendimento, mas NÃO pode ligar a Nicole", async () => {
    // Decisão 2 do @po: o campo exige `IMOVEIS_CREATE_ROLES` (admin/supervisor).
    // `IMOVEIS_EDIT_ROLES` tem QUATRO papéis — `obras` e `gerente-relacionamento`
    // continuam editando tudo o mais.
    papel = "obras"
    expect((await patch(VIND, { name: "Vind II" })).status).toBe(200)
    expect((await patch(VIND, { nicole_enabled: true })).status).toBe(403)
    expect(linha(VIND).nicole_enabled).toBe(false)
  })

  it("papel: `gerente-relacionamento` também não liga — e salvar outro campo não quebra", async () => {
    papel = "gerente-relacionamento"
    expect((await patch(VIND, { concept: "Novo conceito" })).status).toBe(200)
    expect((await patch(VIND, { nicole_enabled: true })).status).toBe(403)
  })

  it("`nicole_enabled` não-booleano ⇒ 400, e NADA muda", async () => {
    // Sem esta guarda, `"true"` (string) seria coagido a `false` por `=== true`
    // e DESLIGARIA a Nicole em silêncio — mudança de estado não pedida, na
    // superfície que esta story existe justamente para tornar deliberada.
    linha(VIND).nicole_enabled = true
    const { status } = await patch(VIND, { nicole_enabled: "true" })
    expect(status).toBe(400)
    expect(linha(VIND).nicole_enabled).toBe(true)
  })

  it("papel: reenviar o valor ATUAL não exige o papel elevado", async () => {
    // Sem esta regra, um usuário de `obras` levaria 403 ao salvar QUALQUER coisa
    // pela tela de edição, que monta o body inteiro.
    papel = "obras"
    const { status } = await patch(VIND, { name: "Vind III", nicole_enabled: false })
    expect(status).toBe(200)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC7 — os mínimos vivem numa constante única, e os números são assertados
// ────────────────────────────────────────────────────────────────────────────

describe("AC7 — a constante única", () => {
  it("existe EXATAMENTE UM bloqueio, e é o B1 (≥1 tipologia)", () => {
    // 🔴 `toBe(1)`, nunca `toBeGreaterThan(0)`: um `>0` daria verde com o `B2` de
    // volta, e é assim que uma decisão de produto é desfeita por acidente num
    // rebase, sem nada ficar vermelho.
    expect(MINIMOS_BLOQUEANTES).toHaveLength(1)
    expect(MINIMOS_BLOQUEANTES[0]!.id).toBe("tipologias")
    expect(MINIMOS_BLOQUEANTES[0]!.ref).toBe("B1")
  })

  it("o `B2` está na MESMA estrutura, marcado como aviso", () => {
    const b2 = MINIMOS_NICOLE.find((m) => m.ref === "B2")!
    expect(b2.id).toBe("total_de_unidades")
    expect(b2.classe).toBe("avisa")
  })

  it("(ii) o pré-lançamento legítimo do Risco 4 recebe 200 + aviso, não 422", async () => {
    // Tipologia cadastrada, `total_units` ainda nulo — o caso que SÓ o `B2`
    // barraria. É o vermelho que fixa a decisão 1 como intenção, e não omissão:
    // promover o `B2` a bloqueio faz este caso devolver 422.
    linha(VIND).total_units = null
    const { status, json } = await patch(VIND, { nicole_enabled: true })
    expect(status).toBe(200)
    expect(json.error).toBeUndefined()
    expect(linha(VIND).nicole_enabled).toBe(true)
  })

  it("(iii) mídia (A1) é aviso: cadastro completo com 0 mídia LIGA", async () => {
    // Promover `A1` a bloqueio derruba este caso. O Vind tem mídia, então o teste
    // usa um empreendimento sem nenhuma — senão a mutação passaria despercebida.
    fake.table("agent_media_assets").length = 0
    const { status } = await patch(VIND, { nicole_enabled: true })
    expect(status).toBe(200)
  })

  it("todo mínimo tem id, ref e rótulo — a lista `missing` é legível por quem lê a resposta", () => {
    for (const m of MINIMOS_NICOLE) {
      expect(m.id).toMatch(/^[a-z_]+$/)
      expect(m.ref).toMatch(/^[AB]\d$/)
      expect(m.rotulo.length).toBeGreaterThan(10)
    }
    expect(new Set(MINIMOS_NICOLE.map((m) => m.id)).size).toBe(MINIMOS_NICOLE.length)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Story 87-14 — o switch sai do formulário e vai para a lista.
//
// A story é de TELA, mas a régua da permissão continua sendo a ROTA: é ela que
// decide, e é ela que um teste alcança. O que segue não altera uma vírgula do
// enforcement da 87-13 — só o exercita por eixos que ainda não estavam cobertos.
// ════════════════════════════════════════════════════════════════════════════

describe("87-14 · AC1 — a permissão é comportamental e cobre TODOS os papéis do registro", () => {
  it("(i) os 10 papéis de `KNOWN_ROLES`: só quem tem a capability altera o campo", async () => {
    // Papel novo no registro sem linha aqui ⇒ este número muda e o teste cai.
    expect(KNOWN_ROLES).toHaveLength(10)

    const autorizados: string[] = []
    const recusados: string[] = []

    for (const papelSobTeste of KNOWN_ROLES) {
      // 🔴 RESET A CADA VOLTA — isto não é higiene, é a AC.
      // `KNOWN_ROLES[0] === "admin"`: sem reset, a primeira volta deixaria o Vind
      // em `true` e as NOVE seguintes virariam no-op (`muda === false`), que é
      // precisamente o caso em que o gate da rota NÃO roda. O laço mediria o
      // vazio e ficaria verde com o gate apagado.
      fake = createFakeSupabase(seed())
      papel = papelSobTeste

      const autorizado =
        papelSobTeste === "admin" ||
        (CAPABILITY_SEED["imoveis.ativar_nicole"] as readonly string[]).includes(papelSobTeste)

      // Transição REAL `false → true`: o fixture nasce com o Vind desligado.
      const { status } = await patch(VIND, { nicole_enabled: true })

      if (autorizado) {
        // 🔴 `status !== 403` NÃO serviria: um PATCH que não muda devolve 200 sem
        // nunca consultar a capability. A metade "autorizado" só vale se a
        // alteração ACONTECEU — daí a asserção sobre a linha.
        expect(status, papelSobTeste).toBe(200)
        expect(linha(VIND).nicole_enabled, papelSobTeste).toBe(true)
        autorizados.push(papelSobTeste)
      } else {
        expect(status, papelSobTeste).toBe(403)
        expect(linha(VIND).nicole_enabled, papelSobTeste).toBe(false)
        recusados.push(papelSobTeste)
      }
    }

    expect(autorizados).toEqual(["admin", "supervisor"])
    expect(recusados).toHaveLength(8)
  })

  it("(ii) controle positivo COM DENTES: `supervisor` liga de verdade — não é bypass de admin", async () => {
    // Sem este caso, a metade "autorizado" do laço poderia passar inteira pelo
    // `role === "admin"` do mock e a AC não mediria a capability.
    papel = "supervisor"
    const { status } = await patch(VIND, { nicole_enabled: true })
    expect(status).toBe(200)
    expect(linha(VIND).nicole_enabled).toBe(true)
  })
})

describe("87-14 · AC2 — controle negativo: LIGAR quem passa os mínimos FUNCIONA", () => {
  it("(i) `supervisor` liga o Vind (1 tipologia, passa o B1) ⇒ 200 e a linha grava", async () => {
    papel = "supervisor"
    const { status } = await patch(VIND, { nicole_enabled: true })
    expect(status).toBe(200)
    expect(linha(VIND).nicole_enabled).toBe(true)
  })

  it("(ii) `supervisor` liga o Japura (0 tipologias) ⇒ 422 com `missing` e `faltando` legível", async () => {
    papel = "supervisor"
    const { status, json } = await patch(JAPURA, { nicole_enabled: true })
    expect(status).toBe(422)
    expect(json.missing).toEqual(["tipologias"])
    // `faltando` é o array que a TELA renderiza (rótulos pt-BR), não os ids
    // técnicos de `missing`. Se ele vier vazio, a célula fala em jargão ou não
    // fala nada.
    expect(json.faltando.length).toBeGreaterThan(0)
    expect(linha(JAPURA).nicole_enabled).toBe(false)
  })
})

describe("87-14 · AC3 — desligar não é bloqueado pelos MÍNIMOS, mas continua exigindo o PAPEL", () => {
  it("(i) `supervisor` desliga o Japura com o cadastro vazio ⇒ 200, sem 422", async () => {
    // A válvula da 87-13: nada que este código faça impede alguém de calar a
    // Nicole. É decisão sobre os MÍNIMOS — não sobre permissão.
    linha(JAPURA).nicole_enabled = true
    papel = "supervisor"
    const { status, json } = await patch(JAPURA, { nicole_enabled: false })
    expect(status).toBe(200)
    expect(json.error).toBeUndefined()
    expect(linha(JAPURA).nicole_enabled).toBe(false)
  })

  it("(ii) `obras` tentando DESLIGAR ⇒ 403 — a válvula não é 'qualquer um desliga'", async () => {
    // A confusão que esta AC existe para impedir: "desligar nunca é bloqueado"
    // vale para o cadastro, não para o papel. O gate (`if (muda)`) roda ANTES do
    // `if (desejado)`, nas duas direções.
    linha(VIND).nicole_enabled = true
    papel = "obras"
    const { status } = await patch(VIND, { nicole_enabled: false })
    expect(status).toBe(403)
    expect(linha(VIND).nicole_enabled).toBe(true)
  })
})
