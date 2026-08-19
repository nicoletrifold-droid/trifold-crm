/**
 * Story 75-344 — as telas de Campanhas têm gate DE SERVIDOR.
 *
 * Até esta story, `/dashboard/campaigns` e `/dashboard/campaigns/meta` não tinham
 * nenhum: o `NAV_MODULE_MAP` do layout só filtra a sidebar, então quem tinha o
 * módulo desligado não via o menu e abria a tela pela URL. O comentário da 75-333
 * (em `formularios/page.tsx`) já registrava isso como dívida conhecida.
 *
 * Teste de CÓDIGO-FONTE pelo mesmo motivo do `campaigns-tabs.contract.test.ts`:
 * as telas são server components `async` que puxam sessão, permissões e Supabase;
 * montá-las custaria muito mais do que o defeito merece, e mockar `canAccess()`
 * testaria o mock. O que precisa ser garantido é sintático e objetivo: nenhuma
 * tela de Campanhas fica sem gate, e cada uma usa a chave que lhe corresponde.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const RAIZ = join(__dirname, "..")

function fonte(tela: string): string {
  return readFileSync(join(RAIZ, tela), "utf8")
}

describe("gates de servidor das telas de Campanhas", () => {
  it.each(["page.tsx", "meta/page.tsx"])(
    "%s barra quem não tem o módulo (redireciona para a aba permitida, ou 404)",
    (tela) => {
      const src = fonte(tela)
      expect(src).toContain("resolverAcessoCampanhas")
      expect(src).toContain("destinoSemModuloCampanhas")
      // Sem aba nenhuma permitida a resposta é 404 — não "segue e mostra".
      expect(src).toContain("notFound()")
      expect(src).toMatch(/if \(!acesso\.modulo\)/)
    }
  )

  it("formularios/page.tsx gateia pelo SUB-MÓDULO, não pelo módulo", () => {
    const src = fonte("formularios/page.tsx")
    // É o que permite o Marcos liberar SÓ esta aba pela tela de Perfil de Acesso.
    expect(src).toMatch(/if \(!acesso\.formularios\) notFound\(\)/)
    // O gate antigo (módulo inteiro) não pode voltar por descuido.
    expect(src).not.toContain('canAccess(user.id, user.orgId, "campanhas")')
  })
})
