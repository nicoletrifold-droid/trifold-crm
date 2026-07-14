// Story 78-14 — Tabela de preços conhecidos (plano → valor fixo mensal).
//
// FONTE DE VERDADE MANUAL, não de API: nenhum endpoint devolve o preço do plano Supabase Pro
// (mesma limitação já documentada para Supabase/Resend no épico — CON-3-like). Esta tabela
// PRECISA de manutenção manual sempre que um fornecedor mudar o preço público de um plano.
//
// Só o Supabase tem entrada nesta story:
//   - supabase.pro = US$ 25/mês (preço público confirmado + confirmação empírica do campo
//     `plan` na Story 78-7). Planos sem preço público fixo conhecido (free/team/enterprise/
//     platform) NÃO entram — não inventar (Article IV).
//   - vercel.pro NÃO entra nesta story: só seria adicionado se a T-Vercel-Dedup (AC10)
//     confirmasse que a mensalidade Pro NÃO está embutida no cost_usd já coletado pela 78-5,
//     com o preço confirmado na doc oficial da Vercel no momento — o default seguro (seed com
//     excluded_from_subscription_total=true) mantém a linha Vercel fora do total até então.
//   - claude_team NÃO tem tabela de preço: sem API nenhuma, valor é 100% manual (78-15).

export interface SubscriptionPrice {
  currency: "USD"
  amount: number
}

export const SUBSCRIPTION_PRICE_TABLE: Record<
  string,
  Partial<Record<string, SubscriptionPrice>>
> = {
  supabase: {
    pro: { currency: "USD", amount: 25 },
    // team/enterprise/platform/free: sem preço público fixo conhecido — não inventar.
  },
  // vercel: { pro: { currency: "USD", amount: <confirmar na doc oficial> } }  // só se AC10 = overlap descartado
}

/** Retorna o preço conhecido de um (serviço, plano), ou null se não houver na tabela. */
export function lookupSubscriptionPrice(
  serviceSlug: string,
  plan: string | null | undefined
): SubscriptionPrice | null {
  if (!plan) return null
  return SUBSCRIPTION_PRICE_TABLE[serviceSlug]?.[plan] ?? null
}
