import { NextRequest, NextResponse, after } from "next/server"
import { extrairSinais, enviarEventoFormulario } from "@web/lib/meta/form-capi"
import {
  eventIdValido,
  lerTracking,
  LANDING_VIND_CONTENT_CATEGORY,
  LANDING_VIND_CONTENT_NAME,
  LANDING_VIND_URL_PADRAO,
} from "@web/lib/meta/landing-page-tracking"
import { FORM_CAPI_EVENTS, type FormCapiEventName } from "@trifold/shared"

/**
 * Story 86-11 (AC5) — o par server-side dos eventos de TOPO de funil da landing
 * do Vind Residence: `ViewContent` (carregou a página) e `InitiateCheckout`
 * (focou no primeiro campo do formulário).
 *
 * Rota separada do `/api/webhooks/landing-page` porque estes dois eventos
 * acontecem ANTES de existir um lead. Pendurá-los no endpoint principal exigiria
 * fabricar um "lead vazio" — contaminando exatamente a lógica que decide se um
 * lead nasceu — ou sobrecarregar o contrato de um endpoint compartilhado com o
 * WordPress. Mesmo princípio já adotado em `/formulario/[token]/tracking` (86-9).
 *
 * `Lead` e `CompleteRegistration` NÃO entram na allowlist daqui: por definição só
 * existem quando o servidor confirmou que o lead nasceu, e um endpoint que
 * aceitasse "me manda um Lead" seria um canal aberto para inflar conversão.
 *
 * Não grava nada — nem `leads`, nem `webhook_logs`. É telemetria de marketing.
 */

export const dynamic = "force-dynamic"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

const EVENTOS_ACEITOS: ReadonlySet<string> = new Set<FormCapiEventName>([
  FORM_CAPI_EVENTS.VIEW_CONTENT,
  FORM_CAPI_EVENTS.INITIATE_CHECKOUT,
])

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  // Bracket notation prevents Turbopack/Next.js from statically inlining as undefined
  const env = process.env
  const secret = (env["LANDING_PAGE_WEBHOOK_SECRET"] ?? "").trim()

  if (!secret) {
    console.error("[LP-TRACK] LANDING_PAGE_WEBHOOK_SECRET não configurado")
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503, headers: CORS_HEADERS },
    )
  }

  // Mesma autenticação do endpoint principal: Bearer header OU ?token=...
  const authHeader = request.headers.get("authorization") ?? ""
  const queryToken = request.nextUrl.searchParams.get("token") ?? ""
  const providedToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : queryToken.trim()

  if (providedToken !== secret) {
    console.warn("[LP-TRACK] Token inválido recebido")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: CORS_HEADERS })
  }

  const eventName = typeof body.event_name === "string" ? body.event_name : ""
  if (!EVENTOS_ACEITOS.has(eventName)) {
    // 400 explícito, não descarte silencioso: um nome de evento errado é bug do
    // chamador, e falhar em silêncio esconderia um funil pela metade.
    return NextResponse.json(
      { error: "Event not accepted" },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const eventId = body.event_id
  if (!eventIdValido(eventId)) {
    // Sem o MESMO id do browser não há deduplicação: o Meta contaria dois
    // eventos e a campanha otimizaria por um número inflado.
    return NextResponse.json(
      { error: "Invalid event_id" },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  // O corpo desta rota já É o bloco de tracking (não vem aninhado como no
  // endpoint principal). Mesma allowlist, mesma precedência de IP/UA do corpo
  // sobre os headers — quem chama é o proxy `api/track.js`, servidor-a-servidor.
  //
  // `confiarEmClientIpDoCorpo` é opt-in de propósito (`86.11-QA-001`): ligado só
  // aqui e no endpoint principal da landing, onde há um proxy que enxergou o IP
  // real do visitante e sobrescreve o que o browser tentar ditar. Nas rotas da
  // 86-9, chamadas direto pelo browser, fica desligado.
  const tracking = lerTracking(body)
  const sinais = extrairSinais(request, tracking, { confiarEmClientIpDoCorpo: true })

  // `after()`, nunca `void` — ver o aviso em form-capi.ts. Aqui é telemetria de
  // topo de funil: perder o timing não perde dado de negócio, mas perder o
  // evento inteiro (o que um `void` solto faria) perde.
  after(async () => {
    await enviarEventoFormulario({
      evento: eventName as FormCapiEventName,
      eventId,
      sinais,
      contentName: LANDING_VIND_CONTENT_NAME,
      contentCategory: LANDING_VIND_CONTENT_CATEGORY,
      urlPadrao: LANDING_VIND_URL_PADRAO,
      // Sem lead, sem telefone — não há DDD de onde derivar UF. Explícito para
      // não depender do acaso de `lead` ser undefined.
      derivarUf: false,
    })
  })

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
}
