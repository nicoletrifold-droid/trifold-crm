import { ExternalLink, Megaphone } from "lucide-react"
import { type ServiceSummary, formatMoneyList } from "./shared"

/**
 * Seção SEPARADA de Meta Ads (Story 78-9 — AC6). Só é renderizada quando a API retorna
 * um serviço meta_ads (enabled=true). Hoje meta_ads.enabled=false (seed 78-1), então a API
 * retorna meta_ads=null e esta seção não aparece. É budget de mídia, NÃO conta a pagar —
 * por isso fica FORA do total consolidado (CON-8).
 */
export function MetaAdsSection({ metaAds }: { metaAds: ServiceSummary }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-800 dark:bg-stone-900/40">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Megaphone className="h-4 w-4 text-orange-600" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Budget de Mídia — Meta Ads
        </h2>
        <a
          href={metaAds.billing_url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[#E8856A] hover:underline"
        >
          Billing na Meta
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <p className="text-xs text-stone-500 dark:text-stone-400">Gasto de mídia do mês</p>
        <p className="mt-0.5 text-lg font-semibold text-stone-900 dark:text-stone-100">
          {formatMoneyList(metaAds.month_costs)}
        </p>
        <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
          Budget de mídia — não entra no total consolidado de infraestrutura.
        </p>
      </div>
    </div>
  )
}
