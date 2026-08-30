/**
 * Story 900-25 — provisionamento, canário e teardown das organizações-fixture.
 *
 * ## A regra do teardown: apaga por id, nunca por predicado (AC14)
 *
 * Um teardown por `.like("slug", "%900-25%")` ou por intervalo de `created_at` é exatamente o tipo
 * de `DELETE` que a Onda 2 existe para tornar impossível em código de produção. Replicar o padrão
 * frouxo no teste que prova isolamento seria a ironia que o cabeçalho de `reset-tenancy-testdb.ts`
 * já nomeia.
 *
 * ## A lista de tabelas bloqueantes é DERIVADA, nunca escrita (N1 do parecer do `@po`)
 *
 * A v0.2 desta story carregava uma lista hardcoded, obtida por `grep` nos arquivos de migration.
 * O `@po` mediu contra `pg_constraint` e as três afirmações estavam erradas (eram **4** RESTRICT e
 * não 3 — faltava `financial_notification_log` —, **87** CASCADE e não 75, e o único `SET NULL` é
 * `webhook_logs.org_id`, não `meta_ad_accounts`). A causa é única e é a lição:
 * **o `grep` mede o arquivo de migration; o `DELETE` obedece ao catálogo.** Migration renomeada,
 * FK adicionada por `ALTER TABLE`, coluna redeclarada depois — nada disso aparece no grep, tudo
 * aparece no `pg_constraint`.
 *
 * Nem o nome da TABELA nem o da COLUNA são supostos aqui: os dois saem do catálogo. Supor
 * `org_id` seria a mesma classe de erro num grau menor.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  comRetryDeTransporte,
  consultarCatalogo,
  contarComRetryDeTransporte,
} from "./ambiente"

/** O slug da organização canário — a que a suíte promete NUNCA perturbar. */
export const SLUG_CANARIO = "org-teste-epic-900"

export interface TabelaBloqueante {
  tabela: string
  coluna: string
}

/**
 * Deriva, em runtime, as tabelas cuja FK para `organizations` **bloqueia** o `DELETE`.
 *
 * `confdeltype`: `'c'` = CASCADE e `'n'` = SET NULL não bloqueiam; qualquer outro valor
 * (`'a'` NO ACTION, `'r'` RESTRICT, `'d'` SET DEFAULT) bloqueia.
 */
export async function derivarTabelasBloqueantes(): Promise<TabelaBloqueante[]> {
  const linhas = await consultarCatalogo<{
    tabela: string
    coluna: string
    n_colunas: number
    schema: string
  }>(`
    SELECT DISTINCT
      c.conrelid::regclass::text        AS tabela,
      a.attname                         AS coluna,
      array_length(c.conkey, 1)         AS n_colunas,
      n.nspname                         AS schema
    FROM pg_constraint c
    JOIN pg_class     r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    JOIN unnest(c.conkey) k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND c.confrelid = 'organizations'::regclass
      AND c.confdeltype NOT IN ('c', 'n')
    ORDER BY 1
  `)

  // Duas condições que o `.from(tabela).delete().in(coluna, …)` do PostgREST não conseguiria
  // honrar. Falham NOMEANDO em vez de apagar a coisa errada — mesma disciplina do resto da AC14.
  const compostas = linhas.filter((l) => l.n_colunas !== 1)
  if (compostas.length > 0) {
    throw new Error(
      `teardown: FK COMPOSTA para organizations em ${compostas
        .map((l) => l.tabela)
        .join(", ")} — o delete por coluna única não a honra. Tratar à mão antes de prosseguir.`,
    )
  }
  const foraDoPublic = linhas.filter((l) => l.schema !== "public")
  if (foraDoPublic.length > 0) {
    throw new Error(
      `teardown: FK bloqueante fora do schema public (${foraDoPublic
        .map((l) => `${l.schema}.${l.tabela}`)
        .join(", ")}) — o PostgREST não alcança. Tratar à mão antes de prosseguir.`,
    )
  }

  return linhas.map(({ tabela, coluna }) => ({ tabela, coluna }))
}

/** `provision_org` direto pela RPC — sem passar pela rota de `/platform` (ver Dev Notes). */
export async function provisionarOrg(
  admin: SupabaseClient,
  nome: string,
  slug: string,
): Promise<string> {
  const { data, error } = await admin.rpc("provision_org", { p_name: nome, p_slug: slug })
  if (error) throw new Error(`provision_org("${slug}") falhou — ${error.message}`)
  if (typeof data !== "string" || data.length === 0) {
    throw new Error(`provision_org("${slug}") não devolveu um uuid: ${JSON.stringify(data)}`)
  }
  return data
}

/** Lê o id de uma org pelo slug. Nunca `.maybeSingle()` (regra D5 da story). */
export async function idDeOrgPorSlug(
  admin: SupabaseClient,
  slug: string,
): Promise<string | null> {
  const linhas = await comRetryDeTransporte<{ id: string }>(
    () => admin.from("organizations").select("id").eq("slug", slug).limit(2),
    `leitura de organizations(slug=${slug})`,
  )
  if (linhas.length === 0) return null
  if (linhas.length > 1) throw new Error(`slug ${slug} devolveu ${linhas.length} linhas`)
  return linhas[0]!.id
}

/**
 * As contagens do canário. `meta_capi_outbox` entra por causa da AC11 (D7 do parecer): o cron de
 * CAPI varre a outbox **sem filtro de org**, então "não mexi na outbox de terceiros" é uma
 * pergunta que o canário precisa saber responder.
 *
 * ## A lista sai do WRITE-SET do código sob teste, não da fallout de uma mutação
 *
 * A v1 desta lista tinha 4 tabelas e excluía `leads` com justificativa escrita (*"a suíte nunca
 * cria lead no canário, logo a contagem é constante e não discrimina"*). Uma mutação em
 * `resolveOrgByMetaPage` resolveu para o **canário** e gravou 2 leads + 2 `webhook_logs` dentro
 * dele — e o canário ficou **VERDE**. A vigilância era cega exatamente para *um lead caindo na
 * empresa errada*, o defeito-mãe da onda.
 *
 * A v2 corrigiu isso, mas pelo caminho errado: **a lista veio da fallout daquela mutação**, não do
 * write-set. Achado do `@qa` no gate: `activities` é alvo de INSERT do próprio receptor sob teste
 * (`process-lead.ts:422`, `lead_created`, sempre) e ficou de fora — e havia **8 linhas de
 * `activities` dentro do canário** deixadas pelos meus experimentos, que nenhuma contagem viu.
 *
 * Esta versão é derivada do write-set. O critério, escrito para o próximo: **entra toda tabela com
 * `org_id` na qual um caminho SÍNCRONO exercitado por esta suíte faz INSERT/UPSERT.** São 99 as
 * tabelas com `org_id` no schema; vigiar as 99 seria caro e ruidoso, e vigiar "as que deram
 * problema" é vigiar o passado.
 *
 * | tabela | quem escreve, no código sob teste |
 * |---|---|
 * | `leads` | `findOrUpsertLead` (WhatsApp) · `process-lead` (Meta Ads) |
 * | `conversations` | find-or-create do receptor de WhatsApp |
 * | `activities` | `process-lead` (`lead_created`, sempre) · WhatsApp (opt-out) |
 * | `webhook_logs` | rota de Meta Ads (antes de resolver) · `logOrgUnresolved` |
 * | `meta_capi_outbox` | `meta-capi-dispatch` (varredura GLOBAL, sem filtro de org — D7) |
 * | `organizations`, `whatsapp_config`, `org_integrations` | `provision_org` e o setup das fixtures |
 *
 * `messages` não entra e não precisa: **não tem `org_id`** e só é alcançável via `conversations`,
 * que está na lista. `campaign_entries`/`campaign_events` ficam fora porque só são escritas quando
 * existe entrada de campanha casando o telefone, e as fixtures desta suíte não criam nenhuma —
 * mas se um dia criarem, elas entram por este mesmo critério.
 *
 * ## `system_events` continua DE FORA, e esse motivo permanece medido
 *
 * `forEachActiveOrg` grava `CRON_ORG_PROCESSADA` com o `org_id` de **cada org ativa** — inclusive
 * o canário, que é uma org ativa como qualquer outra. As AC12/AC13 disparam isso **por desenho**,
 * em toda execução correta. Incluí-lo faria o canário ficar vermelho por motivo legítimo a cada
 * run, e vermelho legítimo recorrente é o que ensina a ignorar o instrumento.
 */
export const TABELAS_DO_CANARIO = [
  "organizations",
  "whatsapp_config",
  "org_integrations",
  "meta_capi_outbox",
  "leads",
  "conversations",
  "activities",
  "webhook_logs",
] as const

export type ContagemDoCanario = Record<(typeof TABELAS_DO_CANARIO)[number], number>

export async function contarLinhasDoCanario(
  admin: SupabaseClient,
  canarioId: string,
): Promise<ContagemDoCanario> {
  const saida = {} as ContagemDoCanario
  for (const tabela of TABELAS_DO_CANARIO) {
    const coluna = tabela === "organizations" ? "id" : "org_id"
    // AGREGADA, nunca `select().length` — QA-900-25-1: contar linhas satura no `max_rows` (1000)
    // do PostgREST, e canário saturado fica VERDE com escrita na org errada dentro dele.
    saida[tabela] = await contarComRetryDeTransporte(
      () => admin.from(tabela).select("*", { count: "exact", head: true }).eq(coluna, canarioId),
      `contagem do canário em ${tabela}`,
    )
  }
  return saida
}

/** Ids de linhas que nascem com `org_id: null` e por isso nenhum filtro por org alcança (AC10). */
export interface IdsComOrgIdNulo {
  systemEvents: string[]
  webhookLogs: string[]
}

export function novoAcumuladorDeIdsNulos(): IdsComOrgIdNulo {
  return { systemEvents: [], webhookLogs: [] }
}

/**
 * Teardown — AC14.
 *
 * Ordem: (1) tabelas com FK bloqueante, DERIVADAS do catálogo; (2) as linhas `org_id: null` que a
 * AC10 capturou, por id; (3) `organizations`. Cada `DELETE` lê `{ error }` e lança nomeando —
 * `const { data } = await …` é a causa raiz que a `900-24` existe para fechar, e não pode
 * reaparecer no teardown da story que prova a `900-24`.
 *
 * ## O que este teardown NÃO apaga, de propósito — resíduo, não corrupção (Task 11.5)
 *
 * 1. **`webhook_logs.org_id` é `ON DELETE SET NULL`** — é a ÚNICA FK para `organizations` com esse
 *    efeito em todo o catálogo (medido: `confdeltype='n'`, 1 ocorrência). As linhas que a AC9
 *    acabou de afirmar **não são apagadas quando a org é deletada: são anuladas**. A linha continua
 *    íntegra; só perde a referência. Quem quiser removê-las tem que guardar o id — é o que
 *    `cross-tenant.test.ts` faz com as linhas que ele mesmo criou.
 * 2. **`system_events` de PLATAFORMA (`CRON_RESUMO`) nascem com `org_id: null`** por decisão do
 *    `for-each-org.ts` (atribuí-las a uma org qualquer seria erro de atribuição). Nenhum filtro
 *    por org as alcança, e a suíte não guarda os ids delas — `forEachActiveOrg` não os devolve, e
 *    caçá-las por `source`/janela de tempo seria exatamente o `DELETE` por predicado que esta
 *    story existe para tornar impossível. Medido depois de 8 execuções: **8 linhas**, uma por
 *    execução. Resíduo aceitável, da mesma classe do item 1 e do risco de banco compartilhado que
 *    a Onda 1 já aceitou por escrito.
 */
export async function apagarOrgsDeTeste(
  admin: SupabaseClient,
  orgIds: string[],
  bloqueantes: TabelaBloqueante[],
  idsNulos: IdsComOrgIdNulo = novoAcumuladorDeIdsNulos(),
): Promise<void> {
  for (const { tabela, coluna } of bloqueantes) {
    const { error } = await admin.from(tabela).delete().in(coluna, orgIds)
    if (error) {
      throw new Error(
        `teardown: DELETE FROM ${tabela} (${coluna}) falhou — ${error.message}. Isto é o Postgres ` +
          "nomeando a constraint ofensora; nunca ignorar nem tentar um DELETE mais permissivo.",
      )
    }
  }

  if (idsNulos.systemEvents.length > 0) {
    const { error } = await admin.from("system_events").delete().in("id", idsNulos.systemEvents)
    if (error) throw new Error(`teardown: system_events por id falhou — ${error.message}`)
  }
  if (idsNulos.webhookLogs.length > 0) {
    const { error } = await admin.from("webhook_logs").delete().in("id", idsNulos.webhookLogs)
    if (error) throw new Error(`teardown: webhook_logs por id falhou — ${error.message}`)
  }

  const { error } = await admin.from("organizations").delete().in("id", orgIds)
  if (error) throw new Error(`teardown: DELETE FROM organizations falhou — ${error.message}`)
}

/** "Apaguei o que disse que apagaria" — a pergunta que o canário NÃO faz (D4). */
export async function orgsRemanescentes(
  admin: SupabaseClient,
  orgIds: string[],
): Promise<string[]> {
  const linhas = await comRetryDeTransporte<{ id: string }>(
    () => admin.from("organizations").select("id").in("id", orgIds),
    "leitura de organizations remanescentes",
  )
  return linhas.map((l) => l.id)
}
