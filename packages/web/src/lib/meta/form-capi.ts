import type { NextRequest } from "next/server"
import {
  buildCapiUserData,
  buildFormEvent,
  sendCapiEvents,
  ufFromDDD,
  normalizePhoneBR,
  type FormCapiEventName,
} from "@trifold/shared"

/**
 * Envio dos eventos do funil do formulário à Conversions API.
 *
 * [Story 86-9 — AC4, AC5, AC6, AC9]
 *
 * Este módulo é o par SERVIDOR do `pixel-events.ts` (browser). Os dois disparam
 * o mesmo evento com o mesmo `event_id`; o Meta deduplica e fica com a união dos
 * sinais — o browser traz `fbp`/`fbc`, o servidor traz o telefone e o nome
 * hasheados, o IP e o User-Agent. Nenhum dos dois lados sozinho chega perto de
 * uma nota de correspondência alta.
 */

/** Sinais de atribuição: metade vem do browser, metade dos headers da request. */
export interface SinaisTracking {
  visitorId?: string
  fbp?: string
  fbc?: string
  fbclid?: string
  pageUrl?: string
  clientIp?: string
  clientUa?: string
}

/** O que sabemos da pessoa neste momento do funil. */
export interface IdentidadeLead {
  leadId?: string
  nome?: string
  email?: string
  telefone?: string
}

/** Corpo de tracking aceito nos POSTs públicos do formulário. */
export interface CorpoTracking {
  visitor_id?: string
  fbp?: string
  fbc?: string
  fbclid?: string
  page_url?: string
}

function texto(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined
}

/**
 * IP do cliente. Reusa a mesma leitura de `x-forwarded-for` já praticada nas
 * rotas públicas do projeto — na Vercel o primeiro valor da lista é o IP real.
 */
function ipDaRequest(request: NextRequest): string | undefined {
  const fwd = request.headers.get("x-forwarded-for")
  return texto(fwd?.split(",")[0]) ?? texto(request.headers.get("x-real-ip"))
}

/**
 * Junta o que o browser mandou com o que só o servidor enxerga.
 *
 * O `fbc` é derivado do `fbclid` quando o cookie `_fbc` não veio — é comum na
 * primeira visualização, quando o script do Pixel ainda não rodou. Sem essa
 * derivação, a conversão chega ao Meta desligada do anúncio que a gerou.
 *
 * ⚠️ Todos os quatro campos (`fbp`, `fbc`, IP, UA) trafegam em TEXTO PURO até o
 * payload final. Hashear qualquer um deles quebra a correspondência (AC9).
 */
export function extrairSinais(
  request: NextRequest,
  corpo: CorpoTracking | undefined,
): SinaisTracking {
  const fbclid = texto(corpo?.fbclid)
  const fbc = texto(corpo?.fbc) ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined)

  return {
    visitorId: texto(corpo?.visitor_id),
    fbp: texto(corpo?.fbp),
    fbc,
    fbclid,
    pageUrl: texto(corpo?.page_url),
    clientIp: ipDaRequest(request),
    clientUa: texto(request.headers.get("user-agent")),
  }
}

/**
 * Monta o bloco `metadata.meta_ad` do lead, preservando o resto do JSONB.
 *
 * É o que faz o evento "Visitou" (cron `meta-capi-dispatch`, disparado dias
 * depois) sair COM `fbc`/`fbp`/IP/UA. Até esta story, `extractAttribution`
 * naquele cron lia um campo que ninguém nunca escrevia — o evento de fundo de
 * funil, o mais valioso da operação, saía sem nenhum sinal de atribuição.
 *
 * Segue o padrão de merge de `buildCtwaMetadata`: espalha o metadata atual e
 * escreve apenas sob a chave própria.
 */
export function comMetaAd(
  metadataAtual: Record<string, unknown> | null | undefined,
  sinais: SinaisTracking,
): Record<string, unknown> {
  const meta_ad: Record<string, unknown> = {
    ...(sinais.fbc ? { fbc: sinais.fbc } : {}),
    ...(sinais.fbp ? { fbp: sinais.fbp } : {}),
    ...(sinais.fbclid ? { fbclid: sinais.fbclid } : {}),
    ...(sinais.clientIp ? { client_ip: sinais.clientIp } : {}),
    ...(sinais.clientUa ? { client_ua: sinais.clientUa } : {}),
    ...(sinais.visitorId ? { visitor_id: sinais.visitorId } : {}),
    captured_at: new Date().toISOString(),
  }

  return { ...(metadataAtual ?? {}), meta_ad }
}

export interface EnviarEventoInput {
  evento: FormCapiEventName
  /** UUID gerado no browser — o mesmo que o Pixel usou. */
  eventId: string
  sinais: SinaisTracking
  lead?: IdentidadeLead
  /** Nome do formulário, para leitura humana no Events Manager. */
  contentName: string
  /** Score de qualificação (só no `CompleteRegistration`). */
  value?: number
  /** URL de fallback quando o browser não mandou `page_url`. */
  urlPadrao: string
}

/**
 * Envia UM evento do funil à CAPI. Nunca lança: devolve `false` em qualquer
 * falha, para que o chamador siga o fluxo do lead sem se importar.
 *
 * ⚠️ Chamar SEMPRE de dentro de `after()`. Um `void` solto morre no meio: na
 * Vercel a invocação congela assim que a resposta sai (foi assim que o e-mail de
 * reset da Story 75-139 nunca chegava). Aqui, o sintoma seria um evento que
 * simplesmente não existe no Events Manager, sem erro em lugar nenhum.
 */
export async function enviarEventoFormulario(input: EnviarEventoInput): Promise<boolean> {
  try {
    const telefone = input.lead?.telefone
    const userData = buildCapiUserData({
      leadId: input.lead?.leadId,
      externalIds: input.sinais.visitorId ? [input.sinais.visitorId] : undefined,
      name: input.lead?.nome,
      email: input.lead?.email,
      phone: telefone,
      // UF derivada do DDD. A cidade NÃO é derivada — ver uf-from-ddd.ts (AC7).
      state: ufFromDDD(normalizePhoneBR(telefone) ?? telefone) ?? undefined,
      fbc: input.sinais.fbc,
      fbp: input.sinais.fbp,
      clientIp: input.sinais.clientIp,
      clientUserAgent: input.sinais.clientUa,
    })

    const evento = buildFormEvent({
      eventName: input.evento,
      eventId: input.eventId,
      eventTime: Math.floor(Date.now() / 1000),
      userData,
      eventSourceUrl: input.sinais.pageUrl ?? input.urlPadrao,
      contentName: input.contentName,
      value: input.value,
    })

    const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE
    const resultado = await sendCapiEvents(
      [evento],
      testEventCode ? { testEventCode } : undefined,
    )

    if (!resultado.success) {
      // Só o nome do evento e a mensagem de erro — nunca o user_data (AC9).
      console.error(`[form-capi] falha ao enviar ${input.evento}:`, resultado.error)
    }
    return resultado.success
  } catch (e) {
    console.error(`[form-capi] erro inesperado ao enviar ${input.evento}:`, e)
    return false
  }
}
