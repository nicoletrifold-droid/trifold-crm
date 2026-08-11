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
  const real = await vi.importActual<typeof import("@web/lib/api-auth")>("@web/lib/api-auth")
  return {
    // `requireRole` é o DE PRODUÇÃO — a decisão 2 do @po (o campo exige
    // `IMOVEIS_CREATE_ROLES`) só é provada se o teste não mockar quem decide.
    requireRole: real.requireRole,
    requireAuth: async () => ({
      appUser: { org_id: ORG, role: papel, id: "u1" },
      supabase: fake,
    }),
  }
})

import { PATCH } from "./[id]/route"
import { POST } from "./route"
import { MINIMOS_BLOQUEANTES, MINIMOS_NICOLE } from "@web/lib/nicole-minimos"

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
