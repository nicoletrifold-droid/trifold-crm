/**
 * Story 75-357 — guarda contra a 3ª reincidência da mesma pegadinha.
 *
 * `inputCls` tinha `w-full`. No Tailwind, `w-20`/`w-auto` numa string DEPOIS não
 * vencem: quem decide é a ordem no CSS gerado. O campo do peso ficava com largura
 * cheia e esmagava o do rótulo a ~30px — o texto estava lá, invisível, e na tela
 * parecia que "a opção virou número".
 *
 * Não há como testar layout sem DOM neste projeto (não existe jsdom), então o
 * teste lê o FONTE e trava as duas regras que evitam a recaída. É feio de
 * propósito: mais feio ainda é a mesma classe de bug voltar uma quarta vez.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ARQUIVO = join(__dirname, "construtor-perguntas.tsx")
const fonte = readFileSync(ARQUIVO, "utf8")

describe("classes do construtor de perguntas", () => {
  it("a classe-base dos inputs NÃO carrega largura", () => {
    const base = fonte.match(/const inputCls =\s*\n?\s*"([^"]+)"/)?.[1] ?? ""
    expect(base, "inputCls não encontrado — o teste precisa acompanhar o rename").not.toBe("")
    const larguras = base.split(/\s+/).filter((c) => /^w-/.test(c))
    expect(larguras, `inputCls voltou a carregar largura: ${larguras.join(", ")}`).toEqual([])
  })

  it("todo input elástico tem min-w-0 junto do flex-1", () => {
    // Sem `min-w-0`, um input em flex não encolhe abaixo do conteúdo e volta a
    // empurrar o vizinho — o mesmo sintoma por outro caminho.
    const comFlex1 = [...fonte.matchAll(/\$\{inputCls\}([^`]*)`/g)]
      .map((m) => m[1] ?? "")
      .filter((classes) => classes.includes("flex-1"))
    expect(comFlex1.length, "nenhum input elástico encontrado").toBeGreaterThan(0)
    for (const classes of comFlex1) {
      expect(
        classes.includes("min-w-0") || /min-w-\[/.test(classes),
        `input com flex-1 sem min-w: "${classes.trim()}"`
      ).toBe(true)
    }
  })
})
