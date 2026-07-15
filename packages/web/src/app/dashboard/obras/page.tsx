import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ObraCreateModal } from "./_components/obra-create-modal"
import { ObraReativarButton } from "./_components/obra-reativar-button"
import { ScrollableX } from "@web/components/ui/scrollable-x"

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluída",
  pausada: "Pausada",
}

const STATUS_BADGE: Record<string, string> = {
  em_andamento: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  concluida: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  pausada: "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200",
}

function formatDeliveryDate(date: string | null): string {
  if (!date) return "-"
  return new Date(date).toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  })
}

// Selo por obra com a fatia de aprovações pendentes (soma = badge "Obras" do menu).
// Clica → cai direto na aba Aprovações daquela obra.
function PendenciaCell({ obraId, count }: { obraId: string; count: number }) {
  if (count <= 0) {
    return <span className="text-sm text-gray-400 dark:text-stone-500">—</span>
  }
  return (
    <Link
      href={`/dashboard/obras/${obraId}?tab=aprovacoes`}
      className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700 hover:bg-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/25"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
      {count} a aprovar
    </Link>
  )
}

export default async function ObrasPage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "obras"))) {
    redirect("/dashboard")
  }

  // Apenas usuários com acesso a "sistema" veem ações administrativas
  // (ex.: vínculo manual de obras a empreendimentos).
  const canManageSistema = await canAccess(user.id, user.orgId, "sistema")

  const supabase = await createClient()

  const { data: obras } = await supabase
    .from("obras")
    .select("id, name, status, progress_pct, expected_delivery_date, deleted_at")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })

  const ativas = (obras ?? []).filter((o) => !o.deleted_at)
  const arquivadas = (obras ?? []).filter((o) => !!o.deleted_at)

  // Aprovações de upload pendentes, quebradas por obra — mesma fonte do badge
  // "Obras" no menu lateral (obra_upload_aprovacoes, status='pendente'), mas
  // agrupadas por obra_id para que cada linha mostre a sua fatia. Só admin/
  // supervisor aprovam, então só eles veem a coluna (igual ao gate do menu).
  const canApprove = user.role === "admin" || user.role === "supervisor"
  const pendentesPorObra: Record<string, number> = {}
  if (canApprove) {
    const { data: pendentes } = await supabase
      .from("obra_upload_aprovacoes")
      .select("obra_id")
      .eq("org_id", user.orgId)
      .eq("status", "pendente")
    for (const p of pendentes ?? []) {
      if (p.obra_id) pendentesPorObra[p.obra_id] = (pendentesPorObra[p.obra_id] ?? 0) + 1
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Obras</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
            {ativas.length}{" "}
            {ativas.length === 1 ? "obra cadastrada" : "obras cadastradas"}
          </p>
          {arquivadas.length > 0 && (
            <p className="mt-0.5 text-xs text-gray-400 dark:text-stone-500">
              {arquivadas.length}{" "}
              {arquivadas.length === 1 ? "arquivada" : "arquivadas"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canManageSistema && (
            <Link
              href="/dashboard/obras/backfill"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Vincular empreendimentos
            </Link>
          )}
          <ObraCreateModal />
        </div>
      </div>

      <ScrollableX className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-6 py-3">Nome</th>
              <th className="px-6 py-3">Status</th>
              {canApprove && <th className="px-6 py-3">Pendências</th>}
              <th className="px-6 py-3">Progresso</th>
              <th className="px-6 py-3">Data prevista</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {ativas.map((obra) => {
              const statusBadge =
                STATUS_BADGE[obra.status] ?? "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
              const statusLabel = STATUS_LABEL[obra.status] ?? obra.status
              return (
                <tr key={obra.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                    {obra.name}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge}`}
                    >
                      {statusLabel}
                    </span>
                  </td>
                  {canApprove && (
                    <td className="px-6 py-4">
                      <PendenciaCell obraId={obra.id} count={pendentesPorObra[obra.id] ?? 0} />
                    </td>
                  )}
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-gray-200 dark:bg-stone-700">
                        <div
                          className="h-1.5 rounded-full bg-orange-500"
                          style={{ width: `${obra.progress_pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-stone-400">
                        {obra.progress_pct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                    {formatDeliveryDate(obra.expected_delivery_date)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/obras/${obra.id}`}
                      className="text-sm font-medium text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
                    >
                      Gerenciar
                    </Link>
                  </td>
                </tr>
              )
            })}
            {arquivadas.map((obra) => (
              <tr key={obra.id} className="opacity-50">
                <td className="px-6 py-4 font-medium text-gray-500 dark:text-stone-400">
                  {obra.name}
                </td>
                <td className="px-6 py-4">
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-stone-700 dark:text-stone-400">
                    Arquivada
                  </span>
                </td>
                {canApprove && (
                  <td className="px-6 py-4">
                    <PendenciaCell obraId={obra.id} count={pendentesPorObra[obra.id] ?? 0} />
                  </td>
                )}
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-gray-200 dark:bg-stone-700">
                      <div
                        className="h-1.5 rounded-full bg-gray-400"
                        style={{ width: `${obra.progress_pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 dark:text-stone-500">
                      {obra.progress_pct}%
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-400 dark:text-stone-500">
                  {formatDeliveryDate(obra.expected_delivery_date)}
                </td>
                <td className="px-6 py-4 text-right">
                  {user.role === "admin" ? (
                    <ObraReativarButton obraId={obra.id} obraName={obra.name} />
                  ) : null}
                </td>
              </tr>
            ))}
            {ativas.length === 0 && arquivadas.length === 0 && (
              <tr>
                <td
                  colSpan={canApprove ? 6 : 5}
                  className="px-6 py-12 text-center text-sm text-gray-500 dark:text-stone-400"
                >
                  <p className="mb-3">Nenhuma obra cadastrada.</p>
                  <p className="text-xs text-gray-400 dark:text-stone-500">
                    Clique em &quot;Nova Obra&quot; para começar.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollableX>
    </div>
  )
}
