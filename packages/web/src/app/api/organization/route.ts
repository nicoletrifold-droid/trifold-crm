import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"

/**
 * GET /api/organization
 * Returns organization data for the current user's org.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, slug, settings, created_at")
    .eq("id", appUser.org_id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: org })
}

/**
 * Story 900-62 · AC14 — as duas chaves de `settings` que esta rota NÃO pode escrever.
 *
 * ## O que foi medido, e por que é uma denylist e não uma allowlist
 *
 * O `PATCH` abaixo faz `updates.settings = { ...currentSettings, ...body.settings }` — spread de
 * objeto inteiro, com chaves ARBITRÁRIAS vindas do corpo. Um admin do TENANT (capability
 * `configuracoes.empresa_editar`) portanto conseguia escrever `settings.fiscal.cnpj` com qualquer
 * string: sem passar por `isValidCnpj`, sem gravar linha em `platform_audit_log`, e sem a trava
 * otimista da `900-62` — que é read-modify-write, então uma escrita daqui reverte em SILÊNCIO o
 * que o platform admin acabou de gravar pela outra porta. Uma trava só protege contra escritores
 * que participam do protocolo.
 *
 * Denylist de DUAS chaves, e não allowlist geral, de propósito: uma allowlist mudaria o
 * comportamento de `city`/`state`/`materiais_url`/`relatorio_diario_destinatarios`, que são
 * escritas legítimas do cliente hoje (`dashboard/configuracoes/empresa/page.tsx:134`,
 * `.../materiais/page.tsx:71`, `.../relatorio-diario/page.tsx:120`) e estão fora do escopo da
 * `900-62`. O controle positivo em `city` está no teste ao lado, e existe justamente para provar
 * que a recusa não quebrou o caminho que já funcionava.
 *
 * ⚠️ **DÍVIDA DECLARADA, não fechada por esta story:** os três server actions citados acima
 * continuam fazendo o mesmo spread direto na tabela, sem passar por esta rota. Eles não podem
 * gravar `contato`/`fiscal` hoje porque nenhum formulário deles tem esses campos — mas a
 * denylist aqui é da ROTA, não da tabela. Fechar por constraint/trigger no banco é story própria.
 */
const CHAVES_RESERVADAS_DA_PLATAFORMA = ["contato", "fiscal"] as const

/**
 * PATCH /api/organization
 * Updates org name and settings. Admin only.
 *
 * Body: { name?: string, settings?: Record<string, unknown> }
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "configuracoes.empresa_editar")
  if (roleError) return roleError

  const body = await request.json()

  // AC14 — a recusa vem ANTES de qualquer leitura ou escrita. Um `400` depois do `select` já
  // seria inofensivo, mas a ordem aqui é o que torna óbvio, para quem ler depois, que nenhuma
  // parte do corpo recusado chega a tocar o banco.
  if (body.settings !== null && typeof body.settings === "object") {
    const reservadas = CHAVES_RESERVADAS_DA_PLATAFORMA.filter((chave) =>
      Object.prototype.hasOwnProperty.call(body.settings, chave),
    )
    if (reservadas.length > 0) {
      return NextResponse.json(
        {
          error: "CHAVE_RESERVADA_DA_PLATAFORMA",
          message:
            `As chaves ${reservadas.join(", ")} de settings são mantidas pelo console da ` +
            "plataforma (contato responsável e dados fiscais) e não podem ser gravadas por aqui.",
        },
        { status: 400 },
      )
    }
  }

  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) {
    updates.name = body.name
  }

  if (body.settings !== undefined) {
    // Merge with existing settings
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", appUser.org_id)
      .single()

    const currentSettings = (org?.settings ?? {}) as Record<string, unknown>
    updates.settings = { ...currentSettings, ...body.settings }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from("organizations")
    .update(updates)
    .eq("id", appUser.org_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}
