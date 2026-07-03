import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import Link from "next/link"

// Story 75-117 — configuração da URL da Central de Materiais.
// Guarda a URL em organizations.settings.materiais_url (jsonb existente).
// Admin/supervisor editam sem depender de dev quando o link do SharePoint mudar.
export default async function MateriaisConfigPage() {
  const user = await getServerUser()

  const canConfigure = await canAccess(user.id, user.orgId, "configuracoes.empresa")
  if (!canConfigure) {
    redirect("/dashboard/configuracoes")
  }

  const supabase = await createClient()
  const { data: org } = await supabase
    .from("organizations")
    .select("id, settings")
    .eq("id", user.orgId)
    .single()

  const settings = (org?.settings ?? {}) as Record<string, string>
  const currentUrl = settings.materiais_url ?? ""

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Configurações
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">
          Central de Materiais
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Link dos materiais de marketing (artes, fotos, peças) que aparece no menu dos corretores.
        </p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <form
          action={async (formData: FormData) => {
            "use server"
            const raw = ((formData.get("materiais_url") as string) ?? "").trim()

            // Validação leve: aceita vazio (desliga o link) ou URL http(s).
            if (raw && !/^https?:\/\/.+/i.test(raw)) {
              redirect("/dashboard/configuracoes/materiais?error=url")
            }

            const supabase = await (
              await import("@web/lib/supabase/server")
            ).createClient()
            const authedUser = await (await import("@web/lib/auth")).getServerUser()

            const { data: current } = await supabase
              .from("organizations")
              .select("settings")
              .eq("id", authedUser.orgId)
              .single()
            const currentSettings = (current?.settings ?? {}) as Record<string, string>

            await supabase
              .from("organizations")
              .update({ settings: { ...currentSettings, materiais_url: raw } })
              .eq("id", authedUser.orgId)

            revalidatePath("/dashboard", "layout")
            redirect("/dashboard/configuracoes/materiais?saved=1")
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="materiais_url"
              className="block text-sm font-medium text-gray-700 dark:text-stone-300"
            >
              URL da pasta de materiais
            </label>
            <input
              type="url"
              id="materiais_url"
              name="materiais_url"
              defaultValue={currentUrl}
              placeholder="https://..."
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-stone-400">
              Cole o link da pasta (ex.: SharePoint, Google Drive). Gere um link de acesso
              &ldquo;qualquer pessoa com o link&rdquo; para que os corretores consigam abrir sem login.
              Deixe em branco para desativar o item do menu.
            </p>
          </div>
          <button
            type="submit"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Salvar
          </button>
        </form>
      </div>
    </div>
  )
}
