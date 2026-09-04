/**
 * Nicole NÃO fala em percentual de entrada.
 *
 * DECISÃO (Marcos, 31/08/2026): enquanto não existirem diretrizes comerciais escritas
 * sobre entrada, a Nicole não cita percentual ("a entrada mínima é de 20%") nem valor
 * ("em torno de 80 mil"). Quem faz essa conta é o corretor. O gatilho foi uma conversa
 * real (lead Matheus, 30/08) em que ela respondeu "a entrada mínima é de 20% do valor
 * do imóvel" — número que varia por unidade e por condição comercial, e que já
 * contradizia o RN2 do próprio guardrails ("NUNCA cite ... valor de entrada").
 *
 * Ela CONTINUA podendo dizer que existe entrada e qualificar se o lead tem
 * disponibilidade — o que não pode é sair um número.
 *
 * COBRE OS DOIS LADOS, pelo mesmo motivo de `contradiction.test.ts`:
 *  - `_production/*.txt` — o que roda hoje (o banco é a fonte da verdade, D-87-0-a);
 *  - as CONSTANTES de `prompts/*.ts` — o fallback de bootstrap, que entra em cena
 *    sempre que faltar override e reintroduziria o número pela porta dos fundos.
 */
import { describe, it, expect } from "vitest"
import {
  PERSONALITY_PROMPT,
  GUARDRAILS_PROMPT,
  QUALIFICATION_PROMPT,
  PROPERTY_PRESENTATION_PROMPT,
  VISIT_SCHEDULING_PROMPT,
  HANDOFF_SUMMARY_PROMPT,
  OFF_HOURS_PROMPT,
} from "./index"
import { loadProductionSnapshot } from "./snapshot"

type Fonte = { nome: string; texto: string }

/** A linha fala de entrada/sinal? Só então os padrões abaixo importam. */
const CONTEXTO_ENTRADA = /\b(entrada|sinal)\b/i

/** Marcadores de negação — mesma convenção do `contradiction.test.ts`. */
const NEGADORES = /\b(nunca|jamais|n[ãa]o|proibid[oa]|evite)\b/i

const PADROES: Array<{ id: string; re: RegExp; negacaoNeutraliza: boolean; porque: string }> = [
  {
    id: "numero-percentual",
    // "20%", "20 %", "20 por cento". Absoluto: mesmo negado ("NUNCA diga 20%"), o
    // número entra no vocabulário do modelo — mesma lógica da palavra "stand" (AC7 da 87-0).
    re: /\d+\s*(%|por\s*cento)/i,
    negacaoNeutraliza: false,
    porque: "Percentual de entrada não pode sair da Nicole — quem faz a conta é o corretor.",
  },
  {
    id: "instrucao-de-falar-em-percentual",
    // Manda a Nicole falar em percentual sem citar o número. Negação neutraliza:
    // "NUNCA cite percentual de entrada" é exatamente a régua que queremos.
    re: /(percentual|porcentagem|por\s*cento)/i,
    negacaoNeutraliza: true,
    porque: "Instrução que orienta comunicar entrada em percentual.",
  },
  {
    id: "valor-em-reais",
    // "80 mil", "R$ 80.000". Mesmo raciocínio: 20% de 400 mil é 80 mil — trocar a
    // unidade não muda o fato de a Nicole estar dando o número da entrada.
    re: /(R\$\s*[\d.]+|\d+\s*mil\b)/i,
    negacaoNeutraliza: true,
    porque: "Valor de entrada em reais é o mesmo número em outra unidade (e viola o RN2).",
  },
]

type Achado = { fonte: string; linha: number; padrao: string; trecho: string; porque: string }

function acharPercentuaisDeEntrada(fontes: Fonte[]): Achado[] {
  const achados: Achado[] = []
  for (const fonte of fontes) {
    const linhas = fonte.texto.split("\n")
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i]
      if (!CONTEXTO_ENTRADA.test(linha)) continue
      for (const padrao of PADROES) {
        if (!padrao.re.test(linha)) continue
        if (padrao.negacaoNeutraliza && NEGADORES.test(linha)) continue
        achados.push({
          fonte: fonte.nome,
          linha: i + 1,
          padrao: padrao.id,
          trecho: linha.trim().slice(0, 160),
          porque: padrao.porque,
        })
      }
    }
  }
  return achados
}

function relatorio(achados: Achado[]): string {
  if (achados.length === 0) return "nenhum"
  return [
    `${achados.length} ocorrência(s) de número de entrada:`,
    ...achados.map((a) => `  ${a.fonte}:${a.linha} [${a.padrao}] ${a.trecho}\n      → ${a.porque}`),
  ].join("\n")
}

const CONSTANTES_DO_CODIGO: Fonte[] = [
  { nome: "código: PERSONALITY_PROMPT", texto: PERSONALITY_PROMPT },
  { nome: "código: GUARDRAILS_PROMPT", texto: GUARDRAILS_PROMPT },
  { nome: "código: QUALIFICATION_PROMPT", texto: QUALIFICATION_PROMPT },
  { nome: "código: PROPERTY_PRESENTATION_PROMPT", texto: PROPERTY_PRESENTATION_PROMPT },
  { nome: "código: VISIT_SCHEDULING_PROMPT", texto: VISIT_SCHEDULING_PROMPT },
  { nome: "código: HANDOFF_SUMMARY_PROMPT", texto: HANDOFF_SUMMARY_PROMPT },
  { nome: "código: OFF_HOURS_PROMPT", texto: OFF_HOURS_PROMPT },
]

function snapshotComoFontes(): Fonte[] {
  return Object.entries(loadProductionSnapshot()).map(([slug, texto]) => ({
    nome: `_production/${slug}.txt`,
    texto,
  }))
}

describe("Nicole não fala em percentual (nem valor) de entrada", () => {
  it("o teste tem o que medir: o detector reprova a frase que gerou a decisão", () => {
    // Sem esta asserção, um regex quebrado deixaria os dois testes abaixo verdes por vazio.
    const achados = acharPercentuaisDeEntrada([
      { nome: "fixture", texto: "- A Trifold trabalha com entrada minima de 20% do valor do imovel" },
    ])
    expect(achados.map((a) => a.padrao)).toContain("numero-percentual")
  })

  it("nenhum override de produção manda a Nicole dar número de entrada", () => {
    const achados = acharPercentuaisDeEntrada(snapshotComoFontes())
    expect(achados, relatorio(achados)).toEqual([])
  })

  it("nenhuma constante de fallback manda a Nicole dar número de entrada", () => {
    const achados = acharPercentuaisDeEntrada(CONSTANTES_DO_CODIGO)
    expect(achados, relatorio(achados)).toEqual([])
  })
})
