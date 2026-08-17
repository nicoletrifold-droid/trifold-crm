import type { Pergunta } from "./schema"
import type { Respostas, Resposta } from "./branching"

// Story 75-333 (Epic 89) — a decisão de salvar o RASCUNHO: o que a pessoa
// digitou e ainda NÃO confirmou com "Continuar".
//
// Vive aqui, e não dentro do componente, pelo motivo de sempre neste projeto:
// sem jsdom, decisão dentro da tela é decisão sem teste. E esta em particular
// precisa de prova — a AC5 existe porque, até a 75-333, um telefone digitado e
// não confirmado simplesmente sumia quando a pessoa fechava a aba.

export interface SalvamentoDeRascunho {
  /** O corpo a enviar: respostas confirmadas + a que está sendo digitada. */
  payload: Respostas
  /** Assinatura para dedupe entre chamadas. */
  assinatura: string
}

function preenchido(v: Resposta): boolean {
  return Array.isArray(v) ? v.length > 0 : String(v).trim() !== ""
}

/**
 * Decide se há rascunho a salvar e monta o payload.
 *
 * Devolve `null` quando não há nada a fazer:
 *  - sem pergunta na tela (formulário terminado);
 *  - rascunho vazio — salvar "" não guarda informação e ainda gasta requisição;
 *  - payload idêntico ao último enviado.
 *
 * O dedupe **não é otimização**: o salvamento agora dispara no blur, e o
 * endpoint público tem 30 req/min POR IP. Sem ele, alguém corrigindo a digitação
 * do telefone queimaria a própria cota e passaria a ver 429 no meio do
 * preenchimento — uma melhoria de captura virando perda total.
 */
export function prepararSalvamentoDeRascunho(params: {
  /**
   * O passo da vez. Story 75-336 tornou o passo multi-campo (nome + telefone
   * juntos), então o que se salva é o BLOCO, não um campo.
   */
  passo: Pergunta[]
  rascunhos: Respostas
  respostas: Respostas
  ultimaAssinatura: string
}): SalvamentoDeRascunho | null {
  const { passo, rascunhos, respostas, ultimaAssinatura } = params
  if (passo.length === 0) return null

  const preenchidos: Respostas = {}
  for (const p of passo) {
    const v = rascunhos[p.id]
    if (v !== undefined && preenchido(v)) preenchidos[p.id] = v
  }
  if (Object.keys(preenchidos).length === 0) return null

  // Deliberadamente SEM `limparRespostas`: aqui o objetivo é guardar o que
  // existe, não decidir o caminho. Podar um ramo com base numa resposta que a
  // pessoa ainda não confirmou poderia apagar justamente o que se quer salvar.
  const payload: Respostas = { ...respostas, ...preenchidos }
  const assinatura = JSON.stringify(payload)
  if (assinatura === ultimaAssinatura) return null

  return { payload, assinatura }
}
