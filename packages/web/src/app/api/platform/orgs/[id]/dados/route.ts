/**
 * Story 900-62 · AC1/AC2/AC3/AC5/AC6 — editar nome, identificador, contato e dados fiscais de uma
 * empresa pelo console de plataforma.
 *
 * ## Por que este arquivo é SEPARADO do `[id]/route.ts` da 900-60
 *
 * Não é organização: é para as duas stories poderem entrar em qualquer ordem, por agentes
 * diferentes, sem conflito de merge. A `900-60` é `PATCH /api/platform/orgs/[id]` com corpo
 * `{ isActive, reason }` e escreve SÓ `organizations.is_active`. Esta é
 * `PATCH /api/platform/orgs/[id]/dados` e nunca toca `is_active`. Um único `PATCH` com corpo
 * discriminado acoplaria duas stories independentes ao mesmo arquivo e à mesma janela.
 *
 * ## A org NUNCA vem do corpo
 *
 * Ela é o parâmetro de rota `[id]` — mesma disciplina de `resend-admin-invite/route.ts` e da
 * `900-60`. Aceitar um id do corpo deixaria renomear uma empresa a partir da tela de outra, e
 * nada na resposta de sucesso denunciaria isso.
 *
 * ## Por que o efeito é uma RPC, e não um `.update()` aqui
 *
 * 1. `app/api/platform/**` não pode conter `.from(<literal>)` — é a segunda rede da `900-22b`
 *    (`platform-query-scan.ts`), aplicada por teste, e ela não distingue leitura de escrita nem
 *    isenta `createAdminClient()`. Escrita de plataforma vai por `db.rpc(...)`.
 * 2. A trava otimista, o no-op (AC4) e a linha de trilha precisam da MESMA transação do `UPDATE`.
 *    Lida em duas viagens, a trava não trava.
 *
 * **`createAdminClient()` aqui é deliberado e está na allowlist** (`docs/audits/
 * admin-client-allowlist.json`, seção `plataforma`): a RPC é `GRANT EXECUTE … TO service_role` e
 * a autorização acontece nesta rota (`getPlatformAdmin()`), não no SQL. A régua é
 * `scripts/admin-client-allowlist.test.ts`.
 *
 * ## AC11 — nenhum log novo com dado pessoal
 *
 * Não há `console.log`/`console.error` neste arquivo, de propósito. Contato do responsável é dado
 * pessoal (LGPD Art. 5º, I), e os dois únicos lugares onde ele pode aparecer são
 * `organizations.settings` e `platform_audit_log`. Um `console.error(corpo)` num ramo de falha
 * abriria um terceiro lugar, não auditado, fora de qualquer política de retenção.
 */

import { NextResponse } from "next/server"
import { getPlatformAdmin } from "@web/lib/tenancy/platform-guard"
import { createAdminClient } from "@web/lib/supabase/admin"
import { validarDadosDaEmpresa } from "@web/lib/tenancy/console-dados-empresa"

/** O que a migration `252` levanta, e o status HTTP que cada código merece. */
const STATUS_POR_CODIGO_SQL: Record<string, number> = {
  // Trava otimista ausente. A rota já barra antes; a função é a segunda rede, para quando a RPC
  // for chamada por outra superfície. `400` porque é defeito de chamada, não corrida.
  P0024: 400,
}

/**
 * A RPC ainda não existe no banco — sintoma exato de deploy fora de ordem (código antes da
 * migration `252`). Mesma rede da `900-60` (QA-900-60-2): sem ela o desfecho cai no `?? 500`
 * genérico, e o operador lê "não foi possível concluir" numa tela que parece pronta.
 *
 * `PGRST202` é o PostgREST não achando a função no schema cache; `42883` é o
 * `undefined_function` do próprio Postgres.
 */
const CODIGOS_DE_FUNCAO_NAO_PUBLICADA = new Set(["PGRST202", "42883"])
const MENSAGEM_DE_FUNCAO_NAO_PUBLICADA =
  "A função de banco desta tela ainda não foi publicada (migration 252). Nada foi alterado."

/** O que a migration `252` devolve — uma linha, ou nenhuma quando a empresa não existe. */
interface LinhaDaRpc {
  id: string
  name: string
  slug: string
  settings: Record<string, unknown> | null
  updated_at: string
  conflito: boolean
  slug_em_uso: boolean
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const platformAdmin = await getPlatformAdmin()
  if (!platformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })

  const { id: orgId } = await params
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>

  // AC3 — obrigatório. Sem ele não há trava otimista nenhuma, e a AC3 afirma para o operador que
  // ela existe. Barrado ANTES da validação dos oito campos: um corpo sem trava não é um corpo
  // "quase certo", é um cliente que não participa do protocolo.
  const expectedUpdatedAt =
    typeof corpo.expectedUpdatedAt === "string" ? corpo.expectedUpdatedAt.trim() : ""
  if (!expectedUpdatedAt) {
    return NextResponse.json(
      {
        error: "EXPECTED_UPDATED_AT_REQUIRED",
        message: "Recarregue a página: falta a marca de versão dos dados que você abriu.",
      },
      { status: 400 },
    )
  }

  // AC2 — os OITO campos validados AQUI, antes de qualquer viagem ao banco. A mesma função que o
  // diálogo usa para liberar o botão "Salvar": uma implementação só, dois consumidores.
  const { erro, normalizado } = validarDadosDaEmpresa(corpo)
  if (erro) {
    return NextResponse.json({ error: erro.codigo, message: erro.mensagem }, { status: 400 })
  }

  const reason = typeof corpo.reason === "string" ? corpo.reason.trim() : ""

  const db = createAdminClient()
  const { data, error } = await db.rpc("org_details_update_as_platform", {
    p_org_id: orgId,
    p_actor_user_id: platformAdmin.userId,
    p_name: normalizado.name,
    p_slug: normalizado.slug,
    p_contato_nome: normalizado.contatoNome,
    p_contato_email: normalizado.contatoEmail,
    p_contato_telefone: normalizado.contatoTelefone,
    p_fiscal_cnpj: normalizado.fiscalCnpj,
    p_fiscal_razao_social: normalizado.fiscalRazaoSocial,
    p_fiscal_endereco: normalizado.fiscalEndereco,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: reason || null,
  })

  // Falha de escrita NÃO pode virar "salvo". A UI só fecha o diálogo sobre um 200.
  if (error) {
    const codigo = (error as { code?: string }).code ?? ""
    const naoPublicada = CODIGOS_DE_FUNCAO_NAO_PUBLICADA.has(codigo)
    return NextResponse.json(
      {
        error: codigo || "ESCRITA_FALHOU",
        message: naoPublicada
          ? MENSAGEM_DE_FUNCAO_NAO_PUBLICADA
          : (error.message ?? "Não foi possível concluir. Nada foi alterado."),
      },
      { status: naoPublicada ? 503 : (STATUS_POR_CODIGO_SQL[codigo] ?? 500) },
    )
  }

  // `RETURNS TABLE` chega pelo PostgREST como array. Zero linhas é a empresa que não existe — a
  // RPC desambigua isso do conflito de propósito (AC5), e os dois desfechos são HTTPs diferentes.
  const linha = (Array.isArray(data) ? (data as LinhaDaRpc[])[0] : null) ?? null
  if (!linha) {
    return NextResponse.json({ error: "ORG_NOT_FOUND" }, { status: 404 })
  }

  // AC3 — o corpo devolve os valores ATUAIS do banco, para a UI poder mostrar "isto foi alterado
  // por outra pessoa" com o valor real em vez de com o que o operador digitou.
  if (linha.conflito) {
    return NextResponse.json(
      {
        error: "CONFLITO_DE_CONCORRENCIA",
        atual: {
          name: linha.name,
          slug: linha.slug,
          settings: linha.settings,
          updatedAt: linha.updated_at,
        },
      },
      { status: 409 },
    )
  }

  if (linha.slug_em_uso) {
    return NextResponse.json({ error: "SLUG_EM_USO" }, { status: 409 })
  }

  // O retorno é a verdade do que ficou gravado — não repetimos aqui o que pedimos. `updatedAt` é
  // o valor já bombado pelo trigger `set_updated_at`, e é ele que a próxima edição vai usar como
  // trava.
  return NextResponse.json({
    orgId: linha.id,
    name: linha.name,
    slug: linha.slug,
    updatedAt: linha.updated_at,
  })
}
