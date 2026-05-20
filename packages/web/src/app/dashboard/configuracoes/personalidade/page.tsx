import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import Link from "next/link"
import { redirect } from "next/navigation"

export default async function PersonalidadePage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "configuracoes"))) {
    redirect("/dashboard")
  }

  const supabase = await createClient()

  const { data: agentConfig } = await supabase
    .from("agent_config")
    .select("*")
    .eq("org_id", user.orgId)
    .single()

  const { data: agentPrompts } = await supabase
    .from("agent_prompts")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .order("type")
    .order("name")

  const typeColors: Record<string, string> = {
    system: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    qualification: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    guardrail: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    greeting: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
    objection: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes/pipeline"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Configurações
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">
          Personalidade da Nicole
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Configurações de personalidade e comportamento da IA
        </p>
      </div>

      {!agentConfig ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-gray-500 dark:text-stone-400">
            Nenhuma configuracao de agente encontrada para esta organizacao.
          </p>
        </div>
      ) : (
        <>
          {/* Personality Prompt */}
          <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Prompt de personalidade</h2>
            <textarea
              readOnly
              value={agentConfig.personality_prompt ?? ""}
              rows={8}
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-stone-500">
              Somente leitura. Edição disponível em breve.
            </p>
          </div>

          {/* Editable Messages */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
              <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">Mensagem de saudacao</h2>
              <textarea
                readOnly
                value={agentConfig.greeting_message ?? ""}
                rows={4}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              />
            </div>
            <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
              <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">
                Mensagem fora do horario
              </h2>
              <textarea
                readOnly
                value={agentConfig.out_of_hours_message ?? ""}
                rows={4}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              />
            </div>
          </div>

          {/* Model Info */}
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
        </>
      )}

      {/* Agent Prompts */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-3 text-lg font-semibold dark:text-stone-100">
          Prompts do agente ({agentPrompts?.length ?? 0})
        </h2>
        {agentPrompts && agentPrompts.length > 0 ? (
          <div className="space-y-3">
            {agentPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="rounded-md border border-gray-200 p-4 dark:border-stone-800"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-stone-100">{prompt.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      typeColors[prompt.type] ?? "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                    }`}
                  >
                    {prompt.type}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-500 dark:text-stone-400">
                  {prompt.content?.substring(0, 150)}
                  {prompt.content && prompt.content.length > 150 ? "..." : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-stone-400">Nenhum prompt configurado.</p>
        )}
      </div>
    </div>
  )
}
