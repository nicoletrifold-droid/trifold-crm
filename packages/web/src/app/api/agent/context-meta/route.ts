import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { fetchProvenance, type ProvenanceStatus } from "@web/lib/agent/context-builder"

// ─── GET /api/agent/context-meta ──────────────────────────────────────────────
// Retorna a proveniência/staleness dos dados Meta Ads (Story 76-3) para a org do
// usuário autenticado, consumindo o mesmo helper da Story 76-1 (sem duplicar a
// lógica de staleness/erro). Acesso autenticado via createClient() com a sessão do
// usuário (requireAuth) — sem service_role, isolamento multi-tenant por org_id (AC7).
//
// Fail-safe (AC1): qualquer erro de query/rede → estado "sem aviso". É melhor
// silenciar o banner do que exibir um aviso falso de defasagem.
const FAIL_SAFE: ProvenanceStatus = {
  isStale: false,
  isError: false,
  lastSyncAt: null,
  errorMessage: null,
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  try {
    const status = await fetchProvenance(supabase, appUser.org_id)
    return NextResponse.json(status)
  } catch (err) {
    console.error("[76-3] erro ao computar proveniência:", err)
    return NextResponse.json(FAIL_SAFE)
  }
}
