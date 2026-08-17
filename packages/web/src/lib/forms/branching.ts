// Story 75-330 (Epic 89) — a RAMIFICAÇÃO. AC3.
//
// Quem responde "à vista" não vê pergunta de financiamento. A decisão de qual é
// a próxima pergunta é função pura: a tela só desenha o que estas funções
// mandam. Sem isso a regra ficaria dentro de um componente e o projeto não tem
// como testar componente (sem jsdom).

import type { FormSchema, Pergunta } from "./schema"

/** O que `answers` guarda: resposta de texto, número ou múltipla escolha. */
export type Resposta = string | number | string[]
export type Respostas = Record<string, Resposta | undefined>

function respostaContem(resposta: Resposta | undefined, valores: string[]): boolean {
  if (resposta === undefined || resposta === null) return false
  if (Array.isArray(resposta)) return resposta.some((r) => valores.includes(String(r)))
  return valores.includes(String(resposta))
}

/**
 * A pergunta deve aparecer, dadas as respostas até aqui?
 *
 * Sem condições → sempre aparece. Com condições → TODAS precisam bater (E).
 * Condição cuja pergunta ainda não foi respondida → não aparece (ainda).
 */
export function perguntaVisivel(pergunta: Pergunta, respostas: Respostas): boolean {
  if (!pergunta.condicoes?.length) return true
  return pergunta.condicoes.every((c) => respostaContem(respostas[c.pergunta], c.em))
}

/** Todas as perguntas que fazem sentido para este conjunto de respostas. */
export function perguntasVisiveis(schema: FormSchema, respostas: Respostas): Pergunta[] {
  return schema.perguntas.filter((p) => perguntaVisivel(p, respostas))
}

/**
 * A próxima pergunta a mostrar, ou `null` se acabou.
 *
 * "Acabou" é o que libera a tela final — e, na 75-331, a agenda. Note que a
 * lista de visíveis é recalculada a cada resposta: responder de novo uma
 * pergunta anterior pode fazer aparecer (ou sumir) perguntas à frente.
 */
export function proximaPergunta(schema: FormSchema, respostas: Respostas): Pergunta | null {
  for (const pergunta of schema.perguntas) {
    if (!perguntaVisivel(pergunta, respostas)) continue
    const r = respostas[pergunta.id]
    const respondida = Array.isArray(r) ? r.length > 0 : r !== undefined && r !== null && String(r).trim() !== ""
    if (!respondida) return pergunta
  }
  return null
}

/**
 * O formulário está completo? Todas as OBRIGATÓRIAS visíveis respondidas.
 *
 * Só olha as visíveis de propósito: uma obrigatória escondida por ramificação
 * não pode travar o envio — foi a ramificação que decidiu que ela não se aplica.
 */
export function formularioCompleto(schema: FormSchema, respostas: Respostas): boolean {
  return perguntasVisiveis(schema, respostas)
    .filter((p) => p.obrigatoria)
    .every((p) => {
      const r = respostas[p.id]
      if (Array.isArray(r)) return r.length > 0
      return r !== undefined && r !== null && String(r).trim() !== ""
    })
}

/**
 * Respostas limpas de lixo: descarta chave que não existe no schema e resposta
 * de pergunta que a ramificação escondeu.
 *
 * Sem isso, mudar uma resposta lá atrás deixaria para trás a resposta de um
 * ramo abandonado — e ela contaria no score de um caminho que a pessoa não
 * seguiu.
 */
export function limparRespostas(schema: FormSchema, respostas: Respostas): Respostas {
  // Passada para FRENTE, decidindo cada pergunta contra o que já foi limpo — e
  // não contra o conjunto sujo. É o que faz a cascata funcionar: se A deixa de
  // valer, B some, e C — que só aparecia por causa de B — some junto. O schema
  // garante que condição só aponta para pergunta anterior (parseFormSchema), e
  // é isso que torna uma única passada suficiente.
  const limpas: Respostas = {}
  for (const pergunta of schema.perguntas) {
    if (!perguntaVisivel(pergunta, limpas)) continue
    const r = respostas[pergunta.id]
    if (r !== undefined) limpas[pergunta.id] = r
  }
  return limpas
}
