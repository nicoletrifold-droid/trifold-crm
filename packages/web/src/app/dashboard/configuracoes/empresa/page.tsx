import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"

export default async function EmpresaPage() {
  const user = await getServerUser()
  const supabase = await createClient()

  const isAdmin = user.role === "admin"

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, settings, created_at")
    .eq("id", user.orgId)
    .single()

  const settings = (org?.settings ?? {}) as Record<string, string>

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Configurações
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">Empresa</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Dados da organização
        </p>
      </div>

      {!org ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-gray-500 dark:text-stone-400">
            Organização não encontrada.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Org Info (read-only view) */}
          <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-stone-100">Informações</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-400 dark:text-stone-500">Nome</p>
                <p className="mt-0.5 text-sm text-gray-900 dark:text-stone-100">{org.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 dark:text-stone-500">Slug</p>
                <p className="mt-0.5 rounded bg-gray-50 px-2 py-1 font-mono text-sm text-gray-700 dark:bg-stone-800 dark:text-stone-300">
                  {org.slug}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 dark:text-stone-500">Cidade</p>
                <p className="mt-0.5 text-sm text-gray-900 dark:text-stone-100">{settings.city || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 dark:text-stone-500">Estado</p>
                <p className="mt-0.5 text-sm text-gray-900 dark:text-stone-100">{settings.state || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 dark:text-stone-500">Criado em</p>
                <p className="mt-0.5 text-sm text-gray-900 dark:text-stone-100">
                  {new Date(org.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>
          </div>

          {/* Edit Form (admin only) */}
          {isAdmin && (
            <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-stone-100">Editar</h2>
              <EditOrgForm
                orgId={org.id}
                currentName={org.name}
                currentCity={settings.city || ""}
                currentState={settings.state || ""}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EditOrgForm({
  orgId,
  currentName,
  currentCity,
  currentState,
}: {
  orgId: string
  currentName: string
  currentCity: string
  currentState: string
}) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server"
        const name = formData.get("name") as string
        const city = formData.get("city") as string
        const state = formData.get("state") as string

        const supabase = await (
          await import("@web/lib/supabase/server")
        ).createClient()

        // Get current settings to merge
        const { data: org } = await supabase
          .from("organizations")
          .select("settings")
          .eq("id", orgId)
          .single()

        const currentSettings = (org?.settings ?? {}) as Record<string, string>

        await supabase
          .from("organizations")
          .update({
            name,
            settings: { ...currentSettings, city, state },
          })
          .eq("id", orgId)
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-stone-300">
          Nome da empresa
        </label>
        <input
          type="text"
          id="name"
          name="name"
          defaultValue={currentName}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-gray-700 dark:text-stone-300">
            Cidade
          </label>
          <input
            type="text"
            id="city"
            name="city"
            defaultValue={currentCity}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          />
        </div>
        <div>
          <label htmlFor="state" className="block text-sm font-medium text-gray-700 dark:text-stone-300">
            Estado
          </label>
          <input
            type="text"
            id="state"
            name="state"
            defaultValue={currentState}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          />
        </div>
      </div>
      <button
        type="submit"
        className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
      >
        Salvar
      </button>
    </form>
  )
}
