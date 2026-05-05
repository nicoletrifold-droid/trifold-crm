export { PERSONALITY_PROMPT } from "./personality"
export { GUARDRAILS_PROMPT } from "./guardrails"
export { QUALIFICATION_PROMPT } from "./qualification"
export { PROPERTY_PRESENTATION_PROMPT } from "./property-presentation"
export { VISIT_SCHEDULING_PROMPT } from "./visit-scheduling"
export { HANDOFF_SUMMARY_PROMPT } from "./handoff-summary"
export { OFF_HOURS_PROMPT } from "./off-hours"

import type Anthropic from "@anthropic-ai/sdk"
import { PERSONALITY_PROMPT } from "./personality"
import { GUARDRAILS_PROMPT } from "./guardrails"
import { QUALIFICATION_PROMPT } from "./qualification"
import { PROPERTY_PRESENTATION_PROMPT } from "./property-presentation"
import { VISIT_SCHEDULING_PROMPT } from "./visit-scheduling"

/**
 * Endereço da sede — definido UMA vez e referenciado nos demais prompts.
 */
export const SEDE_ADDRESS = "Av. Nildo Ribeiro da Rocha, 1337, Vila Marumby, Maringá-PR"

/**
 * Anthropic prompt caching — minimum tokens required for `cache_control: ephemeral`
 * to be applied. Sonnet/Opus: 1024. Haiku: 2048. Below this, the API still works
 * but does NOT cache. We compute a rough token estimate (text.length / 4) and
 * fall back to a single uncached block if the static section is too small.
 *
 * Source: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export const PROMPT_CACHE_MIN_TOKENS = 1024

/**
 * Toggle para o prompt caching. Default: true (recomendado em produção).
 * Para rollback rápido sem redeploy, definir `ANTHROPIC_PROMPT_CACHE_ENABLED=false`.
 */
export function isPromptCacheEnabled(): boolean {
  const flag = process.env.ANTHROPIC_PROMPT_CACHE_ENABLED
  // Default: enabled. Only the explicit string "false" disables.
  return flag !== "false"
}

/**
 * Estimativa rápida de tokens (rough: 1 token ~= 4 chars). Usada apenas para
 * decidir se vale a pena cachear (>= PROMPT_CACHE_MIN_TOKENS). Para contagem
 * exata, a Anthropic retorna `usage.input_tokens` no response.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Constrói o conteúdo estático do system prompt da Nicole.
 * Estes 8 segmentos são idênticos em cada invocação dentro da mesma org →
 * candidato natural para Anthropic prompt caching (cache_control: ephemeral).
 *
 * NÃO inclui propertyContext (dinâmico, vai em bloco separado).
 */
function buildStaticSystemContent(): string {
  const sections = [
    `IDIOMA: Responda EXCLUSIVAMENTE em português brasileiro com acentuação correta. Use é, á, ã, õ, ç, ú, í, ê, ô em todas as palavras que exigem. Exemplo: "você", "não", "também", "está", "será", "imóvel", "próximo". NUNCA escreva sem acentos. Isso é obrigatório e inegociável.`,
    `ENDERECO DA SEDE TRIFOLD (referencia unica — use este endereco sempre que mencionar a sede, o decorado ou agendar visitas):\n${SEDE_ADDRESS}\nTodos os decorados ficam na SEDE. O endereco dos empreendimentos (obras) NAO e onde o lead visita.`,
    PERSONALITY_PROMPT,
    GUARDRAILS_PROMPT,
    QUALIFICATION_PROMPT,
    PROPERTY_PRESENTATION_PROMPT,
    VISIT_SCHEDULING_PROMPT,
    // FINAL REINFORCEMENT — last instruction wins, model prioritizes these.
    // Mantido no bloco estático: as regras absolutas não variam por lead/conversa.
    `LEMBRETE FINAL — REGRAS ABSOLUTAS:
1. Responda SEMPRE em português brasileiro correto COM acentos (é, ã, ç, ú).
2. ZERO emojis. ZERO markdown. Texto puro simples.
3. Mensagens CURTAS. 2-3 frases no máximo.
4. UMA pergunta por mensagem, no final.
5. Decorado fica na SEDE (endereço definido acima). NUNCA no endereço da obra. Mencione o endereço APENAS quando o lead perguntar onde é ou quando estiver confirmando agendamento.
6. NÃO pergunte dia/horário de visita sem antes confirmar que o lead quer visitar.
7. NUNCA repita uma pergunta que o lead já respondeu. Se ele já disse o dia, o horário, o nome, o interesse — NÃO pergunte de novo. Isso irrita o lead.
8. Se a visita já está agendada (ver CONVERSATION CONTEXT acima), NÃO pergunte quando ele quer ir. Responda normalmente sobre outros assuntos.
9. Leia o contexto da conversa ANTES de responder. Se o lead já informou algo, use essa informação.
10. Seja natural e coloquial. Varie suas respostas.
11. NÃO repita o endereço da sede em toda mensagem. Mencione APENAS quando relevante (lead perguntou, agendamento confirmado).`,
  ]

  return sections.join("\n\n---\n\n")
}

/**
 * Monta o system prompt completo da Nicole como array de blocos para a Anthropic API.
 *
 * Estrutura:
 *  - Bloco 1 (ESTÁTICO, cacheável): IDIOMA + SEDE + PERSONALITY + GUARDRAILS +
 *    QUALIFICATION + PROPERTY_PRESENTATION + VISIT_SCHEDULING + LEMBRETE FINAL.
 *    Marcado com `cache_control: ephemeral` (TTL 5min) → -90% custo em cache hit.
 *  - Bloco 2 (DINÂMICO, sem cache): propertyContext (RAG context — varia por query).
 *    Inclui-se apenas quando `propertyContext` é não-vazio.
 *
 * Pre-condição da Anthropic: bloco com `cache_control` precisa ter no mínimo
 * 1024 tokens (Sonnet/Opus) para ser cacheado. Se o bloco estático estimado
 * for menor, fallback para single-block sem cache_control e log warning.
 *
 * NOTA — Story 21.2 (lead context injection): qualquer bloco `<lead_context>`
 * a ser adicionado deve ser DINÂMICO e ir como parte do segundo bloco (sem
 * cache_control). Nunca incluir no bloco estático cacheável.
 *
 * @returns Array de TextBlockParam compatível com `anthropic.messages.create({ system: [...] })`.
 */
export function buildSystemPrompt(
  propertyContext?: string,
  options?: { onWarning?: (event: { code: string; message: string; metadata?: Record<string, unknown> }) => void }
): Anthropic.Messages.TextBlockParam[] {
  const staticContent = buildStaticSystemContent()
  const staticTokens = estimateTokens(staticContent)
  const cacheEnabled = isPromptCacheEnabled()
  const cacheEligible = cacheEnabled && staticTokens >= PROMPT_CACHE_MIN_TOKENS

  if (cacheEnabled && !cacheEligible) {
    options?.onWarning?.({
      code: "prompt_cache_skipped_too_small",
      message: `Static prompt block has ~${staticTokens} tokens, below Anthropic min ${PROMPT_CACHE_MIN_TOKENS}. Skipping cache_control.`,
      metadata: { estimated_tokens: staticTokens, min_tokens: PROMPT_CACHE_MIN_TOKENS },
    })
  }

  const blocks: Anthropic.Messages.TextBlockParam[] = []

  if (cacheEligible) {
    blocks.push({
      type: "text",
      text: staticContent,
      cache_control: { type: "ephemeral" },
    })
  } else {
    // Fallback: bloco único sem cache_control (comportamento legado).
    blocks.push({ type: "text", text: staticContent })
  }

  // Dynamic block (RAG context) — never cached.
  if (propertyContext) {
    const dynamicContent = `CONTEXTO DA BASE DE CONHECIMENTO\n\nUse as informacoes abaixo para responder perguntas especificas sobre o empreendimento. Se a resposta nao estiver aqui, siga as regras de "QUANDO NAO SOUBER".\n\n${propertyContext}`
    blocks.push({ type: "text", text: dynamicContent })
  }

  return blocks
}

/**
 * Versão legada que retorna o system prompt como string concatenada.
 * Usada por consumidores não-API (ex: `scripts/seed-prompts.ts` que persiste
 * o prompt em `agent_config.personality_prompt` no banco).
 *
 * NÃO usar no pipeline da Nicole — o pipeline usa `buildSystemPrompt()` que
 * retorna array de blocos com cache_control aplicado.
 */
export function buildSystemPromptText(propertyContext?: string): string {
  const blocks = buildSystemPrompt(propertyContext)
  return blocks.map((b) => b.text).join("\n\n---\n\n")
}
