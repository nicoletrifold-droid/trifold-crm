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
  /**
   * IP do visitante, quando quem monta o corpo é um proxy que fala com o CRM
   * servidor-a-servidor (Story 86-11: a landing do Vind Residence passa pelo
   * proxy `api/lead.js`, hospedado em outro projeto Vercel).
   *
   * ⚠️ Nesse arranjo o `x-forwarded-for` que o CRM enxerga é o do datacenter da
   * Vercel, não o do visitante — por isso este campo pode ter precedência sobre
   * o header. Mas SÓ quando o chamador pede explicitamente:
   * `extrairSinais(request, corpo, { confiarEmClientIpDoCorpo: true })`.
   * Ver `OpcoesSinais` e o defeito `86.11-QA-001`.
   */
  client_ip?: string
  /** User-Agent do visitante. Mesma precedência e mesma justificativa de `client_ip`. */
  client_ua?: string
}

/** Opções de `extrairSinais`. */
export interface OpcoesSinais {
  /**
   * Liga a precedência de `client_ip`/`client_ua` do CORPO sobre os headers da
   * request. Default `false`.
   *
   * 🔴 Ligar SOMENTE quando quem monta o corpo é um servidor confiável que
   * enxergou o IP real do visitante — hoje, os dois proxies serverless da
   * landing do Vind Residence (`api/lead.js` e `api/track.js`), que sobrescrevem
   * qualquer valor vindo do browser antes de repassar ao CRM.
   *
   * Nas rotas chamadas DIRETO pelo browser (`/formulario/[token]` e
   * `/formulario/[token]/tracking`, Story 86-9) isto fica desligado: ali o corpo
   * é digitado pelo próprio visitante, e aceitá-lo deixaria qualquer um forjar
   * `client_ip_address`/`client_user_agent` no evento CAPI — forja de
   * atribuição no dataset do Meta (`86.11-QA-001`). O header é a única fonte
   * que o visitante não escolhe.
   */
  confiarEmClientIpDoCorpo?: boolean
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
 *
 * 🔴 IP e UA: por padrão vêm SEMPRE dos headers desta request — o corpo não tem
 * como influenciá-los. Só com `confiarEmClientIpDoCorpo: true` o corpo passa a
 * ter precedência (Story 86-11 AC7): quando há um proxy servidor-a-servidor
 * entre o browser e esta rota, o `x-forwarded-for` visto aqui é o do datacenter
 * da Vercel — usá-lo degradaria a correspondência em silêncio, sem erro e sem
 * log, exatamente como o defeito `86.9-QA-001`. Nas rotas chamadas direto pelo
 * browser o default desligado é o que impede a forja (`86.11-QA-001`).
 */
export function extrairSinais(
  request: NextRequest,
  corpo: CorpoTracking | undefined,
  opcoes?: OpcoesSinais,
): SinaisTracking {
  const fbclid = texto(corpo?.fbclid)
  const fbc = texto(corpo?.fbc) ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined)

  // Opt-in explícito: sem ele, o corpo é ignorado para IP/UA (não é fallback —
  // é como se os campos não existissem).
  const confiaNoCorpo = opcoes?.confiarEmClientIpDoCorpo === true

  return {
    visitorId: texto(corpo?.visitor_id),
    fbp: texto(corpo?.fbp),
    fbc,
    fbclid,
    pageUrl: texto(corpo?.page_url),
    clientIp: (confiaNoCorpo ? texto(corpo?.client_ip) : undefined) ?? ipDaRequest(request),
    clientUa:
      (confiaNoCorpo ? texto(corpo?.client_ua) : undefined) ??
      texto(request.headers.get("user-agent")),
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
  /**
   * Segmenta a origem nas Custom Conversions. Omitido → `'form_qualificacao'`
   * (o default de `buildFormEvent`, preservado para o chamador da 86-9).
   */
  contentCategory?: string
  /**
   * Deriva a UF (`st`) a partir do DDD do telefone. Ligado por default, que é o
   * comportamento da Story 86-9 em `/formulario/[token]`.
   *
   * A landing do Vind Residence (86-11) desliga: o telefone chega ali já
   * normalizado por um normalizador DIFERENTE (`+55DDNNNNNNNNN`, do
   * `landing-page/route.ts`), e `st`/`ct` estão explicitamente fora do escopo
   * daquela story. Ligar aqui seria implementar escopo que a story excluiu.
   */
  derivarUf?: boolean
}

/** Monta o evento CAPI de UM item do funil. Pura — sem I/O. */
function montarEvento(input: EnviarEventoInput) {
  const telefone = input.lead?.telefone
  const userData = buildCapiUserData({
    leadId: input.lead?.leadId,
    externalIds: input.sinais.visitorId ? [input.sinais.visitorId] : undefined,
    name: input.lead?.nome,
    email: input.lead?.email,
    phone: telefone,
    // UF derivada do DDD. A cidade NÃO é derivada — ver uf-from-ddd.ts (AC7).
    ...(input.derivarUf === false
      ? {}
      : { state: ufFromDDD(normalizePhoneBR(telefone) ?? telefone) ?? undefined }),
    fbc: input.sinais.fbc,
    fbp: input.sinais.fbp,
    clientIp: input.sinais.clientIp,
    clientUserAgent: input.sinais.clientUa,
  })

  return buildFormEvent({
    eventName: input.evento,
    eventId: input.eventId,
    eventTime: Math.floor(Date.now() / 1000),
    userData,
    eventSourceUrl: input.sinais.pageUrl ?? input.urlPadrao,
    contentName: input.contentName,
    value: input.value,
    ...(input.contentCategory ? { contentCategory: input.contentCategory } : {}),
  })
}

/**
 * Envia N eventos do funil à CAPI em UMA só chamada (batch nativo do
 * `sendCapiEvents`). Nunca lança: devolve `false` em qualquer falha, para que o
 * chamador siga o fluxo do lead sem se importar.
 *
 * O batch existe porque a landing do Vind Residence (86-11) dispara `Lead` e
 * `CompleteRegistration` no MESMO instante — dois POSTs ao Meta seriam duas
 * chances de falha de rede para um único fato de negócio.
 *
 * ⚠️ Chamar SEMPRE de dentro de `after()`. Um `void` solto morre no meio: na
 * Vercel a invocação congela assim que a resposta sai (foi assim que o e-mail de
 * reset da Story 75-139 nunca chegava). Aqui, o sintoma seria um evento que
 * simplesmente não existe no Events Manager, sem erro em lugar nenhum.
 */
export async function enviarEventosFormulario(
  inputs: EnviarEventoInput[],
): Promise<boolean> {
  const nomes = inputs.map((i) => i.evento).join("+")
  try {
    if (inputs.length === 0) return true

    const eventos = inputs.map(montarEvento)

    const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE
    const resultado = await sendCapiEvents(
      eventos,
      testEventCode ? { testEventCode } : undefined,
    )

    if (!resultado.success) {
      // Só o nome do evento e a mensagem de erro — nunca o user_data (AC9).
      console.error(`[form-capi] falha ao enviar ${nomes}:`, resultado.error)
    }
    return resultado.success
  } catch (e) {
    console.error(`[form-capi] erro inesperado ao enviar ${nomes}:`, e)
    return false
  }
}

/**
 * Envia UM evento do funil à CAPI. Atalho sobre `enviarEventosFormulario` —
 * mantido como a assinatura que a Story 86-9 já usa em produção.
 */
export async function enviarEventoFormulario(input: EnviarEventoInput): Promise<boolean> {
  return enviarEventosFormulario([input])
}
