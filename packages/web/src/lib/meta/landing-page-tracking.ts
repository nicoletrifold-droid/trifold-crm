import type { CorpoTracking } from "@web/lib/meta/form-capi"

/**
 * Contrato do bloco `tracking` que a landing do Vind Residence envia ao CRM.
 *
 * [Story 86-11 — AC5, AC6, AC7]
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
 * do projeto Vercel `vind-residence` — servidor-a-servidor. É por isso que
 * `client_ip`/`client_ua` viajam no CORPO: o `x-forwarded-for` que o CRM enxerga
 * é o do datacenter da Vercel, não o do visitante (ver `extrairSinais`).
 */

/**
 * Segmenta os eventos desta landing nas Custom Conversions do Meta, separando-os
 * do funil do formulário de qualificação (`form_qualificacao`, Story 86-9).
 *
 * Fica no SERVIDOR de propósito: se viesse no corpo, qualquer chamador com o
 * token poderia gravar eventos sob a categoria que quisesse.
 */
export const LANDING_VIND_CONTENT_CATEGORY = "landing_vind_residence"

/** Nome legível no Events Manager. */
export const LANDING_VIND_CONTENT_NAME = "Landing Vind Residence"

/** URL usada quando o browser não mandou `page_url` (nunca deveria acontecer). */
export const LANDING_VIND_URL_PADRAO = "https://trifold.eng.br/vindresidence/"

/** Bloco `tracking` aceito nos POSTs vindos da landing. */
export interface TrackingLanding extends CorpoTracking {
  /** `event_id` do evento `Lead` — gerado no browser, é o que deduplica. */
  event_id?: string
  /** `event_id` PRÓPRIO do `CompleteRegistration` (ver AC6). */
  complete_registration_event_id?: string
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
  }

  return Object.keys(tracking).length > 0 ? tracking : undefined
}
