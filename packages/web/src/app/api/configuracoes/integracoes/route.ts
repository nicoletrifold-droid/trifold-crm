/**
 * Story 900-51 · AC5/AC9 — escrita de integração pela superfície do CLIENTE (`/dashboard`).
 *
 * ## O que esta rota deliberadamente NÃO faz
 *
 * 1. **Não usa `createAdminClient()`.** O client é o RLS-scoped de `lib/supabase/server`, e as
 *    RPCs chamadas são as `_as_org`, que não aceitam `org_id` nem `actor_user_id`: a org vem de
 *    `user_org_id()` e o ator de `auth.uid()`, dentro do banco. Não há parâmetro para o cliente
 *    mentir. Isto não é promessa — `scripts/admin-client-allowlist.test.ts` roda ESLint por AST
 *    dentro do `pnpm test` e reprovaria um `createAdminClient()` aqui, porque este caminho não
 *    está na allowlist (AC8).
 * 2. **Não importa nada de `lib/tenancy/platform-*`** (AC9). A varredura de
 *    `app/api/configuracoes/**` existe para que a ponte entre as duas superfícies nunca nasça.
 * 3. **Não serializa `technicalDetail`** (R9). O erro bruto do provider não é escondido no
 *    render — ele não entra no JSON. Se o payload chega ao navegador, o dado está lá,
 *    independentemente do que a UI renderiza; por isso a decisão é de servidor, aqui.
 *
 * ## O que esta rota PASSOU a fazer (QA-900-51-1)
 *
 * Ela dispara os alertas da AC11. Antes não disparava, e essa era a falha inteira: este é o
 * caminho por onde o `org_admin` grava `page_id` — exatamente o que o dono do produto abriu ao
 * recusar a prevenção em C1 —, e o único call site do disparo era a rota `/platform`, onde toda
 * escrita é `platform_admin` por construção. A detecção que compensava o risco aceito não tinha
 * caminho alcançável.
 *
 * A leitura da trilha usa o client RLS-scoped: a policy `platform_audit_log_select_org` já a
 * escopa na própria org do requisitante, e a capability exigida acima é a mesma da policy. Não há
 * `createAdminClient()` aqui, e continua não havendo.
 */

import { NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { gravarIntegracao, type PortaDeEscrita } from "@web/lib/integrations/painel/escrita"
import { ehProviderGravavel } from "@web/lib/integrations/painel/providers"
import {
  alertarAposEscritaDeIntegracao,
  LINHAS_DA_JANELA,
} from "@web/lib/integrations/painel/alertas-page-id"

interface CorpoDeEscrita {
  provider?: unknown
  secret?: unknown
  config?: unknown
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const negado = await requireCapability(appUser, "configuracoes.integracoes_gerenciar")
  if (negado) return negado

  const corpo = (await req.json().catch(() => ({}))) as CorpoDeEscrita
  const provider = String(corpo.provider ?? "")
  const segredo = typeof corpo.secret === "string" ? corpo.secret : ""
  const config = (corpo.config ?? {}) as Record<string, unknown>

  if (!ehProviderGravavel(provider)) {
    return NextResponse.json({ error: "PROVIDER_INVALIDO" }, { status: 400 })
  }

  const { data: linha } = await supabase
    .from("org_integrations")
    .select("status")
    .eq("org_id", appUser.org_id)
    .eq("provider", provider)
    .maybeSingle()

  const porta: PortaDeEscrita = {
    writeSecret: (p, s, c) =>
      supabase.rpc("org_integration_write_secret_as_org", {
        p_provider: p,
        p_secret: s,
        p_config: c,
      }),
    markConnected: (p) => supabase.rpc("org_integration_mark_connected_as_org", { p_provider: p }),
    markError: (p, codigo) =>
      supabase.rpc("org_integration_mark_error_as_org", { p_provider: p, p_codigo: codigo }),
  }

  const resultado = await gravarIntegracao(
    porta,
    { provider, segredo, config, statusAtual: (linha?.status as string | null) ?? null },
    // R9 — o `false` aqui é a régua inteira: `montarRespostaDeErro` não põe a chave no objeto.
    { incluirDetalheTecnico: false },
  )

  // AC11 — mesmo ponto de disparo da rota `/platform`; muda só o transporte da leitura.
  if (resultado.ok) {
    await alertarAposEscritaDeIntegracao(provider, () =>
      supabase
        .from("platform_audit_log")
        .select("id, actor_type, org_id, action, metadata")
        .eq("org_id", appUser.org_id)
        .eq("target_table", "org_integrations")
        .eq("metadata->>provider", provider)
        .order("created_at", { ascending: false })
        .limit(LINHAS_DA_JANELA),
    )
  }

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 })
}
