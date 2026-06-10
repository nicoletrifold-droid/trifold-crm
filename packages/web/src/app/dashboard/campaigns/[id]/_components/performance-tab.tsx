import { createClient } from "@web/lib/supabase/server"

interface PerformanceTabProps {
  campaignId: string
  totalSent: number
}

export async function PerformanceTab({ campaignId, totalSent }: PerformanceTabProps) {
  const supabase = await createClient()

  const { data: images } = await supabase
    .from("campaign_email_images")
    .select("id, variant_id, image_url, link_url, alt_text, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })

  if (!images || images.length === 0) {
    return (
      <div className="rounded-lg bg-white p-8 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <p className="text-sm text-gray-500 dark:text-stone-400">
          Nenhuma imagem registrada nesta campanha.
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-stone-500">
          Use o editor visual para inserir imagens com links e começar a medir cliques.
        </p>
      </div>
    )
  }

  // Buscar cliques por variant_id via regexp no campo metadata->'click'->>'link'
  const { data: clickEvents } = await supabase
    .from("campaign_events")
    .select("metadata")
    .eq("campaign_id", campaignId)
    .eq("event_type", "clicked")

  // Contar cliques por variant_id no lado JS para evitar query complexa
  const clicksByVariant: Record<string, number> = {}
  for (const event of clickEvents ?? []) {
    const link: string = event.metadata?.click?.link ?? ""
    if (!link) continue
    try {
      const url = new URL(link)
      const variantId = url.searchParams.get("utm_content")
      if (variantId) {
        clicksByVariant[variantId] = (clicksByVariant[variantId] ?? 0) + 1
      }
    } catch {
      // link inválido, ignorar
    }
  }

  const rows = images
    .map((img) => {
      const clicks = clicksByVariant[img.variant_id] ?? 0
      const rate = totalSent > 0 ? (clicks / totalSent) * 100 : 0
      return { ...img, clicks, rate }
    })
    .sort((a, b) => b.rate - a.rate)

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
        <thead className="bg-gray-50 dark:bg-stone-800/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Imagem</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Alt</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Enviados</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Cliques</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-stone-400">Click-rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                {/* URLs são do Supabase Storage (CDN externo) — next/image exige domínio configurado */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.image_url}
                  alt={row.alt_text ?? ""}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded object-cover"
                />
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-stone-300">
                {row.alt_text ?? <span className="text-gray-400 dark:text-stone-500">—</span>}
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-stone-100">
                {totalSent}
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium text-blue-600 dark:text-blue-400">
                {row.clicks}
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-stone-100">
                {row.rate.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
