import type { SupabaseClient } from "@supabase/supabase-js"
import { sendEmail } from "@web/lib/email"

/**
 * Story 75-194 — notificação de pendência de aprovação (obras) SEM flood.
 *
 * Modelo híbrido (decisão Marcos 2026-07-21):
 * - JANELA DE SILÊNCIO: o 1º upload pendente da obra avisa na hora; os
 *   seguintes dentro de SILENCE_WINDOW_HOURS ficam mudos — o e-mail é um
 *   "sino" que aponta pra aba de aprovações, onde tudo já aparece.
 * - DIGEST DIÁRIO (cron aprovacoes-digest): backlog ainda pendente é cobrado
 *   uma vez por dia, num único e-mail por aprovador.
 */

export const SILENCE_WINDOW_HOURS = 4

/**
 * Story 75-210 — aprovadores que devem receber e-mail de aprovação: admin e
 * supervisor ATIVOS que não desligaram a preferência em Configurações
 * (users.notif_obra_aprovacao_email). Fonte única para os três disparos
 * (imediato, digest diário e lembrete 48h) — o e-mail é opt-out por usuário;
 * a aba Aprovações continua visível para todos os gestores.
 */
export async function getAprovadoresParaEmail(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ name: string; email: string }[]> {
  const { data, error } = await supabase
    .from("users")
    .select("name, email")
    .eq("org_id", orgId)
    .in("role", ["admin", "supervisor"])
    .eq("is_active", true)
    .eq("notif_obra_aprovacao_email", true)
    .not("email", "is", null)
  if (error) {
    // Falha de query ≠ "todos optaram por sair" — sem este log, os 3 disparos
    // silenciam sem rastro (ex.: migration 191 ausente no banco).
    console.error("[aprovadores-email] query falhou:", error.message)
  }
  return (data as { name: string; email: string }[] | null) ?? []
}

export async function notificarAdminsNovoUpload(params: {
  supabase: SupabaseClient
  orgId: string
  obraName: string
  obraId: string
  tipoUpload: "foto" | "documento"
  nomeEnviador: string
  /** id da aprovação recém-criada (excluída da checagem da janela) */
  aprovacaoId: string
}) {
  // Janela de silêncio: já existe OUTRA pendência desta obra criada dentro da
  // janela? Então alguém acabou de ser avisado — não repete o sino.
  const windowStart = new Date(
    Date.now() - SILENCE_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString()
  const { count } = await params.supabase
    .from("obra_upload_aprovacoes")
    .select("id", { count: "exact", head: true })
    .eq("obra_id", params.obraId)
    .eq("status", "pendente")
    .gte("created_at", windowStart)
    .neq("id", params.aprovacaoId)

  if ((count ?? 0) > 0) return { suppressed: true }

  const admins = await getAprovadoresParaEmail(params.supabase, params.orgId)

  if (!admins.length) return { suppressed: false }

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/obras/${params.obraId}?tab=aprovacoes`

  await Promise.allSettled(
    admins.map((u: { name: string; email: string }) =>
      sendEmail({
        to: u.email,
        subject: `[Trifold] Nova pendência de aprovação — ${params.obraName}`,
        html: `<p>Olá ${u.name},</p>
               <p><strong>${params.nomeEnviador}</strong> enviou ${params.tipoUpload === "foto" ? "uma foto" : "um documento"} para a obra <strong>${params.obraName}</strong> aguardando sua aprovação.</p>
               <p><a href="${link}">Clique aqui para revisar</a></p>
               <p style="color:#888;font-size:12px">Novos envios desta obra nas próximas ${SILENCE_WINDOW_HOURS}h não geram outro aviso — tudo fica na aba de aprovações, e o que restar pendente entra no resumo diário.</p>`,
      })
    )
  )
  return { suppressed: false }
}

// ── Digest diário ────────────────────────────────────────────────────────────

export interface PendenciaRow {
  tipo: string
  created_at: string
  org_id: string
  obra: { id: string; name: string } | null
}

export interface ObraDigest {
  obraId: string
  obraName: string
  documentos: number
  fotos: number
  maisAntiga: string
}

/** Parte pura (testável): agrupa pendências por org → obra com contagens. */
export function groupPendencias(rows: PendenciaRow[]): Map<string, ObraDigest[]> {
  const byOrg = new Map<string, Map<string, ObraDigest>>()
  for (const r of rows) {
    if (!r.obra) continue
    const org = byOrg.get(r.org_id) ?? new Map<string, ObraDigest>()
    const cur =
      org.get(r.obra.id) ??
      ({ obraId: r.obra.id, obraName: r.obra.name, documentos: 0, fotos: 0, maisAntiga: r.created_at } as ObraDigest)
    if (r.tipo === "foto") cur.fotos += 1
    else cur.documentos += 1
    if (r.created_at < cur.maisAntiga) cur.maisAntiga = r.created_at
    org.set(r.obra.id, cur)
    byOrg.set(r.org_id, org)
  }
  return new Map([...byOrg.entries()].map(([orgId, m]) => [orgId, [...m.values()]]))
}

export function renderDigestHtml(userName: string, obras: ObraDigest[]): string {
  const items = obras
    .map((o) => {
      const partes = [
        o.documentos > 0 ? `${o.documentos} documento${o.documentos > 1 ? "s" : ""}` : null,
        o.fotos > 0 ? `${o.fotos} foto${o.fotos > 1 ? "s" : ""}` : null,
      ].filter(Boolean)
      const desde = new Date(o.maisAntiga).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      const link = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/obras/${o.obraId}?tab=aprovacoes`
      return `<li><strong>${o.obraName}</strong> — ${partes.join(" e ")} aguardando aprovação (mais antiga: ${desde}). <a href="${link}">Revisar</a></li>`
    })
    .join("")
  return `<p>Olá ${userName},</p>
          <p>Resumo diário das pendências de aprovação em aberto:</p>
          <ul>${items}</ul>`
}
