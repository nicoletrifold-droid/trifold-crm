import { NextRequest, NextResponse, after } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { criarRateLimit, ipDaRequisicao } from "@web/lib/forms/rate-limit"
import {
  extrairSinais,
  enviarEventoFormulario,
  type CorpoTracking,
} from "@web/lib/meta/form-capi"
import { FORM_CAPI_EVENTS, type FormCapiEventName } from "@trifold/shared"

// Story 86-9 (AC6) — o par server-side dos eventos de funil que acontecem ANTES
// de existirem dados do lead: `ViewContent` (abriu o formulário) e
// `InitiateCheckout` (confirmou a primeira resposta).
//
// Por que uma rota separada e não o POST principal: o POST principal só existe
// quando há respostas para gravar. Pendurar o `ViewContent` nele mediria apenas
// quem já respondeu algo — perderíamos exatamente o número que diz se o criativo
// traz gente que abre e desiste. Aqui o evento sai no carregamento da página.
//
// Só estes DOIS eventos são aceitos. `Lead` e `CompleteRegistration` nascem do
// POST principal, onde o servidor SABE que o lead nasceu — um endpoint público
// que aceitasse "me manda um Lead" seria um canal aberto para inflar conversão.

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Mesma resposta para qualquer falha de token — não vazar o que existe. */
const TOKEN_INVALIDO = { error: "Link inválido ou desativado." }

/**
 * Limite próprio, mais folgado que o do formulário (30/min): estes eventos são
 * de navegação e podem sair várias vezes numa sessão legítima.
 */
const checarRateLimit = criarRateLimit(60)

const EVENTOS_ACEITOS: ReadonlySet<string> = new Set<FormCapiEventName>([
  FORM_CAPI_EVENTS.VIEW_CONTENT,
  FORM_CAPI_EVENTS.INITIATE_CHECKOUT,
])

interface CorpoPost extends CorpoTracking {
  evento?: string
  event_id?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  if (!checarRateLimit(ipDaRequisicao(request))) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 })
  }
  if (!UUID_RE.test(token)) return NextResponse.json(TOKEN_INVALIDO, { status: 404 })

  const body = (await request.json().catch(() => null)) as CorpoPost | null
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 })

  const evento = body.evento
  const eventId = body.event_id
  if (!evento || !EVENTOS_ACEITOS.has(evento)) {
    return NextResponse.json({ error: "Evento não aceito." }, { status: 400 })
  }
  // Sem o mesmo id do browser não há deduplicação — dois eventos seriam
  // contados, e a campanha otimizaria por um número inflado. Melhor não enviar.
  if (!eventId || !UUID_RE.test(eventId)) {
    return NextResponse.json({ error: "event_id inválido." }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from("lead_forms")
    .select("nome")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle()

  if (!data) return NextResponse.json(TOKEN_INVALIDO, { status: 404 })

  const sinais = extrairSinais(request, body)
  const contentName = (data.nome as string) ?? "Formulário de qualificação"
  const urlPadrao = new URL(`/formulario/${token}`, request.url).toString()

  // `after()`, nunca `void` — ver o aviso em form-capi.ts.
  after(async () => {
    await enviarEventoFormulario({
      evento: evento as FormCapiEventName,
      eventId,
      sinais,
      contentName,
      urlPadrao,
    })
  })

  return NextResponse.json({ ok: true })
}
