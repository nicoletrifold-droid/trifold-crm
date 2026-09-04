/**
 * Story 900-60 · AC1/AC2/AC4/AC5/AC7/AC10 — pausar e retomar o processamento de uma empresa.
 *
 * É a PRIMEIRA mutação nova do console fora de integrações. Todo o resto da Fase 1 é leitura.
 *
 * ## A org NUNCA vem do corpo
 *
 * Ela é o parâmetro de rota `[id]`, validado contra `organizations` antes de qualquer efeito —
 * mesmo desenho de `resend-admin-invite/route.ts` e `integracoes/route.ts`. Aceitar um id do
 * corpo deixaria pausar uma empresa clicando no menu de outra.
 *
 * ## Por que o efeito é uma RPC, e não um `.update()` aqui
 *
 * Três razões, todas medidas (a longa está no cabeçalho da migration `251`):
 *   1. `orgs_ativas_depois` (AC10) só é verdade lido na MESMA transação do `UPDATE`.
 *   2. A contagem exata não é alcançável daqui: `platformQuery()` recusa `(` desde a `900-42a`,
 *      agregado é `HTTP 400 PGRST123` neste Supabase, e contar em memória sofreria o corte de
 *      1000 linhas do PostgREST.
 *   3. `app/api/platform/**` não pode conter `.from(<literal>)` — é a segunda rede da `900-22b`
 *      (`platform-query-scan.ts`), aplicada por teste.
 *
 * **`createAdminClient()` aqui é deliberado e está na allowlist** (`docs/audits/
 * admin-client-allowlist.json`, seção `plataforma`): a RPC é `GRANT EXECUTE ... TO service_role`
 * e a autorização acontece nesta rota (`getPlatformAdmin()`), não no SQL — mesmo modelo de
 * confiança de `integracoes/route.ts`. A régua é `scripts/admin-client-allowlist.test.ts`.
 *
 * ## O que este botão faz de verdade, medido (é o que o diálogo do cliente precisa dizer)
 *
 * `organizations.is_active` tem TRÊS leitores, não dois:
 *   • `forEachActiveOrg()` — os crons pulam a empresa pausada.
 *   • `resolveSoleOrg()` (`lib/tenancy/webhook-org.ts:244-248`) — lê a coluna como CONTAGEM de
 *     empresas ativas e só resolve quando há EXATAMENTE UMA. Pausar a empresa A muda o
 *     denominador que roteia os leads de landing-page e Telegram da empresa B.
 *   • O gate de sessão (`lib/supabase/middleware.ts`, `lib/api-auth.ts`) **não** lê esta coluna:
 *     ele lê `users.is_active`, outra tabela e outra granularidade. **Pausar não impede login.**
 *
 * É por isso que o rótulo é "Pausar", não "Desativar" (AC8), e por que a trilha registra
 * `orgs_ativas_depois` (AC10) — o número que explica, meses depois, por que o roteamento mudou.
 */

import { NextResponse } from "next/server"
import { getPlatformAdmin } from "@web/lib/tenancy/platform-guard"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import { createAdminClient } from "@web/lib/supabase/admin"

/** O que a migration `251` levanta, e o status HTTP que cada código merece. */
const STATUS_POR_CODIGO_SQL: Record<string, number> = {
  // Motivo vazio. A rota já barra antes; a função é a segunda rede, para quando a RPC for
  // chamada por outra superfície.
  P0021: 400,
  // A org sumiu entre a leitura e a escrita. É corrida real, não erro do operador.
  P0022: 404,
  // `UPDATE` afetou ≠ 1 linha — o banco discorda de si mesmo, e isso não é culpa do cliente.
  P0023: 500,
}

/**
 * A RPC **ainda não existe no banco** — o sintoma exato de deploy fora de ordem (código antes da
 * migration `251`). Achado do gate, QA-900-60-2: sem isto o desfecho cai no `?? 500` genérico, e o
 * operador lê "não foi possível concluir" numa tela que parece pronta, sem nada que aponte para a
 * causa.
 *
 * `PGRST202` é o PostgREST não achando a função no schema cache; `42883` é o `undefined_function`
 * do próprio Postgres. `503` porque o pedido volta a funcionar sozinho quando a migration subir:
 * não é erro do cliente (4xx) nem defeito do código (500).
 *
 * ⚠️ Isto é uma REDE, não a solução: a ordem certa continua sendo `251` primeiro, deploy depois.
 */
const CODIGOS_DE_FUNCAO_NAO_PUBLICADA = new Set(["PGRST202", "42883"])
const MENSAGEM_DE_FUNCAO_NAO_PUBLICADA =
  "A função de banco desta tela ainda não foi publicada (migration 251). Nada foi alterado."

interface CorpoDaPausa {
  isActive?: unknown
  reason?: unknown
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const platformAdmin = await getPlatformAdmin()
  if (!platformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })

  const { id: orgId } = await params

  const corpo = (await req.json().catch(() => ({}))) as CorpoDaPausa

  // `typeof === "boolean"` e não `Boolean(...)`: um `isActive` ausente viraria `false` na
  // coerção, e a rota pausaria uma empresa por causa de um corpo malformado.
  if (typeof corpo.isActive !== "boolean") {
    return NextResponse.json(
      { error: "IS_ACTIVE_INVALIDO", message: "`isActive` precisa ser true ou false." },
      { status: 400 },
    )
  }
  const isActive = corpo.isActive

  // AC1 — obrigatório e não-vazio após `trim()`. Sem mínimo de caracteres inventado: nenhuma
  // fonte especifica um, e um número escolhido aqui seria regra de negócio nascida no código.
  const reason = typeof corpo.reason === "string" ? corpo.reason.trim() : ""
  if (!reason) {
    return NextResponse.json(
      { error: "MOTIVO_OBRIGATORIO", message: "Escreva o motivo — ele fica na trilha." },
      { status: 400 },
    )
  }

  const resposta = await platformQuery("organizations", "id, name")
    .eq("id", orgId)
    .maybeSingle()

  // ⚠️ Os dois modos de "não veio linha" são DIFERENTES e não podem virar o mesmo 404.
  // `error != null` é leitura que NÃO ACONTECEU: responder 404 ali diria "essa empresa não
  // existe" sobre uma empresa que existe, e o operador iria procurá-la, não a rede. Fail-closed
  // e explícito. Só `data == null` com `error == null` é ausência de verdade.
  if (resposta.error) {
    return NextResponse.json(
      {
        error: "LEITURA_FALHOU",
        message: "Não consegui confirmar a empresa no banco. Nada foi alterado.",
      },
      { status: 503 },
    )
  }
  if (!resposta.data) {
    return NextResponse.json({ error: "ORG_NOT_FOUND" }, { status: 404 })
  }

  const org = resposta.data as unknown as { id: string; name: string }

  const db = createAdminClient()
  const { data, error } = await db.rpc("organization_set_active_as_platform", {
    p_org_id: orgId,
    p_is_active: isActive,
    p_reason: reason,
    p_actor_user_id: platformAdmin.userId,
  })

  // Falha de escrita NÃO pode virar "salvo". A UI só atualiza sobre um 200, e o 200 só existe
  // quando o `UPDATE` e a linha de trilha aconteceram na mesma transação.
  if (error) {
    const codigo = (error as { code?: string }).code ?? ""
    const naoPublicada = CODIGOS_DE_FUNCAO_NAO_PUBLICADA.has(codigo)
    return NextResponse.json(
      {
        error: codigo || "ESCRITA_FALHOU",
        // A mensagem crua do PostgREST para função ausente fala de "schema cache" — verdadeira e
        // inútil para quem está olhando a tela. As outras falhas continuam devolvendo a do banco.
        message: naoPublicada
          ? MENSAGEM_DE_FUNCAO_NAO_PUBLICADA
          : (error.message ?? "Não foi possível concluir. Nada foi alterado."),
      },
      { status: naoPublicada ? 503 : (STATUS_POR_CODIGO_SQL[codigo] ?? 500) },
    )
  }

  // O retorno da RPC é a verdade do que aconteceu — não repetimos aqui o que pedimos.
  const resultado = (data ?? {}) as {
    is_active?: boolean
    is_active_anterior?: boolean
    orgs_ativas_depois?: number
    action?: string
  }

  return NextResponse.json({
    orgId: org.id,
    name: org.name,
    isActive: resultado.is_active ?? isActive,
    isActiveAnterior: resultado.is_active_anterior,
    orgsAtivasDepois: resultado.orgs_ativas_depois,
    action: resultado.action,
  })
}
