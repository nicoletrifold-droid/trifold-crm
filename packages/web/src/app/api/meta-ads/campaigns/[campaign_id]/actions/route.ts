import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRole } from '@web/lib/api-auth'

interface ActionLogRow {
  started_at: string
  details: {
    action?: string
    campaign_id?: string
    campaign_name?: string
    old_value?: unknown
    new_value?: unknown
  } | null
  executed_by: string | null
}

const ACTION_LABELS: Record<string, string> = {
  pause: 'Pausada',
  resume: 'Retomada',
  set_budget: 'Budget ajustado',
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ campaign_id: string }> },
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ['admin'])
  if (forbidden) return forbidden

  const { campaign_id: metaCampaignId } = await params

  // Verify campaign belongs to user's org (anti-IDOR)
  const { data: campaign } = await supabase
    .from('meta_campaigns')
    .select('meta_campaign_id')
    .eq('meta_campaign_id', metaCampaignId)
    .eq('org_id', appUser.org_id)
    .maybeSingle()

  if (!campaign) {
    return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 })
  }

  const { data: rows } = await supabase
    .from('meta_sync_log')
    .select('started_at, details, executed_by')
    .eq('org_id', appUser.org_id)
    .eq('sync_type', 'campaign_action')
    .filter('details->>campaign_id', 'eq', metaCampaignId)
    .order('started_at', { ascending: false })
    .limit(5)

  if (!rows || rows.length === 0) {
    return NextResponse.json({ actions: [] })
  }

  // Resolve user names from public.users
  const executedByIds = [...new Set(rows.map((r: ActionLogRow) => r.executed_by).filter(Boolean))] as string[]
  const nameMap: Record<string, string> = {}

  if (executedByIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .in('id', executedByIds)

    if (users) {
      for (const u of users) {
        nameMap[u.id] = u.name
      }
    }
  }

  const actions = rows.map((row: ActionLogRow) => ({
    executed_at: row.started_at,
    action: ACTION_LABELS[row.details?.action ?? ''] ?? row.details?.action ?? '—',
    campaign_name: row.details?.campaign_name ?? null,
    executed_by_name: row.executed_by ? (nameMap[row.executed_by] ?? 'Usuário desconhecido') : 'Sistema',
  }))

  return NextResponse.json({ actions })
}
