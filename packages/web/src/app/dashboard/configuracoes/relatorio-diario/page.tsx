import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess, getOrgRoles } from "@web/lib/permissions"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import Link from "next/link"
import { normalizePhoneBR } from "@trifold/shared"
import { parseIdsSelecionados, SETTINGS_KEY } from "@web/lib/reports/recipients"

// Story 75-345 — quem recebe o relatório diário de leads (07:59 BRT, WhatsApp).
//
// Antes a lista era a env `DAILY_REPORT_RECIPIENTS` na Vercel: incluir alguém
// exigia dev + redeploy. Guarda em `organizations.settings` (jsonb já existente,
// mesmo lugar do `materiais_url` da 75-117) — sem migration.
//
// A escolha é POR PESSOA, de propósito, e não uma capability na matriz: lá o admin
// é `true` por construção, e isso faria todo admin com telefone passar a receber
// WhatsApp às 07:59 sem pedir.

export default async function RelatorioDiarioConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "configuracoes.relatorio-diario"))) {
    redirect("/dashboard/configuracoes")
  }

  const { saved } = await searchParams
  const supabase = await createClient()

  // O rótulo do perfil sai da tabela `roles` (a fonte que a matriz usa), em vez de
  // um mapa nome→rótulo copiado aqui.
  const [{ data: org }, { data: usuarios }, roles] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", user.orgId).single(),
    supabase
      .from("users")
      .select("id, name, phone, role, is_active")
      .eq("org_id", user.orgId)
      .eq("is_active", true)
      .neq("role", "cliente")
      .order("name"),
    getOrgRoles(user.orgId),
  ])

  const rotuloDoPerfil = new Map(roles.map((r) => [r.name, r.label]))

  const selecionados = new Set(parseIdsSelecionados(org?.settings))
  const lista = (usuarios ?? []) as Array<{
    id: string
    name: string | null
    phone: string | null
    role: string | null
  }>

  const comTelefone = lista.filter((u) => normalizePhoneBR(u.phone))
  // Sem telefone aparece SEPARADO, não escondido: quem procurar a pessoa na lista
  // precisa entender por que ela não está disponível, em vez de achar que é bug.
  const semTelefone = lista.filter((u) => !normalizePhoneBR(u.phone))

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/configuracoes"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          &larr; Configurações
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">Relatório Diário</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
          Quem recebe, por WhatsApp, o resumo dos leads do dia — todos os dias às 7h59, antes de a
          roleta reabrir.
        </p>
      </div>

      {saved === "1" && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300">
          Lista salva. O próximo envio das 7h59 já usa ela.
        </p>
      )}

      <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <form
          action={async (formData: FormData) => {
            "use server"
            const authedUser = await (await import("@web/lib/auth")).getServerUser()
            const client = await (await import("@web/lib/supabase/server")).createClient()

            if (
              !(await (
                await import("@web/lib/permissions")
              ).canAccess(authedUser.id, authedUser.orgId, "configuracoes.relatorio-diario"))
            ) {
              redirect("/dashboard/configuracoes")
            }

            // Só aceita id que É usuário ativo desta org: o formulário é do cliente,
            // e uma lista de ids arbitrários viraria envio para telefone alheio.
            const escolhidos = formData.getAll("destinatarios").map(String)
            const { data: validos } = await client
              .from("users")
              .select("id")
              .eq("org_id", authedUser.orgId)
              .eq("is_active", true)
              .in("id", escolhidos.length > 0 ? escolhidos : ["00000000-0000-0000-0000-000000000000"])
            const ids = (validos ?? []).map((u) => u.id as string)

            const { data: atual } = await client
              .from("organizations")
              .select("settings")
              .eq("id", authedUser.orgId)
              .single()
            const settingsAtuais = (atual?.settings ?? {}) as Record<string, unknown>

            await client
              .from("organizations")
              .update({ settings: { ...settingsAtuais, [SETTINGS_KEY]: ids } })
              .eq("id", authedUser.orgId)

            revalidatePath("/dashboard/configuracoes/relatorio-diario")
            redirect("/dashboard/configuracoes/relatorio-diario?saved=1")
          }}
          className="space-y-4"
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700 dark:text-stone-300">
              Recebem o relatório
            </legend>
            {comTelefone.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-stone-400">
                Nenhum usuário ativo tem telefone no cadastro.
              </p>
            )}
            {comTelefone.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-stone-700"
              >
                <input
                  type="checkbox"
                  name="destinatarios"
                  value={u.id}
                  defaultChecked={selecionados.has(u.id)}
                  className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
                />
                <span className="font-medium text-gray-900 dark:text-stone-100">{u.name ?? "sem nome"}</span>
                <span className="text-xs text-gray-500 dark:text-stone-400">
                  {rotuloDoPerfil.get(u.role ?? "") ?? u.role}
                </span>
                <span className="ml-auto tabular-nums text-xs text-gray-500 dark:text-stone-400">
                  {normalizePhoneBR(u.phone)}
                </span>
              </label>
            ))}
          </fieldset>

          <button
            type="submit"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Salvar
          </button>

          <p className="text-xs text-gray-500 dark:text-stone-400">
            Quem for desativado ou perder o telefone do cadastro para de receber sozinho — a lista é
            resolvida na hora do envio.
          </p>
        </form>
      </div>

      {semTelefone.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-stone-100">
            Não podem receber ainda
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-stone-400">
            Sem telefone no cadastro — preencha em{" "}
            <Link
              href="/dashboard/configuracoes/usuarios"
              className="text-orange-600 hover:text-orange-700 dark:text-orange-300"
            >
              Usuários
            </Link>{" "}
            para poder incluir.
          </p>
          <ul className="mt-3 space-y-1">
            {semTelefone.map((u) => (
              <li key={u.id} className="text-sm text-gray-500 dark:text-stone-400">
                {u.name ?? "sem nome"}{" "}
                <span className="text-xs">({rotuloDoPerfil.get(u.role ?? "") ?? u.role})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
