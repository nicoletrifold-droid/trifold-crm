/**
 * Story 900-25 · AC1 (Camada A) — o receptor de Lead Ads da Meta responde `200` quando a org
 * NÃO é resolvida.
 *
 * ## Por que este arquivo nasce agora
 *
 * O Passo 6 do plano da Onda 2 nomeia três mutações que a Camada A precisa reprovar. Duas já
 * tinham carrasco (`webhook-org.test.ts` e `cron/meta-ads-intelligence/route.test.ts`). A terceira
 * — *"`unresolved` devolvendo 500 em vez de 200 → vermelho"* — só tinha carrasco no receptor de
 * WhatsApp; para `webhooks/meta-ads` **não existia arquivo de teste nenhum** (medido contra
 * `origin/main` e contra a branch da `900-24`: zero blobs). É a lacuna que a AC1 manda fechar.
 *
 * O que está em jogo não é cosmético. A Meta **repete** a entrega de um evento cujo webhook não
 * respondeu `2xx`, e desativa a assinatura depois de falhas seguidas. Se "não sei de que empresa é
 * este lead" virasse `5xx`, um `page_id` desconhecido deixaria de ser um lead perdido e passaria a
 * ser a integração inteira derrubada — para **todas** as empresas, inclusive as que resolvem bem.
 *
 * ## O que este arquivo mede — e o que ele explicitamente NÃO mede
 *
 * Nesta rota a resolução de org acontece **depois** da resposta, dentro do `after()`
 * (`processMetaLead` → `resolveOrgByMetaPage`). Então o `200` não é consequência de o resolver ter
 * sido gentil: ele é consequência de a resolução estar **fora do caminho da resposta**. É essa
 * separação que o teste tranca. A mutação que o derruba é a da AC1 escrita ao pé da letra —
 * resolver antes de responder e devolver `5xx` quando não resolve; medida na Task 1.1 desta story
 * (a rota passou a responder 500 e este arquivo ficou vermelho).
 *
 * A asserção sobre QUAL identificador chega ao resolver (`entry[0].id`, nunca o `leadgen_id`) já
 * tem dono em `lib/meta/process-lead.test.ts` — não é duplicada aqui.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import crypto from "crypto"

vi.mock("server-only", () => ({}))

/**
 * Trabalho agendado por `after()`. Roda na hora, mas de forma aguardável — mesmo padrão de
 * `webhooks/landing-page/route.test.ts`, que já resolveu isto para este mesmo `next/server`.
 */
const pendentes: Promise<unknown>[] = []
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    pendentes.push(Promise.resolve().then(fn))
  },
}))

/**
 * `processMetaLead` é o dono da resolução de org neste receptor. Aqui ele é dirigido para o
 * desfecho "não resolveu" — que é o cenário da AC1 — e devolve `{ ok: false }` sem lançar, como o
 * de verdade faz (`process-lead.ts`, ramo `no_active_org` → `fail(...)`).
 */
const chamadasProcessa: unknown[][] = []
let resultadoProcessa: unknown = {
  ok: false,
  error: "no_active_org: whatsapp_config sem linha status=active",
}
vi.mock("@web/lib/meta/process-lead", () => ({
  processMetaLead: async (...args: unknown[]) => {
    chamadasProcessa.push(args)
    return resultadoProcessa
  },
}))

// Importado ANTES de `./route` de propósito: a factory do `vi.mock` abaixo lê este símbolo quando
// a rota importa `@web/lib/supabase/admin`, e a ordem das declarações de import é o que garante
// que o módulo do fixture já esteja avaliado nessa hora.
import {
  criarFakeSupabase,
  type ChamadaRegistrada,
} from "@web/lib/tenancy/__fixtures__/fake-supabase-postgrest"

/** `webhook_logs` é a única tabela que a rota toca antes de responder. */
let chamadasDb: ChamadaRegistrada[] = []
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () =>
    criarFakeSupabase({ tabelas: { webhook_logs: [] }, chamadas: chamadasDb }),
}))

import { POST } from "./route"

const SEGREDO = "segredo-de-teste-900-25"
const PAGE_ID_DESCONHECIDO = "page-que-nenhuma-org-reivindica"

const ENV_SECRET = process.env.META_APP_SECRET
const ENV_ROTEAMENTO = process.env.WEBHOOK_ORG_ROUTING

/** Payload `leadgen` real na forma que a rota lê: `entry[0].id` é o `page_id`. */
function corpoLeadgen(pageId: string) {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        time: 1_756_000_000,
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: "leadgen-1",
              form_id: "form-1",
              page_id: pageId,
              created_time: 1_756_000_000,
            },
          },
        ],
      },
    ],
  }
}

function requisicao(corpo: unknown, { assinaturaValida = true } = {}) {
  const bruto = JSON.stringify(corpo)
  const assinatura = assinaturaValida
    ? "sha256=" + crypto.createHmac("sha256", SEGREDO).update(bruto).digest("hex")
    : "sha256=" + "0".repeat(64)
  return new Request("http://localhost/api/webhooks/meta-ads", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": assinatura },
    body: bruto,
  }) as never
}

beforeEach(() => {
  pendentes.length = 0
  chamadasProcessa.length = 0
  chamadasDb = []
  resultadoProcessa = {
    ok: false,
    error: "no_active_org: whatsapp_config sem linha status=active",
  }
  process.env.META_APP_SECRET = SEGREDO
  process.env.WEBHOOK_ORG_ROUTING = "identifier"
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterAll(() => {
  if (ENV_SECRET === undefined) delete process.env.META_APP_SECRET
  else process.env.META_APP_SECRET = ENV_SECRET
  if (ENV_ROTEAMENTO === undefined) delete process.env.WEBHOOK_ORG_ROUTING
  else process.env.WEBHOOK_ORG_ROUTING = ENV_ROTEAMENTO
})

describe("POST webhooks/meta-ads — org não resolvida não vira erro HTTP (900-25 AC1)", () => {
  it("modo `identifier` com `page_id` desconhecido: responde 200, nunca 4xx/5xx", async () => {
    const res = await POST(requisicao(corpoLeadgen(PAGE_ID_DESCONHECIDO)))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "ok" })
  })

  it("o 200 é entregue com o cenário de não-resolução REALMENTE exercitado", async () => {
    // Sem esta asserção o teste acima ficaria satisfeito com uma rota que nunca chega a tentar
    // resolver org nenhuma — o `200` seria verdadeiro e vazio. Aqui o trabalho agendado roda, e
    // roda com o `page_id` desconhecido, e reporta que NÃO resolveu.
    const res = await POST(requisicao(corpoLeadgen(PAGE_ID_DESCONHECIDO)))
    await Promise.all(pendentes)

    expect(res.status).toBe(200)
    expect(chamadasProcessa).toHaveLength(1)
    expect((chamadasProcessa[0]![2] as { id?: string }).id).toBe(PAGE_ID_DESCONHECIDO)
    expect(resultadoProcessa).toMatchObject({ ok: false })
  })

  it("controle negativo: a rota NÃO responde 200 para tudo — assinatura inválida é 403", async () => {
    // Discriminador do caso acima. Sem ele, "responde 200" seria compatível com uma rota que
    // devolve 200 incondicionalmente, e a asserção da AC1 não mediria nada.
    const res = await POST(requisicao(corpoLeadgen(PAGE_ID_DESCONHECIDO), { assinaturaValida: false }))

    expect(res.status).toBe(403)
    expect(chamadasProcessa).toHaveLength(0)
  })
})
