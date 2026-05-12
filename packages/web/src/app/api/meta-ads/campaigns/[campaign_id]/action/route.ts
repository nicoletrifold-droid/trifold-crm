import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRole } from '@web/lib/api-auth'
import { metaFetch, MetaOAuthException, MetaPermissionError } from '@trifold/shared'

type ActionType = 'pause' | 'resume' | 'set_budget'

interface ActionBody {
  action: ActionType
  value?: number
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaign_id: string }> },
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ['admin'])
  if (forbidden) return forbidden

  const { campaign_id: metaCampaignId } = await params

  // Parse and validate body
  let body: ActionBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const { action, value } = body

  const validActions: ActionType[] = ['pause', 'resume', 'set_budget']
  if (!action || !validActions.includes(action)) {
    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 })
  }

  if (action === 'set_budget') {
    if (value === undefined || value === null || value < 100) {
      return NextResponse.json(
        { error: 'INVALID_BUDGET', message: 'Budget mínimo: R$1,00 (100 centavos)' },
        { status: 400 },
      )
    }
  }

  // Fetch campaign (anti-IDOR: must belong to user's org)
  const { data: campaign } = await supabase
    .from('meta_campaigns')
    .select('id, meta_campaign_id, name, status, daily_budget, org_id')
    .eq('meta_campaign_id', metaCampaignId)
    .eq('org_id', appUser.org_id)
    .maybeSingle()

  if (!campaign) {
    return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 })
  }

  // Fetch active Meta access token (limit(1) to handle orgs with multiple accounts)
  const { data: accounts } = await supabase
    .from('meta_ad_accounts')
    .select('access_token')
    .eq('org_id', appUser.org_id)
    .eq('status', 'active')
    .limit(1)
  const account = accounts?.[0] ?? null

  if (!account?.access_token) {
    return NextResponse.json(
      { error: 'API_ERROR', message: 'No active Meta account configured' },
      { status: 502 },
    )
  }

  // Map action to Meta API body
  const metaBody: Record<string, unknown> =
    action === 'pause'
      ? { status: 'PAUSED' }
      : action === 'resume'
        ? { status: 'ACTIVE' }
        : { daily_budget: value }

  const oldValue =
    action === 'pause' || action === 'resume'
      ? campaign.status
      : campaign.daily_budget

  const newValue =
    action === 'pause'
      ? 'PAUSED'
      : action === 'resume'
        ? 'ACTIVE'
        : value

  const startedAt = new Date().toISOString()

  // Call Meta Graph API
  let metaResult: { success?: boolean }
  try {
    metaResult = await metaFetch<{ success?: boolean }>(
      campaign.meta_campaign_id,
      account.access_token,
      { method: 'POST', body: metaBody },
    )
  } catch (err) {
    if (err instanceof MetaOAuthException) {
      return NextResponse.json(
        { error: 'API_ERROR', code: 'OAUTH_EXCEPTION', message: (err as Error).message },
        { status: 502 },
      )
    }
    if (err instanceof MetaPermissionError) {
      return NextResponse.json(
        { error: 'API_ERROR', code: 'PERMISSION_DENIED', message: (err as Error).message },
        { status: 502 },
      )
    }
    return NextResponse.json(
      { error: 'API_ERROR', message: String(err) },
      { status: 502 },
    )
  }

  if (metaResult.success === false) {
    return NextResponse.json(
      { error: 'API_ERROR', message: 'Meta API returned success: false' },
      { status: 502 },
    )
  }

  const finishedAt = new Date().toISOString()

  // Audit log in meta_sync_log
  const { error: logError } = await supabase.from('meta_sync_log').insert({
    org_id: appUser.org_id,
    sync_type: 'campaign_action',
    status: 'success',
    started_at: startedAt,
    finished_at: finishedAt,
    records_synced: 1,
    executed_by: appUser.id,
    details: {
      action,
      campaign_id: campaign.meta_campaign_id,
      campaign_name: campaign.name,
      old_value: oldValue,
      new_value: newValue,
    },
  })
  if (logError) {
    console.error('[CAMPAIGN_ACTION] Audit log failed', {
      logError,
      action,
      campaign_id: campaign.meta_campaign_id,
      executed_by: appUser.id,
    })
    // NÃO retornar erro ao client — a ação Meta já foi executada com sucesso.
    // Apenas registrar o gap de audit para investigação posterior.
  } else {
    console.log('[CAMPAIGN_ACTION] Success', {
      action,
      campaign_id: campaign.meta_campaign_id,
      campaign_name: campaign.name,
      executed_by: appUser.id,
      old_value: oldValue,
      new_value: newValue,
    })
  }

  // Build response
  const executedAt = finishedAt
  if (action === 'pause') {
    return NextResponse.json({
      success: true,
      action,
      campaign_id: campaign.meta_campaign_id,
      new_status: 'PAUSED',
      executed_at: executedAt,
    })
  }
  if (action === 'resume') {
    return NextResponse.json({
      success: true,
      action,
      campaign_id: campaign.meta_campaign_id,
      new_status: 'ACTIVE',
      executed_at: executedAt,
    })
  }
  return NextResponse.json({
    success: true,
    action,
    campaign_id: campaign.meta_campaign_id,
    new_budget: value,
    executed_at: executedAt,
  })
}
