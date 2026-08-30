/**
 * Story 900-14 — regra `aios/no-unscoped-admin-client`.
 *
 * Sinaliza uso de `createAdminClient()` (service-role, bypassa RLS) fora da allowlist.
 *
 * ## Por que existe uma allowlist grande, e por que isso não é capitulação
 *
 * Quando a regra nasceu, 237 arquivos já usavam o client cru. Ligá-la sem allowlist produziria
 * 237 avisos de uma vez — e 237 avisos não são um alarme, são papel de parede. O time aprende a
 * rolar a tela e a regra morre no primeiro dia.
 *
 * A allowlist aplica a mesma catraca do gate de tenancy: **congela o legado e sinaliza o novo**.
 * Desde a Story 900-21b (re-triagem da Onda 2) ela tem CINCO seções, e todas as cinco isentam —
 * a diferença entre elas é o que se promete sobre o futuro do arquivo:
 *
 *   • `plataforma`   — cross-org de plataforma (dado da própria Trifold, sem dimensão de org).
 *     Permanente: não migra para `forEachActiveOrg`.
 *   • `itera-orgs`   — cron que JÁ itera as orgs corretamente; o motivo cita o `arquivo:linha` do
 *     loop. Não migra: o que falta a ele é isolamento de erro por org, não forma.
 *   • `alvos-onda-2` — cron travado numa org fixa ou com defeito medido. Isenção COM PRAZO
 *     (`alvosExpiramEm`); vencido, o teste estrutural fica vermelho.
 *   • `legitimos`    — residual: webhooks que resolvem a org pelo payload, caminhos cross-org
 *     sancionados do painel `/platform`. Motivo já correto; correção de código é story futura.
 *   • `legado`       — dívida. **Esta lista só diminui.** É a `900-15` que a esvazia, migrando as
 *     rotas para `createOrgScopedAdminClient`, priorizando as que tocam PII.
 *
 * Arquivo novo que precise do client cru entra em `legitimos` com justificativa, e isso aparece
 * em diff para alguém revisar. Arquivo novo que apenas esqueceu de escopar recebe o aviso.
 *
 * A FORMA deste JSON é vigiada por `scripts/admin-client-allowlist.test.ts` (Story 900-21b), que
 * também roda o ESLint de verdade num subprocesso: `npx eslint src` sozinho sai com código 0
 * quando só há warnings, então ele não serve de catraca.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Story 900-21b (R2 do parecer @po): a resolução era `join(process.cwd(), "..", "..")`, o que só
// funciona quando o cwd é EXATAMENTE `packages/web`. A API Node do ESLint (`new ESLint({ cwd })`)
// não muda `process.cwd()`, então qualquer consumidor fora do diretório — o teste desta story,
// entre outros — recebia ENOENT no carregamento do módulo. `import.meta.url` é âncora do ARQUIVO,
// não do processo: `eslint-rules/` -> `web/` -> `packages/` -> raiz.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

const allowlist = JSON.parse(
  readFileSync(join(RAIZ, "docs", "audits", "admin-client-allowlist.json"), "utf-8"),
)

/**
 * União das CINCO chaves da allowlist (Story 900-21b, correção B1 do parecer @po).
 *
 * Até a 900-21b a allowlist tinha duas chaves (`legitimos` + `legado`) e esta união lia só as
 * duas. A re-triagem da 900-21b quebrou `legitimos` em quatro seções com significados diferentes
 * (`plataforma`, `itera-orgs`, `alvos-onda-2`, `legitimos` residual) — e, sem esta mudança, 51
 * arquivos perderiam a isenção EM SILÊNCIO, porque a severidade da regra é `warn` e nenhum CI
 * ficaria vermelho. Medido: mover um único arquivo de seção acendia 2 warnings antes silenciosos.
 *
 * Exportado (não mais `const` privado) para que `scripts/admin-client-allowlist.test.ts` possa
 * assertar `PERMITIDOS.size` contra o total do JSON — a ponte entre o arquivo de dados e o
 * runtime de lint. Sem exportar, o teste só conseguiria remedir o próprio JSON.
 */
export const PERMITIDOS = new Set([
  ...Object.keys(allowlist.plataforma ?? {}),
  ...Object.keys(allowlist["itera-orgs"] ?? {}),
  ...Object.keys(allowlist["alvos-onda-2"] ?? {}),
  ...Object.keys(allowlist.legitimos ?? {}),
  ...(allowlist.legado ?? []),
])

/** Caminho do arquivo relativo a `packages/web/`, que é como a allowlist guarda. */
function caminhoRelativo(filename) {
  const norm = filename.split("\\").join("/")
  const i = norm.indexOf("/packages/web/")
  if (i !== -1) return norm.slice(i + "/packages/web/".length)
  const j = norm.indexOf("src/")
  return j !== -1 ? norm.slice(j) : norm
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Proíbe createAdminClient() fora da allowlist — service-role bypassa RLS e exige escopo manual de org",
    },
    schema: [],
    messages: {
      naoEscopado:
        "createAdminClient() usa service-role e BYPASSA RLS: o isolamento entre empresas passa a " +
        "depender de um .eq('org_id', …) escrito à mão em cada query. Use " +
        "createOrgScopedAdminClient(orgId), que injeta o escopo. Se esta rota é legitimamente " +
        "cross-org (cron/webhook), acrescente-a a docs/audits/admin-client-allowlist.json em " +
        "'legitimos', com o motivo.",
    },
  },

  create(context) {
    const arquivo = caminhoRelativo(context.filename ?? context.getFilename())
    if (PERMITIDOS.has(arquivo)) return {}

    return {
      ImportSpecifier(node) {
        if (node.imported?.name === "createAdminClient") {
          context.report({ node, messageId: "naoEscopado" })
        }
      },
      CallExpression(node) {
        if (node.callee?.type === "Identifier" && node.callee.name === "createAdminClient") {
          context.report({ node, messageId: "naoEscopado" })
        }
      },
    }
  },
}
