import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { loadOpeningContext } from "@web/lib/whatsapp/opening-context"
import {
  listApprovedOpeningTemplates,
  resolveOpeningParams,
  renderOpeningBody,
} from "@web/lib/whatsapp/opening-templates"

// Story 75-217 — lista os templates de abertura APROVADOS na Meta para o menu
// do "Iniciar atendimento", já com o preview renderizado para este lead.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const context = await loadOpeningContext(id, appUser, supabase)
  if (!context.ok) {
    return NextResponse.json({ success: false, error: context.error, message: context.message }, { status: context.status })
  }
  if (!context.waConfig.waba_id) {
    return NextResponse.json({ success: false, error: "WABA_ID_MISSING", message: "Conta WhatsApp Business não configurada." }, { status: 400 })
  }

  try {
    const approved = await listApprovedOpeningTemplates(context.waConfig.waba_id, context.waConfig.access_token)
    const templates = approved.flatMap((t) => {
      const paramsForTemplate = resolveOpeningParams(t.name, context.ctx)
      if (!paramsForTemplate) return []
      return [{ name: t.name, preview: renderOpeningBody(t.body, paramsForTemplate) }]
    })
    return NextResponse.json({ success: true, templates })
  } catch (err) {
    console.error("[OPENING-TEMPLATES] list failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ success: false, error: "TEMPLATE_LIST_FAILED", message: "Não foi possível carregar as mensagens de abertura. Tente novamente." }, { status: 502 })
  }
}
