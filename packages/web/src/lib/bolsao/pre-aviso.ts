/**
 * Story 75-366 — pré-aviso do bolsão ao gerente comercial.
 *
 * O lead vai ao bolsão aos BOLSAO_REBALANCE_MIN minutos de relógio comercial sem
 * atendimento (Story 75-80). Este módulo decide QUEM está na janela de pré-aviso
 * (os últimos 5 minutos antes da queda) para o gerente ter chance de acionar o
 * corretor ANTES de o lead perder o dono.
 *
 * Só decisão pura aqui — o cron (`bolsao-rebalance`) consulta, marca e envia.
 * Puro de propósito: o projeto não tem teste de componente/rota, então a régua
 * mora onde dá para testar sem banco.
 */

/** Minutos sem atendimento que mandam o lead ao bolsão (fonte única — o cron importa daqui). */
export const BOLSAO_REBALANCE_MIN = 15

/** Cruzou isto (e ainda não caiu) → entra na janela de pré-aviso. */
export const PRE_BOLSAO_AVISO_MIN = BOLSAO_REBALANCE_MIN - 5

export interface CandidatoPreAviso {
  id: string
  /** Minutos de relógio COMERCIAL desde a última distribuição (mesma conta do rebalance). */
  elapsed: number
}

export interface SelecaoPreAviso {
  /** Todos na janela [PRE_BOLSAO_AVISO_MIN, BOLSAO_REBALANCE_MIN) — é esta a contagem da mensagem. */
  naJanela: CandidatoPreAviso[]
  /** Subconjunto ainda não avisado — só a chegada de um destes dispara mensagem nova. */
  novos: CandidatoPreAviso[]
  /** Minutos até o MAIS URGENTE cair no bolsão (mín. 1); null com janela vazia. */
  minutosRestantes: number | null
}

export function selecionarPreAviso(
  candidatos: CandidatoPreAviso[],
  jaAvisados: ReadonlySet<string>
): SelecaoPreAviso {
  const naJanela = candidatos.filter(
    (c) => c.elapsed >= PRE_BOLSAO_AVISO_MIN && c.elapsed < BOLSAO_REBALANCE_MIN
  )
  const novos = naJanela.filter((c) => !jaAvisados.has(c.id))
  const minutosRestantes =
    naJanela.length === 0
      ? null
      : Math.max(1, Math.round(BOLSAO_REBALANCE_MIN - Math.max(...naJanela.map((c) => c.elapsed))))
  return { naJanela, novos, minutosRestantes }
}

/**
 * Parâmetros do template `aviso_pre_bolsao_gestor` ({{1}}=nome {{2}}=qtd {{3}}=min),
 * na ordem. Lição da 75-356: variável VAZIA derruba o envio do template inteiro —
 * nome sem conteúdo vira "gerente", nunca "".
 */
export function paramsPreAviso(
  nome: string | null | undefined,
  qtd: number,
  minutos: number
): [string, string, string] {
  const nomeSeguro = (nome ?? "").trim() || "gerente"
  return [nomeSeguro, String(qtd), String(Math.max(1, Math.round(minutos)))]
}
