import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { reconcileDistratosForObra } from "@web/lib/integrations/sienge/sync"
import { propagateDistratosToLeads } from "@web/lib/distrato/is-contato-distratado"
import { createAdminClient } from "@web/lib/supabase/admin"

/**
 * Story 20.11 — Cron automático de sync Sienge + propagação de distrato p/ leads.
 *
 * Varre TODAS as obras com `sienge_enterprise_id IS NOT NULL` (todas as orgs),
 * reconcilia o status de distrato em `clientes_obras_vinculos` via
 * `reconcileDistratosForObra` (Story 20-9) e depois propaga a flag `leads.distrato`
 * por org via `propagateDistratosToLeads` (Story 20-10).
 *
 * - GET  → acionado pelo Vercel Cron (auth via CRON_SECRET), schedule `0 3 * * *`.
 * - POST → remediação one-shot admin (auth via requireAuth + requireRole), executado
 *          pelo @devops após deploy e antes da Story 20-12.
 *
 * A reconciliação chama a API Sienge (paginada + rate-limited internamente), por isso
 * `maxDuration = 300` (mesmo padrão de `reconcile-distratos/route.ts`).
 */
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const ADMIN_ROLES = ["admin", "supervisor"]

const LOG_PREFIX = "[DISTRATO-SYNC]"

/** Relatório consolidado do sync (AC 1.4). */
interface SyncReport {
  /** Total de obras com `sienge_enterprise_id` processadas. */
  obras: number
  /** Total de vínculos reconciliados (soma de todas as obras). */
  reconciled: number
  /** Total de vínculos que ficaram com `distrato = true`. */
  distratados: number
  /** Leads que ficaram com `distrato = true` (soma de todas as orgs). */
  leadsUpdated: number
  /** Leads que voltaram a `distrato = false` (soma de todas as orgs). */
  leadsCleared: number
  /** Erros por obra (não-bloqueantes; o loop continua nas demais obras). */
  errors: string[]
}

/**
 * Núcleo compartilhado entre GET (cron) e POST (remediação admin).
 *
 * Erro por obra é isolado: uma obra que falha na API Sienge é registrada em
 * `errors[]` e o loop continua para as próximas (AC 2). A propagação por org só
 * roda depois de todas as obras da org terem sido reconciliadas.
 */
async function runSync(): Promise<SyncReport> {
  const admin = createAdminClient()

  const { data: obras, error } = await admin
    .from("obras")
    .select("id, org_id, sienge_enterprise_id")
    .not("sienge_enterprise_id", "is", null)

  if (error) {
    throw new Error(`Falha ao carregar obras: ${error.message}`)
  }

  // Agrupa obras por org para propagar uma vez por org depois de reconciliar todas.
  const obrasByOrg = new Map<string, string[]>()
  for (const obra of (obras ?? []) as {
    id: string
    org_id: string
    sienge_enterprise_id: number | null
  }[]) {
    const list = obrasByOrg.get(obra.org_id) ?? []
    list.push(obra.id)
    obrasByOrg.set(obra.org_id, list)
  }

  const report: SyncReport = {
    obras: 0,
    reconciled: 0,
    distratados: 0,
    leadsUpdated: 0,
    leadsCleared: 0,
    errors: [],
  }

  for (const [orgId, obraIds] of obrasByOrg) {
    for (const obraId of obraIds) {
      report.obras += 1
      try {
        const result = await reconcileDistratosForObra(obraId)
        report.reconciled += result.reconciled
        report.distratados += result.distratados
        if (result.errors.length > 0) {
          report.errors.push(...result.errors.map((e) => `obra:${obraId}: ${e}`))
        }
        console.log(
          `${LOG_PREFIX} obra ${obraId}: reconciled=${result.reconciled} distratados=${result.distratados} errors=${result.errors.length}`
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : "erro desconhecido"
        console.error(`${LOG_PREFIX} obra ${obraId} FALHOU:`, msg)
        report.errors.push(`obra:${obraId}: ${msg}`)
        // Isola o erro: continua para a próxima obra (AC 2).
      }
    }

    // Após reconciliar TODAS as obras da org, propaga o estado de distrato p/ leads.
    try {
      const prop = await propagateDistratosToLeads(orgId)
      report.leadsUpdated += prop.updated
      report.leadsCleared += prop.cleared
      console.log(
        `${LOG_PREFIX} org ${orgId}: leadsUpdated=${prop.updated} leadsCleared=${prop.cleared}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido"
      console.error(`${LOG_PREFIX} org ${orgId} propagate FALHOU:`, msg)
      report.errors.push(`org:${orgId}: propagate: ${msg}`)
      // Isola o erro de propagação: continua para a próxima org.
    }
  }

  console.log(
    `${LOG_PREFIX} concluído: obras=${report.obras} reconciled=${report.reconciled} distratados=${report.distratados} leadsUpdated=${report.leadsUpdated} leadsCleared=${report.leadsCleared} errors=${report.errors.length}`
  )

  return report
}

/**
 * GET — acionado pelo Vercel Cron. Auth fail-closed via CRON_SECRET (AC 3).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!CRON_SECRET) {
    console.error(`${LOG_PREFIX} CRON_SECRET not configured — endpoint blocked`)
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const report = await runSync()
    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno no sync"
    console.error(`${LOG_PREFIX} GET falhou:`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST — remediação one-shot admin (AC 6). Executa o mesmo fluxo do GET, mas com
 * autenticação de sessão (admin/supervisor) em vez de CRON_SECRET.
 */
export async function POST(): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const roleError = requireRole(appUser, ADMIN_ROLES)
  if (roleError) return roleError

  try {
    const report = await runSync()
    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno na remediação"
    console.error(`${LOG_PREFIX} POST falhou:`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
