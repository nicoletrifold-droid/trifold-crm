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
 * Ela tem duas seções com significados opostos:
 *
 *   • `legitimos` — cron cross-org, webhook que resolve a org pelo payload, a própria definição
 *     do client. Ficam para sempre; cada um com o motivo escrito.
 *   • `legado`    — dívida. **Esta lista só diminui.** É a `900-15` que a esvazia, migrando as
 *     rotas para `createOrgScopedAdminClient`, priorizando as que tocam PII.
 *
 * Arquivo novo que precise do client cru entra em `legitimos` com justificativa, e isso aparece
 * em diff para alguém revisar. Arquivo novo que apenas esqueceu de escopar recebe o aviso.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const allowlist = JSON.parse(
  readFileSync(join(process.cwd(), "..", "..", "docs", "audits", "admin-client-allowlist.json"), "utf-8"),
)

const PERMITIDOS = new Set([...Object.keys(allowlist.legitimos ?? {}), ...(allowlist.legado ?? [])])

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
