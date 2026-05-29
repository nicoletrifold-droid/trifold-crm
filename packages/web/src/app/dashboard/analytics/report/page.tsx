import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { redirect } from "next/navigation"

export default async function AnalyticsReportPage() {
  const user = await getServerUser()

  if (!(await canAccess(user.id, user.orgId, "analytics"))) {
    redirect("/dashboard")
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
            Relatório de Analytics
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Gerado com dados atuais. Enviado automaticamente todo domingo às 23h.
          </p>
        </div>
        <a
          href="/api/analytics/report"
          download="relatorio-analytics.pdf"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Baixar PDF
        </a>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <embed
          src="/api/analytics/report"
          type="application/pdf"
          className="h-full w-full"
        />
      </div>
    </div>
  )
}
