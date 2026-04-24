import { createClient } from '@web/lib/supabase/server'
import { getServerUser } from '@web/lib/auth'
import { MetaAdsIntegrationCard } from './meta-ads-integration-card'

export const metadata = { title: 'Meta Ads — Integrações' }

export default async function MetaAdsPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const { data: account } = await supabase
    .from('meta_ad_accounts')
    .select('meta_account_id, access_token, status, last_synced_at')
    .eq('org_id', user.orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const initialData = {
    has_token: !!account?.access_token,
    last_4: account?.access_token ? account.access_token.slice(-4) : null,
    ad_account_id: account?.meta_account_id ?? null,
    status: account?.status ?? null,
    last_synced_at: account?.last_synced_at ?? null,
  }

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Meta Ads</h1>
        <p className="mt-1 text-sm text-gray-500">
          Conecte sua conta de anúncios para sincronizar campanhas e leads automaticamente.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Meta Ads</h2>
            <p className="text-sm text-gray-500">Facebook & Instagram Ads</p>
          </div>
        </div>

        <MetaAdsIntegrationCard initialData={initialData} />
      </div>
    </div>
  )
}
