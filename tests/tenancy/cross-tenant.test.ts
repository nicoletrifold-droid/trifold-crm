/**
 * Story 900-25 — **A prova**: duas empresas reais no `trifold-crm-dev`.
 *
 * Camada B. Cada `it()` abaixo é uma das asserções que o dono do produto nomeou, na ordem em que
 * ele as nomeou. O que este arquivo prova, e nenhum unit test com fake conseguiria:
 *
 *  - que o **schema real** aplicado tem as UNIQUE parciais (fake nenhum reprova "o índice não
 *    existe" — só o Postgres reprova);
 *  - que `provision_org()` executado contra Postgres de verdade semeia as linhas certas;
 *  - que os webhooks, recebendo um `phone_number_id`/`page_id` real, resolvem para a org certa
 *    **e não para a outra** — nos DOIS sentidos, porque um resolver que sempre devolve B passaria
 *    num teste de um sentido só;
 *  - e que, **com as duas empresas ativas, a mensagem É gravada** — a asserção central, a que
 *    reprova o código de antes desta onda, que respondia 200 e descartava em silêncio.
 *
 * ## Regras desta suíte (Testing Standards da story)
 *
 *  - **Nunca desestruturar só `data`.** Toda query de verificação lê `{ data, error }` e afirma o
 *    `error` antes de usar `data`. É a mesma causa raiz que a `900-24` existe para fechar.
 *  - **Nenhum `.maybeSingle()`/`.single()` em leitura de verificação** — `.limit(n)` +
 *    `toHaveLength` explícito. (O código de PRODUÇÃO sob teste usa o que usa; a regra é sobre o
 *    código do teste.)
 *  - **Nunca afirmar contagem total** do banco compartilhado: só as entradas cujo `org.id` é uma
 *    das orgs-fixture, por `find`, ignorando o resto.
 *  - **Teardown por id, nunca por predicado.**
 *
 * ## Por que `after()` é interceptado, e o que isso NÃO enfraquece
 *
 * O `after()` do `next/server` agenda o trabalho pós-resposta. Nos dois receptores ele significa
 * coisas diferentes:
 *  - **WhatsApp:** o `after()` é o pipeline da Nicole — Anthropic, Graph API, push ao corretor. A
 *    asserção central (AC8) é sobre a linha de `messages`, que é gravada no caminho **SÍNCRONO**,
 *    antes do 200. Este arquivo **descarta** os `after()` do WhatsApp: rodá-los faria a suíte
 *    disparar IA e envio real de WhatsApp contra um banco compartilhado (a mesma classe de efeito
 *    colateral que o D7 do parecer mandou escopar).
 *  - **Meta Ads:** a resolução de org mora **dentro** do `after()` (`processMetaLead`). Ali o
 *    agendado é **executado de propósito** — é o objeto sob teste da AC9.
 *
 * Interceptar o AGENDADOR não apaga nenhum argumento observado: o que se afirma é o efeito no
 * banco, medido depois. O que ficaria apagado — e por isso é executado — é a resolução da AC9.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import crypto from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  aplicarEnv,
  comRetryDeTransporte,
  contarComRetryDeTransporte,
  credenciaisPresentes,
  criarClienteDeTeste,
  envDoBancoDeTeste,
  type EnvSalva,
} from "./support/ambiente"
import {
  SLUG_CANARIO,
  apagarOrgsDeTeste,
  contarLinhasDoCanario,
  derivarTabelasBloqueantes,
  idDeOrgPorSlug,
  novoAcumuladorDeIdsNulos,
  orgsRemanescentes,
  provisionarOrg,
  type ContagemDoCanario,
  type TabelaBloqueante,
} from "./support/fixtures"

/**
 * Agendador de `after()` interceptado. A factory só LÊ `agendados` quando `after` é chamado (em
 * tempo de teste), nunca no momento em que ela mesma é avaliada — por isso não há TDZ apesar do
 * hoisting do `vi.mock`. Mesmo padrão de `webhooks/meta-ads/route.test.ts` (Camada A).
 */
const agendados: Array<() => unknown> = []
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    agendados.push(fn)
  },
}))

import { NextRequest } from "next/server"
import { normalizePhoneBR } from "@trifold/shared"
import { POST as postWhatsApp } from "@web/app/api/webhook/whatsapp/route"
import { POST as postMetaAds } from "@web/app/api/webhooks/meta-ads/route"
import { GET as getDailyReport } from "@web/app/api/cron/daily-report/route"
import { forEachActiveOrg } from "@web/lib/tenancy/for-each-org"
import * as moduloEnvioRelatorio from "@web/lib/reports/send-daily-report"
import * as moduloAutomations from "@web/lib/email-automations"
import * as moduloRoleta from "@web/lib/roleta/distributor"

// ---------------------------------------------------------------------------
// Constantes de fixture
// ---------------------------------------------------------------------------

const SLUG_A = "org-a-900-25"
const SLUG_B = "org-b-900-25"
const SLUG_C = "org-c-900-25"

const TELEFONE_PA = "PA-900-25"
const TELEFONE_PB = "PB-900-25"
const PAGE_A = "PAGE-A-900-25"
const PAGE_B = "PAGE-B-900-25"

const SEGREDO_META_TESTE = "segredo-hmac-900-25"
const SEGREDO_CRON_TESTE = "cron-secret-900-25"

/**
 * N4 do parecer (rodada 2). A cadeia real é `resolveDailyReportRecipients` → `mergeRecipients`
 * (`recipients.ts`), que faz `const tel = normalizePhoneBR(bruto); if (!tel …) return` — um valor
 * que não normaliza é **descartado em silêncio**. Um fixture "inventado sem forma" mataria a
 * metade POSITIVA da prova da AC13. Este é inventado **sem dono**, não sem forma: 11 dígitos,
 * DDD 11, faixa de teste, nunca discado.
 */
const TELEFONE_FIXTURE_900_25 = "11999990000"
const TELEFONE_FIXTURE_900_25_NORMALIZADO = normalizePhoneBR(TELEFONE_FIXTURE_900_25)!

/** Telefones dos leads de cada sentido do teste de WhatsApp. Já em forma canônica. */
const TELEFONE_LEAD_B = "5511988880001"
const TELEFONE_LEAD_A = "5511988880002"

// ---------------------------------------------------------------------------
// Estado compartilhado da suíte
// ---------------------------------------------------------------------------

let admin: SupabaseClient
let orgAId = ""
let orgBId = ""
let canarioId = ""
let canarioAntes: ContagemDoCanario
let bloqueantes: TabelaBloqueante[] = []
let runId = ""
let teardownExecutado = false

const idsComOrgIdNuloDaAC10 = novoAcumuladorDeIdsNulos()

/** Ids das linhas `webhook_logs` que a rota de Meta Ads cria (nascem sem `org_id`). */
const idsWebhookLogsDaAC9: string[] = []

// ---------------------------------------------------------------------------
// Helpers de leitura (todos com `{ data, error }`, nenhum com terminal singular)
// ---------------------------------------------------------------------------

async function linhasDe<T = Record<string, unknown>>(
  construir: () => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
  rotulo: string,
): Promise<T[]> {
  // Repete SÓ falha de transporte (`fetch failed`), nunca resposta do banco — ver
  // `comRetryDeTransporte` em `support/ambiente.ts`, que é onde a distinção mora.
  return comRetryDeTransporte<T>(construir, rotulo)
}

/**
 * Contagens por org, usadas nas metades "a OUTRA empresa ficou inalterada" das AC7/AC8/AC9.
 *
 * **Agregadas, nunca `select().length`** — mesma correção do QA-900-25-1 que o canário levou, e
 * pela mesma razão: `max_rows = 1000` faz `select("id").length` saturar, e duas contagens saturadas
 * são **iguais entre si** mesmo com vazamento no meio. A asserção `expect(depois).toEqual(antes)`
 * ficaria verde exatamente quando a org vizinha estivesse cheia.
 *
 * `messages` não tem `org_id`: o escopo é via `conversations` (ver AC8). As conversas da org são
 * lidas por id (poucas, por construção — são as fixtures) e usadas como filtro da contagem
 * agregada de `messages`.
 */
async function contarDaOrg(orgId: string): Promise<{
  leads: number
  conversations: number
  messages: number
}> {
  const leads = await contarComRetryDeTransporte(
    () => admin.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    `contagem leads(${orgId})`,
  )
  const conversas = await linhasDe<{ id: string }>(
    () => admin.from("conversations").select("id").eq("org_id", orgId),
    `ids de conversations(${orgId})`,
  )
  const conversations = await contarComRetryDeTransporte(
    () =>
      admin.from("conversations").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    `contagem conversations(${orgId})`,
  )
  let messages = 0
  if (conversas.length > 0) {
    messages = await contarComRetryDeTransporte(
      () =>
        admin
          .from("messages")
          .select("*", { count: "exact", head: true })
          .in(
            "conversation_id",
            conversas.map((c) => c.id),
          ),
      `contagem messages(${orgId})`,
    )
  }
  return { leads, conversations, messages }
}

function assinar(corpo: string): string {
  return "sha256=" + crypto.createHmac("sha256", SEGREDO_META_TESTE).update(corpo).digest("hex")
}

/** Payload real do WhatsApp Cloud API, na forma que a rota lê. */
function corpoWhatsApp(params: { phoneNumberId: string; wamid: string; from: string }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-900-25",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5544000000000",
                phone_number_id: params.phoneNumberId,
              },
              contacts: [{ profile: { name: "Fixture 900-25" }, wa_id: params.from }],
              messages: [
                {
                  from: params.from,
                  id: params.wamid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "mensagem de fixture da Story 900-25" },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

async function postarWhatsApp(corpo: unknown): Promise<Response> {
  const bruto = JSON.stringify(corpo)
  return postWhatsApp(
    new NextRequest("http://localhost/api/webhook/whatsapp", {
      method: "POST",
      body: bruto,
      headers: { "content-type": "application/json", "x-hub-signature-256": assinar(bruto) },
    }),
  )
}

/** Payload `leadgen` da Meta. `entry[0].id` é o `page_id` — é ele que resolve a org. */
function corpoMetaAds(params: { pageId: string; leadgenId: string; telefone: string }) {
  return {
    object: "page",
    entry: [
      {
        id: params.pageId,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: params.leadgenId,
              form_id: "form-900-25",
              page_id: params.pageId,
              created_time: Math.floor(Date.now() / 1000),
              // `field_data` inline faz `fetchLeadData` devolver sem tocar a Graph API
              // (`process-lead.ts`, ramo AC2). Zero chamada externa nesta AC.
              field_data: [
                { name: "full_name", values: ["Fixture Meta 900-25"] },
                { name: "phone_number", values: [params.telefone] },
              ],
            },
          },
        ],
      },
    ],
  }
}

async function postarMetaAds(corpo: unknown): Promise<Response> {
  const bruto = JSON.stringify(corpo)
  return postMetaAds(
    new NextRequest("http://localhost/api/webhooks/meta-ads", {
      method: "POST",
      body: bruto,
      headers: { "content-type": "application/json", "x-hub-signature-256": assinar(bruto) },
    }),
  )
}

/** Executa os `after()` acumulados. Usado SÓ pela AC9 — ver cabeçalho. */
async function rodarAgendados(): Promise<void> {
  const fila = agendados.splice(0, agendados.length)
  for (const fn of fila) await fn()
}

/** Descarta os `after()` acumulados sem executá-los (WhatsApp — ver cabeçalho). */
function descartarAgendados(): void {
  agendados.length = 0
}

// ---------------------------------------------------------------------------

describe.skipIf(!credenciaisPresentes)("Camada B — duas empresas reais (trifold-crm-dev)", () => {
  let envDaSuite: EnvSalva

  beforeAll(async () => {
    admin = criarClienteDeTeste()
    runId = crypto.randomUUID()

    // Task 11.0 — a lista de tabelas com FK bloqueante é DERIVADA do catálogo, uma vez, aqui.
    bloqueantes = await derivarTabelasBloqueantes()
    // eslint-disable-next-line no-console
    console.log(
      `[900-25] FKs bloqueantes derivadas de pg_constraint (${bloqueantes.length}): ` +
        bloqueantes.map((b) => `${b.tabela}.${b.coluna}`).join(", "),
    )

    // Task 0.3 — o canário tem que existir. Sem ele a suíte falha CEDO, nomeando a org esperada,
    // nunca segue em silêncio.
    const idCanario = await idDeOrgPorSlug(admin, SLUG_CANARIO)
    if (!idCanario) {
      throw new Error(
        `pré-condição: a organização canário "${SLUG_CANARIO}" não existe em trifold-crm-dev. ` +
          "A AC14 depende dela para provar que a suíte não perturbou nada além das próprias " +
          "fixtures. Não prosseguir sem canário.",
      )
    }
    canarioId = idCanario

    // Limpeza de resíduo de uma execução ANTERIOR interrompida. Continua sendo por id: o slug só
    // resolve o id; quem apaga é `.in("id", [...])`. Sem isto, um crash no meio deixaria orgs
    // vivas e a AC5 da execução seguinte explodiria na AC errada (o efeito de 2ª ordem do D4).
    const residuais: string[] = []
    for (const slug of [SLUG_A, SLUG_B, SLUG_C]) {
      const id = await idDeOrgPorSlug(admin, slug)
      if (id) residuais.push(id)
    }
    if (residuais.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[900-25] resíduo de execução anterior: ${residuais.length} org(s) — apagando`)
      await apagarOrgsDeTeste(admin, residuais, bloqueantes)
    }

    canarioAntes = await contarLinhasDoCanario(admin, canarioId)

    // Redirecionamento de env (Dev Notes) — SEMPRE depois de `confirmarDestinoDeTeste()`, que
    // `criarClienteDeTeste()`/`envDoBancoDeTeste()` já executaram: primeiro se confirma que a URL
    // não é produção, só então o valor é copiado para as vars que o código de produção lê.
    envDaSuite = aplicarEnv({
      ...envDoBancoDeTeste(),
      WEBHOOK_ORG_ROUTING: "identifier",
      META_APP_SECRET: SEGREDO_META_TESTE,
      CRON_SECRET: SEGREDO_CRON_TESTE,
      // Sem token não há como um `fetch` acidental à Graph API ser autenticado.
      META_PAGE_ACCESS_TOKEN: undefined,
    })
  })

  afterAll(async () => {
    // Rede de segurança: se algum `it()` anterior derrubou a suíte antes da AC14, as orgs-fixture
    // não podem ficar vivas no banco compartilhado.
    if (!teardownExecutado && orgAId && orgBId) {
      try {
        await apagarOrgsDeTeste(admin, [orgAId, orgBId], bloqueantes, idsComOrgIdNuloDaAC10)
        // eslint-disable-next-line no-console
        console.warn("[900-25] teardown de emergência executado no afterAll (a AC14 não rodou).")
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[900-25] teardown de emergência FALHOU:", e)
      }
    }
    if (idsWebhookLogsDaAC9.length > 0) {
      // `webhook_logs.org_id` é SET NULL (ver AC14): deletar as orgs ANULA a referência mas deixa
      // a linha. Estas são as linhas que a própria suíte criou — apagadas por id.
      await admin.from("webhook_logs").delete().in("id", idsWebhookLogsDaAC9)
    }
    envDaSuite?.restaurar()
  })

  // -------------------------------------------------------------------------
  // AC4 — assertion 1
  // -------------------------------------------------------------------------
  it("AC4 · assertion 1 — `provision_org` é idempotente e dá ids DISTINTOS às duas empresas", async () => {
    const orgAId1 = await provisionarOrg(admin, "Org A — 900-25", SLUG_A)
    const orgBId1 = await provisionarOrg(admin, "Org B — 900-25", SLUG_B)
    expect(orgAId1).not.toBe(orgBId1)

    const orgAId2 = await provisionarOrg(admin, "Org A — 900-25", SLUG_A)
    expect(orgAId2).toBe(orgAId1)

    const linhasComEsseSlug = await linhasDe<{ id: string }>(
      () => admin.from("organizations").select("id").eq("slug", SLUG_A),
      "organizations por slug",
    )
    expect(linhasComEsseSlug).toHaveLength(1)

    orgAId = orgAId1
    orgBId = orgBId1
  })

  // -------------------------------------------------------------------------
  // AC5 — assertion 2
  // -------------------------------------------------------------------------
  it("AC5 · assertion 2 — cada empresa nasce com 1 `whatsapp_config` inactive e 6 `org_integrations` disconnected", async () => {
    for (const orgId of [orgAId, orgBId]) {
      const wa = await linhasDe<{
        status: string
        phone_number_id: string | null
        access_token: string | null
      }>(
        () =>
          admin
            .from("whatsapp_config")
            .select("status, phone_number_id, access_token")
            .eq("org_id", orgId),
        `whatsapp_config(${orgId})`,
      )
      expect(wa).toHaveLength(1)
      expect(wa[0]).toMatchObject({
        status: "inactive",
        phone_number_id: null,
        access_token: null,
      })

      const integ = await linhasDe<{ provider: string; status: string }>(
        () => admin.from("org_integrations").select("provider, status").eq("org_id", orgId),
        `org_integrations(${orgId})`,
      )
      // SEIS, não sete — `resend` fica de fora por decisão do dono do produto (migration 246,
      // seção 3, bloco 6). O plano aprovado diz 7; a story está certa e o plano está velho.
      expect(integ).toHaveLength(6)
      expect(new Set(integ.map((i) => i.provider))).toEqual(
        new Set(["whatsapp", "meta_ads", "meta_capi", "sienge", "telegram", "google"]),
      )
      expect(integ.every((i) => i.status === "disconnected")).toBe(true)
    }
  })

  // -------------------------------------------------------------------------
  // AC6 — assertion 3: "se este passo passar sem erro, o índice não existe e todo o resto é teatro"
  // -------------------------------------------------------------------------
  describe("AC6 · assertion 3 — as UNIQUE parciais falham, NOMEANDO a constraint", () => {
    it("controle positivo: ativar A e B com telefones DISTINTOS funciona sem erro", async () => {
      const { error: erroA } = await admin
        .from("whatsapp_config")
        .update({ status: "active", phone_number_id: TELEFONE_PA })
        .eq("org_id", orgAId)
      expect(erroA).toBeNull()

      const { error: erroB } = await admin
        .from("whatsapp_config")
        .update({ status: "active", phone_number_id: TELEFONE_PB })
        .eq("org_id", orgBId)
      expect(erroB).toBeNull()

      // Se esta etapa falhasse, o índice estaria restritivo DEMAIS e as asserções de falha
      // seguintes não provariam nada — passariam pelo motivo errado.
      const ativos = await linhasDe<{ org_id: string; phone_number_id: string }>(
        () =>
          admin
            .from("whatsapp_config")
            .select("org_id, phone_number_id")
            .in("org_id", [orgAId, orgBId])
            .eq("status", "active"),
        "whatsapp_config ativos",
      )
      expect(ativos).toHaveLength(2)
    })

    it("`whatsapp_config_phone_ativo`: terceira linha ativa com `PA` repetido FALHA 23505 nomeando o índice", async () => {
      const { error } = await admin
        .from("whatsapp_config")
        .insert({ org_id: orgAId, status: "active", phone_number_id: TELEFONE_PA })
      expect(error).not.toBeNull()
      expect(error!.code).toBe("23505")
      // O DISCRIMINANTE (D3): sem o nome, este insert viola AS DUAS UNIQUE ao mesmo tempo
      // (`org_ativo` também, porque a org A já tem uma linha ativa) e ficaria verde mesmo se
      // `whatsapp_config_phone_ativo` não existisse.
      expect(error!.message).toContain("whatsapp_config_phone_ativo")
    })

    it("`whatsapp_config_phone_ativo` ISOLADO — org C própria, sem depender de ordem de OID (Menor 7)", async () => {
      // O caso acima discrimina HOJE porque o Postgres nomeia o primeiro índice que checa, e
      // "primeiro" é acidente de ordem de criação (oid), não garantia da migration. A org C não
      // tem nenhuma outra linha ativa própria: `org_ativo` não tem o que reprovar nela, então só
      // `phone_ativo` pode disparar.
      const orgCId = await provisionarOrg(
        admin,
        "Org C — 900-25 (isolamento phone_ativo)",
        SLUG_C,
      )
      try {
        const { error } = await admin
          .from("whatsapp_config")
          .insert({ org_id: orgCId, status: "active", phone_number_id: TELEFONE_PA })
        expect(error).not.toBeNull()
        expect(error!.code).toBe("23505")
        expect(error!.message).toContain("whatsapp_config_phone_ativo")
      } finally {
        // Desmonte imediato, por id — a org C não vaza para nenhuma outra AC.
        await apagarOrgsDeTeste(admin, [orgCId], bloqueantes)
      }
    })

    it("`whatsapp_config_org_ativo` ISOLADO — segunda linha ativa na própria org B, telefone diferente", async () => {
      // `PB2` não colide com nenhum telefone existente: só `org_ativo` pode reprovar. Sem este
      // caso, `org_ativo` nasceria "provado" de carona no teste do `phone_ativo`.
      const { error } = await admin
        .from("whatsapp_config")
        .insert({ org_id: orgBId, status: "active", phone_number_id: `${TELEFONE_PB}2` })
      expect(error).not.toBeNull()
      expect(error!.code).toBe("23505")
      expect(error!.message).toContain("whatsapp_config_org_ativo")
    })

    it("`org_integrations_meta_page_ativo`: `page_id` repetido entre A e B FALHA nomeando o índice", async () => {
      const { error: erroA } = await admin
        .from("org_integrations")
        .update({ config: { page_id: PAGE_A } })
        .eq("org_id", orgAId)
        .eq("provider", "meta_ads")
      expect(erroA).toBeNull()

      const { error: erroPageId } = await admin
        .from("org_integrations")
        .update({ config: { page_id: PAGE_A } })
        .eq("org_id", orgBId)
        .eq("provider", "meta_ads")
      expect(erroPageId).not.toBeNull()
      expect(erroPageId!.code).toBe("23505")
      expect(erroPageId!.message).toContain("org_integrations_meta_page_ativo")

      // Com o índice provado, B recebe o SEU page_id — é o que a AC9 exercita.
      const { error: erroB } = await admin
        .from("org_integrations")
        .update({ config: { page_id: PAGE_B } })
        .eq("org_id", orgBId)
        .eq("provider", "meta_ads")
      expect(erroB).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // AC7 + AC8 — assertions 4 e 5
  // -------------------------------------------------------------------------
  describe("AC7/AC8 · assertions 4 e 5 — WhatsApp roteia por `phone_number_id`, nos dois sentidos", () => {
    it("`PB` → org B recebe; org A fica INALTERADA; e a mensagem É GRAVADA (a asserção central)", async () => {
      const antesA = await contarDaOrg(orgAId)
      const wamid = `wamid.900-25-${runId}-b`

      const res = await postarWhatsApp(
        corpoWhatsApp({ phoneNumberId: TELEFONE_PB, wamid, from: TELEFONE_LEAD_B }),
      )
      descartarAgendados()
      expect(res.status).toBe(200)

      // AC8 — 200 sozinho NÃO distingue "processou" de "caiu no ramo silencioso": os dois branches
      // devolvem `{ status: "ok" }`. É exatamente assim que o bug agudo original respondia. A
      // distinção só existe olhando o efeito no banco.
      //
      // ⚠️ `messages` NÃO tem coluna `org_id` (medido no information_schema de trifold-crm-dev:
      // id, conversation_id, role, content, media_url, media_type, metadata, created_at). O escopo
      // de organização da mensagem é `conversation_id → conversations.org_id`. A AC8 escreve
      // `msg.org_id`; a pergunta que ela faz é atendida pelo join, e é ele que está aqui.
      const msgs = await linhasDe<{ id: string; conversation_id: string }>(
        () =>
          admin
            .from("messages")
            .select("id, conversation_id")
            .eq("metadata->>whatsapp_message_id", wamid)
            .limit(2),
        "messages por wamid",
      )
      expect(msgs).toHaveLength(1)

      const conversas = await linhasDe<{ id: string; org_id: string; lead_id: string }>(
        () =>
          admin
            .from("conversations")
            .select("id, org_id, lead_id")
            .eq("id", msgs[0]!.conversation_id)
            .limit(2),
        "conversations da mensagem",
      )
      expect(conversas).toHaveLength(1)
      expect(conversas[0]!.org_id).toBe(orgBId)

      const leads = await linhasDe<{ id: string; org_id: string }>(
        () => admin.from("leads").select("id, org_id").eq("id", conversas[0]!.lead_id).limit(2),
        "lead da conversa",
      )
      expect(leads).toHaveLength(1)
      expect(leads[0]!.org_id).toBe(orgBId)

      // A outra empresa não foi tocada.
      const depoisA = await contarDaOrg(orgAId)
      expect(depoisA).toEqual(antesA)
    })

    it("`PA` → org A recebe; org B fica INALTERADA (o sentido simétrico, não assumido)", async () => {
      // Um resolver que sempre devolvesse B passaria no teste anterior sozinho. É por isso que os
      // dois sentidos são obrigatórios.
      const antesB = await contarDaOrg(orgBId)
      const wamid = `wamid.900-25-${runId}-a`

      const res = await postarWhatsApp(
        corpoWhatsApp({ phoneNumberId: TELEFONE_PA, wamid, from: TELEFONE_LEAD_A }),
      )
      descartarAgendados()
      expect(res.status).toBe(200)

      const msgs = await linhasDe<{ id: string; conversation_id: string }>(
        () =>
          admin
            .from("messages")
            .select("id, conversation_id")
            .eq("metadata->>whatsapp_message_id", wamid)
            .limit(2),
        "messages por wamid (sentido A)",
      )
      expect(msgs).toHaveLength(1)

      const conversas = await linhasDe<{ id: string; org_id: string }>(
        () =>
          admin
            .from("conversations")
            .select("id, org_id")
            .eq("id", msgs[0]!.conversation_id)
            .limit(2),
        "conversations da mensagem (sentido A)",
      )
      expect(conversas).toHaveLength(1)
      expect(conversas[0]!.org_id).toBe(orgAId)

      const depoisB = await contarDaOrg(orgBId)
      expect(depoisB).toEqual(antesB)
    })
  })

  // -------------------------------------------------------------------------
  // AC9 — assertion 6
  // -------------------------------------------------------------------------
  /**
   * A AC9 escreve "mesmo padrão da AC7" e nomeia os DOIS `page_id` (`PAGE-A`/`PAGE-B`) — então os
   * dois sentidos valem aqui pela mesma razão que valem lá, e ela é a razão central desta story:
   * **um resolver que sempre devolvesse a org A passaria num teste de um sentido só**, e o
   * sentido único ainda ficaria verde na metade "a outra org não foi tocada". Um `describe.each`
   * com os dois sentidos torna a simetria estrutural, não uma promessa de quem escreveu.
   */
  describe.each([
    { rotulo: "PAGE-A → org A", pageId: () => PAGE_A, dono: () => orgAId, outra: () => orgBId, sufixo: "a" },
    { rotulo: "PAGE-B → org B", pageId: () => PAGE_B, dono: () => orgBId, outra: () => orgAId, sufixo: "b" },
  ])(
    "AC9 · assertion 6 — Meta Ads roteia por `page_id`, com `webhook_logs.org_id` correto",
    ({ rotulo, pageId, dono, outra, sufixo }) => {
      it(`${rotulo}; a outra empresa fica INALTERADA`, async () => {
        // Efeito colateral escopado (mesma disciplina do D7): e-mail automático e roleta são
        // transporte externo, não o objeto sob teste. `vi.spyOn` — nunca `vi.mock` — para não
        // vazar para o resto do arquivo.
        const spyAutomations = vi
          .spyOn(moduloAutomations, "triggerAutomations")
          .mockResolvedValue(undefined as never)
        const spyRoleta = vi
          .spyOn(moduloRoleta, "distributeLeadToNextBroker")
          .mockResolvedValue(undefined as never)

        try {
          const orgDona = dono()
          const orgOutra = outra()
          const antesOutra = await contarDaOrg(orgOutra)
          const leadgenId = `leadgen-900-25-${runId}-${sufixo}`

          const res = await postarMetaAds(
            corpoMetaAds({
              pageId: pageId(),
              leadgenId,
              telefone: `551197777000${sufixo === "a" ? "1" : "2"}`,
            }),
          )
          expect(res.status).toBe(200)
          // Nesta rota a resolução de org mora DENTRO do `after()` — aqui ele é executado de
          // propósito: é o objeto sob teste.
          await rodarAgendados()

          const leads = await linhasDe<{ id: string; org_id: string }>(
            () =>
              admin
                .from("leads")
                .select("id, org_id")
                .eq("metadata->>leadgen_id", leadgenId)
                .limit(2),
            "lead por leadgen_id",
          )
          expect(leads).toHaveLength(1)
          expect(leads[0]!.org_id).toBe(orgDona)

          // A linha de `webhook_logs` é inserida pela rota ANTES de resolver a org (Task 5.4 da
          // 900-24) e recebe o `org_id` depois do processamento — nunca fica `null` quando
          // resolveu.
          const logs = await linhasDe<{ id: string; org_id: string | null; processed: boolean }>(
            () =>
              admin
                .from("webhook_logs")
                .select("id, org_id, processed")
                .eq("leadgen_id", leadgenId)
                .order("created_at", { ascending: false })
                .limit(2),
            "webhook_logs por leadgen_id",
          )
          expect(logs).toHaveLength(1)
          expect(logs[0]!.org_id).toBe(orgDona)
          idsWebhookLogsDaAC9.push(logs[0]!.id)

          const depoisOutra = await contarDaOrg(orgOutra)
          expect(depoisOutra).toEqual(antesOutra)
        } finally {
          spyAutomations.mockRestore()
          spyRoleta.mockRestore()
        }
      })
    },
  )

  // -------------------------------------------------------------------------
  // AC10 — assertion 7
  // -------------------------------------------------------------------------
  it("AC10 · assertion 7 — `phone_number_id` DESCONHECIDO → 200, zero mensagem, log nos dois lugares", async () => {
    // Identificador único por execução (D5): `logOrgUnresolved` NÃO passa `dedupe_key`, então cada
    // execução insere linha nova. Com um literal constante, a 2ª execução acharia duas linhas.
    const identificadorDesteRun = `PHONE-DESCONHECIDO-900-25-${runId}`
    const wamid = `wamid.900-25-${runId}-desconhecido`

    const res = await postarWhatsApp(
      corpoWhatsApp({
        phoneNumberId: identificadorDesteRun,
        wamid,
        from: "5511966660001",
      }),
    )
    descartarAgendados()
    // O 200 é AC: a Meta desabilita o webhook após falhas repetidas.
    expect(res.status).toBe(200)

    const msgs = await linhasDe<{ id: string }>(
      () => admin.from("messages").select("id").eq("metadata->>whatsapp_message_id", wamid),
      "messages do identificador desconhecido",
    )
    expect(msgs).toHaveLength(0)

    const eventos = await linhasDe<{ id: string; org_id: string | null }>(
      () =>
        admin
          .from("system_events")
          .select("id, event_type, org_id, metadata")
          .eq("event_type", "WEBHOOK_ORG_UNRESOLVED")
          .eq("metadata->identificador->>phone_number_id", identificadorDesteRun)
          .order("created_at", { ascending: false })
          .limit(2),
      "system_events WEBHOOK_ORG_UNRESOLVED",
    )
    expect(eventos).toHaveLength(1)
    expect(eventos[0]!.org_id).toBeNull()

    const logs = await linhasDe<{ id: string; org_id: string | null; processing_error: string }>(
      () =>
        admin
          .from("webhook_logs")
          .select("id, org_id, processing_error")
          .eq("payload->>phone_number_id", identificadorDesteRun)
          .order("created_at", { ascending: false })
          .limit(2),
      "webhook_logs de não-resolução",
    )
    expect(logs).toHaveLength(1)
    expect(logs[0]!.org_id).toBeNull()

    // Handoff AC10 → AC14, DE FATO consumido (Menor 5): as duas linhas nascem com `org_id: null`,
    // logo nenhum `.eq("org_id", …)` do teardown as alcança. Só por id.
    idsComOrgIdNuloDaAC10.systemEvents.push(eventos[0]!.id)
    idsComOrgIdNuloDaAC10.webhookLogs.push(logs[0]!.id)
  })

  // -------------------------------------------------------------------------
  // AC12 — assertion 9
  // -------------------------------------------------------------------------
  it("AC12 · assertion 9 — erro de uma org NÃO contamina a outra, com os dois `orgId` nomeados", async () => {
    // `forEachActiveOrg` chama `createAdminClient()` internamente para listar `organizations`
    // (D9) — o redirecionamento de env do `beforeAll` é o que faz esse client apontar para o
    // banco de teste em vez de `createClient("", "")`.
    const resumo = await forEachActiveOrg(
      async (org) => {
        if (org.id === orgAId) throw new Error("falha forçada 900-25")
        return "ok"
      },
      { source: "tests/tenancy/isolamento-900-25" },
    )

    // Só as entradas de A e B, por `find` — nunca `resumo.total`/`sucesso`/`falha`, que incluem o
    // canário e qualquer outra org viva no banco compartilhado.
    const entradaA = resumo.resultados.find((r) => r.org.id === orgAId)
    const entradaB = resumo.resultados.find((r) => r.org.id === orgBId)
    expect(entradaA).toBeDefined()
    expect(entradaB).toBeDefined()
    expect(entradaA!.ok).toBe(false)
    expect(entradaA!.ok === false ? entradaA!.erro : "").toContain("falha forçada 900-25")
    expect(entradaB!.ok).toBe(true)
  })

  // -------------------------------------------------------------------------
  // AC13 — assertion 10
  // -------------------------------------------------------------------------
  it("AC13 · assertion 10 — `daily-report`: um despacho por org, `DAILY_REPORT_RECIPIENTS` escopado a A", async () => {
    const chamadasEnvio: Array<{ orgId: string; recipients: string[] }> = []
    // D7 — `sendDailyReport` checa `phone_number_id`/`access_token`, NÃO checa `status`. Uma
    // terceira org que outro trabalho no mesmo banco tenha deixado com token real receberia um
    // `fetch` de verdade à Graph API só por esta suíte ter rodado a rota inteira. O stub torna
    // "nenhuma org recebe envio real" verdade POR DESENHO, não por sorte do estado do banco.
    const stubEnvio = vi
      .spyOn(moduloEnvioRelatorio, "sendDailyReport")
      .mockImplementation(async (_admin, orgId, recipients) => {
        chamadasEnvio.push({ orgId, recipients })
        return { sent: recipients.length, errors: [] }
      })

    // N3 — `trifoldOrgId()` RESOLVE em trifold-crm-dev: devolve o id que É o da org canário. Sem
    // este override, os telefones de `DAILY_REPORT_RECIPIENTS` valeriam para o CANÁRIO — a org
    // que esta suíte promete não perturbar. O override não é conveniência, é contenção.
    const envDaAC13 = aplicarEnv({
      DAILY_REPORT_ORG_ID: orgAId,
      DAILY_REPORT_RECIPIENTS: TELEFONE_FIXTURE_900_25, // a forma BRUTA — quem normaliza é a rota
    })

    try {
      const res = await getDailyReport(
        new NextRequest("http://localhost/api/cron/daily-report", {
          headers: { authorization: `Bearer ${SEGREDO_CRON_TESTE}` },
        }),
      )
      const corpo = (await res.json()) as {
        resultados: Array<{ orgId: string; ok: boolean }>
      }

      const chamadaOrgA = chamadasEnvio.find((c) => c.orgId === orgAId)
      const chamadaOrgB = chamadasEnvio.find((c) => c.orgId === orgBId)

      // Metade POSITIVA — a env FOI aplicada a A. Compara contra a forma NORMALIZADA porque é
      // isso que `mergeRecipients` devolve (N4). Relaxar isto para `toBeDefined()` mataria a
      // metade positiva da prova: passaria inclusive com o telefone descartado.
      expect(chamadaOrgA?.recipients).toEqual([TELEFONE_FIXTURE_900_25_NORMALIZADO])
      // Metade NEGATIVA — B teve `destinatarios.length === 0`, logo nunca chamou o envio.
      expect(chamadaOrgB).toBeUndefined()

      // Um despacho por org — `find`, nunca "só duas entradas no total".
      expect(corpo.resultados.filter((r) => r.orgId === orgAId)).toHaveLength(1)
      expect(corpo.resultados.filter((r) => r.orgId === orgBId)).toHaveLength(1)
    } finally {
      envDaAC13.restaurar()
      stubEnvio.mockRestore()
    }
  })

  // -------------------------------------------------------------------------
  // AC14 — assertion 11
  // -------------------------------------------------------------------------
  it("AC14 · assertion 11 — teardown por id: apaga o que disse que apagaria, e NADA além", async () => {
    await apagarOrgsDeTeste(admin, [orgAId, orgBId], bloqueantes, idsComOrgIdNuloDaAC10)
    teardownExecutado = true

    // "Apaguei o que disse que apagaria" — a pergunta que o canário NÃO faz (D4). Sem ela, um
    // teardown que devolve `23503` e não apaga nada deixa a suíte VERDE, com as duas orgs vivas
    // e `active` no banco compartilhado para sempre.
    expect(await orgsRemanescentes(admin, [orgAId, orgBId])).toHaveLength(0)

    // "Não apaguei demais" — o canário.
    const canarioDepois = await contarLinhasDoCanario(admin, canarioId)
    expect(canarioDepois).toEqual(canarioAntes)
  })
})
