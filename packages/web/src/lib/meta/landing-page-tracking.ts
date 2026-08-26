import type { CorpoTracking } from "@web/lib/meta/form-capi"

/**
 * Contrato do bloco `tracking` que as landings standalone enviam ao CRM.
 *
 * [Story 86-11 — AC5, AC6, AC7] · [Story 86-12 — AC5: discriminador multi-landing]
 *
 * O bloco chega por DOIS caminhos, e os dois passam por aqui:
 *
 * 1. `POST /api/webhooks/landing-page` — junto com o lead (`Lead` +
 *    `CompleteRegistration`, disparados quando o servidor confirma que o lead
 *    nasceu).
 * 2. `POST /api/webhooks/landing-page/track` — sozinho, antes de existir lead
 *    (`ViewContent`, `InitiateCheckout`).
 *
 * Em ambos os casos quem fala com o CRM é o proxy `api/lead.js` / `api/track.js`
 * do projeto Vercel da landing (`vind-residence`, `yarden`) —
 * servidor-a-servidor. É por isso que `client_ip`/`client_ua` viajam no CORPO: o
 * `x-forwarded-for` que o CRM enxerga é o do datacenter da Vercel, não o do
 * visitante (ver `extrairSinais`).
 */

/** Landings standalone instrumentadas com Pixel + CAPI. */
export type LandingSlug = "vind_residence" | "yarden"

export interface LandingConfig {
  /**
   * Segmenta os eventos da landing nas Custom Conversions do Meta, separando-os
   * do funil do formulário de qualificação (`form_qualificacao`, Story 86-9) e
   * das outras landings — que compartilham o MESMO dataset Meta
   * (`1337310707164669`, decisão travada na 86-12 AC1).
   */
  contentCategory: string
  /** Nome legível no Events Manager. */
  contentName: string
  /** URL usada quando o browser não mandou `page_url` (nunca deveria acontecer). */
  urlPadrao: string
}

/**
 * Mapa fixo de landings. É a única fonte de verdade destes três valores.
 *
 * Fica no SERVIDOR de propósito: se `content_category`/`content_name` viessem do
 * corpo, qualquer chamador com o token poderia gravar eventos sob a categoria
 * que quisesse. O corpo só carrega o SLUG (`tracking.landing`), e ele é validado
 * contra este `Record` — um valor desconhecido cai no default, nunca quebra.
 */
export const LANDING_CONFIGS: Record<LandingSlug, LandingConfig> = {
  vind_residence: {
    contentCategory: "landing_vind_residence",
    contentName: "Landing Vind Residence",
    urlPadrao: "https://trifold.eng.br/vindresidence/",
  },
  yarden: {
    contentCategory: "landing_yarden",
    contentName: "Landing Yarden",
    urlPadrao: "https://trifold.eng.br/yarden/",
  },
}

/**
 * Default = Vind Residence, e isso é o que torna a 86-12 um ADAPT seguro.
 *
 * Os dois proxies em produção do Vind Residence (`api/lead.js`, `api/track.js`)
 * NÃO enviam `landing` e não foram tocados pela 86-12. `resolveLandingConfig`
 * sem slug devolve exatamente as três strings que as constantes
 * `LANDING_VIND_CONTENT_CATEGORY`/`_NAME`/`_URL_PADRAO` produziam antes — o
 * único consumidor existente não muda de comportamento. Trocar este default
 * (ou transformar slug inválido em erro) regride a landing que já está no ar.
 */
export const DEFAULT_LANDING_SLUG: LandingSlug = "vind_residence"

/**
 * Resolve o slug recebido no corpo (`tracking.landing`) para a config da landing.
 *
 * Aceita `unknown` de propósito: o valor vem de JSON externo. Defesa em
 * profundidade — a validação acontece SÓ aqui, para não haver duas allowlists
 * divergentes (`lerTracking` apenas propaga a string, ver 86-12 AC5.3).
 */
export function resolveLandingConfig(slug: unknown): LandingConfig {
  const chave =
    typeof slug === "string" && Object.prototype.hasOwnProperty.call(LANDING_CONFIGS, slug)
      ? (slug as LandingSlug)
      : DEFAULT_LANDING_SLUG
  return LANDING_CONFIGS[chave]
}

/** Bloco `tracking` aceito nos POSTs vindos da landing. */
export interface TrackingLanding extends CorpoTracking {
  /** `event_id` do evento `Lead` — gerado no browser, é o que deduplica. */
  event_id?: string
  /** `event_id` PRÓPRIO do `CompleteRegistration` (ver AC6). */
  complete_registration_event_id?: string
  /**
   * Slug da landing de origem (Story 86-12 AC5). Escrito pelo PROXY como
   * constante do arquivo, nunca pelo browser — mesmo raciocínio de
   * `client_ip`/`client_ua`. Ausente = Vind Residence (`DEFAULT_LANDING_SLUG`).
   */
  landing?: string
}

/**
 * Formato aceito para um `event_id`.
 *
 * Deliberadamente mais frouxo que o UUID estrito de
 * `/formulario/[token]/tracking`: o helper vanilla da landing cai num id
 * `e-<base36>-<base36>` quando `crypto.randomUUID` não existe (contexto
 * inseguro / navegador antigo). Exigir UUID ali descartaria em silêncio
 * exatamente os eventos dos navegadores mais frágeis. O que importa para a
 * deduplicação é o id ser o MESMO dos dois lados e não ser forjável em massa —
 * não o seu formato.
 */
const EVENT_ID_RE = /^[A-Za-z0-9._-]{8,64}$/

export function eventIdValido(valor: unknown): valor is string {
  return typeof valor === "string" && EVENT_ID_RE.test(valor)
}

function textoCurto(v: unknown, max = 512): string | undefined {
  if (typeof v !== "string") return undefined
  const limpo = v.trim().slice(0, max)
  return limpo.length > 0 ? limpo : undefined
}

/**
 * Lê o bloco `tracking` do JSON BRUTO recebido, com allowlist de chaves.
 *
 * ⚠️ Tem que ser lido do JSON bruto, e não do mapa `fields`: o
 * `flattenIntoFields` de `landing-page/route.ts` descarta objetos aninhados de
 * propósito — é essa propriedade que garante que o campo novo seja invisível
 * para todo o tráfego WordPress que compartilha o endpoint, e que IP/UA do
 * visitante nunca vazem para `webhook_logs.payload` nem para
 * `leads.metadata.raw_fields`. NÃO "consertar" o flatten para achatar objetos.
 *
 * Devolve `undefined` quando não há nada aproveitável — o chamador então segue
 * exatamente como antes desta story (AC10).
 */
export function lerTracking(bruto: unknown): TrackingLanding | undefined {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return undefined
  const t = bruto as Record<string, unknown>

  const tracking: TrackingLanding = {
    ...(textoCurto(t.event_id, 64) ? { event_id: textoCurto(t.event_id, 64) } : {}),
    ...(textoCurto(t.complete_registration_event_id, 64)
      ? { complete_registration_event_id: textoCurto(t.complete_registration_event_id, 64) }
      : {}),
    ...(textoCurto(t.visitor_id, 64) ? { visitor_id: textoCurto(t.visitor_id, 64) } : {}),
    ...(textoCurto(t.fbc, 256) ? { fbc: textoCurto(t.fbc, 256) } : {}),
    ...(textoCurto(t.fbp, 256) ? { fbp: textoCurto(t.fbp, 256) } : {}),
    ...(textoCurto(t.fbclid, 256) ? { fbclid: textoCurto(t.fbclid, 256) } : {}),
    ...(textoCurto(t.client_ip, 64) ? { client_ip: textoCurto(t.client_ip, 64) } : {}),
    ...(textoCurto(t.client_ua, 512) ? { client_ua: textoCurto(t.client_ua, 512) } : {}),
    ...(textoCurto(t.page_url, 512) ? { page_url: textoCurto(t.page_url, 512) } : {}),
    // Só propaga a string; quem decide se ela é um slug conhecido é
    // `resolveLandingConfig` (86-12 AC5.3 — uma allowlist, não duas).
    ...(textoCurto(t.landing, 32) ? { landing: textoCurto(t.landing, 32) } : {}),
  }

  return Object.keys(tracking).length > 0 ? tracking : undefined
}
