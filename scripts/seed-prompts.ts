/**
 * ⚠️ BOOTSTRAP-ONLY — Story 87-1 · AC2-b.
 *
 * Este script faz `upsert` dos 7 slugs de `agent_prompts` a partir das CONSTANTES do
 * código. Desde a decisão D-87-0-a (05/08/2026) o painel admin é a fonte da verdade dos
 * prompts da Nicole e o código é apenas fallback de bootstrap — então rodar isto contra
 * produção APAGA o texto que está no ar e o substitui por uma versão que pode estar meses
 * atrasada. Com `.env.local` apontando para produção (o padrão desta casa), é um incidente.
 *
 * Por isso ele agora exige um gate explícito:
 *
 *   SEED_AGENT_PROMPTS_BOOTSTRAP=1 npx tsx scripts/seed-prompts.ts
 *   npx tsx scripts/seed-prompts.ts --bootstrap
 *
 * Para conferir/atualizar o espelho do repositório use `npm run prompts:check` e
 * `npx tsx scripts/dump-agent-prompts.ts --write`. Para voltar atrás num prompt, o
 * runbook `docs/runbooks/87-1-rollback-agent-prompts.md` — NUNCA este script.
 */
import { createClient } from "@supabase/supabase-js"
import { bootstrapLiberado, mensagemDoGate } from "./agent-prompts-bootstrap-gate"
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
import { resolverAmbiente } from "./lib/db-env"

// AC2-b: o gate roda ANTES de qualquer coisa — antes até do createClient, para que a
// mensagem seja sobre o bloqueio e não sobre uma credencial faltando.
if (!bootstrapLiberado()) {
  console.error(mensagemDoGate("scripts/seed-prompts.ts"))
  process.exit(1)
}

// Story 900-3b (AC3): alvo por `scripts/lib/db-env.ts` — allowlist que falha FECHADA,
// default TESTE. Escrever em produção exige TRIFOLD_ENV=producao E TRIFOLD_ALLOW_PROD=1.
const ALVO = resolverAmbiente({ escreve: true })
const supabase = createClient(
  ALVO.url,
  ALVO.serviceRoleKey!,
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
