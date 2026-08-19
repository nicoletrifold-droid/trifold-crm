/**
 * Story 75-346 — quais atalhos de Configurações aparecem.
 *
 * O defeito que esta story conserta era invisível por construção: a tela nova da
 * 75-345 nasceu inalcançável para o gerente-comercial porque a landing filtrava por
 * NOME DE PERFIL. O teste que impede a recaída não é sobre pixels — é sobre o mapa
 * card→permissão estar completo e a decisão ser derivada dele.
 */
import { describe, it, expect } from "vitest"
import {
  CONFIG_CARDS,
  NICOLE_CARDS,
  cardsVisiveis,
  chavesDosCards,
  type ConfigCard,
} from "./config-cards"

/** Resolvedor de teste: só as chaves da lista respondem `true`. */
const com = (...chaves: string[]) => (chave: string) => chaves.includes(chave)

const titulos = (cards: ConfigCard[]) => cards.map((c) => c.title)

describe("o mapa card→permissão", () => {
  it("TODO card declara ao menos uma permissão", () => {
    // 🔴 A trava da story. Card sem permissão declarada apareceria para todos (ou
    // para ninguém, dependendo do filtro) — que é exatamente o defeito de origem.
    for (const card of [...CONFIG_CARDS, ...NICOLE_CARDS]) {
      expect(card.permissoes.length, `card "${card.title}" sem permissão`).toBeGreaterThan(0)
    }
  })

  it("nenhum card duplica href", () => {
    const hrefs = [...CONFIG_CARDS, ...NICOLE_CARDS].map((c) => c.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("as chaves distintas evitam consulta repetida", () => {
    const chaves = chavesDosCards(CONFIG_CARDS)
    // Sem duplicata: "Empresa" e "Central de Materiais" compartilham
    // `configuracoes.empresa` e a chave é perguntada UMA vez.
    expect(new Set(chaves).size).toBe(chaves.length)
    expect(chaves.filter((c) => c === "configuracoes.empresa")).toHaveLength(1)
    expect(chaves).toContain("configuracoes.relatorio-diario")
  })
})

describe("cardsVisiveis", () => {
  it("🔴 O CASO DA STORY — a tela nova aparece para quem tem a permissão dela", () => {
    // Era o que a lista fixa por perfil impedia: ligar
    // `configuracoes.relatorio-diario` na matriz não criava caminho até a tela.
    const vistos = titulos(cardsVisiveis(CONFIG_CARDS, com("configuracoes.relatorio-diario")))
    expect(vistos).toEqual(["Relatório Diário"])
  })

  it("sem permissão nenhuma, nenhum atalho (a landing redireciona)", () => {
    expect(cardsVisiveis(CONFIG_CARDS, () => false)).toEqual([])
  })

  it("quem pode tudo vê tudo, na ordem definida", () => {
    const todos = cardsVisiveis(CONFIG_CARDS, () => true)
    expect(todos).toHaveLength(CONFIG_CARDS.length)
    expect(titulos(todos)[0]).toBe("Empresa")
  })

  it("uma chave compartilhada acende os dois cards que a usam", () => {
    const vistos = titulos(cardsVisiveis(CONFIG_CARDS, com("configuracoes.empresa")))
    expect(vistos).toEqual(["Empresa", "Central de Materiais"])
  })

  it("Corretores segue o guard COMPOSTO da tela (sistema OU corretores)", () => {
    expect(titulos(cardsVisiveis(CONFIG_CARDS, com("sistema")))).toContain("Corretores")
    expect(titulos(cardsVisiveis(CONFIG_CARDS, com("corretores")))).toContain("Corretores")
  })

  it("o hub da Nicole aparece por QUALQUER uma das três telas filhas", () => {
    for (const chave of [
      "configuracoes.personalidade",
      "nicole.treinamento_gerenciar",
      "nicole.midia_gerenciar",
    ]) {
      expect(titulos(cardsVisiveis(CONFIG_CARDS, com(chave))), chave).toContain("Nicole")
    }
  })

  it("dentro do hub, cada card segue a capability da sua tela", () => {
    // O caso real do gerente-comercial em produção: Treinamento e Mídia, sem
    // Personalidade — o mesmo recorte que os `roles: [...]` faziam à mão.
    const vistos = titulos(
      cardsVisiveis(NICOLE_CARDS, com("nicole.treinamento_gerenciar", "nicole.midia_gerenciar"))
    )
    expect(vistos).toEqual(["Treinamento", "Mídia"])
  })

  it("Follow-up segue o módulo `pipeline`, não uma chave de configuracoes", () => {
    // A tela é /dashboard/pipeline/config e gateia por `pipeline`. Errar isto
    // esconderia o card de quem pode usá-lo (corretor, SDR).
    expect(titulos(cardsVisiveis(CONFIG_CARDS, com("pipeline")))).toEqual(["Follow-up"])
  })
})
