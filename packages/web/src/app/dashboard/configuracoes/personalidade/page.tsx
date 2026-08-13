import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { can, canAccess } from "@web/lib/permissions"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PromptEditor } from "./prompt-editor"
import { SNAPSHOT_CAPTURED_AT, promptParity } from "@web/lib/agent-prompts-parity"
import { buscarVersoesPorSlug } from "@web/lib/agent-prompt-versions"

const PERSONALITY_SLUG = "system-personality"

// Campos de agent_config editáveis por esta tela (allowlist de defesa em profundidade)
const AGENT_CONFIG_FIELDS = ["greeting_message", "out_of_hours_message"] as const

// A server action de escrita mora em ./actions.ts (Story 87-1): ela precisa devolver
// estado para a tela mostrar POR QUE não gravou (AC2) — a versão que vivia aqui
// retornava void em toda rejeição e "não gravou" era indistinguível de "salvou".

/**
 * Server Action: salva um campo de texto de agent_config (greeting_message,
 * out_of_hours_message). Mesma equivalência funcional do PATCH /api/agent-config,
 * mas via Supabase client direto (sem fetch interno) — padrão da página horario.
 */
async function saveAgentConfigAction(formData: FormData) {
  "use server"
  const field = (formData.get("field") as string)?.trim()
  const content = formData.get("content") as string

  if (!field || !(AGENT_CONFIG_FIELDS as readonly string[]).includes(field)) return
  if (!content?.trim()) return

  const { createClient: mkClient } = await import("@web/lib/supabase/server")
  const { getServerUser: getUser } = await import("@web/lib/auth")
  const supabaseServer = await mkClient()
  const user = await getUser()

  if (!(await can(user.id, user.orgId, "nicole.personalidade_editar"))) return

  await supabaseServer
    .from("agent_config")
    .update({ [field]: content.trim() })
    .eq("org_id", user.orgId)
    .eq("is_active", true)

  const { revalidatePath } = await import("next/cache")
  revalidatePath("/dashboard/configuracoes/personalidade")
}

export default async function PersonalidadePage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "configuracoes.personalidade"))) {
    redirect("/dashboard")
  }

  const isAdmin = await can(user.id, user.orgId, "nicole.personalidade_editar")

  const supabase = await createClient()

  const { data: agentConfig } = await supabase
    .from("agent_config")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .maybeSingle()

  // Story 87-1: o filtro `is_active=true` saiu. Um slug desativado sumia da tela e
  // continuava gravável pelo slug (a action nunca olhou `is_active`) — e o selo de
  // paridade e o histórico precisam cobrir os 7, ativos ou não. O card marca o inativo.
  const { data: agentPrompts } = await supabase
    .from("agent_prompts")
    .select("*")
    .eq("org_id", user.orgId)
    .order("type")
    .order("name")

  // Story 87-1 · AC3 — histórico por slug (migration 219). RLS admin-only na tabela:
  // para quem não é admin isto volta vazio, e a tela simplesmente não mostra histórico.
  //
  // REL-001 do gate: o teto é POR SLUG e é do banco (uma consulta por slug, coberta pelo
  // índice `(org_id, slug, created_at DESC)`). A versão anterior lia 35 linhas de todos os
  // slugs juntos e separava 5 depois — numa noite de correções repetidas em UM slug, os
  // outros seis exibiam "Sem histórico ainda". Ver `@web/lib/agent-prompt-versions`.
  const versoesPorSlug = await buscarVersoesPorSlug(
    supabase,
    user.orgId,
    (agentPrompts ?? []).map((p) => p.slug)
  )

  // O prompt de personalidade do runtime (Story 53-1) é agent_prompts.slug=system-personality.
  // Ele ganha uma seção dedicada (AC1) e é removido do loop genérico para evitar edição duplicada.
  const personalityPrompt = agentPrompts?.find((p) => p.slug === PERSONALITY_SLUG)
  const otherPrompts = (agentPrompts ?? []).filter((p) => p.slug !== PERSONALITY_SLUG)
  const divergentes = (agentPrompts ?? []).filter(
    (p) => promptParity(p.slug, p.content).status !== "em-paridade"
  ).length

  const typeColors: Record<string, string> = {
    system: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    qualification: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    guardrail: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    greeting: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
    objection: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  }

  const editableTextareaClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 disabled:bg-gray-50 disabled:text-gray-600 dark:disabled:bg-stone-800/60 dark:disabled:text-stone-400"

  const saveButtonClass =
    "mt-3 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700"

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes/nicole"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Nicole
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">
          Personalidade da Nicole
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Configurações de personalidade e comportamento da IA
        </p>
      </div>

      {/* Story 87-1 · AC6 — o resumo de paridade. Editar aqui muda o que a Nicole diz
          na PRÓXIMA mensagem, sem deploy e sem revisão de ninguém: o selo é o que
          torna visível que produção e repositório se separaram. */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600 shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
        {divergentes === 0 ? (
          <p>
            ✅ Os {agentPrompts?.length ?? 0} prompts estão em paridade com o repositório
            (snapshot de {new Date(SNAPSHOT_CAPTURED_AT).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}).
          </p>
        ) : (
          <p className="text-amber-700 dark:text-amber-400">
            ⚠️ {divergentes} de {agentPrompts?.length ?? 0} prompts divergem do repositório
            (snapshot de {new Date(SNAPSHOT_CAPTURED_AT).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}). Ninguém
            revisou essas versões em diff. Rode{" "}
            <code>npx tsx scripts/dump-agent-prompts.ts --write</code> e commite, ou reverta
            pelo histórico do slug.
          </p>
        )}
      </div>

      {!agentConfig && !personalityPrompt ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-gray-500 dark:text-stone-400">
            Nenhuma configuracao de agente encontrada para esta organizacao.
          </p>
        </div>
      ) : (
        <>
          {/* Personalidade da Nicole — edita agent_prompts.slug=system-personality (AC1) */}
          <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <h2 className="mb-1 text-lg font-semibold dark:text-stone-100">
              Personalidade da Nicole
            </h2>
            <p className="mb-3 text-xs text-gray-500 dark:text-stone-400">
              Define o tom, a persona e as regras de comportamento usadas pela IA em todas as conversas.
            </p>
            {personalityPrompt ? (
              <PromptEditor
                slug={PERSONALITY_SLUG}
                nome="personalidade"
                conteudo={personalityPrompt.content ?? ""}
                isAtivo={personalityPrompt.is_active ?? true}
                isAdmin={isAdmin}
                paridade={promptParity(PERSONALITY_SLUG, personalityPrompt.content)}
                versoes={versoesPorSlug.get(PERSONALITY_SLUG) ?? []}
                rows={12}
              />
            ) : (
              <p className="text-sm text-gray-500 dark:text-stone-400">
                Prompt de personalidade ({PERSONALITY_SLUG}) ainda não configurado para esta organização.
              </p>
            )}
          </div>

          {/* Mensagens editáveis: greeting_message e out_of_hours_message (AC2) */}
          {agentConfig && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
                <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Mensagem de saudacao</h2>
                <form action={saveAgentConfigAction}>
                  <input type="hidden" name="field" value="greeting_message" />
                  <textarea
                    name="content"
                    defaultValue={agentConfig.greeting_message ?? ""}
                    rows={4}
                    disabled={!isAdmin}
                    className={editableTextareaClass}
                  />
                  {isAdmin && (
                    <button type="submit" className={saveButtonClass}>
                      Salvar saudação
                    </button>
                  )}
                </form>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
                <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">
                  Mensagem fora do horario
                </h2>
                <form action={saveAgentConfigAction}>
                  <input type="hidden" name="field" value="out_of_hours_message" />
                  <textarea
                    name="content"
                    defaultValue={agentConfig.out_of_hours_message ?? ""}
                    rows={4}
                    disabled={!isAdmin}
                    className={editableTextareaClass}
                  />
                  {isAdmin && (
                    <button type="submit" className={saveButtonClass}>
                      Salvar mensagem
                    </button>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* Model Info — somente leitura (fora de escopo desta story) */}
          {agentConfig && (
            <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
              <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Modelo</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-stone-400">Modelo primario</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-stone-100">
                    {agentConfig.model_primary ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-stone-400">Temperatura</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-stone-100">
                    {agentConfig.temperature ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-stone-400">Max tokens</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-stone-100">
                    {agentConfig.max_tokens ?? "-"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Prompts do agente — cards expansíveis e editáveis (AC3) */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">
          Prompts do agente ({otherPrompts.length})
        </h2>
        {otherPrompts.length > 0 ? (
          <div className="space-y-3">
            {otherPrompts.map((prompt) => {
              // AC6: o selo também aparece FECHADO. Um aviso que só existe depois de
              // expandir o card avisa quem já foi olhar — e ninguém foi olhar no
              // episódio que originou esta story.
              const paridade = promptParity(prompt.slug, prompt.content)
              return (
                <details
                  key={prompt.id}
                  className="rounded-md border border-gray-200 p-4 dark:border-stone-800"
                >
                  <summary className="flex cursor-pointer items-center gap-2 marker:content-none">
                    <span className="font-medium text-gray-900 dark:text-stone-100">{prompt.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        typeColors[prompt.type] ?? "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                      }`}
                    >
                      {prompt.type}
                    </span>
                    <span
                      className={`text-xs ${
                        paridade.status === "em-paridade"
                          ? "text-green-700 dark:text-green-400"
                          : "text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {paridade.status === "em-paridade" ? "✅" : "⚠️ divergente do repositório"}
                    </span>
                    <span className="ml-auto text-xs text-gray-400 dark:text-stone-500">
                      {isAdmin ? "Clique para editar" : "Clique para ver"}
                    </span>
                  </summary>
                  <div className="mt-3">
                    <PromptEditor
                      slug={prompt.slug}
                      nome={prompt.name}
                      conteudo={prompt.content ?? ""}
                      isAtivo={prompt.is_active ?? true}
                      isAdmin={isAdmin}
                      paridade={paridade}
                      versoes={versoesPorSlug.get(prompt.slug) ?? []}
                    />
                  </div>
                </details>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-stone-400">Nenhum prompt configurado.</p>
        )}
      </div>
    </div>
  )
}
