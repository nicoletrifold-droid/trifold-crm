import { trifoldOrgId } from "@web/lib/tenancy/trifold-org"

/**
 * Story 900-67 · AC1 — quem decide se o cabeçalho do e-mail leva a MARCA da Trifold.
 *
 * ## O que esta função substituiu
 *
 * Até esta story a decisão morava em `components/header.ts:14`, e era feita sobre o **nome** da
 * organização:
 *
 * ```ts
 * const isTrifold = !orgName || /trifold/i.test(orgName)
 * ```
 *
 * Duas formas de disparo, ambas erradas:
 *
 * 1. **`orgName` ausente/vazio ⇒ assumia Trifold.** Falhar na direção da marca de alguém é o
 *    oposto de falhar fechado: quem não sabe de quem é o e-mail não pode carimbar a marca do
 *    primeiro cliente nele.
 * 2. **Substring.** Uma org chamada `"Trifold Sandbox"` — que a Story 900-25 planeja criar — casa
 *    `/trifold/i` e receberia, nos e-mails DELA, o `<img alt="Trifold">` que só a Trifold real
 *    deveria ver. Não é risco hipotético: a org que dispara o defeito já está planejada.
 *
 * ## O contrato
 *
 * `orgId` é comparado por **identidade** com `trifoldOrgId()`. Nome não entra: a função nem recebe
 * `orgName`, para que nenhuma decisão de marca volte a depender de texto. Tudo que não for
 * exatamente o id da Trifold — incluindo `null` e `undefined` — é `false`.
 *
 * O `null`/`undefined` ⇒ `false` **inverte** o comportamento de hoje de propósito. É o mesmo
 * invariante do item 1 desta leva (Story 900-66): quando não se sabe de quem é o e-mail, a saída
 * neutra é o texto, nunca a marca de outro.
 *
 * ⚠️ Isto decide **qual branch** o cabeçalho abre (imagem vs. texto) — não **o que** cada branch
 * renderiza. O branch de texto continua imprimindo o literal hardcoded que o chamador passou
 * ("Trifold", "Trifold CRM", "Portal de Obras"); derivar `organizations.name`/`logo_url` reais é a
 * story futura já nomeada pela 900-64.
 *
 * @param orgId o `organizations.id` da org dona do e-mail, ou `null`/`undefined` quando o chamador
 *              não tem essa informação em escopo.
 * @returns `true` **somente** para a Trifold real.
 */
export function isMarcaTrifold(orgId: string | null | undefined): boolean {
  return orgId === trifoldOrgId()
}
