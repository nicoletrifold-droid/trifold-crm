/**
 * Story 87-20 — TRAVA DE LOOP BOT-A-BOT.
 *
 * Num incidente real, a Nicole trocou 22 mensagens em 5 minutos com um número que
 * não era um lead: 11 dela e 11 do outro lado, cadência de 14,6s com desvio de 6,0s
 * — forma de máquina. O loop não parou sozinho; parou
 * porque um humano marcou `is_ai_active=false` na conversa. Este módulo existe para
 * que a próxima vez não dependa de alguém notar.
 *
 * TRÊS SINAIS, TRÊS CLASSES DISJUNTAS (medidas em 90 dias / 1.764 mensagens
 * `assistant` de 472 conversas, contra o banco de produção, só com agregados):
 *
 *  - **A — repetição exata de conteúdo.** O bot que repete o mesmo texto. Pico de
 *    reenvios idênticos numa janela de 30 min em 90 dias: **3**, numa conversa só —
 *    o incidente. As 3 conversas seguintes param em 2.
 *  - **B — contagem (backstop, independe de conteúdo).** O bot que varia o texto.
 *    Pico real de mensagens da Nicole em 10 min, em 90 dias: **19** — uma conversa
 *    de lead de verdade, que o corretor assumiu depois. Por isso o limiar é 25 e não
 *    15: com 15 esse lead seria cortado. Ver `LOOP_COUNT_MAX`.
 *  - **C — modo de encerramento.** O bot que se despede repetidamente com texto
 *    DIFERENTE a cada vez — o mecanismo real do incidente: **8 das 11 mensagens da
 *    Nicole eram despedidas**. Zero falso positivo em 90 dias; a única conversa que
 *    ele bloquearia é o incidente. É o sinal que contém mais cedo (6ª mensagem,
 *    contra a 11ª do Sinal A).
 *
 * União dos três em 90 dias, com os limiares deste arquivo: **1 conversa — o
 * incidente**. As classes não se somam em falso positivo.
 *
 * FAIL-CLOSED de propósito, ao contrário do `detectSlotMismatch` (que só observa):
 * o custo de um falso positivo aqui é um handoff para humano — recuperável. O custo
 * de um falso negativo é o loop infinito que já aconteceu.
 *
 * Funções PURAS: quem carrega as mensagens é o `pipeline.ts` (`carregarMensagensRecentesDaNicole`).
 * O discriminador de fala humana (`isTransition`) faz parte do TIPO de entrada e não
 * é filtrado só no chamador — ver `MensagemRecente`.
 */

/** Janela do Sinal A (repetição exata de conteúdo), em minutos. */
export const LOOP_REPEAT_WINDOW_MIN = 30

/**
 * Quantos envios do MESMO texto são tolerados na janela. O 3º é bloqueado — a 1ª e
 * a 2ª vez passam. Medido: nenhuma conversa de 90 dias, fora o incidente, chega
 * sequer ao 2º envio idêntico.
 */
export const LOOP_REPEAT_MAX_SENDS = 2

/** Janela do Sinal B (contagem bruta), em minutos. */
export const LOOP_COUNT_WINDOW_MIN = 10

/**
 * Limiar do backstop de contagem.
 *
 * ⚠️ **25, não 15.** O valor 15 foi calibrado numa janela de 14 dias (pico 11) e
 * estava falsificado: em 90 dias o pico real é **19**, numa conversa de lead — 21
 * mensagens da Nicole todas DISTINTAS, lado `user` com 19 mensagens curtas e
 * **2 mensagens `role='broker'`**, ou seja, um lead que o corretor de fato assumiu. Com 15, o Sinal B cortaria esse lead. 25 fica 32% acima do máximo
 * real de 90 dias.
 *
 * O custo de um limiar ALTO demais é os Sinais A/C pegarem antes (eles pegam); o de
 * um limiar BAIXO demais é cortar lead quente, que é o único falso positivo que esta
 * família de sinais já produziu de verdade.
 */
export const LOOP_COUNT_MAX = 25

/** Janela do Sinal C (modo de encerramento), em minutos — a mesma do Sinal A. */
export const LOOP_CLOSING_WINDOW_MIN = 30

/**
 * "No máximo 2 mensagens de encerramento" — o pedido literal do dono do produto,
 * cumprido literalmente: a 1ª e a 2ª despedida passam, a 3ª é bloqueada.
 */
export const LOOP_CLOSING_MAX_SENDS = 2

/**
 * `conversations.handoff_reason` gravado quando um dos três sinais dispara.
 *
 * É o MESMO campo que o handoff manual (`leads/[id]/handoff`) e o handoff por
 * resposta do corretor (`send-message`) já usam — nenhuma migration. E é o que o
 * webhook lê para NÃO reativar a Nicole sozinha em 24h (AC14): sem essa condição, a
 * trava viraria uma oscilação permanente (reativa → o contador da janela de 30 min
 * zera → repete 2× → bloqueia → reativa, para sempre).
 */
export const LOOP_BOT_HANDOFF_REASON = "loop_bot_detectado"

/**
 * Padrões que classificam uma fala da Nicole como "de encerramento".
 *
 * Extensível e NÃO exaustiva — e é a lista que carrega o risco do Sinal C, não o
 * mecanismo. **Toda linha nova aqui exige rodar de novo a régua de falso positivo
 * antes do merge:** `docs/qa/87-20-regua-sinais-loop.sql` (devolve só contagens,
 * nunca conteúdo). A lista atual é a que foi medida: 41 mensagens casam em 90 dias,
 * em 28 conversas, e só uma delas — o incidente — chegaria a 3 numa janela de 30 min.
 *
 * Casamento por palavra-chave é frágil por natureza: não cobre paráfrase, gíria, erro
 * de digitação da própria Nicole, nem sobrevive a uma mudança de tom no prompt que
 * reescreva a despedida de um jeito que a lista não reconheça — e falharia em
 * silêncio. A fragilidade é documentada, não escondida. O que a compensa é que o dano
 * de um falso positivo é um handoff para humano, recuperável.
 *
 * Minúsculas e sem flag `i` de propósito: quem normaliza é `ehMensagemDeEncerramento`,
 * um lugar só. Um extrator que normaliza e um comparador que não normaliza é falha
 * ABERTA — o padrão casaria "Até mais" e não casaria "ATÉ MAIS".
 */
export const PADROES_DE_ENCERRAMENTO: RegExp[] = [
  /tchau/,
  /até mais|até logo|até breve|até a próxima/,
  /qualquer coisa (é )?só chamar/,
  /fico à disposição/,
  /foi um prazer (te )?atender/,
  /um abraço/,
  /nos falamos/,
]

/**
 * Uma mensagem já enviada pela Nicole nesta conversa.
 *
 * `isTransition` faz parte do TIPO, e não é um filtro do chamador, porque é a única
 * forma de o teste da função pura conseguir reprovar pelo defeito que a exclusão
 * existe para impedir. A mensagem de transição do handoff é gravada por HUMANO com
 * `role='assistant'` (`send-message/route.ts`, Story 87-5): contá-la como fala da
 * Nicole faria a trava disparar em cima do corretor.
 *
 * A outra metade da garantia mora no carregador (`pipeline.ts`): o `.select()` PRECISA
 * projetar `metadata`, senão `metadata?.is_transition === true` é `false` para toda
 * linha e a exclusão vira no-op silencioso — com o teste da função pura verde. Ver
 * `pipeline-loop-breaker.test.ts`.
 */
export interface MensagemRecente {
  content: string
  created_at: string
  isTransition: boolean
}

interface EntradaComCandidato {
  candidato: string
  recentes: MensagemRecente[]
  now: Date
}

/** Fala da Nicole (não do corretor) dentro da janela. Base dos três sinais. */
function naJanela(recentes: MensagemRecente[], now: Date, janelaMin: number): MensagemRecente[] {
  const limite = now.getTime() - janelaMin * 60_000
  return recentes.filter((m) => {
    if (m.isTransition) return false
    const t = new Date(m.created_at).getTime()
    return Number.isFinite(t) && t >= limite && t <= now.getTime()
  })
}

/**
 * Quantas mensagens a Nicole enviou nesta conversa dentro da janela. Exportada porque
 * o `pipeline.ts` precisa do NÚMERO para o `metadata` do evento, e recontar lá seria
 * uma segunda definição de "janela" que diverge desta no primeiro refator.
 */
export function contarEnviosNaJanela(input: {
  recentes: MensagemRecente[]
  now: Date
  janelaMin: number
}): number {
  return naJanela(input.recentes, input.now, input.janelaMin).length
}

/**
 * Sinal A — a Nicole está prestes a enviar, pela 3ª vez, um texto que já mandou 2
 * vezes nesta conversa nos últimos 30 min.
 *
 * Compara `trim()`, não `md5(content)`: `trim()` colapsa variantes de espaço e só
 * pode produzir MAIS colisões, nunca menos — a régua mais dura das duas, e é sob ela
 * que o achado de "1 conversa em 90 dias" foi medido.
 */
export function detectarLoopDeConteudo(input: EntradaComCandidato): {
  bloquear: boolean
  ocorrenciasAnteriores: number
} {
  const alvo = input.candidato.trim()
  if (alvo === "") return { bloquear: false, ocorrenciasAnteriores: 0 }
  const ocorrenciasAnteriores = naJanela(
    input.recentes,
    input.now,
    LOOP_REPEAT_WINDOW_MIN
  ).filter((m) => m.content.trim() === alvo).length
  return {
    bloquear: ocorrenciasAnteriores >= LOOP_REPEAT_MAX_SENDS,
    ocorrenciasAnteriores,
  }
}

/**
 * Sinal B — backstop bruto: a Nicole já enviou ≥ `LOOP_COUNT_MAX` mensagens nesta
 * conversa em `LOOP_COUNT_WINDOW_MIN` minutos, com ou sem repetição.
 *
 * Não olha o candidato de propósito: é o único sinal que pode rodar ANTES de chamar
 * o modelo (AC15), cortando o custo de uma geração numa conversa que já vai ser
 * contida.
 */
export function detectarLoopPorContagem(input: {
  recentes: MensagemRecente[]
  now: Date
}): boolean {
  return (
    contarEnviosNaJanela({
      recentes: input.recentes,
      now: input.now,
      janelaMin: LOOP_COUNT_WINDOW_MIN,
    }) >= LOOP_COUNT_MAX
  )
}

/** A fala casa algum `PADROES_DE_ENCERRAMENTO`? Normaliza (trim + minúsculas) aqui. */
export function ehMensagemDeEncerramento(texto: string): boolean {
  const normalizado = texto.trim().toLowerCase()
  if (normalizado === "") return false
  return PADROES_DE_ENCERRAMENTO.some((p) => p.test(normalizado))
}

/**
 * Sinal C — a Nicole está prestes a se despedir pela 3ª vez na mesma janela de 30
 * min, MESMO QUE o texto seja diferente a cada vez.
 *
 * Mesma mecânica do Sinal A; o que muda é o critério de classificação — pertencer à
 * classe "encerramento" em vez de ser byte-idêntico. É por isso que ele pega o
 * incidente na 6ª mensagem e o Sinal A só na 11ª: das 8 despedidas do incidente, só
 * 3 eram o mesmo texto.
 */
export function detectarLoopDeEncerramento(input: EntradaComCandidato): {
  bloquear: boolean
  ocorrenciasAnteriores: number
} {
  if (!ehMensagemDeEncerramento(input.candidato)) {
    return { bloquear: false, ocorrenciasAnteriores: 0 }
  }
  const ocorrenciasAnteriores = naJanela(
    input.recentes,
    input.now,
    LOOP_CLOSING_WINDOW_MIN
  ).filter((m) => ehMensagemDeEncerramento(m.content)).length
  return {
    bloquear: ocorrenciasAnteriores >= LOOP_CLOSING_MAX_SENDS,
    ocorrenciasAnteriores,
  }
}
