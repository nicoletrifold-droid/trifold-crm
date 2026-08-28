/**
 * Story 900-22b (Epic 900, Onda 2) — caminho único de LEITURA do painel `/platform`.
 *
 * Por que existir: `/platform` lê com service-role, que bypassa RLS por desenho (o platform
 * admin precisa enxergar TODAS as orgs, e `org_select_own` escopa por org do usuário). Isso
 * significa que a única fronteira real entre "a Trifold vê o dado do cliente" e "não vê" é
 * esta lista. D14 do épico proíbe impersonation, então esta superfície é o ÚNICO acesso que
 * existe — e ela precisa crescer por regra explícita, não por uma consulta solta em cada tela
 * nova.
 *
 * O épico declara a assinatura como `platformQuery(table, orgId)`. A assinatura real ficou
 * `platformQuery(table, columns, orgId?)` porque `.select()` do Supabase sempre exige colunas —
 * e exigi-las é o que torna possível recusar `"*"`. `orgId` é opcional porque as leituras de
 * `/platform/orgs` são cross-org por natureza (listam todas as empresas); as telas de detalhe
 * de uma org (900-31/900-35/900-44) é que vão passá-lo.
 *
 * Escopo: LEITURA. `.update()`/`.insert()` não passam por aqui (ver `admin-invite.ts`) — isto
 * não é um firewall geral de acesso a dado de plataforma.
 *
 * LIMITE CONHECIDO DA RECUSA DE `"*"` — EMBEDDING DO POSTGREST NÃO É COBERTO (SEC-001).
 * A checagem quebra `columns` por vírgula e procura o token `"*"` exato. Medido, com controles
 * positivos que provam que a régua não está morta:
 *
 *     platformQuery("organizations", "*")                    → lança  ✔ (controle positivo)
 *     platformQuery("organizations", "id, *")                → lança  ✔ (controle positivo)
 *     platformQuery("organizations", "id, users(*)")         → PASSA  ✘
 *     platformQuery("organizations", "id, leads(name, phone)") → PASSA ✘
 *
 * O segundo par é o que importa: como todo o schema tem `org_id uuid REFERENCES
 * organizations(id)`, o PostgREST resolve `leads(...)` aninhado a partir de `organizations` e
 * devolve linhas de uma tabela que **não está** em `PLATFORM_READABLE_TABLES` — sem emitir
 * nenhum `.from()` cru, logo sem acender o scanner da AC-B4. As duas redes desta story passam
 * por baixo do mesmo furo. Embedding não é exótico neste repositório: 84 arquivos de
 * `packages/web/src` já usam o idioma.
 *
 * DONA: **900-42a**, junto do débito de tipagem abaixo — é a story que endurece esta função e
 * fecha a lista. O conserto provável é parsear `columns` e validar cada tabela aninhada contra
 * `PLATFORM_READABLE_TABLES`, não só o token `"*"`. Não foi feito aqui porque a AC-B2 desta
 * story especifica exatamente a recusa de `"*"`, e alargar a checagem em silêncio esconderia
 * de quem for endurecer que o furo existia.
 *
 * CUSTO CONHECIDO DA ASSINATURA: como `columns` é um `string` de runtime e não um literal, o
 * client tipado do Supabase não consegue inferir a forma da linha e degrada o retorno para
 * `GenericStringError[]`. Por isso os chamadores precisam de `as unknown as <Linha>[]` — é
 * consequência direta de `columns` ser um parâmetro (o que é o que permite recusar `"*"` em
 * runtime), não desleixo do chamador. Quem for endurecer isto na 900-42a e ganhar tipagem de
 * volta terá que trocar `string` por um genérico de literal.
 */

import { createAdminClient } from "@web/lib/supabase/admin"

// lista PROVISÓRIA — consolidada por 900-42a, fechada por 900-42b
export const PLATFORM_READABLE_TABLES = ["organizations", "users"] as const

export type PlatformReadableTable = (typeof PLATFORM_READABLE_TABLES)[number]

/**
 * Abre uma leitura de plataforma sobre uma tabela da lista permitida.
 *
 * Devolve o query builder do Supabase, então filtros adicionais são encadeamento normal
 * (`platformQuery("users", "org_id, auth_id").eq("role", "admin")`).
 *
 * @throws se `table` não estiver em `PLATFORM_READABLE_TABLES` (checagem de RUNTIME: o tipo
 *   sozinho não protege quando a tabela chega por variável em vez de literal).
 * @throws se `columns` contiver `"*"` — a lista de colunas é o que impede `users` inteiro de
 *   vazar para o painel. Um scanner estático cobre quem NÃO passar por aqui
 *   (`platform-query-scan.ts`); esta checagem cobre quem passa.
 */
export function platformQuery<T extends PlatformReadableTable>(
  table: T,
  columns: string,
  orgId?: string,
) {
  if (!PLATFORM_READABLE_TABLES.includes(table)) {
    throw new Error(`platformQuery: "${table}" fora de PLATFORM_READABLE_TABLES`)
  }
  if (
    columns
      .split(",")
      .map((c) => c.trim())
      .includes("*")
  ) {
    throw new Error(`platformQuery: "select *" não é permitido — liste as colunas`)
  }

  const db = createAdminClient()
  const query = db.from(table).select(columns)
  return orgId ? query.eq("org_id", orgId) : query
}
