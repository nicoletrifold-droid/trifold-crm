import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAnthropicClient } from "@trifold/ai"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  // Fetch lead data
  const { data: lead, error: leadError } = await supabase
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

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // Fetch conversation messages
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

  // Fetch conversation state for collected_data
  const { data: convStates } = await supabase
    .from("conversation_state")
    .select("collected_data")
    .eq("lead_id", id)

  // Build all messages across conversations
  const allMessages: Array<{ role: string; content: string; created_at: string }> = []
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
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  // Extract names from relations
  const stageArr = lead.stage as unknown as Array<{ name: string }> | null
  const stageName = stageArr?.[0]?.name ?? null
  const propertyArr = lead.property_interest as unknown as Array<{ name: string }> | null
  const propertyName = propertyArr?.[0]?.name ?? null

  // Collected data from conversation state
  const collectedData = (convStates ?? [])
    .map((s) => s.collected_data)
    .filter(Boolean)

  // Build prompt
  const conversationText = allMessages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n")

  const prompt = `Voce e um assistente de CRM imobiliario. Analise os dados do lead e gere um resumo estruturado em portugues.

DADOS DO LEAD:
- Nome: ${lead.name || "Nao informado"}
- Telefone: ${lead.phone || "Nao informado"}
- Email: ${lead.email || "Nao informado"}
- Canal: ${lead.channel || "Nao informado"}
- Estagio: ${stageName || "Nao informado"}
- Empreendimento de interesse: ${propertyName || "Nao informado"}
- Quartos preferidos: ${lead.preferred_bedrooms ?? "Nao informado"}
- Andar preferido: ${lead.preferred_floor ?? "Nao informado"}
- Vista preferida: ${lead.preferred_view ?? "Nao informado"}
- Vagas: ${lead.preferred_garage_count ?? "Nao informado"}
- Tem entrada: ${lead.has_down_payment === true ? "Sim" : lead.has_down_payment === false ? "Nao" : "Nao informado"}
- Score de qualificacao: ${lead.qualification_score ?? "Nao informado"}
- Nivel de interesse: ${lead.interest_level ?? "Nao informado"}

DADOS COLETADOS:
${collectedData.length > 0 ? JSON.stringify(collectedData, null, 2) : "Nenhum dado adicional coletado."}

HISTORICO DE CONVERSAS (${allMessages.length} mensagens):
${conversationText || "Nenhuma conversa registrada."}

Gere um resumo estruturado com os seguintes topicos:
1. **Nome e perfil**: Quem e o lead
2. **Interesse em empreendimento**: Qual empreendimento e por que
3. **Preferencias**: Tipo de unidade, andar, vista, etc
4. **Perguntas feitas**: Principais duvidas do lead
5. **Objecoes**: Resistencias ou preocupacoes demonstradas
6. **Score sugerido**: De 0 a 100, qual score voce daria
7. **Proximos passos**: Acoes recomendadas para o corretor

Seja conciso e objetivo.`

  try {
    const anthropic = createAnthropicClient()

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-20250414",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    })

    const firstBlock = message.content[0]
    const summary =
      firstBlock && firstBlock.type === "text" ? firstBlock.text : ""

    // Save summary to lead
    const { error: updateError } = await supabase
      .from("leads")
      .update({ ai_summary: summary })
      .eq("id", id)
      .eq("org_id", appUser.org_id)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { summary } })
  } catch (err) {
    console.error("Error generating AI summary:", err)
    return NextResponse.json(
      { error: "Failed to generate AI summary" },
      { status: 500 }
    )
  }
}
