/**
 * Story 75-340 — trava contra a regressão que já aconteceu DUAS vezes na barra
 * de abas de Campanhas.
 *
 * 1ª vez (antes da 75-333): a barra estava copiada em três arquivos; somar uma
 *    aba exigia editar os três, e esquecer um produzia uma barra que PERDIA a
 *    aba conforme a tela. A 75-333 extraiu o `CampaignsTabs` para matar isso.
 * 2ª vez (a própria 75-333, reportada em 18/08): a tela de Formulários nasceu passando
 *    `showAgente={false}` LITERAL, e a aba "Lídia" desaparecia ao entrar em
 *    Formulários. Mesmo sintoma, causa nova: valor fixo em vez de cópia.
 *
 * Este é um teste de CÓDIGO-FONTE, e isso é deliberado: as quatro telas são
 * server components `async` que puxam sessão, permissões e Supabase — montá-las
 * num teste custaria muito mais do que o defeito merece, e um mock de `can()`
 * testaria o mock. O que precisa ser garantido é objetivo e sintático: nenhuma
 * tela de Campanhas decide a visibilidade da aba por valor fixo.
 *
 * Se uma aba nova aparecer com a mesma forma (`showXxx`), acrescente-a à lista.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const RAIZ = join(__dirname, "..")

/** As quatro telas que montam a barra de abas. */
const TELAS = [
  "page.tsx", // CRM
  "meta/campaigns-meta-client.tsx", // Meta Ads
  "formularios/page.tsx", // Formulários
  "agente/agente-client.tsx", // Lídia
] as const

/**
 * Props de visibilidade do `CampaignsTabs` que precisam vir de capability.
 *
 * Story 75-344: `showModuloCampanhas` entrou aqui. As abas CRM e Meta Ads deixaram
 * de aparecer sempre e passaram a seguir o módulo — se uma tela fixar essa prop
 * em `false`, ela some as duas abas de quem TEM o módulo: é o mesmo defeito da
 * "Lídia" que este teste nasceu para pegar.
 */
const PROPS = ["showAgente", "showFormularios", "showModuloCampanhas"] as const

function fonte(tela: string): string {
  return readFileSync(join(RAIZ, tela), "utf8")
}

/** Trecho do arquivo que renderiza o `<CampaignsTabs …>`, com as props. */
function usoDasAbas(src: string): string | null {
  const i = src.indexOf("<CampaignsTabs")
  if (i === -1) return null
  return src.slice(i, src.indexOf("/>", i) + 2)
}

describe("CampaignsTabs — nenhuma tela de Campanhas esconde aba por valor fixo", () => {
  it.each(TELAS)("%s renderiza a barra de abas", (tela) => {
    // A barra some da tela inteira também é regressão — a 75-333 só a extraiu
    // porque cada tela montava a sua.
    expect(usoDasAbas(fonte(tela))).not.toBeNull()
  })

  it.each(TELAS)("%s não passa `false` literal para as props de visibilidade", (tela) => {
    const uso = usoDasAbas(fonte(tela))!
    for (const prop of PROPS) {
      expect(uso).not.toMatch(new RegExp(`${prop}={false}`))
      expect(uso).not.toMatch(new RegExp(`${prop}={\\s*false\\s*}`))
    }
  })

  it("a tela de Formulários decide a aba da Lídia por capability (o defeito de 18/08)", () => {
    const uso = usoDasAbas(fonte("formularios/page.tsx"))!
    // Vem de `can(...)`, de uma variável resolvida no próprio arquivo, ou — desde a
    // Story 75-344 — do `acesso` devolvido por `resolverAcessoCampanhas`. O que não
    // pode é ser constante.
    expect(uso).toMatch(/showAgente=\{(await )?can\(|showAgente=\{show|showAgente=\{acesso\./)
    // A capability saiu das quatro telas e passou a viver num lugar só. Se ela
    // desaparecer DE LÁ, a aba da Lídia volta a ser decidida por outra coisa.
    expect(readFileSync(join(RAIZ, "../../../lib/campaigns/access.ts"), "utf8")).toContain(
      '"marketing.gerenciar"'
    )
  })

  it("a tela da Lídia é a única que pode fixar `showAgente` (ela É a aba ativa)", () => {
    // `<CampaignsTabs showAgente …>` sem valor = `true`. É correto: quem está
    // DENTRO da tela da Lídia já passou pelo gate de servidor dela.
    const uso = usoDasAbas(fonte("agente/agente-client.tsx"))!
    expect(uso).toMatch(/showAgente(\s|>)/)
    expect(uso).not.toContain("showAgente={false}")
  })
})
