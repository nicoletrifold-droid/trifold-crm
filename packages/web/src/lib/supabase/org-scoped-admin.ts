/**
 * Story 900-14 — o piso de isolamento das rotas em service-role.
 *
 * ## O problema que isto resolve
 *
 * `createAdminClient()` usa a service-role key, que **bypassa RLS por completo**. Medido em
 * 2026-08-23: **129 dos 318 route handlers** o usam. Nessas rotas, todo o isolamento entre
 * empresas depende de alguém ter escrito `.eq("org_id", appUser.org_id)` à mão — em cada
 * query, toda vez. Basta esquecer uma.
 *
 * RLS é a rede; isto aqui é o piso (NFR-5 do Epic 900). Os dois são obrigatórios: a rede não
 * pega quem passa por baixo dela, que é exatamente o que service-role faz.
 *
 * ## Como usar
 *
 * ```ts
 * // ANTES — o filtro é responsabilidade de quem escreve, toda vez
 * const db = createAdminClient()
 * const { data } = await db.from("leads").select("*").eq("org_id", appUser.org_id)
 *
 * // DEPOIS — o filtro é estrutural
 * const db = createOrgScopedAdminClient(appUser.org_id)
 * const { data } = await db.from("leads").select("*")   // já vem escopado
 * ```
 *
 * ## O que ele NÃO faz
 *
 * Não substitui RLS, não valida permissão de usuário (isso é `can()`/`canAccess()`) e não
 * protege query escrita com SQL cru via `rpc()`. É um piso, não um teto.
 */

import { createAdminClient } from "./admin"
import schemaSnapshot from "../../../../../docs/audits/schema-snapshot.json"

/**
 * Tabelas que possuem coluna `org_id`, derivadas do snapshot versionado pela Story 900-2a.
 *
 * **Por que não é um array escrito à mão.** Uma lista manual nasce correta e apodrece: tabela
 * nova aparece e ninguém lembra de atualizá-la — e o modo de falha é silencioso, porque o
 * client simplesmente deixa de escopar. O snapshot é gerado por introspecção, versionado, e
 * aparece em diff quando muda. A regra R3 do gate fecha o ciclo, acusando tabela nova sem
 * `org_id`.
 */
const TABELAS_COM_ORG_ID: ReadonlySet<string> = new Set(
  (schemaSnapshot as { tables: Array<{ name: string; hasOrgId: boolean }> }).tables
    .filter((t) => t.hasOrgId)
    .map((t) => t.name),
)

/** Exportado para teste e diagnóstico. */
export function tabelaTemOrgId(tabela: string): boolean {
  return TABELAS_COM_ORG_ID.has(tabela)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Injeta `org_id` num payload de insert — objeto ou array.
 *
 * **Sobrescreve valor divergente de propósito.** Um `org_id` que veio no corpo da requisição
 * não pode vencer o escopo do chamador: esse é o vetor de IDOR mais direto que existe numa API
 * multi-tenant (cliente manda o `org_id` de outra empresa e o service-role obedece). O epic
 * trata disso no FR-3, "INSERT com `org_id` forjado".
 */
function comOrgId<T>(payload: T, orgId: string): T {
  if (Array.isArray(payload)) {
    return payload.map((linha) => ({ ...(linha as object), org_id: orgId })) as T
  }
  if (payload && typeof payload === "object") {
    return { ...(payload as object), org_id: orgId } as T
  }
  // Payload que não é objeto (string, número) não é insert válido no PostgREST — deixa passar
  // para o Supabase reclamar com a mensagem dele, que é mais útil que uma nossa.
  return payload
}

/**
 * Client service-role com escopo de organização obrigatório.
 *
 * @throws se `orgId` não for um UUID. Devolver um client "escopado" com `orgId` undefined seria
 *   **pior que o client cru**: pareceria seguro, e `.eq("org_id", undefined)` no PostgREST não
 *   filtra nada. Falhar aqui é barulhento e imediato; falhar depois é silencioso e vaza.
 */
export function createOrgScopedAdminClient(orgId: string) {
  if (!orgId || typeof orgId !== "string" || !UUID_RE.test(orgId.trim())) {
    throw new Error(
      `createOrgScopedAdminClient: orgId inválido (${JSON.stringify(orgId)}). ` +
        "Um client sem escopo válido é mais perigoso que o client cru, porque parece seguro.",
    )
  }
  const org = orgId.trim()
  const base = createAdminClient()

  return new Proxy(base, {
    get(alvo, prop, receiver) {
      if (prop !== "from") return Reflect.get(alvo, prop, receiver)

      return (tabela: string) => {
        const qb = alvo.from(tabela)

        // Tabela de plataforma (organizations, platform_services, …) não tem org_id.
        // Injetar o filtro aqui quebraria a query — e quebrar é pior que não escopar,
        // porque tabela sem org_id não é dado de tenant.
        if (!TABELAS_COM_ORG_ID.has(tabela)) return qb

        return new Proxy(qb, {
          get(qbAlvo, qbProp, qbReceiver) {
            const original = Reflect.get(qbAlvo, qbProp, qbReceiver)
            if (typeof original !== "function") return original

            // A injeção acontece UMA vez, no ponto de entrada da cadeia. O retorno continua
            // sendo o query builder do Supabase, então `.eq().order().limit()` seguem
            // funcionando — o proxy precisa ser transparente para não quebrar as 129 rotas.
            if (qbProp === "select" || qbProp === "update" || qbProp === "delete") {
              return (...args: unknown[]) => {
                const r = (original as (...a: unknown[]) => unknown).apply(qbAlvo, args)
                return (r as { eq: (c: string, v: string) => unknown }).eq("org_id", org)
              }
            }

            if (qbProp === "insert" || qbProp === "upsert") {
              return (payload: unknown, ...rest: unknown[]) =>
                (original as (...a: unknown[]) => unknown).apply(qbAlvo, [
                  comOrgId(payload, org),
                  ...rest,
                ])
            }

            return original
          },
        })
      }
    },
  })
}
