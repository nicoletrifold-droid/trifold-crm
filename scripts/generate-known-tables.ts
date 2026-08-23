/**
 * Story 900-2a · T3.3 — gera `docs/audits/tenancy-known-tables.json` UMA VEZ.
 *
 * ⚠️ ESTE SCRIPT NÃO DEVE SER RODADO DE NOVO DEPOIS DA GERAÇÃO INICIAL.
 *
 * O arquivo que ele produz é uma **grandfather list congelada**: o retrato das tabelas que
 * já existiam no dia em que o gate nasceu. É contra esse retrato que a regra R3 decide o que
 * é "tabela nova" — e R3 é a única regra do epic marcada como FAIL absoluto, sem baseline,
 * porque é a que impede dívida NOVA de entrar.
 *
 * Rodar este script de novo re-congela a lista incluindo tudo que foi criado desde então, o
 * que **desarma a R3 em silêncio**: a partir daí toda tabela nova sem `org_id` passa
 * despercebida e o gate continua verde. É a falha mais barata de cometer e a mais cara de
 * descobrir.
 *
 * Tabela nova legítima sem `org_id` (ex.: tabela de plataforma, como as de custo do Epic 78)
 * vai para `docs/audits/tenancy-allowlist.yml` com `reason:` preenchido — que é revisável em
 * diff. Nunca para cá.
 *
 * Por isso o script exige confirmação explícita:
 *   REGENERAR_GRANDFATHER_LIST=1 pnpm tsx scripts/generate-known-tables.ts
 */

import { writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { introspect, checksumTabelas } from "./gate-tenancy"

const DESTINO = join(process.cwd(), "docs", "audits", "tenancy-known-tables.json")

const AVISO =
  "NÃO EDITAR À MÃO E NÃO REGERAR. Grandfather list congelada: retrato das tabelas que " +
  "existiam quando o gate de tenancy nasceu. A regra R3 usa esta lista para decidir o que é " +
  "tabela NOVA. Acrescentar entradas aqui desarma a R3 em silêncio. Tabela nova legítima sem " +
  "org_id vai para docs/audits/tenancy-allowlist.yml com reason: preenchido. O gate valida " +
  "contagem+checksum e RECUSA rodar se este arquivo for editado."

async function main(): Promise<number> {
  if (existsSync(DESTINO) && process.env.REGENERAR_GRANDFATHER_LIST !== "1") {
    console.error(
      `${DESTINO} já existe.\n\n` +
        "Esta lista é congelada de propósito — regerá-la desarma a regra R3 em silêncio,\n" +
        "porque tudo que foi criado desde o congelamento passaria a contar como 'legado'.\n\n" +
        "Se você REALMENTE quer regerar (ex.: a geração inicial saiu errada e nada depende\n" +
        "dela ainda), rode com:\n" +
        "  REGENERAR_GRANDFATHER_LIST=1 pnpm tsx scripts/generate-known-tables.ts",
    )
    return 1
  }

  if (!process.env.SUPABASE_MANAGEMENT_PAT?.trim()) {
    console.error("SUPABASE_MANAGEMENT_PAT ausente — a lista precisa vir do schema real.")
    return 1
  }

  const schema = await introspect(false)
  if (schema.source !== "management-api") {
    console.error("Introspecção caiu para snapshot — abortando. A grandfather list precisa ser ao vivo.")
    return 1
  }

  const tabelas = schema.tables.map((t) => t.name).sort()
  writeFileSync(
    DESTINO,
    JSON.stringify(
      {
        _aviso: AVISO,
        congeladoEm: new Date().toISOString(),
        projectRef: schema.projectRef,
        contagem: tabelas.length,
        checksum: checksumTabelas(tabelas),
        tabelas,
      },
      null,
      2,
    ) + "\n",
  )

  const semOrgId = schema.tables.filter((t) => !t.hasOrgId).length
  console.log(`Grandfather list congelada: ${DESTINO}`)
  console.log(`  ${tabelas.length} tabelas (${semOrgId} sem org_id — legado tolerado por R3)`)
  console.log(`  checksum ${checksumTabelas(tabelas)}`)
  return 0
}

if (process.argv[1]?.includes("generate-known-tables")) {
  main()
    .then((c) => process.exit(c))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    })
}
