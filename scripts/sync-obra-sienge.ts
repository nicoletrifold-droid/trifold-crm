/**
 * Roda o sync Sienge para uma obra pelo ID.
 * Uso: npx tsx scripts/sync-obra-sienge.ts <obra_id>
 */

import { readFileSync } from "fs"
import { resolve } from "path"

const envPath = resolve(__dirname, "../packages/web/.env.local")
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match && !process.env[match[1].trim()]) {
    process.env[match[1].trim()] = match[2].trim()
  }
}

async function main() {
  const obraId = process.argv[2]
  if (!obraId) {
    console.error("Uso: npx tsx scripts/sync-obra-sienge.ts <obra_id>")
    process.exit(1)
  }

  console.log(`\n🔄 Sync Sienge → obra ${obraId}`)
  console.log(`   Subdomain: ${process.env.SIENGE_SUBDOMAIN}`)

  const { syncObraClientes } = await import("../packages/web/src/lib/integrations/sienge/sync")

  console.log("   Buscando contratos e importando clientes...\n")
  const result = await syncObraClientes(obraId)

  console.log("📊 Resultado:")
  console.log(`   Success:  ${result.success}`)
  console.log(`   Synced:   ${result.synced}`)
  console.log(`   Created:  ${result.created}`)
  console.log(`   Invited:  ${result.invited}`)
  if (result.error) console.log(`   Error:    ${result.error}`)
}

main().catch(console.error)
