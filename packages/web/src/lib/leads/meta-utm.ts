import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 75-365 — UTMs de tráfego pago carregam os MACROS do Meta
 * (`utm_campaign={{campaign.id}}`, `utm_content={{ad.id}}`), então o lead chega
 * com "120246224161970741" no lugar de um nome legível. O CRM já tem os nomes
 * (sync do Agente Meta Ads, 75-262): aqui é só a tradução de exibição.
 *
 * IDs do Meta são inteiros longos (15+ dígitos hoje); 10+ dá folga sem engolir
 * um utm_campaign legítimo curto como "2024" ou "black-friday-24".
 */
export function ehIdMeta(valor: string | null | undefined): boolean {
  return typeof valor === "string" && /^\d{10,}$/.test(valor)
}

export interface NomesUtmResolvidos {
  /** Nome da campanha em `meta_campaigns`, se `utm_campaign` for ID conhecido. */
  utm_campaign_nome: string | null
  /** Nome do anúncio em `meta_ads`, se `utm_content` for ID conhecido. */
  utm_content_nome: string | null
}

/**
 * Resolve `utm_campaign`/`utm_content` numéricos para os nomes do sync do Meta.
 * Best-effort: qualquer erro devolve nulls — quem exibe cai no rótulo do source.
 * O sync pode ainda não conhecer um anúncio recém-criado; na próxima renderização
 * depois do sync, o nome aparece sozinho (por isso a resolução é na EXIBIÇÃO,
 * não na captura).
 */
export async function resolverNomesUtm(
  supabase: SupabaseClient,
  orgId: string,
  utm: { utm_campaign?: string | null; utm_content?: string | null }
): Promise<NomesUtmResolvidos> {
  const vazio: NomesUtmResolvidos = { utm_campaign_nome: null, utm_content_nome: null }
  const campaignId = ehIdMeta(utm.utm_campaign) ? (utm.utm_campaign as string) : null
  const adId = ehIdMeta(utm.utm_content) ? (utm.utm_content as string) : null
  if (!campaignId && !adId) return vazio

  try {
    const [campanha, anuncio] = await Promise.all([
      campaignId
        ? supabase
            .from("meta_campaigns")
            .select("name")
            .eq("org_id", orgId)
            .eq("meta_campaign_id", campaignId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      adId
        ? supabase
            .from("meta_ads")
            .select("name")
            .eq("org_id", orgId)
            .eq("meta_ad_id", adId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    return {
      utm_campaign_nome: (campanha.data as { name: string | null } | null)?.name ?? null,
      utm_content_nome: (anuncio.data as { name: string | null } | null)?.name ?? null,
    }
  } catch {
    return vazio
  }
}
