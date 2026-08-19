import Anthropic from "@anthropic-ai/sdk"

/**
 * Story 82-1 — strings de modelo centralizadas. A rota /summary usava uma
 * string antiga (claude-haiku-4-20250414) divergente do cron enrich-leads;
 * todo consumidor deve importar daqui.
 */
export const ANTHROPIC_MODELS = {
  /** Extrações/classificações baratas (enrich, classify, resumo). */
  haiku: "claude-haiku-4-5-20251001",
  /** Raciocínio sobre comportamento/recomendações (análise do lead). */
  sonnet: "claude-sonnet-5",
} as const

export function createAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })
}

/**
 * Story 75-349 — quais modelos AINDA aceitam `temperature`.
 *
 * A geração atual (Opus 5/4.7/4.8, Sonnet 5, Fable 5) **removeu os parâmetros de
 * sampling**: mandar `temperature` volta HTTP 400. A Nicole manda em toda chamada,
 * lendo `agent_config.temperature` do BANCO — e `agent_config.model_primary`
 * também é do banco, editável fora do deploy. Ou seja: trocar o modelo pela tela
 * levava a Nicole a 100% de erro sem que uma linha de código mudasse.
 *
 * Lista de PERMISSÃO, não de bloqueio, de propósito: modelo desconhecido cai no
 * `false` e a chamada sai sem `temperature` — o pior caso é uma resposta um pouco
 * mais determinística, contra uma conversa que não acontece.
 */
const MODELOS_COM_SAMPLING = [
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-3-5-sonnet",
  "claude-3-haiku",
]

export function supportsSampling(model: string): boolean {
  return MODELOS_COM_SAMPLING.some((m) => model.startsWith(m))
}

/**
 * Story 75-349 — o texto de uma resposta, por FILTRO e nunca por posição.
 *
 * `content[0]` era a leitura em 6 lugares do repo. Nos modelos atuais o thinking
 * é ligado por padrão e o bloco 0 pode ser `thinking` — então `content[0].type`
 * não é `"text"`, o texto sai vazio e a fala real do modelo é DESCARTADA. No
 * pipeline da Nicole isso não gera erro nenhum: cai no `SANITIZED_EMPTY_FALLBACK`
 * e o lead recebe uma frase neutra em TODO turno, o que parece funcionar.
 *
 * Três flows (`form-reading`, `behavior-analysis`, `marketing-*`) já tinham a
 * leitura certa com o comentário explicando o risco. Esta função é a mesma regra,
 * num lugar só — uma guarda aplicada a um caminho e não aos outros é a lição da
 * 75-268.
 */
export function textoDaResposta(
  content: Array<{ type: string; text?: string }>
): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
}
