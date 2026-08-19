/**
 * Story 75-346 — a landing de Configurações não volta a filtrar por nome de perfil,
 * nem a anunciar atalhos para quem não tem nenhum.
 *
 * Teste de CÓDIGO-FONTE, como o das abas de Campanhas (75-340): as duas telas são
 * server components `async` que puxam sessão e permissões, e o projeto não tem
 * jsdom. `cardsVisiveis` cobre a decisão; o que sobra aqui é a FIAÇÃO — e ela é
 * justamente o que regrediu na 75-345 (tela nova invisível para o perfil que tinha
 * a permissão).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const fonte = (rel: string) => readFileSync(join(__dirname, rel), "utf8")

/**
 * O mesmo arquivo sem COMENTÁRIOS. As asserções de "não volta a decidir por nome de
 * perfil" olham código: o comentário que conta a história do `GERENTE_ALLOWED`
 * precisa poder citá-lo pelo nome sem reprovar o teste.
 */
const codigo = (rel: string) =>
  fonte(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")

const TELAS = ["page.tsx", "nicole/page.tsx"] as const

describe("landing de Configurações e hub da Nicole", () => {
  it.each(TELAS)("%s deriva os cards da matriz", (tela) => {
    const src = fonte(tela)
    expect(src).toContain("cardsVisiveis")
    expect(src).toContain("chavesDosCards")
    expect(src).toContain("canAccess(")
  })

  it.each(TELAS)("%s redireciona quem não tem atalho nenhum", (tela) => {
    // Sem isto a tela fica aberta a qualquer autenticado — era o estado anterior da
    // landing, que listava doze atalhos para quem digitasse a URL.
    expect(fonte(tela)).toMatch(/if \((visibleCards|cards)\.length === 0\) redirect\(/)
  })

  it("nenhuma das duas volta a decidir por NOME DE PERFIL", () => {
    for (const tela of TELAS) {
      const src = codigo(tela)
      expect(src).not.toContain("GERENTE_ALLOWED")
      expect(src).not.toMatch(/user\.role ===/)
      expect(src).not.toMatch(/roles:\s*\[/)
      expect(src).not.toMatch(/roles\.includes\(/)
    }
  })

  it("a lista de cards não é redeclarada dentro das telas", () => {
    // Duas listas divergem em silêncio: foi assim que a barra de abas de Campanhas
    // quebrou duas vezes antes da 75-333.
    for (const tela of TELAS) {
      expect(codigo(tela)).not.toMatch(/const (CONFIG_CARDS|NICOLE_CARDS|ALL_CARDS) = \[/)
    }
  })
})
