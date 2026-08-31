/**
 * Story 900-51 · AC4 — o catálogo dos 5 tiles do painel compartilhado.
 *
 * ## Por que CINCO, e não seis
 *
 * A v0.2 desta story se contradizia ("4 tiles" num lugar, "5, não 4" em outro). Fixado em 5, e a
 * ausência de `google` NÃO é omissão: OAuth exige o consentimento do próprio cliente, e completá-lo
 * por ele exigiria impersonation, proibida pela D14 do epic. `google` continua vivendo no card
 * "Google Forms" já existente em `/dashboard/configuracoes/integracoes` (ação do cliente) e, no
 * `/platform`, como uma linha SOMENTE LEITURA fora deste componente.
 *
 * ## Por que `whatsapp` está aqui mas não escreve em `org_integrations`
 *
 * WhatsApp é o único tile cuja escrita vai para `whatsapp_config`, não para `org_integrations` — e
 * isso não é convenção: a migration 247 tem o `CHECK whatsapp_sem_identificador_proprio`, e o
 * helper `_org_integration_write_secret` levanta `P0010` para ele. Duas gavetas para o mesmo dado
 * seriam duas fontes de verdade; o banco torna a segunda impossível.
 *
 * ## A allowlist de `config` é positiva e por provider
 *
 * Chave desconhecida em `config` é recusada na rota. `config` de `meta_ads` é a chave de roteamento
 * de tenant que o webhook lê (`resolveOrgByMetaPage`) — escrita arbitrária de jsonb ali não é um
 * campo livre, é a decisão de qual empresa recebe um lead.
 */

/** Os providers que `_org_integration_write_secret` aceita (allowlist positiva da migration 248). */
export const PROVIDERS_GRAVAVEIS = ["meta_ads", "meta_capi", "sienge", "telegram"] as const
export type ProviderGravavel = (typeof PROVIDERS_GRAVAVEIS)[number]

/** Os 5 tiles do painel compartilhado. `whatsapp` grava em `whatsapp_config`, não aqui. */
export const PROVIDERS_DO_PAINEL = ["whatsapp", ...PROVIDERS_GRAVAVEIS] as const
export type ProviderDoPainel = (typeof PROVIDERS_DO_PAINEL)[number]

export interface DefinicaoDeProvider {
  id: ProviderDoPainel
  /** Rótulo na UI. `meta_ads` é desambiguado de `meta_capi` de propósito. */
  rotulo: string
  descricao: string
  /** Rótulo do campo de segredo (nunca exibe o valor — escrita-apenas). */
  rotuloSegredo: string
  /**
   * Chaves de `config` que este provider aceita. Positiva: chave desconhecida é recusada.
   * `[]` significa "nenhum identificador público" (Telegram é bot global, ADR-005).
   */
  chavesDeConfig: readonly string[]
  /** Rótulos dos identificadores públicos, na ordem de `chavesDeConfig`. */
  rotulosDeConfig: Readonly<Record<string, string>>
  /** `false` para `whatsapp`: a gaveta dele é `whatsapp_config` (CHECK da migration 247). */
  gravaEmOrgIntegrations: boolean
}

export const DEFINICOES_DE_PROVIDER: Readonly<Record<ProviderDoPainel, DefinicaoDeProvider>> = {
  whatsapp: {
    id: "whatsapp",
    rotulo: "WhatsApp",
    descricao: "Conversas com o lead pela WABA da sua empresa.",
    rotuloSegredo: "Access token (System User)",
    chavesDeConfig: ["phone_number_id", "waba_id"],
    rotulosDeConfig: { phone_number_id: "Phone Number ID", waba_id: "WABA ID" },
    gravaEmOrgIntegrations: false,
  },
  meta_ads: {
    // Desambiguação exigida pela story: o tile "Meta Ads" da tela antiga fala de
    // `meta_ad_accounts` (relatórios); ESTE fala de recebimento de lead por webhook.
    id: "meta_ads",
    rotulo: "Meta — Recebimento de Leads",
    descricao: "Leads de formulário do Facebook/Instagram chegam por webhook nesta Página.",
    rotuloSegredo: "Access token da Página",
    chavesDeConfig: ["page_id"],
    rotulosDeConfig: { page_id: "ID da Página" },
    gravaEmOrgIntegrations: true,
  },
  meta_capi: {
    id: "meta_capi",
    rotulo: "Meta CAPI",
    descricao: "Devolve conversões para a Meta pelo Conversions API.",
    rotuloSegredo: "Access token do dataset",
    chavesDeConfig: ["dataset_id"],
    rotulosDeConfig: { dataset_id: "ID do dataset" },
    gravaEmOrgIntegrations: true,
  },
  sienge: {
    id: "sienge",
    rotulo: "Sienge",
    descricao: "Contratos, extratos e boletos do ERP da construtora.",
    rotuloSegredo: "Senha da API",
    chavesDeConfig: ["subdomain", "usuario"],
    rotulosDeConfig: { subdomain: "Subdomínio", usuario: "Usuário da API" },
    gravaEmOrgIntegrations: true,
  },
  telegram: {
    id: "telegram",
    rotulo: "Telegram",
    descricao: "Canal de teste/interno. O bot pode ser o global da plataforma.",
    rotuloSegredo: "Bot token",
    chavesDeConfig: [],
    rotulosDeConfig: {},
    gravaEmOrgIntegrations: true,
  },
}

/**
 * Story 900-57 — o rótulo e o TOM de um status de tile, num lugar só.
 *
 * Nasceu dentro de `integrations-panel.tsx`, onde ficava certo enquanto o painel era a única
 * tela que mostrava status de integração. A `900-57` acrescenta uma segunda superfície (o card
 * "Integrações" do Resumo da empresa), e duas traduções do mesmo `status` são o começo de duas
 * telas do console discordando sobre o mesmo fato — que é literalmente o defeito QA-900-51-2.
 *
 * Devolve TOM, não classe: verde e vermelho valem nas duas paletas, mas o neutro depende de qual
 * escala a superfície usa (`stone` no CRM do cliente, `slate` no console). Quem sabe a escala é
 * quem renderiza.
 */
export type TomDoStatus = "ok" | "erro" | "neutro"

const ROTULO_DE_STATUS: Readonly<Record<string, { texto: string; tom: TomDoStatus }>> = {
  connected: { texto: "Conectado", tom: "ok" },
  active: { texto: "Conectado", tom: "ok" },
  error: { texto: "Com erro", tom: "erro" },
  disconnected: { texto: "Não conectado", tom: "neutro" },
  inactive: { texto: "Não conectado", tom: "neutro" },
}

/** Status desconhecido aparece com o próprio nome e tom neutro — nunca como "conectado". */
export function rotuloDeStatusDoTile(status: string): { texto: string; tom: TomDoStatus } {
  return ROTULO_DE_STATUS[status] ?? { texto: status, tom: "neutro" }
}

export function ehProviderDoPainel(valor: string): valor is ProviderDoPainel {
  return (PROVIDERS_DO_PAINEL as readonly string[]).includes(valor)
}

export function ehProviderGravavel(valor: string): valor is ProviderGravavel {
  return (PROVIDERS_GRAVAVEIS as readonly string[]).includes(valor)
}

/**
 * Recusa chave de `config` fora da allowlist do provider. Devolve os NOMES recusados — nunca os
 * valores, pela mesma razão de `filtrarIdentificador` em `webhook-org.ts`.
 */
export function chavesDeConfigRecusadas(
  provider: ProviderDoPainel,
  config: Record<string, unknown>,
): string[] {
  const permitidas = new Set(DEFINICOES_DE_PROVIDER[provider].chavesDeConfig)
  return Object.keys(config).filter((k) => !permitidas.has(k))
}

/**
 * Story 900-51 · QA-900-51-2 — o 18º instrumento cego, e ele era da TELA.
 *
 * ## O defeito, medido pelo `@qa` contra produção
 *
 * O tile `whatsapp` do `/platform` era montado **só de `org_integrations`** — uma linha que é
 * estruturalmente **inescrevível** para esse provider (`CHECK whatsapp_sem_identificador_proprio`
 * da migration `247` + `P0010` no helper da `248`). Ela nasce `disconnected` e nada, em lugar
 * nenhum, jamais a promove. Medido em produção no mesmo instante:
 *
 *     whatsapp_config      → status='active', access_token PRESENTE, phone_number_id PRESENTE
 *     org_integrations     → provider='whatsapp', status='disconnected'
 *
 * Ou seja: o canal que atende o cliente estava **no ar**, e o painel do dono do produto dizia
 * "Não conectado". O `/dashboard` sobrescrevia o valor e acertava. **Mesmo componente, duas telas,
 * discordando sobre o mesmo fato — e quem errava era a do dono do produto.**
 *
 * A pergunta que ninguém tinha feito: *"a fonte que este tile lê é a fonte que decide este
 * estado?"* Para `whatsapp`, não era.
 *
 * ## Por que a derivação virou função compartilhada
 *
 * Consertar só o `/platform` deixaria as duas telas com DUAS derivações, que é a causa e não o
 * sintoma. Esta função é a única definição de "o WhatsApp desta empresa está conectado?", e o
 * teste `nao-consumo.test.ts` afirma que as duas páginas a importam.
 *
 * ## Por que `status`/`phone_number_id`, e não `access_token`
 *
 * A `/platform` **não pode** ler `whatsapp_config.access_token`: seria a Trifold puxando a
 * credencial de um tenant para dentro do painel, exatamente o que a AC6 existe para impedir. O
 * sinal que as duas superfícies conseguem obter sem tocar no segredo é `status='active'` — e ele
 * não é frouxo: `whatsapp_config_org_ativo` (UNIQUE parcial da `900-21b`) garante no máximo uma
 * linha `active` por org, e o seed cria as linhas novas como `inactive` sem credencial.
 */
export interface LinhaWhatsAppConfig {
  status: string | null
  phone_number_id: string | null
  updated_at?: string | null
}

export interface EstadoDerivadoDoTile {
  status: string
  temSegredo: boolean
  atualizadoEm: string | null
}

export function derivarEstadoDoTileWhatsapp(
  linha: LinhaWhatsAppConfig | null | undefined,
): EstadoDerivadoDoTile {
  const ativo = linha?.status === "active" && Boolean(linha?.phone_number_id)
  return {
    status: ativo ? "active" : "inactive",
    temSegredo: ativo,
    atualizadoEm: linha?.updated_at ?? null,
  }
}

/**
 * Monta os 5 tiles do painel — a ÚNICA montagem, usada pelas duas superfícies.
 *
 * ## Por que isto é função e não um `.map()` em cada página (QA-900-51-2, segunda volta)
 *
 * A primeira correção deste achado deixou a montagem inline nas duas páginas e apostou numa régua
 * estática ("as duas páginas importam {@link derivarEstadoDoTileWhatsapp}"). Medido: apagar o
 * ramo `if (l.provider === "whatsapp")` do `/platform` deixava a régua **verde** — o `import`
 * sobrevivia à remoção do uso. Guarda de EXISTÊNCIA não é guarda de COBERTURA, e o defeito
 * original voltava inteiro sem nada acender.
 *
 * Com a montagem aqui, não há ramo para apagar numa página só: as duas recebem os mesmos tiles da
 * mesma função, e o carrasco (`providers.test.ts`) reproduz o estado REAL de produção — a linha
 * `whatsapp` de `org_integrations` em `disconnected` convivendo com `whatsapp_config` `active`.
 *
 * `linhaWhatsApp` é passada separada porque cada superfície a obtém por um caminho diferente
 * (`platformQuery` lá, client RLS-scoped aqui) — mas o que se FAZ com ela é o mesmo.
 */
export interface LinhaDeIntegracaoDoPainel {
  provider: string
  status: string
  config: Record<string, string | null> | null
  /** Ponteiro para o Vault. Só o booleano "existe" atravessa para a tela — nunca o valor. */
  secret_ref: string | null
  updated_at: string | null
}

export interface TileDoPainel {
  provider: ProviderDoPainel
  status: string
  config: Record<string, string | null>
  temSegredo: boolean
  atualizadoEm: string | null
}

export function montarTilesDoPainel(
  integracoes: LinhaDeIntegracaoDoPainel[],
  linhaWhatsApp: LinhaWhatsAppConfig | null | undefined,
): TileDoPainel[] {
  const porProvider = new Map(integracoes.map((l) => [l.provider, l]))

  return PROVIDERS_DO_PAINEL.map((provider) => {
    if (provider === "whatsapp") {
      // A linha `whatsapp` de `org_integrations` é IGNORADA de propósito: ela é estruturalmente
      // inescrevível (CHECK da 247 + P0010) e fica `disconnected` para sempre. Lê-la era afirmar
      // "Não conectado" sobre um canal que, em produção, estava `active` com credencial.
      return { provider, config: {}, ...derivarEstadoDoTileWhatsapp(linhaWhatsApp) }
    }
    const l = porProvider.get(provider)
    return {
      provider,
      status: l?.status ?? "disconnected",
      config: l?.config ?? {},
      temSegredo: (l?.secret_ref ?? null) !== null,
      atualizadoEm: l?.updated_at ?? null,
    }
  })
}
