import type Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC_MODELS } from "../client/anthropic"

/**
 * Story 90-1 (Epic 90) — Live Coach: detecta a objeção que o LEAD acabou de
 * levantar numa conversa que o CORRETOR assumiu, e redige rascunhos de resposta
 * ancorados no RAG.
 *
 * Dois passos, de propósito:
 *   1. `detectObjection`  — Haiku, gate barato. Roda em quase toda mensagem.
 *   2. `draftCoachReply`  — Sonnet, só quando há objeção confiável.
 * Sem objeção, o custo da mensagem é um Haiku curto e nada é persistido.
 *
 * Regras de produto:
 * - A sugestão é RASCUNHO. Quem envia é o humano — nada aqui fala com o lead.
 * - Sem apoio no RAG/perfil ⇒ `ancorada: false`. Nunca fingir lastro (mesmo
 *   espírito do `dados_faltando` da análise de comportamento, Epic 82).
 * - Fail-open: parse inválido/timeout ⇒ `null`, e quem chama simplesmente não
 *   gera sugestão (padrão do `message-review.ts`, Story 83-1).
 */

/** Classes de objeção — espelha o CHECK de `coach_suggestions.tipo` (mig 242). */
export type ObjecaoTipo =
  | "preco"
  | "prazo"
  | "localizacao"
  | "concorrente"
  | "decisor"
  | "financiamento"
  | "indeciso"
  | "outro"

const TIPOS: readonly ObjecaoTipo[] = [
  "preco",
  "prazo",
  "localizacao",
  "concorrente",
  "decisor",
  "financiamento",
  "indeciso",
  "outro",
]

/**
 * `baixa` existe no vocabulário do modelo mas NUNCA é persistida: serve para o
 * detector poder dizer "achei algo, mas não confio" e ser descartado aqui.
 */
export type Confianca = "alta" | "media" | "baixa"

export interface ObjectionDetection {
  objecao: string
  tipo: ObjecaoTipo
  confianca: Exclude<Confianca, "baixa">
}

export interface CoachDraft {
  respostas: string[]
  ancoras: string[]
  ancorada: boolean
  cuidado: string | null
}

/**
 * Elegibilidade: mensagens triviais não valem uma chamada de IA.
 *
 * Base na régua de `isReviewEligible` (message-review.ts), com UMA diferença
 * deliberada: **URLs são removidas antes da avaliação**. Para a revisão
 * ortográfica, deixar um link passar é inócuo; aqui cada mensagem elegível custa
 * um Haiku, e lead mandando link de concorrente sem escrever nada é comum.
 *
 * Consequência aceita: link solto ("olha esse aqui: <url>") não gera sugestão —
 * o coach não busca conteúdo de página externa, então não teria o que analisar.
 * Com texto ao redor ("achei esse melhor e mais barato <url>") passa normalmente.
 */
export function isCoachEligible(text: string): boolean {
  const semUrls = text.replace(/https?:\/\/\S+|www\.\S+/gi, " ").trim()
  if (semUrls.length < 8) return false
  if (!/[a-záéíóúâêôãõàçüA-ZÁÉÍÓÚÂÊÔÃÕÀÇÜ]{3,}/.test(semUrls)) return false
  return true
}

const DETECT_PROMPT = `Voce analisa mensagens de clientes em conversas de WhatsApp de uma incorporadora/imobiliaria brasileira.

Sua UNICA tarefa: dizer se a mensagem do cliente carrega uma OBJECAO de venda e classifica-la.

O que E objecao: resistencia, duvida ou barreira que atrasa/impede a decisao de compra.
  - "ta caro", "acima do meu orcamento" -> preco
  - "demora muito pra entregar", "so fica pronto em 2027?" -> prazo
  - "e longe do meu trabalho", "nao conheco esse bairro" -> localizacao
  - "vi outro empreendimento melhor/mais barato" -> concorrente
  - "preciso falar com minha esposa/socio" -> decisor
  - "nao sei se aprovo financiamento", "entrada alta" -> financiamento
  - "vou pensar", "depois te falo", esquiva sem motivo dito -> indeciso
  - resistencia real que nao encaixa nas anteriores -> outro

O que NAO E objecao: pergunta neutra de informacao, agradecimento, saudacao,
confirmacao de horario, elogio, envio de documento, ou entusiasmo.

Confianca:
  - alta: a objecao esta explicita na mensagem.
  - media: esta implicita, mas o contexto sustenta.
  - baixa: voce esta chutando. Use SEMPRE que houver duvida real.

Retorne APENAS JSON valido, sem markdown:
{"tem_objecao": true|false, "objecao": "a objecao em UMA frase, na linguagem do cliente", "tipo": "preco|prazo|localizacao|concorrente|financiamento|decisor|indeciso|outro", "confianca": "alta|media|baixa"}

Se nao houver objecao, retorne {"tem_objecao": false}. Na duvida entre ter e nao ter, responda false.`

/**
 * Passo 1 — Haiku. `recentHistory` são as últimas mensagens (mais antigas
 * primeiro, já formatadas "Lead: …" / "Corretor: …") para desambiguar ironia e
 * respostas curtas; opcional.
 */
export async function detectObjection(
  anthropic: Anthropic,
  params: { message: string; recentHistory?: string }
): Promise<ObjectionDetection | null> {
  const { message, recentHistory } = params
  const contexto = recentHistory?.trim()
    ? `\n\nCONTEXTO RECENTE DA CONVERSA:\n${recentHistory.trim()}`
    : ""

  const response = await anthropic.messages.create(
    {
      model: ANTHROPIC_MODELS.haiku,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `${DETECT_PROMPT}${contexto}\n\nMENSAGEM DO CLIENTE:\n${message}`,
        },
      ],
    },
    { timeout: 6000 }
  )

  return parseObjectionDetection(extractText(response))
}

const DRAFT_PROMPT = `Voce é um gerente de vendas experiente de incorporadora brasileira, orientando um corretor POR ESCRITO durante um atendimento de WhatsApp em andamento.

O corretor vai LER sua sugestao e responder ao cliente com as PROPRIAS maos. Voce NAO fala com o cliente.

Escreva 1 ou 2 rascunhos de resposta que o corretor possa colar e ajustar:
- tom de WhatsApp brasileiro, cordial e direto (nao carta formal, nao script de telemarketing)
- 2 a 4 frases cada, no maximo
- responda a objecao com INFORMACAO das ANCORAS abaixo, nao com tecnica de venda vazia
- termine movendo a conversa adiante (pergunta ou proximo passo concreto)

REGRA ABSOLUTA — nao inventar:
- Use SOMENTE numeros, prazos, valores, condicoes e nomes que aparecem nas ANCORAS ou no PERFIL.
- Se as ANCORAS estiverem vazias ou nao cobrirem a objecao, escreva rascunhos que NAO afirmam
  dado nenhum: acolhem a objecao e fazem a pergunta que abre a conversa. Nunca cite numero
  que voce nao recebeu.
- NUNCA prometa desconto, condicao especial, prazo ou reserva. Se houver risco de o corretor
  prometer algo assim, escreva isso no campo "cuidado".

No campo "ancoras", liste APENAS os trechos das ANCORAS que voce realmente usou nos rascunhos.
Se nao usou nenhum, devolva lista vazia.

Retorne APENAS JSON valido, sem markdown:
{"respostas": ["rascunho 1", "rascunho 2"], "ancoras": ["trecho usado"], "cuidado": "o que NAO prometer, ou null"}`

/**
 * Passo 2 — Sonnet. `timeout` de 20s é teto defensivo: o `maxDuration = 60` da
 * rota do webhook é compartilhado por todo o `after()`, e o coach jamais pode
 * ser a causa de um estouro.
 *
 * `ancorada` é DERIVADA aqui, não confiada ao modelo: só é `true` quando
 * sobrou ao menos uma âncora de fato.
 */
export async function draftCoachReply(
  anthropic: Anthropic,
  params: {
    objecao: string
    tipo: ObjecaoTipo
    ragContext: string
    leadProfile?: string
    recentHistory?: string
  }
): Promise<CoachDraft | null> {
  const { objecao, tipo, ragContext, leadProfile, recentHistory } = params

  const blocos = [
    `OBJECAO DO CLIENTE (${tipo}):\n${objecao}`,
    `ANCORAS (base de conhecimento do empreendimento):\n${
      ragContext.trim() || "(vazio — nao ha dado disponivel para esta objecao)"
    }`,
  ]
  if (leadProfile?.trim()) blocos.push(`PERFIL DO CLIENTE:\n${leadProfile.trim()}`)
  if (recentHistory?.trim()) blocos.push(`CONVERSA RECENTE:\n${recentHistory.trim()}`)

  const response = await anthropic.messages.create(
    {
      model: ANTHROPIC_MODELS.sonnet,
      max_tokens: 1600,
      messages: [
        { role: "user", content: `${DRAFT_PROMPT}\n\n${blocos.join("\n\n")}` },
      ],
    },
    { timeout: 20000 }
  )

  return parseCoachDraft(extractText(response))
}

/**
 * Lição 82-4: NUNCA ler `content[0]` — a resposta pode vir multi-bloco (e com
 * bloco de thinking na frente). Concatenar só os blocos de texto.
 */
function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
}

/** Descasca cerca ```json e fatia do primeiro `{` ao último `}`. */
function isolateJson(raw: string): string | null {
  let cleaned = raw.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim()
  if (!cleaned.startsWith("{")) {
    const start = cleaned.indexOf("{")
    const end = cleaned.lastIndexOf("}")
    if (start === -1 || end <= start) return null
    cleaned = cleaned.slice(start, end + 1)
  }
  return cleaned
}

/**
 * Parse defensivo do detector. Descarta silenciosamente:
 * - `tem_objecao` ausente/false
 * - `tipo` fora do CHECK da migration
 * - `confianca: "baixa"` (o modelo admitiu chute)
 * - objeção vazia
 */
export function parseObjectionDetection(raw: string): ObjectionDetection | null {
  try {
    const cleaned = isolateJson(raw)
    if (!cleaned) return null
    const parsed = JSON.parse(cleaned) as Record<string, unknown>

    if (parsed.tem_objecao !== true) return null

    const objecao = typeof parsed.objecao === "string" ? parsed.objecao.trim() : ""
    if (!objecao) return null

    const tipo = parsed.tipo as ObjecaoTipo
    if (!TIPOS.includes(tipo)) return null

    const confianca = parsed.confianca
    if (confianca !== "alta" && confianca !== "media") return null

    return { objecao, tipo, confianca }
  } catch {
    return null
  }
}

/**
 * Parse defensivo do redator. `ancorada` é derivada das âncoras que sobraram
 * após a limpeza — o modelo não decide isso.
 */
export function parseCoachDraft(raw: string): CoachDraft | null {
  try {
    const cleaned = isolateJson(raw)
    if (!cleaned) return null
    const parsed = JSON.parse(cleaned) as Record<string, unknown>

    if (!Array.isArray(parsed.respostas)) return null
    const respostas = parsed.respostas
      .filter((r): r is string => typeof r === "string")
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .slice(0, 2)
    if (respostas.length === 0) return null

    const ancoras = Array.isArray(parsed.ancoras)
      ? parsed.ancoras
          .filter((a): a is string => typeof a === "string")
          .map((a) => a.trim())
          .filter((a) => a.length > 0)
      : []

    const cuidadoRaw = typeof parsed.cuidado === "string" ? parsed.cuidado.trim() : ""

    return {
      respostas,
      ancoras,
      // Nunca `true` com lista vazia — é a regra do épico, não uma escolha do modelo.
      ancorada: ancoras.length > 0,
      cuidado: cuidadoRaw && cuidadoRaw.toLowerCase() !== "null" ? cuidadoRaw : null,
    }
  } catch {
    return null
  }
}
