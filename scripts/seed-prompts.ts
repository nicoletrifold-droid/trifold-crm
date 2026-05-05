import { createClient } from "@supabase/supabase-js"
import {
  PERSONALITY_PROMPT,
  GUARDRAILS_PROMPT,
  QUALIFICATION_PROMPT,
  PROPERTY_PRESENTATION_PROMPT,
  VISIT_SCHEDULING_PROMPT,
  HANDOFF_SUMMARY_PROMPT,
  OFF_HOURS_PROMPT,
  buildSystemPromptText,
} from "../packages/ai/src/prompts"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ORG_ID = "00000000-0000-0000-0000-000000000001"

async function seedPrompts() {
  console.log("Seeding agent prompts with real content...\n")

  const prompts = [
    {
      slug: "system-personality",
      name: "Personalidade Nicole",
      type: "system",
      content: PERSONALITY_PROMPT,
    },
    {
      slug: "guardrails",
      name: "Guardrails da IA",
      type: "guardrail",
      content: GUARDRAILS_PROMPT,
    },
    {
      slug: "qualification-flow",
      name: "Fluxo de Qualificacao",
      type: "qualification",
      content: QUALIFICATION_PROMPT,
    },
    {
      slug: "property-presentation",
      name: "Apresentacao de Empreendimentos",
      type: "system",
      content: PROPERTY_PRESENTATION_PROMPT,
    },
    {
      slug: "visit-scheduling",
      name: "Agendamento de Visitas",
      type: "system",
      content: VISIT_SCHEDULING_PROMPT,
    },
    {
      slug: "handoff-summary",
      name: "Resumo para Corretor",
      type: "handoff",
      content: HANDOFF_SUMMARY_PROMPT,
    },
    {
      slug: "off-hours",
      name: "Mensagem Fora do Horario",
      type: "system",
      content: OFF_HOURS_PROMPT,
    },
  ]

  for (const prompt of prompts) {
    const { error } = await supabase.from("agent_prompts").upsert(
      { ...prompt, org_id: ORG_ID },
      { onConflict: "org_id,slug" }
    )
    if (error) {
      console.error(`  ❌ ${prompt.slug}: ${error.message}`)
    } else {
      console.log(`  ✅ ${prompt.name} (${prompt.slug})`)
    }
  }

  // Also update the personality_prompt in agent_config with the full built prompt
  // Use the text helper (concatenated string) for DB persistence —
  // the array form (with cache_control) is only used at API call time.
  const fullSystemPrompt = buildSystemPromptText()
  const { error: configError } = await supabase
    .from("agent_config")
    .update({ personality_prompt: fullSystemPrompt })
    .eq("org_id", ORG_ID)

  if (configError) {
    console.error(`\n  ❌ agent_config update: ${configError.message}`)
  } else {
    console.log(`\n  ✅ agent_config.personality_prompt updated with full system prompt`)
  }

  console.log("\nSeed prompts complete!")
}

seedPrompts().catch(console.error)
