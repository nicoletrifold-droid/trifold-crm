/**
 * Story 900-25 · AC11 (assertion 8) — `meta-capi-dispatch`: outbox por org, transporte CAPI
 * stubado, isolamento medido por `external_id`.
 *
 * ## Por que este arquivo é SEPARADO do `cross-tenant.test.ts` (D6 do parecer do `@po`)
 *
 * O stub de `sendCapiEvents` vive no barrel `@trifold/shared` — o mesmo de onde a guarda de
 * destino da AC3 importa `ehRefDeProducao`. Se esta AC morasse no mesmo arquivo das demais e
 * usasse `vi.mock("@trifold/shared", …)`, que é **hoisted e vale para o arquivo inteiro**, a
 * guarda deixaria de ser a real sem ninguém perceber. Duas defesas, não uma: arquivo próprio
 * **e** `vi.spyOn` (não hoisted, afeta só o export nomeado, restaura sozinho).
 *
 * ## Fixtures próprias, teardown próprio
 *
 * `provision_org` é idempotente, então provisionar orgs próprias (`-capi`) é mais simples e mais
 * seguro do que coordenar teardown entre dois arquivos. O canário e a derivação de FKs por
 * `pg_constraint` são replicados aqui — não compartilhados.
 *
 * ## O efeito colateral que o D7 mandou escopar, e ele é IRREVERSÍVEL
 *
 * O `GET` deste cron varre `meta_capi_outbox` com `.eq("status","pending")` **sem filtro de org**:
 * linhas pendentes de QUALQUER organização do `trifold-crm-dev` compartilhado entram no lote. E
 * `skipped` é **terminal** — o comentário da própria rota registra que nada neste repositório
 * devolve `skipped` para `pending`. Rodar esta AC sem cuidado mutaria, permanentemente, a fila de
 * outra pessoa. Daí a pré-condição que ABORTA (não ignora) logo abaixo.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  aplicarEnv,
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
  orgsRemanescentes,
  provisionarOrg,
  type ContagemDoCanario,
  type TabelaBloqueante,
} from "./support/fixtures"

import * as barrelCompartilhado from "@trifold/shared"
import type { CapiEvent, SendCapiEventsOptions } from "@trifold/shared"

const SLUG_A_CAPI = "org-a-900-25-capi"
const SLUG_B_CAPI = "org-b-900-25-capi"
const DATASET_A = "dataset-teste-a-900-25"
const SEGREDO_CRON_TESTE = "cron-secret-900-25-capi"

let admin: SupabaseClient
let orgAId = ""
let orgBId = ""
let leadAId = ""
let leadBId = ""
let outboxAId = ""
let outboxBId = ""
let canarioId = ""
let canarioAntes: ContagemDoCanario
let bloqueantes: TabelaBloqueante[] = []
let teardownExecutado = false

const chamadasCapi: Array<{ events: CapiEvent[]; options?: SendCapiEventsOptions }> = []

/**
 * `logEvent` (`CAPI_ORG_SEM_DATASET`) é fire-and-forget e grava em `system_events` com o `org_id`
 * da org B. Se essa escrita aterrissasse ENTRE o `DELETE FROM system_events` e o
 * `DELETE FROM organizations` do teardown, o segundo levaria `23503`. Não é hipótese elegante: é
 * a única janela real de flakiness deste arquivo, e 300ms a fecham de forma barata e explícita.
 */
function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe.skipIf(!credenciaisPresentes)("AC11 — meta-capi-dispatch com duas empresas", () => {
  let envDaSuite: EnvSalva
  let getDispatch: (req: Request) => Promise<Response>
  let stubCapi: ReturnType<typeof vi.spyOn>

  beforeAll(async () => {
    admin = criarClienteDeTeste()
    bloqueantes = await derivarTabelasBloqueantes()

    const idCanario = await idDeOrgPorSlug(admin, SLUG_CANARIO)
    if (!idCanario) {
      throw new Error(
        `pré-condição: a organização canário "${SLUG_CANARIO}" não existe em trifold-crm-dev.`,
      )
    }
    canarioId = idCanario

    // Resíduo de execução anterior interrompida — apagado ANTES da pré-condição, senão as nossas
    // próprias linhas órfãs seriam contadas como "pendentes de terceiros" e abortariam a suíte.
    const residuais: string[] = []
    for (const slug of [SLUG_A_CAPI, SLUG_B_CAPI]) {
      const id = await idDeOrgPorSlug(admin, slug)
      if (id) residuais.push(id)
    }
    if (residuais.length > 0) {
      await apagarOrgsDeTeste(admin, residuais, bloqueantes)
    }

    // ── Task 8.0 — a pré-condição que ABORTA (D7).
    // Aqui as orgs deste arquivo ainda NÃO existem, então qualquer linha `pending` é de terceiro,
    // por construção — mais estrito (e mais simples) do que o `.not(org_id, in, …)` da AC, que
    // pressupunha as orgs já provisionadas.
    const { data: pendentesDeTerceiros, error: erroPend } = await admin
      .from("meta_capi_outbox")
      .select("id, org_id")
      .eq("status", "pending")
    if (erroPend) throw erroPend
    if ((pendentesDeTerceiros ?? []).length > 0) {
      throw new Error(
        `AC11 abortada: ${pendentesDeTerceiros!.length} linha(s) 'pending' de outra(s) org(ns) em ` +
          `meta_capi_outbox (ids: ${pendentesDeTerceiros!
            .map((r) => (r as { id: string }).id)
            .join(", ")}) — rodar o cron real marcaria essas linhas como 'skipped' (terminal, ` +
          "irreversível). Não prosseguir.",
      )
    }

    canarioAntes = await contarLinhasDoCanario(admin, canarioId)

    orgAId = await provisionarOrg(admin, "Org A — 900-25 (CAPI)", SLUG_A_CAPI)
    orgBId = await provisionarOrg(admin, "Org B — 900-25 (CAPI)", SLUG_B_CAPI)

    // Org A ganha dataset; org B PERMANECE com `dataset_id: null` (seed padrão da migration 246).
    const { error: erroDataset } = await admin
      .from("org_integrations")
      .update({ config: { dataset_id: DATASET_A } })
      .eq("org_id", orgAId)
      .eq("provider", "meta_capi")
    if (erroDataset) throw erroDataset

    // Um lead por org.
    const { data: leads, error: erroLeads } = await admin
      .from("leads")
      .insert([
        { org_id: orgAId, name: "Lead A — 900-25", phone: "5511955550001" },
        { org_id: orgBId, name: "Lead B — 900-25", phone: "5511955550002" },
      ])
      .select("id, org_id")
    if (erroLeads) throw erroLeads
    const linhasLead = (leads ?? []) as Array<{ id: string; org_id: string }>
    leadAId = linhasLead.find((l) => l.org_id === orgAId)!.id
    leadBId = linhasLead.find((l) => l.org_id === orgBId)!.id

    // Outbox `pending`, `event_id` determinístico (é o que faz a Meta deduplicar — Story 86-2).
    const { data: outbox, error: erroOutbox } = await admin
      .from("meta_capi_outbox")
      .insert([
        { org_id: orgAId, lead_id: leadAId, event_id: `900-25-capi-a-${leadAId}` },
        { org_id: orgBId, lead_id: leadBId, event_id: `900-25-capi-b-${leadBId}` },
      ])
      .select("id, org_id")
    if (erroOutbox) throw erroOutbox
    const linhasOutbox = (outbox ?? []) as Array<{ id: string; org_id: string }>
    outboxAId = linhasOutbox.find((l) => l.org_id === orgAId)!.id
    outboxBId = linhasOutbox.find((l) => l.org_id === orgBId)!.id

    envDaSuite = aplicarEnv({
      ...envDoBancoDeTeste(),
      CRON_SECRET: SEGREDO_CRON_TESTE,
    })

    // `meta-capi-dispatch/route.ts` lê `CRON_SECRET` no ESCOPO DE MÓDULO (`const CRON_SECRET =
    // process.env.CRON_SECRET`, fora do handler). Import estático rodaria antes do `aplicarEnv`
    // acima e a rota responderia 500 "Server misconfiguration" — falha por artefato de ordem, não
    // por comportamento. Daí o import dinâmico, aqui.
    const mod = await import("@web/app/api/cron/meta-capi-dispatch/route")
    getDispatch = mod.GET as unknown as (req: Request) => Promise<Response>

    // O stub CAPTURA o argumento — não só devolve sucesso. Sem a captura, a asserção de
    // isolamento ("nenhum evento de B saiu no dataset de A") seria insatisfazível por desenho.
    // Contrato REAL, medido em `packages/shared/src/meta/capi-client.ts`:
    // `sendCapiEvents(events, options?)` — não `(datasetId, events)`.
    stubCapi = vi
      .spyOn(barrelCompartilhado, "sendCapiEvents")
      .mockImplementation(async (events: CapiEvent[], options?: SendCapiEventsOptions) => {
        chamadasCapi.push({ events, options })
        // Forma REAL do retorno (`CapiSendResult`): `eventsReceived`, não `events_received`.
        // A rota compara `result.eventsReceived === events.length` para decidir `sent`.
        return { success: true, eventsReceived: events.length }
      }) as never
  })

  afterAll(async () => {
    stubCapi?.mockRestore()
    if (!teardownExecutado && orgAId && orgBId) {
      try {
        await esperar(300)
        await apagarOrgsDeTeste(admin, [orgAId, orgBId], bloqueantes)
        // eslint-disable-next-line no-console
        console.warn("[900-25/capi] teardown de emergência executado no afterAll.")
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[900-25/capi] teardown de emergência FALHOU:", e)
      }
    }
    envDaSuite?.restaurar()
  })

  it("assertion 8 — o evento de A sai no dataset de A; o de B NUNCA sai, e a linha dele vira `skipped`", async () => {
    const res = await getDispatch(
      new Request("http://localhost/api/cron/meta-capi-dispatch", {
        headers: { authorization: `Bearer ${SEGREDO_CRON_TESTE}` },
      }),
    )
    expect(res.status).toBe(200)

    const externalIdA = barrelCompartilhado.sha256Hex(leadAId)
    const externalIdB = barrelCompartilhado.sha256Hex(leadBId)

    // Exatamente UMA chamada, e ela leva o dataset da org A.
    const chamadasComDatasetA = chamadasCapi.filter((c) => c.options?.datasetId === DATASET_A)
    expect(chamadasComDatasetA).toHaveLength(1)

    const externalIdsDaChamadaA = chamadasComDatasetA[0]!.events.flatMap(
      (e) => e.user_data?.external_id ?? [],
    )
    expect(externalIdsDaChamadaA).toContain(externalIdA)
    expect(externalIdsDaChamadaA).not.toContain(externalIdB)

    // E em NENHUMA chamada capturada — não só na de A. Um envio de B para um dataset qualquer
    // seria vazamento do mesmo jeito.
    const externalIdsDeTodasAsChamadas = chamadasCapi.flatMap((c) =>
      c.events.flatMap((e) => e.user_data?.external_id ?? []),
    )
    expect(externalIdsDeTodasAsChamadas).not.toContain(externalIdB)
    expect(chamadasCapi).toHaveLength(1)

    // A linha de B: `skipped` com o motivo nomeado. Nunca `sent`, nunca `failed`.
    const { data: linhaB, error: erroB } = await admin
      .from("meta_capi_outbox")
      .select("id, status, last_error")
      .eq("id", outboxBId)
      .limit(2)
    expect(erroB).toBeNull()
    expect(linhaB).toHaveLength(1)
    expect(linhaB![0]).toMatchObject({ status: "skipped", last_error: "capi_nao_configurado" })

    // "Nenhuma linha fica `sent` a menos que o stub tenha sido chamado para ela": o carrasco é a
    // correspondência stub↔linha, não o rótulo sozinho. As linhas `sent` desta execução têm que
    // ser EXATAMENTE aquelas cujo `external_id` apareceu numa chamada capturada.
    const { data: linhasSent, error: erroSent } = await admin
      .from("meta_capi_outbox")
      .select("id, lead_id, status")
      .in("id", [outboxAId, outboxBId])
      .eq("status", "sent")
    expect(erroSent).toBeNull()
    const leadIdsMarcadosSent = ((linhasSent ?? []) as Array<{ lead_id: string }>).map(
      (l) => l.lead_id,
    )
    const leadIdsQueOStubViu = [leadAId, leadBId].filter((id) =>
      externalIdsDeTodasAsChamadas.includes(barrelCompartilhado.sha256Hex(id)),
    )
    expect(leadIdsMarcadosSent.sort()).toEqual(leadIdsQueOStubViu.sort())
    expect(leadIdsMarcadosSent).toEqual([leadAId])
  })

  it("AC14 (replicado) — teardown por id do arquivo da AC11, com canário próprio", async () => {
    await esperar(300) // ver `esperar()`: fecha a janela do `logEvent` fire-and-forget da org B
    await apagarOrgsDeTeste(admin, [orgAId, orgBId], bloqueantes)
    teardownExecutado = true

    expect(await orgsRemanescentes(admin, [orgAId, orgBId])).toHaveLength(0)
    expect(await contarLinhasDoCanario(admin, canarioId)).toEqual(canarioAntes)
  })
})
