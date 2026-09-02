/**
 * Story 900-57 · AC5 / QA-900-57-3 — o carrasco de `rotuloDoAtor`.
 *
 * O componente da linha de trilha era exercitado SÓ por `type-check`, e `type-check` não vê nada
 * aqui: `metadata` é `Record<string, unknown> | null`, então o TypeScript não sabe se
 * `actor_label` existe, se é string, nem se está vazia. Os quatro caminhos abaixo são a lógica
 * que decide o que o operador lê — e `platform_audit_log` tem **zero linhas** em produção e no
 * ambiente de teste, então nenhuma tela ia poder prová-los.
 *
 * A justificativa anterior ("não há infra de render para RSC") não se aplica: isto é função pura
 * sobre objeto simples. O arquivo é `.test.ts` e não `.test.tsx` porque o `include` do
 * `vitest.config.ts` casa **só** `*.test.ts` — um `.tsx` existiria e nunca rodaria.
 */

import { describe, it, expect } from "vitest"
import {
  ATOR_SEM_ROTULO,
  rotuloDoAtor,
  type LinhaDeTrilhaDaPlataforma,
} from "./linha-da-trilha"

/** Uma linha sintética. Nenhum dado de cliente entra neste arquivo. */
function linha(metadata: LinhaDeTrilhaDaPlataforma["metadata"]): LinhaDeTrilhaDaPlataforma {
  return {
    // UUID sintético e deliberadamente distante do literal da Trifold: `trifold-org-literal.test.ts`
    // varre a árvore inteira atrás dele, e um fixture que o copia é como a duplicação começa.
    id: "9f3c1d7a-0b52-4e88-a1c6-7d204e6b3fa1",
    action: "org.integration.updated",
    actor_type: "platform",
    created_at: "2026-08-31T12:00:00.000Z",
    metadata,
  }
}

describe("QA-900-57-3 — quem agiu, quando o banco não diz", () => {
  it("`actor_label` string útil é o que aparece", () => {
    expect(rotuloDoAtor(linha({ actor_label: "Gabriel" }))).toBe("Gabriel")
  })

  it("`metadata` nulo, ou sem a chave, cai no rótulo declarado — não em `undefined`", () => {
    // O caminho real do banco de hoje: `platform_audit_log` tem 0 linhas, e nada garante que a
    // primeira a existir traga `actor_label`.
    expect(rotuloDoAtor(linha(null))).toBe(ATOR_SEM_ROTULO)
    expect(rotuloDoAtor(linha({}))).toBe(ATOR_SEM_ROTULO)
    expect(rotuloDoAtor(linha({ outra_coisa: "Gabriel" }))).toBe(ATOR_SEM_ROTULO)
  })

  it("string vazia ou só espaço NÃO vira rótulo — a linha ficaria com um buraco", () => {
    // Mata a troca de `rotulo.trim() !== ""` por `rotulo !== ""`: sem o `trim`, `"   "` passaria
    // e a coluna "quem" apareceria em branco, que é pior que "sem rótulo" porque parece um nome.
    expect(rotuloDoAtor(linha({ actor_label: "" }))).toBe(ATOR_SEM_ROTULO)
    expect(rotuloDoAtor(linha({ actor_label: "   " }))).toBe(ATOR_SEM_ROTULO)
    expect(rotuloDoAtor(linha({ actor_label: "\t\n" }))).toBe(ATOR_SEM_ROTULO)
  })

  it("tipo errado não é renderizado como texto — `metadata` é `unknown` e o banco não valida", () => {
    // Mata a remoção do `typeof === "string"`. Sem ela, um número vira `123` na tela e um objeto
    // vira `[object Object]` — e o React lança ao receber um objeto cru como filho.
    expect(rotuloDoAtor(linha({ actor_label: 123 }))).toBe(ATOR_SEM_ROTULO)
    expect(rotuloDoAtor(linha({ actor_label: null }))).toBe(ATOR_SEM_ROTULO)
    expect(rotuloDoAtor(linha({ actor_label: { nome: "Gabriel" } }))).toBe(ATOR_SEM_ROTULO)
    expect(rotuloDoAtor(linha({ actor_label: ["Gabriel"] }))).toBe(ATOR_SEM_ROTULO)
  })

  it("o rótulo declarado não é vazio — senão os quatro caminhos acima aprovariam o buraco", () => {
    // Vivacidade: com `ATOR_SEM_ROTULO = ""` toda asserção deste arquivo continuaria verde e a
    // coluna "quem" ficaria em branco na tela.
    expect(ATOR_SEM_ROTULO.trim()).not.toBe("")
  })
})
