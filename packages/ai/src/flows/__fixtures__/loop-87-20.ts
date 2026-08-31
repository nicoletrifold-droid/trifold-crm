/**
 * Story 87-20 — os dois casos REAIS, com a forma medida contra o banco de produção.
 *
 * ⚠️ **O conteúdo é RECONSTITUÍDO — com UMA exceção medida.** A regra de investigação
 * deste projeto proíbe extrair conteúdo de mensagem, telefone ou nome de produção —
 * a medição saiu de `length(content)`, `md5(content)`, `created_at` e um predicado
 * regex dentro de `count(*) filter (...)`, que devolve só números. Reconstituir texto
 * a partir de comprimento e de um regex, porém, NÃO garante divergência: recomputando
 * o `md5` dos 8 textos abaixo, **7 divergem do de produção e 1 coincide** — o de 9
 * caracteres (`T.ateMais`), que portanto é texto real *verbatim*. Está declarado aqui
 * porque afirmar "tudo é reconstituído" seria impreciso; a frase é curta, genérica e
 * não identifica ninguém.
 *
 * ⚠️ **Sem identificador de conversa, sem data-hora absoluta e sem hash de conteúdo.**
 * O repositório é público. As duas conversas aparecem aqui só pelos rótulos
 * `CONV_INCIDENTE` e `CONV_CONTROLE`, com UUID sintético; a cadência é registrada como
 * DESLOCAMENTO relativo (`t`, segundos desde a primeira mensagem daquela conversa); e
 * a estrutura de repetição, como RÓTULO de classe (`H1`…`H28`). Os INTERVALOS — que é
 * o que arma as janelas e o que os testes medem — ficam preservados segundo a segundo;
 * a data-hora absoluta não é usada por nada. O valor do `md5` também não era usado por
 * nada além da própria igualdade, e um prefixo de 32 bits sobre um texto que NÃO está
 * versionado é oráculo de confirmação para quem adivinhar o texto — por isso saiu.
 *
 * O que estas fixtures preservam da realidade, e o que os testes AFIRMAM linha a linha:
 *
 *  1. o número de mensagens e o papel de cada uma;
 *  2. o deslocamento `t` exato de cada uma (a cadência é o que arma as janelas);
 *  3. o `length(content)` exato de cada uma;
 *  4. a estrutura de repetição — o campo `hash` é o RÓTULO da classe de igualdade
 *     medida em produção por `left(md5(content),8)`: mesmo rótulo aqui ⇔ mesmo `md5`
 *     lá ⇔ mesmo texto aqui; rótulos diferentes ⇔ textos diferentes;
 *  5. a classificação de encerramento por `PADROES_DE_ENCERRAMENTO`, mensagem a
 *     mensagem, idêntica à que a régua SQL devolveu contra produção.
 *
 * Sem (5), a fixture seria uma régua derivada da fonte: um texto inventado que casa
 * o regex porque foi escrito para casar. Ela é ancorada pela coluna `enc`, que veio
 * da consulta, não do código.
 */

/**
 * Base sintética dos deslocamentos. **Não é a data de nenhuma conversa** — existe só
 * para que `created_at` continue sendo uma string ISO parseável pelas funções puras.
 */
export const T0_SINTETICO = "2020-01-01T00:00:00Z"
const T0_MS = Date.parse(T0_SINTETICO)

/** `T+{t}s` como ISO sobre a base sintética. */
export function emT(t: number): string {
  return new Date(T0_MS + t * 1000).toISOString()
}

/** UUID SINTÉTICO da conversa do incidente. Não é o identificador de produção. */
export const CONV_INCIDENTE_ID = "00000000-0000-4000-8000-000000000001"
/** UUID SINTÉTICO da conversa de controle negativo. Não é o identificador de produção. */
export const CONV_CONTROLE_ID = "00000000-0000-4000-8000-000000000002"

export interface MensagemDaFixture {
  role: "user" | "assistant"
  /** Deslocamento em segundos desde a 1ª mensagem da conversa (`T+{t}s`). Medido. */
  t: number
  /** `emT(t)` — derivado, para as funções puras que recebem string. */
  created_at: string
  content: string
  /** `length(content)` medido em produção. O teste confere. */
  len: number
  /**
   * RÓTULO da classe de igualdade de texto (`H1`…`H28`), atribuído na ordem de primeira
   * aparição. A classe foi medida em produção por `left(md5(content),8)`; o valor do
   * hash **não está versionado** (fingerprint de mensagem de cliente). Igualdade de
   * rótulo ⇔ igualdade de texto — que é exatamente o que a asserção do teste mede.
   */
  hash: string
  /**
   * A régua SQL classificou esta mensagem como encerramento? Medido contra produção
   * com o MESMO predicado de `PADROES_DE_ENCERRAMENTO`. Só existe para `assistant`.
   */
  enc?: boolean
}

type LinhaCrua = Omit<MensagemDaFixture, "created_at">

function materializar(linhas: LinhaCrua[]): MensagemDaFixture[] {
  return linhas.map((l) => ({ ...l, created_at: emT(l.t) }))
}

/** Textos reconstituídos. Nomeados para a repetição ficar visível na fixture. */
const T = {
  abertura: "Oi! Aqui é a Nicole, da Trifold. Vi que você demonstrou interesse em um dos nossos empreendimentos. Posso te ajudar a achar o ideal pra você? :)))",
  qualificacao: "Perfeito!! Pra eu te indicar a melhor opção, você procura um imóvel para morar ou pra investir? E em qual cidade?",
  prazerAtender: "Foi um prazer te atender! Até mais!!",
  tchauAbraco: "Tchau, um abraço!!",
  algoMais: "Se precisar, é só me chamar :)",
  qualquerCoisa: "Qualquer coisa é só chamar! ;))",
  disposicao: "Fico à disposição. Tchau!",
  ateMais: "Até mais!",
} as const

/**
 * O INCIDENTE — 22 mensagens em 5 minutos (`T+0s` → `T+307s`): 11 da Nicole, 11 do
 * outro lado, **zero** `is_transition` (nenhuma é fala de corretor gravada com o
 * papel errado).
 *
 * O lado `user` também repete: o mesmo texto de 28 caracteres aparece 4 vezes
 * seguidas — é o outro bot repetindo a mesma pergunta. O conteúdo do lado `user` é
 * opaco (preenchido só para preservar o comprimento): nenhum sinal desta story olha
 * para ele, e um teste que dependesse disso estaria medindo a coisa errada. Os rótulos
 * do lado `user` (`H1`, `H3`, `H5`, `H7`, `H9`, `H11`, `H13`, `H15`) marcam APENAS a
 * classe de igualdade medida — não há texto correspondente versionado, e nenhum foi
 * inventado.
 */
export const CONV_INCIDENTE: MensagemDaFixture[] = materializar([
  { role: "user", t: 0, content: "·".repeat(15), len: 15, hash: "H1" },
  { role: "assistant", t: 11, content: T.abertura, len: 146, hash: "H2", enc: false },
  { role: "user", t: 38, content: "·".repeat(116), len: 116, hash: "H3" },
  { role: "assistant", t: 49, content: T.qualificacao, len: 113, hash: "H4", enc: false },
  { role: "user", t: 66, content: "·".repeat(44), len: 44, hash: "H5" },
  { role: "assistant", t: 76, content: T.prazerAtender, len: 36, hash: "H6", enc: true },
  { role: "user", t: 97, content: "·".repeat(20), len: 20, hash: "H7" },
  { role: "assistant", t: 105, content: T.tchauAbraco, len: 18, hash: "H8", enc: true },
  { role: "user", t: 124, content: "·".repeat(39), len: 39, hash: "H9" },
  { role: "assistant", t: 133, content: T.algoMais, len: 30, hash: "H10", enc: false },
  { role: "user", t: 157, content: "·".repeat(38), len: 38, hash: "H11" },
  { role: "assistant", t: 165, content: T.qualquerCoisa, len: 31, hash: "H12", enc: true },
  { role: "user", t: 185, content: "·".repeat(28), len: 28, hash: "H13" },
  { role: "assistant", t: 195, content: T.disposicao, len: 25, hash: "H14", enc: true },
  { role: "user", t: 215, content: "•".repeat(28), len: 28, hash: "H15" },
  { role: "assistant", t: 224, content: T.ateMais, len: 9, hash: "H16", enc: true },
  { role: "user", t: 243, content: "•".repeat(28), len: 28, hash: "H15" },
  { role: "assistant", t: 252, content: T.ateMais, len: 9, hash: "H16", enc: true },
  { role: "user", t: 270, content: "•".repeat(28), len: 28, hash: "H15" },
  { role: "assistant", t: 278, content: T.tchauAbraco, len: 18, hash: "H8", enc: true },
  { role: "user", t: 299, content: "•".repeat(28), len: 28, hash: "H15" },
  { role: "assistant", t: 307, content: T.ateMais, len: 9, hash: "H16", enc: true },
])

/**
 * O CONTROLE NEGATIVO — o caso que impede a story de virar "um limite de contagem e
 * pronto": **11 mensagens da Nicole em 5 minutos, todas distintas, nenhuma casando
 * encerramento**. O lado `user` são 9 mensagens de 14 caracteres de média, todas
 * distintas — gente digitando "sim", "ok", "quanto?". Cadência com desvio de 12,9s
 * (3–47s), irregular; o incidente tem 6,0s. **É um lead real, não um segundo bot.**
 *
 * A 12ª linha é o achado que fecha o AC4: uma mensagem `role='assistant'` **real com
 * `is_transition=true`**, 9 horas depois — a transição do handoff, escrita por
 * HUMANO com o papel da Nicole. Ela está aqui de propósito: é o único registro real
 * do repositório em que "fala do corretor gravada como fala da Nicole" pode ser
 * exercitada, e não uma linha sintética inventada para o teste.
 */
export const CONV_CONTROLE: MensagemDaFixture[] = materializar([
  { role: "assistant", t: 0, content: "a".repeat(340), len: 340, hash: "H17", enc: false },
  { role: "assistant", t: 17, content: "b".repeat(219), len: 219, hash: "H18", enc: false },
  { role: "assistant", t: 49, content: "c".repeat(291), len: 291, hash: "H19", enc: false },
  { role: "assistant", t: 79, content: "d".repeat(237), len: 237, hash: "H20", enc: false },
  { role: "assistant", t: 109, content: "e".repeat(87), len: 87, hash: "H21", enc: false },
  { role: "assistant", t: 118, content: "f".repeat(148), len: 148, hash: "H22", enc: false },
  { role: "assistant", t: 170, content: "g".repeat(124), len: 124, hash: "H23", enc: false },
  { role: "assistant", t: 175, content: "h".repeat(44), len: 44, hash: "H24", enc: false },
  { role: "assistant", t: 208, content: "i".repeat(85), len: 85, hash: "H25", enc: false },
  { role: "assistant", t: 223, content: "j".repeat(20), len: 20, hash: "H26", enc: false },
  { role: "assistant", t: 235, content: "k".repeat(10), len: 10, hash: "H27", enc: false },
])

/**
 * A 12ª mensagem do CONTROLE NEGATIVO — `role='assistant'`, `is_transition=true`,
 * `T+32933s` (9h depois). Separada da lista acima porque ela não pertence à janela do
 * incidente e porque o AC4 a usa isoladamente: ela é a fala do CORRETOR.
 */
export const TRANSICAO_REAL_CONTROLE = {
  role: "assistant" as const,
  t: 32933,
  created_at: emT(32933),
  len: 135,
  hash: "H28",
  isTransition: true,
}
