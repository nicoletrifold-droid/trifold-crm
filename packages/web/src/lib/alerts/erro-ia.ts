// Story 87-19 — classificador de falha da API de IA a partir do texto do erro.
//
// POR QUE ISTO EXISTE: em 27/08/2026 o saldo da conta Anthropic acabou e a Nicole
// parou de responder por 22h sem que ninguém soubesse. Os `catch` do projeto já
// gravavam o erro íntegro em `system_events` — o dado estava lá, só não havia quem
// o lesse. Este módulo é o leitor.
//
// PURO DE PROPÓSITO (sem I/O, sem Supabase): a regra que decide "isto é a IA caindo"
// é a parte que precisa ser testável contra as strings REAIS do incidente, sem banco.

/** Os 4 modos de falha da API de IA que travam a Nicole. */
export type TipoErroIA = "credito" | "auth" | "rate_limit" | "sobrecarga"

/**
 * Quantas ocorrências na janela são necessárias para alertar, POR TIPO.
 *
 * `credito` e `auth` são estados **absorventes**: saldo esgotado e credencial
 * revogada não se curam sozinhos e travam 100% do atendimento no primeiro minuto —
 * esperar recorrência só adia o prejuízo (no incidente real, cada minuto de espera
 * era um lead pago sem resposta). `rate_limit` e `sobrecarga` são transitórios por
 * natureza e o próprio provedor se recupera; alertar na primeira ocorrência geraria
 * fadiga de alerta, que é como um canal de alerta morre.
 */
export const LIMIAR_POR_TIPO: Record<TipoErroIA, number> = {
  credito: 1,
  auth: 1,
  rate_limit: 3,
  sobrecarga: 3,
}

/**
 * Assinaturas por tipo, em ordem de precedência.
 *
 * Casamos preferencialmente pelo **`error.type` do SDK** (`rate_limit_error`,
 * `overloaded_error`, `authentication_error`) e não pela frase em inglês: o tipo é
 * contrato de API e o texto não é. Isso também é o que impede o falso positivo mais
 * provável aqui — a Graph API do WhatsApp devolve `(#80007) rate limit hit`, que
 * casaria com um ingênuo `"rate limit"` mas NUNCA com `rate_limit_error`.
 *
 * `credito` é a exceção que precisa da frase: saldo esgotado não tem `error.type`
 * próprio na Anthropic — vem como `invalid_request_error` genérico, e só a mensagem
 * distingue "sem saldo" de "seu request está malformado". A string é a do incidente
 * real de 27/08/2026, recuperada de `system_events`. `insufficient_quota` é o
 * equivalente da OpenAI (o projeto também tem `OPENAI_API_KEY` em produção).
 */
const ASSINATURAS: ReadonlyArray<readonly [TipoErroIA, readonly string[]]> = [
  ["credito", ["credit balance is too low", "purchase credits", "insufficient_quota"]],
  ["auth", ["authentication_error", "invalid x-api-key", "permission_error"]],
  ["rate_limit", ["rate_limit_error"]],
  ["sobrecarga", ["overloaded_error"]],
] as const

/**
 * Classifica a `message` de um `system_event`. Devolve `null` para tudo que não for
 * inequivocamente uma falha da API de IA.
 *
 * O `null` é a parte importante: este classificador roda sobre TODO `level='error'`
 * do sistema. Se ele for generoso, o cron vira um megafone de qualquer falha e o
 * canal morre de fadiga em uma semana. Na dúvida, não é IA.
 */
export function classificarErroIA(message: string): TipoErroIA | null {
  if (!message) return null
  const texto = message.toLowerCase()
  for (const [tipo, assinaturas] of ASSINATURAS) {
    if (assinaturas.some((a) => texto.includes(a))) return tipo
  }
  return null
}

/** Aplica o limiar do tipo. Pura, para o cron não decidir isso na mão. */
export function deveAlertar(tipo: TipoErroIA, ocorrencias: number): boolean {
  return ocorrencias >= LIMIAR_POR_TIPO[tipo]
}

/**
 * Texto de `{{1}}` no template WhatsApp — o "motivo provável" que o admin lê.
 *
 * Constante mapeada, e não string montada no ponto de envio, porque o template da
 * Meta é aprovado com um formato fixo: mudar o teor da variável em produção é o tipo
 * de coisa que passa despercebida até a Meta reprovar o template.
 */
export const MOTIVO_POR_TIPO: Record<TipoErroIA, string> = {
  credito: "saldo/crédito da API de IA esgotado",
  auth: "credencial da API de IA inválida ou revogada",
  rate_limit: "limite de requisições da API de IA atingido",
  sobrecarga: "API de IA sobrecarregada",
}
