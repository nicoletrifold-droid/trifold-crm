/**
 * Story 900-2a · T2.2 — gera `docs/audits/schema-snapshot.json`.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * A arquitetura do Epic 900 fala em "fallback para snapshot versionado" como se o gerador
 * já existisse. Ele não existia. E **não** dá para reusar `scripts/sync-schema.sh`: aquele
 * script roda `supabase db push` (escreve no banco) e não produz snapshot nenhum — os dois
 * têm nomes parecidos e propósitos opostos. Confundir os dois seria rodar um push achando
 * que está tirando uma foto.
 *
 * PARA QUE SERVE O SNAPSHOT
 * -------------------------
 * Permitir que `pnpm gate:tenancy` rode sem `SUPABASE_MANAGEMENT_PAT` — em fork, em PR de
 * contribuidor externo, ou quando a API está fora. O gate avisa alto quando está em modo
 * snapshot, porque o resultado reflete a última captura e não o schema de agora.
 *
 * O snapshot é COMMITADO de propósito: ele é o retrato de referência e precisa aparecer em
 * diff quando muda. Um schema que muda sem ninguém ver é a origem do drift que este epic
 * inteiro combate.
 *
 * COMO RODAR
 *   pnpm gate:tenancy:snapshot
 *   TENANCY_TARGET_REF=<ref> pnpm gate:tenancy:snapshot
 *
 * Requer `SUPABASE_MANAGEMENT_PAT`. Leitura pura — só SELECT em catálogo do Postgres.
 */

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { introspect } from "./gate-tenancy"

async function main(): Promise<number> {
  if (!process.env.SUPABASE_MANAGEMENT_PAT?.trim()) {
    console.error(
      "SUPABASE_MANAGEMENT_PAT ausente.\n" +
        "Gerar o snapshot exige introspecção ao vivo — é justamente a foto que ele guarda.",
    )
    return 1
  }

  const schema = await introspect(false)

  if (schema.source !== "management-api") {
    // Sem esta guarda, uma falha de API geraria um snapshot a partir do snapshot anterior:
    // o arquivo continuaria "atualizando" a data e congelando o schema velho para sempre.
    console.error(
      "A introspecção caiu para modo snapshot — abortando.\n" +
        "Regravar o snapshot a partir dele mesmo apagaria a única referência boa.",
    )
    return 1
  }

  const destino = join(process.cwd(), "docs", "audits", "schema-snapshot.json")
  writeFileSync(destino, JSON.stringify(schema, null, 2) + "\n")

  console.log(`Snapshot gravado: ${destino}`)
  console.log(
    `  ${schema.tables.length} tabelas · ${schema.policies.length} policies · ` +
      `${schema.tables.filter((t) => t.hasOrgId).length} com org_id`,
  )
  console.log(`  projeto ${schema.projectRef}, capturado em ${schema.capturedAt}`)
  return 0
}

if (process.argv[1]?.includes("generate-schema-snapshot")) {
  main()
    .then((c) => process.exit(c))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    })
}
