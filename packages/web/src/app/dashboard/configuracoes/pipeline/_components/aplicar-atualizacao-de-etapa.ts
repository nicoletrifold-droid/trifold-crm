/**
 * Story 75-371 (@qa R3) — quem cede o posto de padrão no estado da tela.
 *
 * O trigger da migration 250 TRANSFERE o padrão: marcar uma etapa como padrão tira o
 * padrão da anterior, na mesma transação. A tela remendava só a linha editada, então a
 * tabela mostrava DUAS linhas "Padrão: Sim" até o próximo refresh — o sintoma seria
 * reportado como "o CRM tem duas etapas padrão", que é o bug que esta story fechou.
 *
 * Função pura porque o projeto não tem jsdom: a DECISÃO sai do componente para poder
 * ter teste, e o `.tsx` só chama.
 */
import type { Stage } from "./types"

export function aplicarAtualizacaoDeEtapa(anteriores: Stage[], atualizada: Stage): Stage[] {
  return anteriores.map((s) => {
    if (s.id === atualizada.id) return { ...s, ...atualizada }
    // A etapa nova virou a padrão → a anterior deixou de ser, no banco.
    if (atualizada.is_default && s.is_default) return { ...s, is_default: false }
    return s
  })
}
