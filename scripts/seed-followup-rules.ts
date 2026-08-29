import { createClient } from "@supabase/supabase-js"
import { resolverAmbiente } from "./lib/db-env"

// Story 900-3b (AC3): alvo por `scripts/lib/db-env.ts` — allowlist que falha FECHADA,
// default TESTE. Escrever em produção exige TRIFOLD_ENV=producao E TRIFOLD_ALLOW_PROD=1.
const ALVO = resolverAmbiente({ escreve: true })
const supabaseUrl = ALVO.url
const serviceRoleKey = ALVO.serviceRoleKey!

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ORG_ID = "00000000-0000-0000-0000-000000000001"

// Default follow-up rules per stage slug
const defaultRules: Record<
  string,
  {
    alert_days: number
    nicole_takeover_days: number
    message_template: string
  }
> = {
  "em-qualificacao": {
    alert_days: 1,
    nicole_takeover_days: 2,
    message_template:
      "Oi {nome}, tudo bem? Vi que conversamos sobre o {empreendimento} e queria saber se posso te ajudar com mais alguma informacao",
  },
  qualificado: {
    alert_days: 1,
    nicole_takeover_days: 2,
    message_template:
      "Oi {nome}, que tal marcarmos uma visita ao decorado do {empreendimento}? Vai adorar conhecer pessoalmente",
  },
  "visita-agendada": {
    alert_days: 0,
    nicole_takeover_days: 1,
    message_template:
      "Oi {nome}, so confirmando sua visita ao {empreendimento}. Estamos te esperando",
  },
  visitou: {
    alert_days: 2,
    nicole_takeover_days: 4,
    message_template:
      "Oi {nome}, que bom que voce veio conhecer o {empreendimento}. Ficou com alguma duvida? Posso ajudar",
  },
  negociando: {
    alert_days: 3,
    nicole_takeover_days: 5,
    message_template:
      "Oi {nome}, como estao as coisas? Se tiver qualquer duvida sobre o {empreendimento}, estou aqui pra ajudar",
  },
}

async function seedFollowUpRules() {
  console.log("Fetching kanban stages...")

  const { data: stages, error: stagesError } = await supabase
    .from("kanban_stages")
    .select("id, slug, name")
    .eq("org_id", ORG_ID)
    .eq("is_active", true)
    .order("position")

  if (stagesError) {
    console.error("Error fetching stages:", stagesError.message)
    process.exit(1)
  }

  if (!stages || stages.length === 0) {
    console.error("No stages found for org", ORG_ID)
    process.exit(1)
  }

  console.log(`Found ${stages.length} stages`)

  for (const stage of stages) {
    const rule = defaultRules[stage.slug]
    if (!rule) {
      console.log(`  Skipping stage "${stage.name}" (${stage.slug}) - no default rule`)
      continue
    }

    console.log(`  Creating rule for stage "${stage.name}"...`)

    const { error } = await supabase.from("follow_up_rules").upsert(
      {
        org_id: ORG_ID,
        stage_id: stage.id,
        alert_days: rule.alert_days,
        nicole_takeover_days: rule.nicole_takeover_days,
        message_template: rule.message_template,
        is_active: true,
      },
      { onConflict: "org_id,stage_id" }
    )

    if (error) {
      console.error(`  Error creating rule for "${stage.name}":`, error.message)
    } else {
      console.log(`  Rule created: alert=${rule.alert_days}d, nicole=${rule.nicole_takeover_days}d`)
    }
  }

  console.log("Done seeding follow-up rules.")
}

seedFollowUpRules()
