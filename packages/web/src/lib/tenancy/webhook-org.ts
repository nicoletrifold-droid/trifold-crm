import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEvent, logEventOnce } from "@web/lib/logger"

/**
 * Story 900-24 · AC1/AC2 (Passo 4 da Onda 2) — resolução de organização nos 4 receptores de
 * webhook, com dual-run observável.
 *
 * ## O bug agudo que este módulo fecha
 *
 * Antes desta story, os 4 receptores respondiam "existe org?" perguntando "existe UMA linha
 * ativa?", em vez de "qual org é dona DESTE identificador do payload?". Com uma organização só,
 * as duas perguntas têm a mesma resposta — é por isso que o defeito nunca apareceu em produção.
 * Com duas, `.maybeSingle()`/`.single()` devolvem `{ data: null, error: PGRST116, status: 406 }`
 * (medido contra `@supabase/postgrest-js@2.101.1`, `dist/index.cjs:129-140`, e contra o PostgREST
 * do `trifold-crm-dev`: HTTP 406). Como todos os call sites desestruturavam só `const { data }`,
 * o erro sumia e "achei duas" virava indistinguível de "não achei" — **as mensagens/leads das
 * DUAS empresas eram descartados em silêncio**, com 200 na resposta.
 *
 * ## A regra não-negociável: `.limit(2)` + checagem de comprimento
 *
 * Nenhum dos 3 resolvers abaixo usa `.maybeSingle()` ou `.single()`. Com `.limit(2)`, "achei
 * duas" vira um estado NOMEADO (`"ambigua"`), CONTADO (`quantidadeEncontrada`) e LOGADO, em vez
 * de colapsar num `null` que o chamador confunde com "não configurado". `.limit(2)` (e não
 * `.limit(1)`) porque `.limit(1)` esconderia a ambiguidade da mesma forma que `.maybeSingle()` —
 * só que sem nem o erro para descartar.
 *
 * ## Dual-run (`WEBHOOK_ORG_ROUTING`) — por que os 4 receptores computam DOIS caminhos
 *
 * A restrição do dono do produto é que a Trifold **não mude de comportamento e não perca dado**.
 * Em `"both"` (o modo de produção), o caminho LEGADO é sempre quem decide o `orgId` que chega ao
 * processamento; o caminho novo roda em sombra e só alimenta o contador de divergência. Isso é
 * invariante com carrasco pré-deploy (mutação #8 da AC10, testada por receptor), não promessa.
 *
 * O corte para `"identifier"` puro é decisão da Onda 3, depois de 7 dias observando
 * `system_events` com `event_type='WEBHOOK_ORG_RESOLVED'` agrupado por `metadata->>'via'`.
 */

/**
 * ## `legado_ambiguo_novo_resolveu` (Story 900-55 · AC1) — o motivo que nasceu porque o
 * anterior MENTIA
 *
 * No modo `both`, quando o caminho LEGADO devolve `null` e o caminho NOVO **resolve**, os dois
 * árbitros (`webhook/whatsapp/route.ts` e `lib/meta/process-lead.ts`) registravam
 * `"nenhuma_correspondencia"` — literalmente *"não achei config para este identificador"*. A
 * verdade é o oposto exato: **achei, e quem estava quebrado era o árbitro.**
 *
 * Esse é o estado que a segunda empresa produz no primeiro minuto: com duas linhas
 * `whatsapp_config` ativas, o `.maybeSingle()` do legado devolve `PGRST116`/406, o `error` morre
 * na desestruturação, `legado` vem `null` — e o `else` do modo `both` **não cai** para o resolver
 * novo. A mensagem das DUAS empresas é descartada com `200 {status:"ok"}`.
 *
 * O motivo antigo mandava quem fosse depurar procurar uma linha de `whatsapp_config` que está lá.
 * Este nomeia o estado real. Ele é, hoje, o ÚNICO sinal que a produção emite nesse minuto — daí
 * também o nível `error` (ver {@link nivelDoMotivo}).
 *
 * Não é uma correção de comportamento: em `both` o legado continua sendo quem decide, e a
 * mensagem continua sendo descartada. Quem corrige o comportamento é o corte para
 * `WEBHOOK_ORG_ROUTING=identifier`, que é o resto da 900-55. Este motivo é a rede que torna esse
 * corte — e a ausência dele — **consultável**.
 *
 * ⚠️ **Consultável, não entregue** (QA-900-55-1, medido em 2026-08-31). Este evento não chega a
 * ninguém sozinho, e há três elos medidos que explicam por quê:
 * 1. O único leitor de `level='error'` no repositório é `api/cron/nicole-health/route.ts`, que
 *    classifica a `message` por `classificarErroIA` e faz `if (!tipo) continue`; nenhuma das 8
 *    assinaturas de `lib/alerts/erro-ia.ts` casa com esta frase.
 * 2. Nenhum consumidor seleciona `WEBHOOK_ORG_UNRESOLVED` por `event_type`.
 * 3. O painel `/dashboard/sistema` **também não vê**: `api/system-events` filtra
 *    `.eq("org_id", user.orgId)` e `get_system_events_summary` tem `WHERE org_id = p_org_id`,
 *    enquanto `logOrgUnresolved` grava com `org_id = null` (não há org a atribuir — é justamente
 *    o que falhou). `= <uuid>` nunca casa `NULL`.
 * O que sobra de observável é o `console.error` de `lib/logger.ts` no runtime da Vercel e uma
 * consulta direta a `system_events`. O runbook §1 da 900-55 diz isso com todas as letras e
 * prescreve a conferência manual; não trate este `error` como alarme entregue.
 */
export type MotivoNaoResolvida =
  | "nenhuma_correspondencia"
  | "ambigua"
  | "erro_consulta"
  | "legado_ambiguo_novo_resolveu"

/**
 * Story 900-55 · AC1 — o NÍVEL do evento é derivado do motivo, não escolhido pelo call site.
 *
 * `legado_ambiguo_novo_resolveu` é o único motivo em que **mensagem de cliente está sendo
 * descartada com HTTP 200 enquanto o dado necessário para roteá-la existe no banco**. Os outros
 * três descrevem ausência ou falha de leitura — `warn` é o nível certo para eles.
 *
 * Derivar (em vez de passar `level` por parâmetro) é deliberado por DOIS motivos — e nenhum deles
 * é o que esta linha dizia antes (ver a correção abaixo):
 *
 * 1. **A severidade é propriedade do estado, não do relator.** Quem lê o runbook §6 decide o
 *    rollback pelo MOTIVO; colar o nível ao motivo impede que os dois divirjam quando um quarto
 *    call site aparecer.
 * 2. **Põe o mapa `motivo → nível` num ponto único e NOMEADO**, o que torna a mutação de um ponto
 *    só expressável: "`nivelDoMotivo` devolve sempre `warn`" e o seu inverso "devolve sempre
 *    `error`" matam conjuntos DISJUNTOS de testes (M3 × M3r na story). Com `level` por parâmetro,
 *    o controle negativo "os outros 3 motivos continuam `warn`" viraria asserção sobre call
 *    sites, e os testes de mapa em `webhook-org.test.ts` não existiriam.
 *
 * **Correção (QA-900-55-1 / gate da 900-55):** a justificativa original — *"um `level` por
 * parâmetro deixaria a mutação do ternário com o `error` órfão, verde numa das duas asserções"* —
 * era FALSA sob a forma do teste que existe: o `toMatchObject` do carrasco é ÚNICO e cobre `level`
 * e `motivo` juntos, então a mutação do ternário o derruba de qualquer jeito. A decisão continua
 * certa; o argumento que a sustentava não era. Registrado em vez de apagado.
 *
 * **Preço, nomeado:** nenhum call site futuro poderá emitir `legado_ambiguo_novo_resolveu` em
 * outro nível sem mexer neste mapa. Hoje isso é correto — o motivo tem uma semântica só.
 */
function nivelDoMotivo(motivo: MotivoNaoResolvida): "warn" | "error" {
  return motivo === "legado_ambiguo_novo_resolveu" ? "error" : "warn"
}

export interface ResolucaoNaoResolvida {
  status: "nao_resolvida"
  motivo: MotivoNaoResolvida
  quantidadeEncontrada: number
}

export interface OrgResolvida {
  status: "resolvida"
  orgId: string
}

export type ResolucaoOrg = OrgResolvida | ResolucaoNaoResolvida

/**
 * Linha de `whatsapp_config` — as mesmas 4 colunas que o código legado já selecionava, para o
 * `access_token` continuar disponível ao chamador sem um segundo lookup na mesma tabela (o
 * "lookup cruzado" que a mission pede para evitar; ver Dev Notes da story).
 *
 * `access_token: string | null` e `phone_number_id: string | null` — nullability MEDIDA no
 * `information_schema` do `trifold-crm-dev` em 2026-08-29 (`is_nullable: YES` nas duas), não
 * suposta. O seed da 900-21b cria linhas `inactive` sem token. `resolveOrgByWhatsAppPhone` filtra
 * `status='active'` E `phone_number_id = <valor>`, então uma linha RESOLVIDA por ele tem
 * `phone_number_id` não-nulo por construção — mas o TIPO da linha não pode afirmar isso, porque a
 * mesma interface descreve a linha que o caminho LEGADO devolve (que não filtra telefone nenhum).
 */
export interface WhatsAppConfigLinha {
  org_id: string
  phone_number_id: string | null
  access_token: string | null
  coexistence_enabled: boolean | null
}

export interface WhatsAppResolvida {
  status: "resolvida"
  config: WhatsAppConfigLinha
}

export type ResolucaoWhatsApp = WhatsAppResolvida | ResolucaoNaoResolvida

/**
 * Resolve a org pelo `phone_number_id` do payload da Meta (`value.metadata.phone_number_id`, que
 * já chega em TODO webhook do WhatsApp Cloud API e hoje é descartado).
 *
 * Filtra também por `status='active'` — replica a invariante que o código legado já impunha (só
 * config ativa roteia). Sem esse filtro, uma org "desconectada" com um `phone_number_id`
 * remanescente poderia sequestrar o roteamento de quem herdasse o número.
 */
export async function resolveOrgByWhatsAppPhone(
  db: SupabaseClient,
  phoneNumberId: string | null | undefined,
): Promise<ResolucaoWhatsApp> {
  if (!phoneNumberId) {
    return { status: "nao_resolvida", motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 }
  }
  const { data, error } = await db
    .from("whatsapp_config")
    .select("org_id, phone_number_id, access_token, coexistence_enabled")
    .eq("phone_number_id", phoneNumberId)
    .eq("status", "active")
    .limit(2)

  if (error) {
    return { status: "nao_resolvida", motivo: "erro_consulta", quantidadeEncontrada: 0 }
  }
  const linhas = (data ?? []) as WhatsAppConfigLinha[]
  if (linhas.length === 1) return { status: "resolvida", config: linhas[0]! }
  if (linhas.length === 0) {
    return { status: "nao_resolvida", motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 }
  }
  return { status: "nao_resolvida", motivo: "ambigua", quantidadeEncontrada: linhas.length }
}

/**
 * Resolve a org pelo `page_id` do payload da Meta (`entry[0].id` — hoje logado em
 * `webhooks/meta-ads/route.ts:91` e jogado fora). Lê `org_integrations` (provider `meta_ads`),
 * NÃO `whatsapp_config`: são identificadores de fontes diferentes, e confundi-los é exatamente o
 * atalho que produziu o defeito original.
 *
 * ## A assimetria ACABOU — `status='connected'` passou a ser exigido (Story 900-51, AC10)
 *
 * A 900-24 omitiu o filtro de `status` de propósito e deixou a razão por escrito: o seed da
 * 900-21b nasce `disconnected`, não existia UI para promover a `connected`, e exigir o filtro
 * faria o modo `identifier` nunca resolver ninguém. A mesma nota dizia *"quando o painel
 * entregar isso, esta decisão volta à mesa"*. A 900-51 é esse painel — `mark_connected` existe,
 * com guard estrutural que recusa promover sem um segredo não vazio gravado (`P0015`/`P0017`), e
 * o argumento que sustentava a omissão deixou de valer no mesmo commit em que ela é revertida.
 *
 * ### O que este filtro faz, medido — e o que ele NÃO faz
 *
 * **Faz:** fecha a sub-classe "config escrito e nunca promovido". Antes, uma única chamada direta
 * a `org_integration_write_secret_as_org` com um `page_id` arbitrário bastava para uma empresa
 * passar a receber os leads de outra, com `status` ainda `disconnected` e o tile mostrando "Não
 * conectado" — ninguém olhando o painel perceberia.
 *
 * **Não faz:** fechar o risco cross-tenant. Medido pelo `@po` na Rodada 3 da 900-51: as duas RPCs
 * (`write_secret_as_org` e `mark_connected_as_org`) estão `GRANT EXECUTE ... TO authenticated`,
 * então o ataque continua possível ao custo de **um POST a mais** — o que este filtro garante é
 * que ele deixe duas linhas de auditoria em vez de uma, não que ele não aconteça. A prevenção foi
 * **conscientemente recusada** pelo dono do produto em 2026-08-30 (*"o cliente também grava o
 * page_id, com auditoria"*); a compensação é a DETECÇÃO da AC11
 * (`lib/integrations/painel/alertas-page-id.ts`).
 *
 * ### O preço, declarado (C3 do parecer)
 *
 * 1. **Credencial que expira passa a PERDER lead, não só a quebrar sync.** Antes, um `page_id`
 *    correto com token vencido ainda resolvia a org certa — o lead chegava e só o enriquecimento
 *    falhava. Agora, se aquela linha deixar de ser `'connected'` (hoje só por ação explícita:
 *    `mark_error` no re-teste do painel, nunca por cron), o mesmo lead **não resolve organização
 *    nenhuma** e cai em `WEBHOOK_ORG_UNRESOLVED`. É perda, não degradação. Trade aceito, escrito.
 * 2. **`org_integrations_meta_page_ativo` não filtra `status`.** Uma linha `disconnected` que já
 *    ocupa um `page_id` continua bloqueando outra org de gravar o mesmo valor. As rotas do painel
 *    traduzem esse `23505` para o código `page_id_ja_configurado` em vez de deixar o erro de banco
 *    cru chegar à tela — mitigação, não cura.
 *
 * ### Por que aplicar AGORA foi seguro (gate da Task 12.2, medido em 2026-08-30)
 *
 * `WEBHOOK_ORG_ROUTING` está **ausente** em produção, e `decidirModoRoteamento()` nunca lança:
 * ausente ⇒ `"both"`, onde o legado decide o roteamento e o caminho novo só alimenta o contador
 * de divergência. E a linha `meta_ads` da Trifold em produção está `disconnected` **com
 * `config->>'page_id'` NULO** — ou seja, ela já não casava este resolver nem antes do filtro.
 * Em `identifier`, o gate da AC10 é bloqueante: não aplicar enquanto essa linha não estiver
 * `connected`, sob pena de o resolver parar de resolver qualquer org.
 */
export async function resolveOrgByMetaPage(
  db: SupabaseClient,
  pageId: string | null | undefined,
): Promise<ResolucaoOrg> {
  if (!pageId) {
    return { status: "nao_resolvida", motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 }
  }
  const { data, error } = await db
    .from("org_integrations")
    .select("org_id")
    .eq("provider", "meta_ads")
    .eq("config->>page_id", pageId)
    // Story 900-51/AC10 — a linha precisa ter sido PROMOVIDA por alguém que passou pela
    // validação síncrona da rota. Ver o cabeçalho desta função para o alcance e o preço.
    .eq("status", "connected")
    .limit(2)

  if (error) {
    return { status: "nao_resolvida", motivo: "erro_consulta", quantidadeEncontrada: 0 }
  }
  const linhas = (data ?? []) as Array<{ org_id: string }>
  if (linhas.length === 1) return { status: "resolvida", orgId: linhas[0]!.org_id }
  if (linhas.length === 0) {
    return { status: "nao_resolvida", motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 }
  }
  return { status: "nao_resolvida", motivo: "ambigua", quantidadeEncontrada: linhas.length }
}

/**
 * `landing-page` e `telegram` NÃO têm identificador de org no payload (decisão travada do plano
 * aprovado — UTM colide entre tenants e não serve de chave de roteamento).
 *
 * `resolveSoleOrg` NOMEIA essa suposição em vez de escondê-la num lookup sem filtro: resolve
 * **somente** quando existe EXATAMENTE uma organização ativa. Com 0 ou 2+, devolve o estado
 * não-resolvida em vez de adivinhar — que é a diferença exata para o `.limit(1).single()` do
 * `telegram/webhook/route.ts`, que hoje pega "a primeira linha que vier", arbitrariamente.
 */
export async function resolveSoleOrg(db: SupabaseClient): Promise<ResolucaoOrg> {
  const { data, error } = await db
    .from("organizations")
    .select("id")
    .eq("is_active", true)
    .limit(2)

  if (error) {
    return { status: "nao_resolvida", motivo: "erro_consulta", quantidadeEncontrada: 0 }
  }
  const linhas = (data ?? []) as Array<{ id: string }>
  if (linhas.length === 1) return { status: "resolvida", orgId: linhas[0]!.id }
  if (linhas.length === 0) {
    return { status: "nao_resolvida", motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 }
  }
  return { status: "nao_resolvida", motivo: "ambigua", quantidadeEncontrada: linhas.length }
}

// ---------------------------------------------------------------------------
// Dual-run compartilhado (AC2)
// ---------------------------------------------------------------------------

export type ModoRoteamento = "legacy" | "both" | "identifier"

/**
 * Sem env var setada, o default é **`"both"`**, nunca `"legacy"` nem `"identifier"` silenciosos:
 * `"legacy"` silencioso perderia toda a instrumentação sem ninguém notar; `"identifier"`
 * silencioso mudaria comportamento sem aviso no primeiro ambiente que esquecesse de configurar a
 * variável. `"both"` é seguro nos dois eixos — com 1 org dá a mesma resposta do legado, e já
 * produz o contador.
 *
 * Fail-safe por construção: qualquer valor fora da união (typo, string vazia, `"BOTH"`) cai em
 * `"both"`. Nunca lança.
 */
export function decidirModoRoteamento(): ModoRoteamento {
  const valor = process.env.WEBHOOK_ORG_ROUTING
  if (valor === "legacy" || valor === "identifier") return valor
  return "both"
}

export type ReceptorWebhook = "whatsapp" | "meta_ads" | "landing_page" | "telegram"

/**
 * Telemetria de ALTO VOLUME (todo webhook recebido, nos modos `both`/`identifier`) —
 * fire-and-forget via `logEvent`, deliberadamente, e não `logEventOnce`.
 *
 * Este NÃO é a última escrita antes do `return` (a Story 87-6 documenta a perda em lambda
 * serverless para esse caso): quando `logOrgResolved` dispara, o handler ainda vai processar a
 * mensagem/lead inteira depois dele. Bloquear o caminho quente num INSERT por webhook recebido
 * seria pagar latência em cada mensagem para uma métrica de observação.
 *
 * É o contador do épico (§854: "resolvido por identificador vs. caiu no fallback, observável
 * antes de remover o fallback") e a fonte da query de corte da Onda 3.
 */
export function logOrgResolved(params: {
  receptor: ReceptorWebhook
  via: "identifier" | "legacy"
  orgId: string
  /** `null` quando o modo é `"identifier"` puro (não computou o legado para comparar). */
  divergiu: boolean | null
}): void {
  logEvent({
    level: "info",
    category: "webhook",
    event_type: "WEBHOOK_ORG_RESOLVED",
    source: `api/webhook/${params.receptor}`,
    org_id: params.orgId,
    message: `${params.receptor}: org resolvida via ${params.via}`,
    metadata: { via: params.via, divergiu: params.divergiu, receptor: params.receptor },
  })
}

/**
 * As ÚNICAS chaves que podem entrar em `identificador`. Todas são identificador da PRÓPRIA
 * organização emissora (ou uma contagem), nunca dado do lead.
 *
 * Fechada de propósito: é a lista que o tipo e o filtro de runtime consultam, e a que os 4 testes
 * de call site espelham. Acrescentar uma entrada aqui é uma decisão visível em diff — que é o
 * ponto, porque este log grava com `org_id: null`.
 */
export const CHAVES_IDENTIFICADOR_PERMITIDAS = [
  "phone_number_id",
  "page_id",
  "quantidade_organizacoes_ativas",
] as const

export type ChaveIdentificador = (typeof CHAVES_IDENTIFICADOR_PERMITIDAS)[number]

/** `Partial<Record<…>>`: chave fora da união é erro de compilação no call site. */
export type IdentificadorWebhook = Partial<Record<ChaveIdentificador, string | number | null>>

/**
 * Segunda barreira, em runtime — para o caminho que o tipo não cobre (`as any`, objeto vindo de
 * JSON, chamador em JS). Devolve o objeto SÓ com as chaves permitidas e a lista de NOMES
 * recusados (nunca os valores: o valor é justamente o que pode ser PII).
 */
function filtrarIdentificador(bruto: IdentificadorWebhook | undefined): {
  identificador: Record<string, string | number | null> | null
  chavesRecusadas: string[]
} {
  if (!bruto) return { identificador: null, chavesRecusadas: [] }
  const permitidas = new Set<string>(CHAVES_IDENTIFICADOR_PERMITIDAS)
  const identificador: Record<string, string | number | null> = {}
  const chavesRecusadas: string[] = []
  for (const [chave, valor] of Object.entries(bruto)) {
    if (permitidas.has(chave)) identificador[chave] = valor as string | number | null
    else chavesRecusadas.push(chave)
  }
  return { identificador, chavesRecusadas }
}

/**
 * Caminho TERMINAL de "não resolveu" — a ÚLTIMA escrita antes do `return`. Por isso AGUARDADO,
 * via `logEventOnce`, nunca fire-and-forget: `lib/logger.ts:46-54` (Story 87-6) documenta que uma
 * promise pendente morre com a lambda no mesmo `return` que a dispararia, e já custou um evento em
 * produção.
 *
 * ## PII — a regra, com dentes em DOIS lugares
 *
 * NUNCA grava corpo bruto do webhook: nem em `system_events.metadata`, nem em
 * `webhook_logs.payload`. `identificador` carrega SÓ o identificador PRÓPRIO da org emissora (o
 * `phone_number_id`/`page_id` do config dela mesma), nunca telefone, nome ou texto do lead.
 *
 * A primeira versão desta story afirmava que "acrescentar uma chave nova exige um teste vermelho"
 * — e o @qa mediu que **não exigia**: o teste montava o `identificador` ele mesmo e conferia as
 * chaves do próprio literal, uma tautologia. Acrescentar `telefone_do_lead` aos 4 call sites
 * ficava **verde nos 4**. Este é o log que grava com `org_id: null`, ou seja, exatamente o que sai
 * do escopo de organização — a guarda mais séria do módulo era a que não existia.
 *
 * Agora ela tem dentes em dois lugares independentes:
 *
 * 1. **Tipo fechado** ({@link IdentificadorWebhook}): a chave nova vira erro de compilação, e
 *    `pnpm type-check` é gate. Isto substitui a defesa que se perdeu quando o tipo passou a
 *    aceitar `number` (necessário para `quantidade_organizacoes_ativas`).
 * 2. **Allowlist em RUNTIME** (aqui): mesmo por um `as any` ou payload não tipado, chave fora de
 *    {@link CHAVES_IDENTIFICADOR_PERMITIDAS} **não é gravada**; só o NOME dela vai para
 *    `identificador_chaves_recusadas`, para o vazamento aparecer no log em vez de acontecer.
 *
 * O carrasco de verdade, porém, é no CALL SITE: cada receptor tem um teste que afirma, com
 * `toEqual`, o objeto EXATO que a rota passa para cá — chave nova reprova lá, antes de o runtime
 * precisar defender.
 *
 * `webhook_logs.source` é um `CHECK` fechado (migrations 015/194:
 * `meta_ads | whatsapp | google_forms | landing_page | imoveis_sync | other`) — daí o parâmetro
 * separado `webhookLogsSource`, que não é o mesmo domínio de `receptor`.
 *
 * ## `webhookLogsExistenteId` — por que existe (achado da Task 5.4)
 *
 * Dois dos quatro receptores (`landing_page` e `meta_ads`) JÁ inserem uma linha em `webhook_logs`
 * ANTES de resolver a org. Se `logOrgUnresolved` sempre inserisse a sua própria, a mesma
 * requisição passaria a ter DUAS linhas — e qualquer contagem "quantas submissões chegaram"
 * passaria a contar errado, em silêncio, exatamente na fatia que existe para tirar silêncio do
 * caminho. Com o id, a linha do chamador é REAPROVEITADA (update); sem ele (`whatsapp`,
 * `telegram`, que não gravam nada hoje), a linha nasce aqui.
 */
export async function logOrgUnresolved(params: {
  receptor: ReceptorWebhook
  motivo: MotivoNaoResolvida
  quantidadeEncontrada: number
  identificador?: IdentificadorWebhook
  webhookLogsSource: "whatsapp" | "meta_ads" | "landing_page" | "other"
  /** Linha de `webhook_logs` que o chamador já inseriu para ESTA requisição, se houver. */
  webhookLogsExistenteId?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  const marcaDeErro = `org_unresolved:${params.motivo}`
  const nivel = nivelDoMotivo(params.motivo)
  const { identificador, chavesRecusadas } = filtrarIdentificador(params.identificador)
  await Promise.all([
    logEventOnce({
      level: nivel,
      category: "webhook",
      event_type: "WEBHOOK_ORG_UNRESOLVED",
      source: `api/webhook/${params.receptor}`,
      message: `${params.receptor}: org não resolvida (${params.motivo})`,
      metadata: {
        motivo: params.motivo,
        quantidade_encontrada: params.quantidadeEncontrada,
        identificador,
        receptor: params.receptor,
        ...(chavesRecusadas.length > 0
          ? { identificador_chaves_recusadas: chavesRecusadas }
          : {}),
      },
    }),
    params.webhookLogsExistenteId
      ? admin
          .from("webhook_logs")
          .update({ processing_error: marcaDeErro })
          .eq("id", params.webhookLogsExistenteId)
      : admin.from("webhook_logs").insert({
          org_id: null,
          source: params.webhookLogsSource,
          event_type: "org_unresolved",
          payload: identificador,
          processing_error: marcaDeErro,
          processed: true,
        }),
  ])
}
