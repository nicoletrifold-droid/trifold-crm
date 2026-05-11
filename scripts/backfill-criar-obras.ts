/**
 * One-shot script: cria obras para todas as properties sem obra vinculada.
 * Dry-run por padrão. Passa --run para executar de verdade.
 *
 * Usage:
 *   npx tsx scripts/backfill-criar-obras.ts          # dry-run (lista o que seria criado)
 *   npx tsx scripts/backfill-criar-obras.ts --run     # executa a criação
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"

// Load env from packages/web/.env.local
const envPath = resolve(__dirname, "../packages/web/.env.local")
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match && !process.env[match[1].trim()]) {
    process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, "$1")
  }
}

const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DRY_RUN = !process.argv.includes("--run")

async function main() {
  console.log(`\n=== Backfill: criar obras para empreendimentos sem obra ===`)
  console.log(DRY_RUN ? "MODO: dry-run (nenhuma alteração será feita)\n" : "MODO: execução real\n")

  // 1. Buscar todos os org_ids ativos
  const { data: orgs, error: orgsErr } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("is_active", true)

  if (orgsErr) {
    console.error("Erro ao buscar orgs:", orgsErr.message)
    process.exit(1)
  }

  let totalCriadas = 0
  let totalSkipped = 0

  for (const org of orgs ?? []) {
    console.log(`\n--- Org: ${org.name} (${org.id}) ---`)

    // 2. Buscar properties da org
    const { data: properties, error: propErr } = await supabase
      .from("properties")
      .select("id, name, delivery_date")
      .eq("org_id", org.id)
      .eq("is_active", true)
      .order("created_at")

    if (propErr) {
      console.error("  Erro ao buscar properties:", propErr.message)
      continue
    }

    if (!properties?.length) {
      console.log("  Nenhum empreendimento.")
      continue
    }

    // 3. Buscar quais já têm obra vinculada
    const { data: obrasExistentes } = await supabase
      .from("obras")
      .select("property_id")
      .eq("org_id", org.id)
      .not("property_id", "is", null)

    const propertyIdsComObra = new Set(
      (obrasExistentes ?? []).map((o) => o.property_id as string)
    )

    const semObra = properties.filter((p) => !propertyIdsComObra.has(p.id))

    if (!semObra.length) {
      console.log(`  Todos os ${properties.length} empreendimentos já têm obra. ✓`)
      totalSkipped += properties.length
      continue
    }

    console.log(
      `  ${properties.length} empreendimentos | ${propertyIdsComObra.size} com obra | ${semObra.length} SEM obra:`
    )

    for (const prop of semObra) {
      const label = `  → "${prop.name}" (${prop.id})`

      if (DRY_RUN) {
        console.log(`${label}  [seria criada]`)
        totalCriadas++
        continue
      }

      const { error: insertErr } = await supabase.from("obras").insert({
        org_id: org.id,
        name: prop.name,
        property_id: prop.id,
        status: "em_andamento",
        progress_pct: 0,
        expected_delivery_date: prop.delivery_date ?? null,
      })

      if (insertErr) {
        console.error(`${label}  ERRO: ${insertErr.message}`)
      } else {
        console.log(`${label}  ✓ criada`)
        totalCriadas++
      }
    }
  }

  console.log(`\n=== Resumo ===`)
  if (DRY_RUN) {
    console.log(`${totalCriadas} obras seriam criadas.`)
    console.log(`\nPara executar de verdade: npx tsx scripts/backfill-criar-obras.ts --run`)
  } else {
    console.log(`${totalCriadas} obras criadas.`)
    console.log(`${totalSkipped} empreendimentos já tinham obra (ignorados).`)
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err)
  process.exit(1)
})
