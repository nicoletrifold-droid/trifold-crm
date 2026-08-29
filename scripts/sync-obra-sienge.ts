/**
 * Roda o sync Sienge para uma obra pelo ID.
 * Uso: npx tsx scripts/sync-obra-sienge.ts <obra_id>
 */

import { resolverAmbiente } from "./lib/db-env"

// Story 900-3b (AC3): o carregador que existia aqui lia `packages/web/.env.local` por
// caminho literal, SEM `existsSync` — depois do rename desta story ele estouraria ENOENT
// no primeiro `readFileSync`. `resolverAmbiente()` carrega `.env.teste`/`.env.producao`
// com a mesma semântica (`process.env` vence) e ainda valida o alvo.
// `escreve: true`: o sync importa clientes do Sienge para o banco.
resolverAmbiente({ escreve: true })

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
