import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAnthropicClient, analyzeLeadBehavior, ANTHROPIC_MODELS } from "@trifold/ai"
import { fetchLeadChronology } from "@web/lib/leads/behavior-chronology"

/**
 * Story 82-1 (Epic 82) — Análise de Comportamento IA (on-demand).
 * Junta a cronologia única do lead, chama o Sonnet e persiste o resultado em
 * leads.behavior_analysis + behavior_analyzed_at. NENHUMA outra escrita no
 * lead (stage/score intocados — IA só sugere, corretor decide).
 *
 * Acesso (Story 82-3): admin, supervisor, gerente-comercial e corretor
 * (`broker`) — corretor SOMENTE nos leads atribuídos a ele.
 */
// Story 82-4 — Sonnet com adaptive thinking pode levar dezenas de segundos;
// sem isso a função cai no timeout default do Vercel antes do modelo responder.
export const maxDuration = 90

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, [
    "admin",
    "supervisor",
    "gerente-comercial",
    "broker",
  ])
  if (forbidden) return forbidden

  // Story 82-3 — corretor só analisa lead dele (mesma regra das notas/tarefas).
  if (appUser.role === "broker") {
    const { data: owned } = await supabase
      .from("leads")
      .select("id")
      .eq("id", id)
      .eq("org_id", appUser.org_id)
      .eq("assigned_broker_id", appUser.id)
      .maybeSingle()
    if (!owned) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const chronology = await fetchLeadChronology(supabase, id, appUser.org_id)
  if (!chronology) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  const now = new Date().toISOString()

  try {
    const anthropic = createAnthropicClient()
    const analysis = await analyzeLeadBehavior(anthropic, {
      leadProfile: chronology.leadProfile,
      currentStage: chronology.currentStage,
      chronology: chronology.events,
      now,
    })

    if (!analysis) {
      // JSON inválido do modelo → nada é persistido (AC5)
      return NextResponse.json(
        { error: "A análise retornou um formato inválido. Tente novamente." },
        { status: 502 }
      )
    }

    const stored = {
      ...analysis,
      _meta: {
        model: ANTHROPIC_MODELS.sonnet,
        version: 1,
        event_count: chronology.events.length,
        last_event_at: chronology.lastEventAt,
      },
    }

    const { error: updateError } = await supabase
      .from("leads")
      .update({ behavior_analysis: stored, behavior_analyzed_at: now })
      .eq("id", id)
      .eq("org_id", appUser.org_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      data: { analysis: stored, analyzed_at: now, last_event_at: chronology.lastEventAt },
    })
  } catch (err) {
    console.error("Error generating behavior analysis:", err)
    return NextResponse.json(
      { error: "Falha ao gerar a análise de comportamento" },
      { status: 500 }
    )
  }
}
