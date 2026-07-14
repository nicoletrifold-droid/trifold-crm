import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { enrichSupabase } from "@web/lib/billing/subscriptions/enrich-supabase"
import { enrichVercel } from "@web/lib/billing/subscriptions/enrich-vercel"
import type { EnrichmentResult } from "@web/lib/billing/subscriptions/types"

// Story 78-14 — Cron de enriquecimento das ASSINATURAS FIXAS (AC11). Roda 1×/dia (10:45 UTC,
// vercel.json), enriquecendo plano/assentos das linhas is_fixed_subscription=true de Supabase e
// Vercel a partir das APIs oficiais.
//
// BEST-EFFORT POR SERVIÇO (diferente do padrão single-provider "503 sem credencial" dos coletores
// 78-3..78-7): este cron toca 2 serviços INDEPENDENTES. Falha/ausência de credencial de UM não
// bloqueia o outro — Promise.allSettled + resposta 200 com o resumo por serviço. O único gate de
// 503 é o próprio CRON_SECRET (auth do cron), idêntico ao padrão da 78-3/78-7/78-11.
//
// Claude Team: sem enricher (sem API pública — plano/assentos/valor 100% manuais, Story 78-15).
//
// O enriquecedor NUNCA sobrescreve edição manual (AC9) — a lógica vive em enrich-*.ts.

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  // Best-effort por serviço: um erro/skip num serviço não impede o outro.
  const settled = await Promise.allSettled([enrichSupabase(admin), enrichVercel(admin)])

  const results: EnrichmentResult[] = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value
    // Salvaguarda: os enrichers já capturam seus próprios erros e retornam status 'error';
    // este ramo só é atingido por uma exceção inesperada fora do try/catch interno.
    const slug = i === 0 ? "supabase" : "vercel"
    return {
      serviceSlug: slug,
      status: "error" as const,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
    }
  })

  const summary = {
    ok: true,
    enriched: results.filter((r) => r.status === "ok").map((r) => r.serviceSlug),
    skipped: results
      .filter((r) => r.status === "skipped")
      .map((r) => ({ service: r.serviceSlug, reason: (r as { reason: string }).reason })),
    errors: results
      .filter((r) => r.status === "error")
      .map((r) => ({ service: r.serviceSlug, error: (r as { error: string }).error })),
    results,
  }

  console.log("[billing-subscription-enrich] concluído:", JSON.stringify(summary))
  return NextResponse.json(summary)
}
