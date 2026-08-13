import { createClient } from "@web/lib/supabase/server"
import { can } from "@web/lib/permissions"
import { getServerUser } from "@web/lib/auth"
import Link from "next/link"
import { redirect } from "next/navigation"
import { MediaUploadForm } from "./_components/media-upload-form"
import { MediaDeleteConfirm } from "./_components/media-delete-confirm"

const CATEGORY_LABELS: Record<string, string> = {
  planta: "Planta",
  fachada: "Fachada",
  tabela: "Tabela de Preços",
  outro: "Outro",
}

function formatSize(bytes: number | null) {
  if (!bytes) return "-"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function MidiaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const filters = await searchParams
  const user = await getServerUser()

  const canAccess = await can(user.id, user.orgId, "nicole.midia_gerenciar")
  if (!canAccess) redirect("/dashboard")

  const supabase = await createClient()

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  let query = supabase
    .from("agent_media_assets")
    .select("id, title, category, file_url, file_name, file_type, file_size, is_active, created_at, property_id")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })

  if (filters.property_id) query = query.eq("property_id", filters.property_id)
  if (filters.category) query = query.eq("category", filters.category)

  const { data: assets } = await query

  const propertyMap = new Map((properties ?? []).map((p) => [p.id, p.name]))
  const deleteAsset = filters.action === "delete" && filters.id
    ? assets?.find((a) => a.id === filters.id) ?? null
    : null

  const BASE = "/dashboard/configuracoes/nicole/midia"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/configuracoes/nicole"
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            &larr; Nicole
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-stone-100">
            Mídia — Biblioteca de Arquivos
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
            Imagens e PDFs organizados por empreendimento para enviar nas conversas
          </p>
        </div>
      </div>

      {/* Filtros + botão upload */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <form className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-stone-400">
              Empreendimento
            </label>
            <select
              name="property_id"
              defaultValue={filters.property_id ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              <option value="">Todos</option>
              {properties?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-stone-400">
              Categoria
            </label>
            <select
              name="category"
              defaultValue={filters.category ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              <option value="">Todas</option>
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            Filtrar
          </button>
          {(filters.property_id || filters.category) && (
            <Link
              href={BASE}
              className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Limpar
            </Link>
          )}
        </form>

        <Link
          href={`${BASE}?action=upload`}
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          + Enviar arquivo
        </Link>
      </div>

      {/* Upload form */}
      {filters.action === "upload" && (
        <MediaUploadForm
          properties={(properties ?? []).map((p) => ({ id: p.id, name: p.name }))}
          base={BASE}
        />
      )}

      {/* Delete confirm */}
      {deleteAsset && (
        <MediaDeleteConfirm
          assetId={deleteAsset.id as string}
          assetTitle={deleteAsset.title as string}
          base={BASE}
        />
      )}

      {/* Tabela */}
      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Arquivo</th>
              <th className="px-6 py-3">Categoria</th>
              <th className="px-6 py-3">Empreendimento</th>
              <th className="px-6 py-3">Tipo</th>
              <th className="px-6 py-3">Tamanho</th>
              <th className="px-6 py-3">Ativo</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {assets?.map((asset) => (
              <tr key={asset.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {asset.file_type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.file_url as string}
                        alt={asset.title as string}
                        className="h-10 w-10 rounded object-cover border border-gray-200 dark:border-stone-700"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded border border-red-200 bg-red-50 text-xs font-bold text-red-600 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
                        PDF
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-stone-100">
                        {asset.title as string}
                      </p>
                      <p className="max-w-[160px] truncate text-xs text-gray-400 dark:text-stone-500">
                        {asset.file_name as string}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {CATEGORY_LABELS[asset.category as string] ?? asset.category}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {asset.property_id
                    ? (propertyMap.get(asset.property_id as string) ?? "-")
                    : <span className="text-gray-400 dark:text-stone-600">Geral</span>
                  }
                </td>
                <td className="px-6 py-4 text-sm uppercase text-gray-500 dark:text-stone-400">
                  {asset.file_type as string}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {formatSize(asset.file_size as number | null)}
                </td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    asset.is_active
                      ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                      : "bg-gray-100 text-gray-500 dark:bg-stone-700/50 dark:text-stone-400"
                  }`}>
                    {asset.is_active ? "Sim" : "Não"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-3">
                    <a
                      href={asset.file_url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Ver
                    </a>
                    <Link
                      href={`${BASE}?action=delete&id=${asset.id}`}
                      className="text-sm text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200"
                    >
                      Excluir
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {(!assets || assets.length === 0) && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500 dark:text-stone-400">
                  Nenhum arquivo na biblioteca.{" "}
                  <Link
                    href={`${BASE}?action=upload`}
                    className="text-orange-600 hover:underline"
                  >
                    Enviar o primeiro
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
