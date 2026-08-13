"use server"

import { revalidatePath } from "next/cache"
import { can } from "@web/lib/permissions"
import { getServerUser } from "@web/lib/auth"
import { createClient } from "@web/lib/supabase/server"
import { validateChangeReason, validatePromptContent } from "@web/lib/agent-prompts"

/**
 * Story 87-1 · AC2 — a escrita real do painel, agora com motivo obrigatório e
 * RESPOSTA VISÍVEL.
 *
 * 🔴 O defeito que esta refatoração corrige (D7 da validação do @po): a versão anterior
 * desta action vivia dentro de `page.tsx` e retornava `void` em TODO caminho de rejeição
 * (`if (!slug || !content) return`, `if (user.role !== 'admin') return`). Acrescentar um
 * `return` novo para "sem motivo" seria indistinguível de sucesso na tela: o admin
 * clicaria em Salvar, nada aconteceria, e ele iria embora achando que salvou.
 * "Não gravou" sem aviso é pior que gravar. Daí o estado de retorno + `useActionState`
 * no Client Component.
 *
 * O motivo viaja para o trigger pela coluna `agent_prompts.last_change_reason`, escrita
 * NO MESMO `UPDATE` do `content` (migration 219, decisão D2 opção (a)). Nada de RPC:
 * o supabase-js não compartilha transação entre chamadas.
 */
export type SavePromptState =
  | { status: "idle" }
  /**
   * `salvoEm` existe para a tela poder limpar o campo de motivo remontando-o por `key`,
   * sem `useEffect` + `setState` (que o lint do React proíbe, com razão). Dois saves
   * seguidos precisam de valores diferentes, senão o segundo não remonta nada — daí um
   * timestamp e não um booleano.
   */
  | { status: "ok"; message: string; salvoEm: number }
  | { status: "erro"; message: string }

export const ESTADO_INICIAL: SavePromptState = { status: "idle" }

export async function savePromptAction(
  _prev: SavePromptState,
  formData: FormData
): Promise<SavePromptState> {
  const slug = (formData.get("slug") as string | null)?.trim()

  if (!slug) {
    return { status: "erro", message: "Slug ausente no formulário. Recarregue a página." }
  }

  const conteudo = validatePromptContent(formData.get("content"))
  if (!conteudo.ok) {
    return { status: "erro", message: conteudo.error }
  }

  const motivo = validateChangeReason(formData.get("motivo"))
  if (!motivo.ok) {
    return { status: "erro", message: motivo.error }
  }

  const user = await getServerUser()

  // Defesa em profundidade: a guarda efetiva no banco é a RLS admin-only da migration
  // 098 (`098_harden_rls_agent_prompts_admin_only.sql`, Story 53-2) — NÃO a 096, que é
  // o `crm_pipeline_readonly_layer` e não tem nada a ver com isto.
  if (!(await can(user.id, user.orgId, "nicole.personalidade_editar"))) {
    return { status: "erro", message: "Só administradores podem editar os prompts da Nicole." }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("agent_prompts")
    .update({ content: conteudo.value, last_change_reason: motivo.value })
    .eq("org_id", user.orgId)
    .eq("slug", slug)
    .select("slug")
    .maybeSingle()

  if (error) {
    return { status: "erro", message: `Não gravou: ${error.message}` }
  }

  // `update` sem linha afetada não é erro no PostgREST — e é exatamente o que a RLS
  // devolve quando nega a escrita. Sem esta checagem, negado pela RLS pareceria salvo.
  if (!data) {
    return {
      status: "erro",
      message: `Nenhuma linha foi alterada para o slug "${slug}". Ou o slug não existe nesta organização, ou a RLS negou a escrita.`,
    }
  }

  revalidatePath("/dashboard/configuracoes/personalidade")

  return {
    status: "ok",
    salvoEm: Date.now(),
    message:
      "Salvo. Este slug agora está DIVERGENTE do repositório — rode `npm run prompts:check` " +
      "e commite o snapshot (`npx tsx scripts/dump-agent-prompts.ts --write`) hoje mesmo.",
  }
}
