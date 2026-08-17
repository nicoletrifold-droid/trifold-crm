import { createAnthropicClient, ANTHROPIC_MODELS } from "../client/anthropic"
import { interestLevelFromScore, type InterestLevel } from "./interest-level"

// Story 75-332 (Epic 89) — o Haiku lê as respostas ABERTAS do formulário.
//
// O score da 75-330 só pontua opção de múltipla escolha. Quando o lead escreve
// "estou saindo do aluguel, minha filha começa na escola do bairro em janeiro",
// isso não vira ponto nenhum — e é exatamente o que o corretor precisa saber
// antes de mandar a primeira mensagem. É esse texto que este flow lê.
//
// ⚠️ O QUE ESTE FLOW NÃO ESCREVE: `qualificacao_comercial`. Aquele campo é
// avaliação MANUAL por desenho (`217_leads_qualificacao_comercial.sql`, Story
// 84-1) e já tem 66 leads classificados à mão em produção. IA escrevendo ali
// apagaria julgamento humano — que é o bug que a migration 201 teve de
// consertar no calor ("corretor evoluía p/ Quente e a próxima mensagem devolvia
// p/ Frio"). Não repetir em outro campo.

export interface RespostaAberta {
  pergunta: string
  resposta: string
}

export interface LeituraDoFormulario {
  /** Até 3 linhas, escritas para o CORRETOR — não para o lead. */
  resumo: string
  calor: InterestLevel
}

// ⚠️ SAÍDA ESTRUTURADA NÃO ESTÁ DISPONÍVEL AQUI. O `output_config.format` da API
// garantiria o formato, mas o SDK fixado no projeto é o `@anthropic-ai/sdk@0.52.0`,
// que antecede o recurso e nem tipa o campo. Subir o SDK toca TODOS os flows de
// IA (Nicole inclusive) e é story própria — não passageira desta.
// Enquanto isso: o formato é pedido no prompt e a garantia real fica em
// `validarLeitura`, que trata como falha tudo que não for exatamente o esperado.

const PROMPT_SISTEMA = `Você lê respostas de um formulário de qualificação imobiliária e escreve uma nota curta para o CORRETOR que vai atender esse lead.

O resumo é para o corretor, não para o lead:
- Sem saudação, sem elogio ao lead, sem se dirigir a ele.
- No máximo 3 linhas, direto ao ponto.
- Escreva SOMENTE o que o lead escreveu. Não deduza renda, estado civil, urgência ou intenção que não estejam no texto. Se as respostas dizem pouco, faça um resumo curto dizendo pouco — não preencha lacunas.
- Priorize o que muda a abordagem do corretor: motivo da mudança, prazo, restrição, contexto familiar.

O calor traduz o que o texto revela sobre proximidade da decisão:
- "hot": prazo definido, motivo concreto e urgência explícita.
- "warm": interesse real, sem urgência clara.
- "cold": exploratório, vago ou sem sinal de intenção.

Responda APENAS com um objeto JSON, sem texto em volta e sem cercas de markdown:
{"resumo": "...", "calor": "hot" | "warm" | "cold"}`

/**
 * Lê as respostas abertas e devolve `{ resumo, calor }`.
 *
 * FAIL-OPEN (AC2): qualquer falha — erro, timeout, resposta fora do formato —
 * devolve `null`. A finalização do formulário, o lead e o agendamento da 75-331
 * NÃO podem ser derrubados porque o modelo não respondeu. Mesmo espírito da
 * guarda de ortografia (Épico 83).
 *
 * AC8: sem pergunta aberta respondida, o modelo nem é chamado — não há texto
 * para interpretar, e um resumo inventado a partir de nada é pior que nenhum.
 */
export async function lerRespostasDoFormulario(params: {
  abertas: RespostaAberta[]
  score: number
}): Promise<LeituraDoFormulario | null> {
  const preenchidas = params.abertas.filter((r) => r.resposta.trim().length > 0)
  if (preenchidas.length === 0) return null // AC8

  const texto = preenchidas.map((r) => `${r.pergunta}\n> ${r.resposta}`).join("\n\n")

  try {
    const anthropic = createAnthropicClient()
    const response = await anthropic.messages.create(
      {
        model: ANTHROPIC_MODELS.haiku,
        max_tokens: 600,
        system: PROMPT_SISTEMA,
        messages: [
          {
            role: "user",
            content: `Score objetivo do formulário (0-100): ${params.score}\n\nRespostas abertas:\n\n${texto}`,
          },
        ],
      },
      { timeout: 15000 }
    )

    // Nunca `content[0]`: se um dia este flow rodar num modelo com thinking, o
    // primeiro bloco não é o texto.
    const bloco = response.content.find((b) => b.type === "text")
    if (!bloco || bloco.type !== "text") return null

    return validarLeitura(bloco.text, params.score)
  } catch (e) {
    console.error("[form-reading] falha ao ler respostas:", e)
    return null // FAIL-OPEN
  }
}

/**
 * Valida o que voltou do modelo. Exportada para teste: é aqui que mora a
 * decisão de aceitar ou descartar, e é a parte que precisa de cobertura sem
 * chamar a API.
 *
 * Calor fora do enum cai para a régua objetiva do score em vez de derrubar a
 * leitura inteira — o resumo é o que o corretor mais usa, e perdê-lo por causa
 * de uma palavra errada seria trocar o mais valioso pelo menos valioso.
 */
export function validarLeitura(bruto: string, score: number): LeituraDoFormulario | null {
  // O modelo às vezes embrulha o JSON em ```json — o `parseEnrichmentResponse`
  // deste mesmo pacote já apanhou disso. Limpar antes de tentar.
  const limpo = bruto.replace(/```json?\s*/gi, "").replace(/```\s*/g, "").trim()

  let json: unknown
  try {
    json = JSON.parse(limpo)
  } catch {
    return null
  }
  if (typeof json !== "object" || json === null) return null

  const obj = json as Record<string, unknown>
  const resumo = typeof obj.resumo === "string" ? obj.resumo.trim() : ""
  if (!resumo) return null // sem resumo não há o que gravar

  const calorBruto = obj.calor
  const calor: InterestLevel =
    calorBruto === "hot" || calorBruto === "warm" || calorBruto === "cold"
      ? calorBruto
      : interestLevelFromScore(score)

  return { resumo, calor }
}
