// Story 75-269 — as opções do filtro de Origem do analytics saem dos DADOS,
// não de uma lista escrita à mão.
//
// O dropdown do gráfico "Leads por Período" tinha 5 opções literais
// (`leads-chart.tsx:37-41`), enquanto os leads da própria janela tinham 8
// origens. Medido em prod 04/08: `other` (188), `broker_sponsored` (55),
// `website` (8) e `referral` (3) — 254 de 612 leads, 41,5% da base — não eram
// selecionáveis. Ninguém conseguia isolar a Carteira Própria num gráfico feito
// para decidir campanha.
//
// 🔑 O rótulo vem de SOURCE_LABELS_SHORT, que é a fonte única desses nomes em
// analytics/badges/PDF (ver o comentário na própria constante). Reproduzir o
// mapa aqui recriaria o bug com outra cara — é o erro de duplicar constante que
// já custou caro neste repo.

import { SOURCE_LABELS_SHORT } from "@web/lib/constants"

/**
 * Chave para lead sem `source` no banco. Existe para a soma das origens fechar
 * com o total da janela (ressalva R3 do @po): descartar o null faria faltar 1 e
 * alguém caçaria essa diferença depois. Não é oferecida no dropdown.
 */
export const SEM_ORIGEM_KEY = "__sem_origem__"

export interface SourceOption {
  value: string
  label: string
}

/** Rótulo de uma origem: a fonte canônica, com a própria chave como fallback. */
export function labelDaOrigem(key: string): string {
  return SOURCE_LABELS_SHORT[key] ?? key
}

/**
 * Opções do filtro de Origem a partir das origens PRESENTES na janela.
 *
 * - "Todos" sempre primeiro (mantém o comportamento anterior do dropdown).
 * - Ordenado por volume decrescente: a origem que domina o período aparece
 *   primeiro, que é a que o gestor vai querer isolar.
 * - Empate resolvido por rótulo, para a ordem não oscilar entre renders.
 * - Origem sem rótulo no mapa entra com a própria chave — nunca desaparece
 *   (AC2). Uma origem nova no banco fica visível na hora, mesmo antes de
 *   alguém cadastrar o rótulo dela.
 * - `SEM_ORIGEM_KEY` é omitido: não é um canal, é ausência de dado.
 */
export function opcoesDeOrigem(
  sources: Record<string, number> | null | undefined
): SourceOption[] {
  const entradas = Object.entries(sources ?? {}).filter(
    ([key, n]) => key !== SEM_ORIGEM_KEY && n > 0
  )

  entradas.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return labelDaOrigem(a[0]).localeCompare(labelDaOrigem(b[0]), "pt-BR")
  })

  return [
    { value: "", label: "Todos" },
    ...entradas.map(([key]) => ({ value: key, label: labelDaOrigem(key) })),
  ]
}
