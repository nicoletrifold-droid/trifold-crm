import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAnthropicClient } from "@trifold/ai"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  // Verify lead exists and belongs to org
  const { data: lead } = await supabase
    .from("leads")
    .select(
      `
      *,
      stage:kanban_stages(name),
      property_interest:properties!property_interest_id(name)
    `
    )
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // Find active conversation
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, is_ai_active")
    .eq("lead_id", id)
    .eq("status", "active")
    .single()

  if (!conversation) {
    return NextResponse.json(
      { error: "No active conversation found" },
      { status: 404 }
    )
  }

  // Deactivate AI on the conversation
  const { error: convError } = await supabase
    .from("conversations")
    .update({
      is_ai_active: false,
      handoff_at: new Date().toISOString(),
      handoff_reason: "manual",
    })
    .eq("id", conversation.id)

  if (convError) {
    return NextResponse.json({ error: convError.message }, { status: 500 })
  }

  // Optionally assign broker
  const body = await request.json().catch(() => ({}))

  if (body.broker_id) {
    await supabase
      .from("leads")
      .update({ assigned_broker_id: body.broker_id })
      .eq("id", id)
      .eq("org_id", appUser.org_id)
  }

  // Generate AI summary
  let summary: string | null = null
  try {
    // Fetch conversation messages for summary
    const { data: conversations } = await supabase
      .from("conversations")
      .select(
        `
        id, channel,
        messages:messages(role, content, created_at)
      `
      )
      .eq("lead_id", id)
      .order("last_message_at", { ascending: false })

    const allMessages: Array<{
      role: string
      content: string
      created_at: string
    }> = []
    for (const conv of conversations ?? []) {
      const msgs = conv.messages as Array<{
        role: string
        content: string
        created_at: string
      }> | null
      if (msgs) {
        allMessages.push(...msgs)
      }
    }
    allMessages.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    const conversationText = allMessages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n")

    const stageArr = lead.stage as unknown as Array<{ name: string }> | null
    const stageName = stageArr?.[0]?.name ?? null
    const propertyArr = lead.property_interest as unknown as Array<{
      name: string
    }> | null
    const propertyName = propertyArr?.[0]?.name ?? null

    const prompt = `Voce e um assistente de CRM imobiliario. O lead esta sendo transferido da IA para um corretor humano (handoff manual). Gere um resumo conciso para o corretor.

DADOS DO LEAD:
- Nome: ${lead.name || "Nao informado"}
- Telefone: ${lead.phone || "Nao informado"}
- Email: ${lead.email || "Nao informado"}
- Canal: ${lead.channel || "Nao informado"}
- Estagio: ${stageName || "Nao informado"}
- Empreendimento de interesse: ${propertyName || "Nao informado"}
- Score de qualificacao: ${lead.qualification_score ?? "Nao informado"}

HISTORICO DE CONVERSAS (${allMessages.length} mensagens):
${conversationText || "Nenhuma conversa registrada."}

Gere um resumo estruturado com:
1. **Perfil do lead**: Quem e, o que busca
2. **Pontos principais da conversa**: O que foi discutido
3. **Nivel de interesse**: Quao engajado esta
4. **Proximos passos sugeridos**: O que o corretor deve fazer

Seja conciso e objetivo.`

    const anthropic = createAnthropicClient()
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-20250414",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    })

    const firstBlock = message.content[0]
    summary =
      firstBlock && firstBlock.type === "text" ? firstBlock.text : null

    // Save summary to lead
    if (summary) {
      await supabase
        .from("leads")
        .update({ ai_summary: summary })
        .eq("id", id)
        .eq("org_id", appUser.org_id)
    }
  } catch (err) {
    console.error("Error generating handoff summary:", err)
    // Continue without summary — handoff itself is more important
  }

  // Create activity log
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: id,
    user_id: appUser.id,
    type: "handoff",
    description: "Handoff manual realizado — IA desativada",
    metadata: {
      handoff_reason: "manual",
      triggered_by: appUser.id,
      broker_id: body.broker_id ?? null,
      conversation_id: conversation.id,
      had_summary: !!summary,
    },
  })

  return NextResponse.json({
    data: {
      lead_id: id,
      conversation_id: conversation.id,
      handoff_at: new Date().toISOString(),
      handoff_reason: "manual",
      ai_summary: summary,
      broker_id: body.broker_id ?? null,
    },
  })
}
