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
 *
 * SEGUNDO ARTEFATO — Story 900-14b
 * --------------------------------
 * Além do JSON, este script emite `packages/web/src/lib/supabase/org-scoped-tables.generated.ts`.
 * Motivo: o `.vercelignore` da raiz exclui `docs/` do build, então código de aplicação **não
 * pode** importar de `docs/audits/schema-snapshot.json` — passa local e no CI, e quebra só na
 * Vercel com `Cannot find module` (três deploys de produção em ERROR, 2026-08-23).
 *
 * A transformação vive em `renderOrgScopedTablesModule()` — pura e determinística, para que o
 * módulo emitido seja função só do schema capturado. Não há check automático de sincronia entre o
 * módulo e o JSON: `main()` grava os dois a partir da MESMA captura, e é isso (e só isso) que os
 * mantém alinhados.
 */

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { introspect } from "./gate-tenancy"

/** Caminho do módulo gerado, relativo à raiz do repo. */
export const ORG_SCOPED_TABLES_MODULE = join(
  "packages",
  "web",
  "src",
  "lib",
  "supabase",
  "org-scoped-tables.generated.ts",
)

/**
 * O mínimo que a emissão precisa ver de um schema.
 *
 * Deliberadamente estrutural, não `IntrospectedSchema`: qualquer coisa com esta forma — inclusive
 * o JSON já commitado — reproduz o mesmo arquivo byte a byte, sem reconstruir o tipo inteiro nem
 * carregar a introspecção.
 */
export interface SchemaParaEmissao {
  tables: ReadonlyArray<{ name: string; hasOrgId: boolean }>
  capturedAt: string
  source: string
  projectRef: string
}

/**
 * Emite o conteúdo de `org-scoped-tables.generated.ts` a partir de um schema.
 *
 * Função pura e determinística — mesma entrada, mesmos bytes, comparável por igualdade de string.
 * Os nomes saem ordenados para o diff não depender da ordem em que o Postgres devolveu as tabelas.
 */
export function renderOrgScopedTablesModule(schema: SchemaParaEmissao): string {
  const comOrgId = [...new Set(schema.tables.filter((t) => t.hasOrgId).map((t) => t.name))].sort()

  const linhas = comOrgId.map((nome) => `  ${JSON.stringify(nome)},`).join("\n")

  return `/**
 * ARQUIVO GERADO — NÃO EDITE À MÃO.
 *
 * Fonte   : docs/audits/schema-snapshot.json (introspecção do schema, Story 900-2a)
 * Gerador : scripts/generate-schema-snapshot.ts · \`pnpm gate:tenancy:snapshot\`
 *
 * POR QUE ESTE MÓDULO EXISTE (Story 900-14b)
 * ------------------------------------------
 * \`org-scoped-admin.ts\` precisa da lista de tabelas com \`org_id\`, e ela tem de continuar
 * **derivada por introspecção, nunca escrita à mão** — uma lista manual nasce correta e apodrece,
 * com modo de falha silencioso (o client simplesmente deixa de escopar). Mas o \`.vercelignore\` da
 * raiz exclui \`docs/\` do build da Vercel: importar o JSON de lá passa local e no CI e quebra só
 * no deploy. Este módulo é o mesmo dado, dentro da árvore que a Vercel envia — e de brinde
 * mantém 194 KB de JSON de auditoria fora do bundle das rotas.
 *
 * LIMITAÇÃO CONHECIDA: não existe check automático garantindo que este arquivo esteja em sincronia
 * com o snapshot. O que os mantém alinhados é o gerador — os dois artefatos saem da MESMA captura,
 * numa única execução de \`pnpm gate:tenancy:snapshot\`. Regenere sempre por ele; editar à mão
 * desalinha os dois em silêncio.
 *
 * Snapshot: projeto ${schema.projectRef} · fonte ${schema.source} · capturado em ${schema.capturedAt}
 * ${comOrgId.length} de ${schema.tables.length} tabelas têm \`org_id\`.
 */

export const TABELAS_COM_ORG_ID = [
${linhas}
] as const
`
}

/** Grava o módulo gerado e devolve o caminho absoluto escrito. */
export function writeOrgScopedTablesModule(schema: SchemaParaEmissao, repoRoot: string): string {
  const destino = join(repoRoot, ORG_SCOPED_TABLES_MODULE)
  writeFileSync(destino, renderOrgScopedTablesModule(schema))
  return destino
}

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

  // Story 900-14b — o mesmo `schema` alimenta o módulo que a Vercel enxerga. Emitir aqui, e não
  // num script separado, é o que garante que os dois artefatos saiam da MESMA captura.
  const moduloGerado = writeOrgScopedTablesModule(schema, process.cwd())

  console.log(`Snapshot gravado: ${destino}`)
  console.log(`Módulo gerado:    ${moduloGerado}`)
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
