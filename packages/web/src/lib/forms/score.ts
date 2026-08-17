// Story 75-330 (Epic 89) — o SCORE. AC5.
//
// ⚠️ LEIA ANTES DE "CONSERTAR": este score é calculado, gravado e NÃO FAZ NADA.
// Ele não esconde pergunta, não desvia lead e não aparece para quem preenche.
// Isso é decisão do diretor (Epic 89, D2: "todos veem a agenda, sem exceção"),
// não sobra de implementação. O motivo de calcular assim mesmo: se em 30 dias
// ficar claro que abaixo de X só dá trabalho para o SDR, ligar o corte precisa
// ser mudar um número — com histórico para calibrar, não no escuro.
//
// Escala 0–100, a MESMA de `leads.qualification_score`, que já é mostrado ao
// corretor com faixa de cor (broker/leads/[id]/page.tsx). Duas escalas
// diferentes com o mesmo nome "Score" na tela seria a pior saída possível.

import type { FormSchema } from "./schema"
import { perguntasVisiveis, type Respostas } from "./branching"

export interface ResultadoScore {
  /** 0–100. Sem nenhum peso definido no formulário → 0 (não é erro). */
  score: number
  /** Soma dos pesos das respostas dadas. */
  bruto: number
  /** Soma do maior peso possível por pergunta visível. 0 = formulário sem pesos. */
  maximo: number
}

/** O maior peso alcançável numa pergunta (múltipla soma todas as positivas). */
function tetoDaPergunta(opcoes: { valor: string; peso?: number }[], multipla: boolean): number {
  const pesos = opcoes.map((o) => o.peso ?? 0)
  if (multipla) return pesos.filter((p) => p > 0).reduce((a, b) => a + b, 0)
  return pesos.reduce((maior, p) => (p > maior ? p : maior), 0)
}

/**
 * Calcula o score das respostas.
 *
 * Só conta perguntas VISÍVEIS: quem não viu a pergunta de financiamento não
 * pode ser penalizado por não tê-la respondido — o teto acompanha o caminho
 * que a pessoa percorreu.
 *
 * Resposta que não corresponde a nenhuma opção do schema vale 0 e é ignorada
 * em silêncio: o schema é editável em produção e uma opção pode ter sido
 * removida depois que alguém respondeu. Isso não pode derrubar o cálculo.
 */
export function calcularScore(schema: FormSchema, respostas: Respostas): ResultadoScore {
  let bruto = 0
  let maximo = 0

  for (const pergunta of perguntasVisiveis(schema, respostas)) {
    const opcoes = pergunta.opcoes
    if (!opcoes?.length) continue // texto/número não pontuam

    const multipla = pergunta.tipo === "multipla"
    maximo += tetoDaPergunta(opcoes, multipla)

    const resposta = respostas[pergunta.id]
    if (resposta === undefined || resposta === null) continue

    const escolhidos = Array.isArray(resposta) ? resposta.map(String) : [String(resposta)]
    for (const valor of escolhidos) {
      const opcao = opcoes.find((o) => o.valor === valor)
      bruto += opcao?.peso ?? 0 // opção inexistente ou sem peso → 0
    }
  }

  // Formulário sem nenhum peso → 0, e não divisão por zero.
  const score = maximo > 0 ? Math.round((bruto / maximo) * 100) : 0
  // Peso negativo pode empurrar o bruto abaixo de zero; a escala não acompanha.
  return { score: Math.max(0, Math.min(100, score)), bruto, maximo }
}
