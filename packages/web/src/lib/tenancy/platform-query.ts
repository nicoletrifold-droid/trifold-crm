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
 * EMBEDDING DO POSTGREST — FECHADO pela Story 900-42a (SEC-001) em 2026-08-31.
 * A checagem de `"*"` quebra `columns` por vírgula e procura o token exato; ela sozinha era
 * cega para a sintaxe de aninhamento. Hoje há uma segunda checagem, de `(`, e as quatro linhas
 * recusam:
 *
 *     platformQuery("organizations", "*")                      → lança ✔ (recusa de `*`)
 *     platformQuery("organizations", "id, *")                  → lança ✔ (recusa de `*`)
 *     platformQuery("organizations", "id, users(*)")           → lança ✔ (recusa de embedding)
 *     platformQuery("organizations", "id, leads(name, phone)") → lança ✔ (recusa de embedding)
 *
 * POR QUE O SEGUNDO PAR ERA GRAVE, medido contra `trifold-crm-dev` em 2026-08-31 e não
 * deduzido: como todo o schema tem `org_id uuid REFERENCES organizations(id)`, o PostgREST
 * resolve `leads(...)` aninhado a partir de `organizations`. `GET
 * /rest/v1/organizations?select=id,leads(name,phone)` devolvia **HTTP 200 com 6 linhas de
 * `leads` aninhadas, todas com `phone` não-nulo** — PII de lead saindo por uma tabela que
 * **não está** em `PLATFORM_READABLE_TABLES`, sem emitir `.from()` cru nenhum e portanto sem
 * acender o scanner. Embedding não é exótico neste repositório: 84 arquivos de
 * `packages/web/src` já usam o idioma.
 *
 * AS DUAS REDES FORAM FECHADAS, não só esta. `platform-query-scan.ts` ganhou
 * `detectEmbeddedTableReads()` na mesma story: sem isso, o scanner continuaria afirmando no
 * próprio comentário que garante a fronteira dos diretórios de plataforma enquanto era cego
 * para metade do mecanismo de vazamento.
 *
 * ⚠️ O QUE ESTA GUARDA **NÃO** COBRE — o `.select()` ENCADEADO (QA-900-42A-1 do gate da
 * 900-42a; remedido pelo @dev em 2026-08-31, não aceito de segunda mão). Ela inspeciona o
 * `columns` que ENTRA, não o builder que SAI. `PostgrestTransformBuilder.select()` faz
 * `url.searchParams.set("select", …)` — **`set`, não `append`: SOBRESCREVE** —, então
 * `platformQuery("organizations", "id").select("id, leads(name, phone)")` emite exatamente a
 * consulta que vazou as 6 linhas de lead acima, sem passar por aqui (medido no
 * `postgrest-js@2.101.1`: mesmo objeto de builder, `select` final `id,leads(name,phone)`).
 * Cobertura residual: `platform-query-scan.ts` acende para essa forma **só** quando o argumento
 * é literal **e** o arquivo está em `app/platform/**` ou `app/api/platform/**` (os dois únicos
 * diretórios varridos); `.select(variavel)` **ninguém** pega. Não é regressão — antes da 900-42a
 * as duas formas passavam — e nenhum dos 13 call sites encadeia `.select()` hoje. **Fechar este
 * canal (selar o `select` do builder devolvido, ou varrer também `lib/tenancy/**`) é story
 * NOVA, com carrasco próprio — não reabrir a `900-42a` para isso.**
 *
 * A RECUSA É DO CARACTERE `(`, não da sintaxe. Um parser de embedding do PostgREST (alias,
 * `!inner`/`!left`, hints de FK, aninhamento de N níveis, colunas entre aspas) seria uma
 * superfície de bug nova num lugar onde errar significa vazar dado de cliente. Nenhum dos 13
 * call sites de produção usa `(` em `columns` (levantados em 2026-08-31), então fechar tudo
 * não custa capacidade nenhuma.
 *
 * ⚠️ NÃO AFROUXAR ISTO POR CAUSA DE CONTAGEM (AC8 da 900-42a, medido). A recusa de `(` fecha
 * também `count()`, e isso não tira nada: agregados estão DESLIGADOS neste projeto Supabase —
 * `?select=count()` devolve **HTTP 400 `PGRST123` "Use of aggregate functions is not
 * allowed"**, e `?select=id,users(count)` devolve **HTTP 300 `PGRST201`** (é embedding).
 * O caminho correto de contagem é o cabeçalho `Prefer: count=exact`, que viaja no **segundo
 * argumento** de `.select()` e nem passa por `columns`. Se uma tela precisar disso, o conserto
 * é estender a assinatura de `platformQuery()` numa story própria, com sua própria régua.
 *
 * CUSTO CONHECIDO DA ASSINATURA — DÉBITO AINDA ABERTO, sem dona: como `columns` é um `string`
 * de runtime e não um literal, o client tipado do Supabase não consegue inferir a forma da
 * linha e degrada o retorno para `GenericStringError[]`. Por isso os chamadores precisam de
 * `as unknown as <Linha>[]` — é consequência direta de `columns` ser um parâmetro (o que é o
 * que permite recusar `"*"` e `(` em runtime), não desleixo do chamador. A 900-42a NÃO mexeu na
 * assinatura (a AC8 proíbe explicitamente), então este débito continua de pé e precisa de um
 * número de story novo — não reabrir `900-42a` para ele.
 */

import { createAdminClient } from "@web/lib/supabase/admin"

// lista PROVISÓRIA — ainda não consolidada. A 900-42a fechou o furo de embedding (SEC-001) e
// SÓ isso; a auditoria entrada-por-entrada, a remoção de órfãs e o congelamento da lista ficaram
// de fora por decisão registrada na AC7 daquela story, e precisam de um número de story novo —
// não reabrir `900-42a` nem presumir `900-42b`.
//
// Story 900-51 (AC3) acrescenta DUAS entradas, e a segunda é uma extensão declarada:
//
//   • `org_integrations` — é o que a AC3 nomeia. O painel de `/platform` lê status e
//     identificadores públicos por org (nunca `secret_ref` como valor útil: ele é um ponteiro
//     para o Vault e o segredo não volta ao navegador em nenhuma resposta).
//   • `platform_audit_log` — NÃO está escrito na AC3, e está aqui por consequência direta da
//     AC2/AC7/AC11: a trilha precisa ser LIDA pelo painel (o cliente vê a dele por RLS; a
//     Trifold vê a de todas as orgs, e para isso o caminho sancionado é este). A alternativa
//     seria um `.from("platform_audit_log")` cru dentro de `app/api/platform/**` — que
//     `platform-query-scan.ts` proíbe, com razão. Registrado como divergência em vez de
//     acrescentado em silêncio.
//   • `whatsapp_config` — acréscimo de QA-900-51-2. O tile de WhatsApp lia `org_integrations`,
//     que para esse provider é uma linha ESTRUTURALMENTE inescrevível (`CHECK` da `247` +
//     `P0010`): medido em produção, o canal estava `active` com credencial e o painel do dono do
//     produto dizia "Não conectado". A fonte que decide esse estado é `whatsapp_config`.
//     **Só `status`/`phone_number_id`/`updated_at` são lidos daqui — nunca `access_token`**: a
//     Trifold puxar a credencial de um tenant para o painel é o que a AC6 existe para impedir, e
//     `nao-consumo.test.ts` reprova qualquer menção a `access_token` na árvore de `/platform`.
export const PLATFORM_READABLE_TABLES = [
  "organizations",
  "users",
  "org_integrations",
  "platform_audit_log",
  "whatsapp_config",
] as const

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
 * @throws se `columns` contiver `(` — é a assinatura de embedding do PostgREST, que devolve
 *   linhas de OUTRA tabela sem passar pela lista fechada (900-42a/SEC-001). Ver o comentário
 *   de topo antes de afrouxar.
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
  // SEC-001 (900-42a). `(` é a assinatura de EMBEDDING do PostgREST (`leads(name, phone)`), e
  // embedding devolve linhas de OUTRA tabela — resolvida pela FK `org_id` sem emitir `.from()`
  // nenhum, logo invisível para a lista fechada acima E para `platform-query-scan.ts`. A
  // recusa é do caractere, não da sintaxe: um parser de embedding do PostgREST (alias,
  // `!inner`, hints de FK, aninhamento de N níveis, colunas entre aspas) seria ele mesmo uma
  // superfície de bug nova, num lugar onde errar significa vazar dado de cliente. Ver AC8 da
  // story antes de afrouxar isto por causa de contagem: `count()` já vem DESLIGADO do
  // servidor, e o caminho de contagem é `Prefer: count=exact`, que nem viaja em `columns`.
  if (columns.includes("(")) {
    throw new Error(
      `platformQuery: embedding/aninhamento não é permitido — liste as colunas da própria tabela`,
    )
  }

  const db = createAdminClient()
  const query = db.from(table).select(columns)
  return orgId ? query.eq("org_id", orgId) : query
}
