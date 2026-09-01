/**
 * Story 75-371 (@qa QA-75-371-1) — a tela de Pipeline não volta a oferecer o que a API
 * recusa.
 *
 * Teste de CÓDIGO-FONTE, no mesmo padrão de `configuracoes-gate.contract.test.ts`: a
 * tela é server component `async` que puxa sessão e permissões, e o projeto não tem
 * jsdom. O que regrediu em 01/09/2026 foi exatamente a FIAÇÃO — a tela perguntando por
 * acesso ao sub-módulo `configuracoes.pipeline` (que herda de `configuracoes`) enquanto
 * a API e a RLS exigem a capability `configuracoes.pipeline_editar`. O Joabe
 * (Gerente-Comercial) preencheu o modal inteiro e levou `Forbidden` no "Criar etapa".
 *
 * A asserção que importa não é "a tela usa uma chave", é **a tela usa A MESMA chave que
 * a API**: as duas são extraídas da fonte e comparadas. Divergir aqui reprova.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const RAIZ = join(__dirname, "../../../..")

const fonte = (rel: string) => readFileSync(join(RAIZ, rel), "utf8")

/** O arquivo sem comentários — os comentários citam a chave antiga ao contar a história. */
const codigo = (rel: string) =>
  fonte(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")

const TELA = "app/dashboard/configuracoes/pipeline/page.tsx"
const TABELA = "app/dashboard/configuracoes/pipeline/_components/stages-table.tsx"
const ROTA_COLECAO = "app/api/stages/route.ts"
const ROTA_ITEM = "app/api/stages/[id]/route.ts"

/** Todas as capabilities exigidas por um arquivo de rota. */
function capabilitiesDaRota(rel: string): string[] {
  const achados = [...codigo(rel).matchAll(/requireCapability\(\s*\w+,\s*"([^"]+)"/g)]
  return [...new Set(achados.map((m) => m[1]!))]
}

/** A capability que a tela usa no gate de escrita. */
function capabilityDaTela(): string[] {
  const achados = [...codigo(TELA).matchAll(/\bcan\(\s*[^,]+,\s*[^,]+,\s*"([^"]+)"/g)]
  return [...new Set(achados.map((m) => m[1]!))]
}

describe("gate da tela de Pipeline × gate da API", () => {
  it("a API exige uma única capability para escrever etapa", () => {
    expect(capabilitiesDaRota(ROTA_COLECAO)).toEqual(["configuracoes.pipeline_editar"])
    expect(capabilitiesDaRota(ROTA_ITEM)).toEqual(["configuracoes.pipeline_editar"])
  })

  it("a tela gateia pela MESMA chave que a API — não por acesso ao sub-módulo", () => {
    // Este é o teste que reprova o bug do Joabe: com o gate antigo
    // (`canAccess(..., "configuracoes.pipeline")`) a lista da tela sai vazia.
    expect(capabilityDaTela()).toEqual(capabilitiesDaRota(ROTA_COLECAO))
  })

  it("a tela não volta a perguntar pelo sub-módulo no gate de escrita", () => {
    const src = codigo(TELA)
    expect(src).not.toContain('"configuracoes.pipeline"')
    expect(src).not.toMatch(/canAccess\(/)
  })

  it("o botão de criar e a tabela saem do MESMO booleano do gate", () => {
    const src = codigo(TELA)
    expect(src).toMatch(/const canEdit = await can\(/)
    expect(src).toMatch(/\{canEdit && <CreateStageModal \/>\}/)
    expect(src).toMatch(/<StagesTable[^>]*canEdit=\{canEdit\}/s)
  })

  it("nem a tela nem a tabela decidem por NOME DE PERFIL", () => {
    for (const rel of [TELA, TABELA]) {
      const src = codigo(rel)
      expect(src).not.toMatch(/user\.role ===/)
      expect(src).not.toMatch(/role ===\s*"admin"/)
      expect(src).not.toMatch(/roles\.includes\(/)
    }
  })

  it("as ações de escrita da tabela ficam atrás do canEdit, e a falha aparece na tela", () => {
    const src = codigo(TABELA)
    expect(src).toMatch(/\{canEdit && \(/)
    // QA-75-371-4: o `if (res.ok)` mudo engolia o 409 da etapa padrão.
    expect(src).toContain("mensagemDeErroDeEtapa")
    expect(src).not.toMatch(/const res = await fetch\(`\/api\/stages\/\$\{stage\.id\}`, \{ method: "DELETE" \}\)\s*\n\s*if \(res\.ok\)/)
  })
})
