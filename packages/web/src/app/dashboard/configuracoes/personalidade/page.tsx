import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import Link from "next/link"
import { redirect } from "next/navigation"

const PERSONALITY_SLUG = "system-personality"

// Campos de agent_config editáveis por esta tela (allowlist de defesa em profundidade)
const AGENT_CONFIG_FIELDS = ["greeting_message", "out_of_hours_message"] as const

/**
 * Server Action: salva o `content` de um prompt em agent_prompts pelo slug.
 * Defesa em profundidade: revalida role admin antes de escrever (a RLS admin-only
 * da migration 096 — Story 53-2 — é a guarda efetiva no banco).
 */
async function savePromptAction(formData: FormData) {
  "use server"
  const slug = (formData.get("slug") as string)?.trim()
  const content = formData.get("content") as string

  if (!slug || !content?.trim()) return

  const { createClient: mkClient } = await import("@web/lib/supabase/server")
  const { getServerUser: getUser } = await import("@web/lib/auth")
  const supabaseServer = await mkClient()
  const user = await getUser()

  if (user.role !== "admin") return

  await supabaseServer
    .from("agent_prompts")
    .update({ content: content.trim() })
    .eq("org_id", user.orgId)
    .eq("slug", slug)

  const { revalidatePath } = await import("next/cache")
  revalidatePath("/dashboard/configuracoes/personalidade")
}

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

  if (user.role !== "admin") return

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

  const isAdmin = user.role === "admin"

  const supabase = await createClient()

  const { data: agentConfig } = await supabase
    .from("agent_config")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .maybeSingle()

  const { data: agentPrompts } = await supabase
    .from("agent_prompts")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .order("type")
    .order("name")

  // O prompt de personalidade do runtime (Story 53-1) é agent_prompts.slug=system-personality.
  // Ele ganha uma seção dedicada (AC1) e é removido do loop genérico para evitar edição duplicada.
  const personalityPrompt = agentPrompts?.find((p) => p.slug === PERSONALITY_SLUG)
  const otherPrompts = (agentPrompts ?? []).filter((p) => p.slug !== PERSONALITY_SLUG)

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
              <form action={savePromptAction}>
                <input type="hidden" name="slug" value={PERSONALITY_SLUG} />
                <textarea
                  name="content"
                  defaultValue={personalityPrompt.content ?? ""}
                  rows={12}
                  disabled={!isAdmin}
                  className={editableTextareaClass}
                />
                {isAdmin && (
                  <button type="submit" className={saveButtonClass}>
                    Salvar personalidade
                  </button>
                )}
              </form>
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
            {otherPrompts.map((prompt) => (
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
                  <span className="ml-auto text-xs text-gray-400 dark:text-stone-500">
                    {isAdmin ? "Clique para editar" : "Clique para ver"}
                  </span>
                </summary>
                <form action={savePromptAction} className="mt-3">
                  <input type="hidden" name="slug" value={prompt.slug} />
                  <textarea
                    name="content"
                    defaultValue={prompt.content ?? ""}
                    rows={10}
                    disabled={!isAdmin}
                    className={editableTextareaClass}
                  />
                  {isAdmin && (
                    <button type="submit" className={saveButtonClass}>
                      Salvar {prompt.name}
                    </button>
                  )}
                </form>
              </details>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-stone-400">Nenhum prompt configurado.</p>
        )}
      </div>
    </div>
  )
}
