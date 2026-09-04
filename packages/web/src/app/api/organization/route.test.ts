/**
 * Story 900-62 · AC14 — a SEGUNDA porta de escrita de `organizations.settings`.
 *
 * ## Por que esta régua existe
 *
 * `PATCH /api/organization` já existia antes desta story e faz
 * `updates.settings = { ...currentSettings, ...body.settings }` — spread de objeto inteiro, com
 * chaves ARBITRÁRIAS vindas do corpo. Medido: um admin do TENANT (capability
 * `configuracoes.empresa_editar`) conseguia escrever `settings.fiscal.cnpj` com qualquer string,
 * e as três promessas da 900-62 caíam de uma vez por essa porta:
 *
 *   • sem passar por `isValidCnpj` — a validação da AC2 vale só para a porta da plataforma;
 *   • sem gravar linha em `platform_audit_log` — a "trilha de auditoria" da User Story ficava com
 *     um buraco do tamanho da outra rota;
 *   • sem `expectedUpdatedAt`, e sendo read-modify-write: uma escrita daqui reverte em SILÊNCIO o
 *     que o platform admin acabou de gravar. Uma trava otimista não protege contra um escritor
 *     que não participa do protocolo.
 *
 * ## O controle positivo é obrigatório, não decorativo
 *
 * Uma denylist que recusasse `settings` inteiro também deixaria o `it` de `contato` verde — e
 * quebraria `city`/`state`, que são escritas legítimas do cliente hoje. O `it` de `city` é o que
 * distingue "fechei a porta certa" de "fechei a porta".
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

/** O que o `.update()` recebeu, se recebeu. `null` = nenhuma escrita aconteceu. */
let escritaRegistrada: Record<string, unknown> | null = null
/** O `settings` que já está no banco — o lado esquerdo do spread. */
const SETTINGS_ATUAIS = { city: "Londrina", materiais_url: "https://drive/x" }

const APP_USER = { id: "user-1", name: "Admin", role: "admin", org_id: "org-1", is_active: true }

function cadeiaDeUpdate() {
  return {
    update: (valores: Record<string, unknown>) => {
      escritaRegistrada = valores
      return {
        eq: () => ({
          select: () => ({
            single: async () => ({ data: { id: "org-1", ...valores }, error: null }),
          }),
        }),
      }
    },
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { settings: SETTINGS_ATUAIS }, error: null }),
      }),
    }),
  }
}

const supabaseFake = { from: () => cadeiaDeUpdate() }

const requireAuthMock = vi.fn()
const requireCapabilityMock = vi.fn()
vi.mock("@web/lib/api-auth", () => ({
  requireAuth: () => requireAuthMock(),
  requireCapability: (...a: unknown[]) => requireCapabilityMock(...a),
}))

import { PATCH } from "./route"

beforeEach(() => {
  escritaRegistrada = null
  requireAuthMock.mockResolvedValue({ supabase: supabaseFake, appUser: APP_USER })
  requireCapabilityMock.mockResolvedValue(null)
})

function chamar(corpo: unknown) {
  return PATCH(
    new Request("http://localhost/api/organization", {
      method: "PATCH",
      body: JSON.stringify(corpo),
    }) as never,
  )
}

describe("AC14 — controle positivo: o que já funcionava continua funcionando", () => {
  it("Task 8.3 — `settings: { city }` → 200, e a escrita PRESERVA as chaves atuais", async () => {
    // `city`/`state` são gravados hoje por `dashboard/configuracoes/empresa/page.tsx:134`. Uma
    // allowlist geral (em vez da denylist de duas chaves) quebraria este caminho — e este `it`
    // é o único lugar onde isso apareceria.
    const res = await chamar({ settings: { city: "Maringá" } })
    expect(res.status).toBe(200)
    expect(escritaRegistrada).not.toBeNull()
    expect((escritaRegistrada!.settings as Record<string, unknown>).city).toBe("Maringá")
    expect((escritaRegistrada!.settings as Record<string, unknown>).materiais_url).toBe(
      "https://drive/x",
    )
  })

  it("`name` sozinho continua sendo gravado", async () => {
    const res = await chamar({ name: "Empresa Renomeada pelo cliente" })
    expect(res.status).toBe(200)
    expect(escritaRegistrada!.name).toBe("Empresa Renomeada pelo cliente")
  })
})

describe("AC14 — as duas chaves reservadas da plataforma", () => {
  it("Task 8.2 — `settings: { contato }` → 400 e NENHUMA escrita", async () => {
    const res = await chamar({ settings: { contato: { nome: "Invasor", email: "x@y.z" } } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("CHAVE_RESERVADA_DA_PLATAFORMA")
    // A ausência da escrita é a metade que importa: um 400 depois do `update` seria a rota
    // recusando o pedido e gravando mesmo assim.
    expect(escritaRegistrada).toBeNull()
  })

  it("`settings: { fiscal }` → 400 e NENHUMA escrita", async () => {
    const res = await chamar({ settings: { fiscal: { cnpj: "00000000000000" } } })
    expect(res.status).toBe(400)
    expect(escritaRegistrada).toBeNull()
  })

  it("a recusa vale mesmo junto de chaves legítimas — não é 'grava o resto'", async () => {
    // Sem esta asserção, uma implementação que apagasse só a chave reservada e seguisse com o
    // resto passaria: o operador do tenant salvaria "com sucesso" e o `contato` sumiria do corpo
    // sem ninguém dizer nada.
    const res = await chamar({ settings: { city: "Maringá", fiscal: { cnpj: "1" } } })
    expect(res.status).toBe(400)
    expect(escritaRegistrada).toBeNull()
  })

  it("a mensagem NOMEIA as chaves recusadas", async () => {
    const json = await (await chamar({ settings: { contato: {}, fiscal: {} } })).json()
    expect(json.message).toContain("contato")
    expect(json.message).toContain("fiscal")
  })

  it("chave reservada com valor `null` também é recusada", async () => {
    // `hasOwnProperty`, e não truthiness: `{ contato: null }` apagaria o bloco inteiro gravado
    // pelo platform admin, que é o pior efeito dos três, não o mais inofensivo.
    const res = await chamar({ settings: { contato: null } })
    expect(res.status).toBe(400)
    expect(escritaRegistrada).toBeNull()
  })
})

describe("AC14 — a recusa não inventa desfecho novo para corpo sem `settings`", () => {
  it("`settings` ausente → o comportamento de antes (400 'No fields to update')", async () => {
    const res = await chamar({})
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("No fields to update")
    expect(escritaRegistrada).toBeNull()
  })

  it("`settings: null` não estoura — `typeof null === 'object'` é a armadilha", async () => {
    // Sem a checagem explícita de `null`, `Object.prototype.hasOwnProperty.call(null, ...)`
    // lançaria e a rota devolveria 500 para um corpo que antes era aceito.
    const res = await chamar({ name: "X", settings: null })
    expect(res.status).toBe(200)
  })
})
