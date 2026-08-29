import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import { createOrgScopedAdminClient } from "@web/lib/supabase/org-scoped-admin"
import { logEvent } from "@web/lib/logger"

/**
 * Story 900-23 · AC1 (Passo 2 da Onda 2) — o mecanismo compartilhado que faz um cron rodar para
 * **todas** as organizações ativas, com o erro de uma isolado das outras.
 *
 * ## O problema
 *
 * Antes desta story, `daily-report` e `nicole-agenda-reconcile` liam um `DEFAULT_ORG_ID`
 * hardcoded: com uma segunda empresa no banco, eles simplesmente não a atendiam — em silêncio,
 * devolvendo 200. E os crons que já iteravam abortavam tudo no primeiro erro: um problema na
 * org A deixava a org B sem processamento no mesmo dia.
 *
 * ## As cinco propriedades (cada uma tem carrasco em `for-each-org.test.ts`)
 *
 * 1. **Isolamento de erro é a razão de ser.** Cada callback roda no próprio `try/catch`. Uma org
 *    que lança nunca aborta as seguintes, e `forEachActiveOrg` **nunca relança** por causa de um
 *    callback — o pior caso é `falha === total`.
 * 2. **O `db` entregue ao callback é `createOrgScopedAdminClient(org.id)`**, não o client cru.
 *    Esquecer `.eq("org_id", …)` dentro do callback deixa de ser possível para as tabelas do
 *    snapshot da 900-14. A única query cross-org do arquivo é a listagem de `organizations`.
 * 3. **Sequencial.** `concurrency` só aceita `1`. Estes crons falam com Meta Graph e WhatsApp
 *    Cloud, que têm rate limit por token: paralelizar troca "processa devagar" por "429 em
 *    cascata", que é um modo de falha novo, não uma otimização.
 * 4. **Log por org + um resumo**, em `system_events` (`CRON_ORG_PROCESSADA` / `CRON_ORG_FALHOU` /
 *    `CRON_RESUMO`).
 * 5. **Status HTTP** via {@link statusHttpParaResumo}: `total === 0` é "nada para fazer" (200),
 *    não falha.
 *
 * ## ⚠️ Regra herdada por todo callback que use `dedupe_key` (R5)
 *
 * O índice único que sustenta `logEventOnce` é `ux_system_events_dedupe_key
 * (event_type, metadata->>'dedupe_key')` — **sem `org_id`** (migration 218). Um `dedupe_key` que
 * não embuta o `org.id` faz a **org B ser suprimida como duplicata da org A** no mesmo
 * `event_type`, no mesmo dia. O helper não impõe isso por código (o dedupe é decisão de cada
 * callback), mas é exatamente ele que torna dois callbacks concorrentes reais pela primeira vez —
 * então: **`dedupe_key` sempre embute `org.id`**. Ver
 * `nicole-agenda-reconcile/route.ts` (`lastro:${orgId}:${dia}:${dias}d`) como referência.
 *
 * ## ⚠️ Antes de apagar um `try/catch` local ao migrar um cron para cá (C4)
 *
 * A tentação é apagar o `try/catch` do handler — "o helper agora trata". Pergunte primeiro se
 * aquele `catch` faz algo **além** de logar o erro genérico: evento nomeado, compensação, métrica
 * própria. Se fizer, ele fica, emite o efeito colateral e **relança**, para o helper continuar
 * contabilizando a falha (Propriedade 1). Foi assim que o `NICOLE_LASTRO_FALHA` da Story 87-6
 * sobreviveu à migração do `nicole-agenda-reconcile`.
 *
 * ## ⚠️ Canal global de notificação dentro do callback (C5)
 *
 * Se o callback despacha para um canal com **destino único por env** (Telegram administrativo,
 * WhatsApp de admin, e-mail de time), escopar QUEM recebe é obrigatório — senão a org B manda
 * dado dela para o destino da Trifold. Ver `lib/tenancy/trifold-org.ts`.
 */

/** Uma organização ativa, como o helper a lê de `organizations`. */
export interface OrgAtiva {
  id: string
  name: string
}

/** O que aconteceu com UMA organização. `ok: false` carrega `erro`, nunca `resultado`. */
export interface ResultadoPorOrg<T> {
  org: OrgAtiva
  ok: boolean
  resultado?: T
  erro?: string
}

export interface ResumoForEachOrg<T> {
  total: number
  sucesso: number
  falha: number
  resultados: ResultadoPorOrg<T>[]
}

export interface ForEachOrgOptions {
  /** Nome do cron/rota, vai em `source` de cada log. Ex.: `"api/cron/daily-report"`. */
  source: string
  /**
   * Só `1` é implementado nesta story (Propriedade 3). Aceito no tipo para não fechar a porta de
   * paralelismo real numa Onda futura de escala de plataforma — mas passar qualquer valor != 1
   * **rejeita**, em vez de fingir que paraleliza. Prometer concorrência que não existe é pior que
   * não aceitar o parâmetro.
   */
  concurrency?: 1
}

/**
 * Executa `fn` uma vez por organização ativa, sequencialmente, isolando o erro de cada uma.
 *
 * @throws **apenas** em dois casos, os dois estruturais e anteriores a qualquer trabalho:
 *   `concurrency` != 1, e falha ao **listar** `organizations`. Erro de callback nunca sobe.
 */
export async function forEachActiveOrg<T>(
  fn: (org: OrgAtiva, db: SupabaseClient) => Promise<T>,
  options: ForEachOrgOptions,
): Promise<ResumoForEachOrg<T>> {
  const { source } = options
  const concurrency = options.concurrency ?? 1

  // ANTES de listar orgs e ANTES de invocar qualquer callback: nada de trabalho parcial antes de
  // rejeitar (R6). Quem tentar `concurrency: 3` descobre no teste, não em produção sob carga.
  if (concurrency !== 1) {
    throw new Error(
      `forEachActiveOrg(${source}): concurrency=${JSON.stringify(concurrency)} não implementado ` +
        "nesta story — só concurrency=1 (sequencial) existe. Ver Propriedade 3 da Story 900-23.",
    )
  }

  // A ÚNICA query cross-org legítima deste arquivo: para saber quais orgs existem é preciso
  // perguntar sem escopo de org. Daqui para baixo, tudo é escopado.
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("organizations")
    .select("id, name")
    .eq("is_active", true)

  if (error) {
    // Erro na listagem NÃO é "uma org falhou" — não há org nenhuma para isolar. Se isto virasse
    // `data ?? []`, "banco fora do ar" cairia em `total === 0` e viraria **200, nada para fazer**,
    // em todos os crons que usam o helper, para sempre, sem ninguém notar. É o pior modo de falha
    // que este arquivo pode ter, e é por isso que ele lança (C8).
    throw new Error(
      `forEachActiveOrg(${source}): falha ao listar organizations ativas — ${error.message}`,
    )
  }

  const orgsAtivas = (data ?? []) as OrgAtiva[]
  const resultados: ResultadoPorOrg<T>[] = []

  for (const org of orgsAtivas) {
    try {
      const db = createOrgScopedAdminClient(org.id) as unknown as SupabaseClient
      const resultado = await fn(org, db)
      resultados.push({ org, ok: true, resultado })
      logEvent({
        level: "info",
        category: "cron",
        event_type: "CRON_ORG_PROCESSADA",
        org_id: org.id,
        source,
        message: `${source}: organização ${org.name} processada`,
      })
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      resultados.push({ org, ok: false, erro })
      logEvent({
        level: "error",
        category: "cron",
        event_type: "CRON_ORG_FALHOU",
        org_id: org.id,
        source,
        message: `${source}: organização ${org.name} falhou — ${erro}`,
        metadata: { erro },
      })
    }
  }

  const sucesso = resultados.filter((r) => r.ok).length
  const resumo: ResumoForEachOrg<T> = {
    total: orgsAtivas.length,
    sucesso,
    falha: orgsAtivas.length - sucesso,
    resultados,
  }

  // Resumo é evento de PLATAFORMA, não de tenant: `org_id` omitido de propósito (`buildRow` do
  // logger grava `null`). Atribuí-lo a uma org qualquer seria a mesma classe de erro de atribuição
  // que motivou a reclassificação do `nicole-health` (AC3).
  logEvent({
    level: "info",
    category: "cron",
    event_type: "CRON_RESUMO",
    source,
    message: `${source}: ${resumo.sucesso}/${resumo.total} organizações processadas com sucesso`,
    metadata: { total: resumo.total, sucesso: resumo.sucesso, falha: resumo.falha, source },
  })

  return resumo
}

/**
 * Decide o status HTTP de um cron que rodou sob {@link forEachActiveOrg}.
 *
 * - `total === 0` ⇒ **200**. "Zero orgs ativas" é *nada para fazer*, não falha — devolver 500 aqui
 *   faria o agendador reprocessar um cron que não tem trabalho nenhum.
 * - `sucesso >= 1` ⇒ **200**, com o relatório dizendo quais orgs falharam.
 * - `total > 0 && sucesso === 0` ⇒ **500**. Todas falharam: é falha de verdade.
 *
 * Função pura, sem I/O — existe para as rotas não reimplementarem a mesma regra cada uma do seu
 * jeito.
 */
export function statusHttpParaResumo(resumo: ResumoForEachOrg<unknown>): 200 | 500 {
  if (resumo.total === 0) return 200
  return resumo.sucesso >= 1 ? 200 : 500
}
