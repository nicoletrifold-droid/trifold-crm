/**
 * Story 75-359 — a Nicole respondia DUAS VEZES quando o lead escrevia em rajada.
 *
 * O webhook do WhatsApp tem idempotência por `wamid` (mesma mensagem entregue
 * duas vezes pela Meta), mas nada que trate mensagens DIFERENTES chegando juntas.
 * Cada POST abre o seu `after()`, que abre o seu `processMessage`, e nenhum vê o
 * irmão. Medido em produção, 20/08/2026:
 *
 *   11:02:04.21  lead: "Qual é esse empreendimento"
 *   11:02:04.99  lead: "?"                            ← 0,79s depois
 *   11:02:09.84  IA:   "Temos dois no momento! …"
 *   11:02:10.87  IA:   "Temos dois no momento! …"      ← a duplicata que o Marcos viu
 *
 * Não é de hoje: **34 respostas colada-em-resposta (<5s) em 30 dias**, 1 a 5 por
 * dia. Estourou em 20/08 porque o cron destravado (75-350…357) acordou 41 leads
 * de uma vez.
 *
 * 🔥 A guarda tem de ficar ANTES de gerar, não antes de enviar: `processMessage`
 * grava a mensagem da assistente ele mesmo (`saveMessages`). Descartar a resposta
 * depois de gerada deixaria mensagem salva no histórico que o lead nunca recebeu —
 * exatamente o defeito da 2ª porta do follow-up pós-visita (75-350).
 *
 * Funções PURAS aqui; o route aplica.
 */

/** Janela padrão (ms) que a Nicole espera antes de decidir que a rajada acabou. */
export const JANELA_ANTI_RAJADA_MS_PADRAO = 6000

/** Teto de sanidade: `after()` também precisa caber no orçamento da lambda. */
export const JANELA_ANTI_RAJADA_MS_MAX = 20000

/**
 * Lê a janela do ambiente. `NICOLE_ANTI_RAJADA_MS=0` desliga a guarda por
 * completo (volta ao comportamento anterior) sem precisar de deploy de código.
 */
export function janelaAntiRajadaMs(
  env: Record<string, string | undefined> = process.env
): number {
  const bruto = env.NICOLE_ANTI_RAJADA_MS
  if (bruto === undefined || bruto.trim() === "") return JANELA_ANTI_RAJADA_MS_PADRAO
  const n = Number(bruto)
  // Valor inválido não vira 0 (que DESLIGA a guarda) nem NaN: cai no padrão.
  // Env vazia/ilegível já derrubou coisa demais neste projeto para virar silêncio.
  if (!Number.isFinite(n) || n < 0) return JANELA_ANTI_RAJADA_MS_PADRAO
  return Math.min(n, JANELA_ANTI_RAJADA_MS_MAX)
}

/**
 * Esta execução deve ABORTAR porque o lead já mandou outra mensagem depois da
 * minha? Quem responde é sempre a execução da mensagem MAIS NOVA — ela enxerga
 * a rajada inteira no histórico, porque o INSERT do inbound é síncrono (acontece
 * antes do `after()`).
 *
 * @param minhaCriacao    `created_at` da mensagem que ESTA execução está tratando.
 * @param criacoesDoLead  `created_at` de mensagens `role='user'` da conversa
 *                        posteriores à minha (o route consulta com `.gt()`).
 */
export function deveAbortarPorMensagemMaisNova(
  minhaCriacao: string | Date | null | undefined,
  criacoesDoLead: readonly (string | Date | null | undefined)[] | null | undefined
): boolean {
  const minha = new Date(minhaCriacao ?? NaN).getTime()
  // Sem referência de tempo confiável a guarda se cala: melhor uma resposta
  // duplicada de vez em quando do que lead sem resposta nenhuma.
  if (Number.isNaN(minha)) return false
  if (!criacoesDoLead || criacoesDoLead.length === 0) return false

  return criacoesDoLead.some((c) => {
    const outra = new Date(c ?? NaN).getTime()
    if (Number.isNaN(outra)) return false
    return outra > minha
  })
}
