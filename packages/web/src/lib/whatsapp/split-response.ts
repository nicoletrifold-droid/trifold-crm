/**
 * Story 75-348 — a resposta da Nicole em DOIS blocos, do jeito que gente escreve
 * no WhatsApp: o contexto vai num balão, a pergunta no seguinte.
 *
 * Por que isso é uma função pura e não três linhas no webhook: o risco desta AC
 * não é dividir — é dividir a coisa ERRADA. Uma confirmação de visita partida em
 * duas mensagens ("te espero quinta" / "às 10h") é exatamente a classe de falha
 * que a 75-245 fechou (a agenda é a fonte da verdade, e o cliente lê a primeira
 * mensagem como confirmada). Então a decisão de dividir tem teste, e o envio não.
 *
 * ⚠️ DESLIGADA POR PADRÃO (`NICOLE_RESPOSTA_EM_BLOCOS`). A 75-348 muda a FORMA de
 * escrever pelo prompt; a divisão é um segundo efeito no mesmo lugar. Ligar as
 * duas juntas e depois olhar o resultado não diria qual das duas funcionou —
 * a mesma lição da anotação de backlog que vira hipótese não medida.
 */

/** Teto absoluto de blocos. Dois é o desenho, não um parâmetro. */
const MAX_BLOCOS = 2

/**
 * Abaixo disso a mensagem já é curta e dividir só cria dois "tim-tim" no celular
 * do lead. 160 caracteres é o tamanho de um SMS — a régua de "isso é curto".
 */
const MINIMO_PARA_DIVIDIR = 160

/**
 * Marcações internas. Se sobrou uma no texto, algo falhou ANTES daqui
 * (`stripSystemBlocks`) — e o pior que se pode fazer com um texto suspeito é
 * multiplicá-lo em duas mensagens. Fail-closed: manda inteiro, uma vez só.
 */
const MARCACAO_INTERNA = /\[SISTEMA|\[CORRETOR/i

/**
 * Confirmação de agendamento: dia e horário viajam JUNTOS, sempre (75-245).
 * Deliberadamente largo — qualquer sinal de confirmação cancela a divisão.
 */
const CONFIRMACAO_DE_AGENDA =
  /\b(anotad[oa]|agendad[oa]|confirmad[oa]|reservad[oa]|te espero|nos vemos|fica marcad[oa])\b/i

/** Termina com pergunta? É o bloco que tem de ficar por último. */
function ehPergunta(paragrafo: string): boolean {
  return paragrafo.trimEnd().endsWith("?")
}

/**
 * Divide a resposta da Nicole em no máximo dois blocos.
 *
 * Regras, em ordem de precedência (a primeira que se aplica manda):
 *  1. marcação interna vazada  → um bloco (fail-closed)
 *  2. confirmação de agenda    → um bloco (dia + horário nunca se separam)
 *  3. texto curto              → um bloco
 *  4. menos de 2 parágrafos    → um bloco
 *  5. a pergunta não está no último parágrafo → um bloco (dividir tiraria a
 *     pergunta do fim, que é justo o que o prompt manda manter lá)
 *  6. caso contrário           → [tudo menos o último parágrafo, último parágrafo]
 *
 * @returns 1 ou 2 blocos, na ordem de envio. Nunca vazio.
 */
export function dividirResposta(texto: string): string[] {
  const limpo = texto.trim()
  if (!limpo) return [texto]

  if (MARCACAO_INTERNA.test(limpo)) return [limpo]
  if (CONFIRMACAO_DE_AGENDA.test(limpo)) return [limpo]
  if (limpo.length < MINIMO_PARA_DIVIDIR) return [limpo]

  const paragrafos = limpo.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (paragrafos.length < 2) return [limpo]

  const ultimo = paragrafos[paragrafos.length - 1]!
  if (!ehPergunta(ultimo)) return [limpo]

  const primeiro = paragrafos.slice(0, -1).join("\n\n")
  if (!primeiro) return [limpo]

  const blocos = [primeiro, ultimo]
  return blocos.slice(0, MAX_BLOCOS)
}

/**
 * A flag. Segue a convenção do `ANTHROPIC_PROMPT_CACHE_ENABLED`: só o literal
 * `"true"` liga — qualquer outra coisa (inclusive vazio, que é o que a Vercel
 * grava quando alguém usa `vercel env add` por stdin) mantém o comportamento de
 * hoje, uma mensagem por turno.
 */
export function divisaoEmBlocosLigada(): boolean {
  return process.env.NICOLE_RESPOSTA_EM_BLOCOS === "true"
}
