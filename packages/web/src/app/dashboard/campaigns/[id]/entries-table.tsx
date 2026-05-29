"use client"

import { useState } from "react"

interface Entry {
  id: string
  name: string
  phone: string
  email: string
  custom_data: Record<string, unknown>
  whatsapp_status: string
  email_status: string
  is_valid_phone: boolean | null
  is_valid_email: boolean | null
  has_responded: boolean
  created_at: string
}

const WA_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500 dark:bg-stone-700/50 dark:text-stone-400",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  read: "bg-green-200 text-green-800 dark:bg-green-500/25 dark:text-green-200",
  failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
}

const WA_LABEL: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviado",
  delivered: "Entregue",
  read: "Lido",
  failed: "Falhou",
}

const EMAIL_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500 dark:bg-stone-700/50 dark:text-stone-400",
  sent: "bg-gray-200 text-gray-600 dark:bg-stone-700 dark:text-stone-300",
  delivered: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  opened: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  clicked: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  bounced: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  failed: "bg-red-200 text-red-800 dark:bg-red-500/25 dark:text-red-200",
}

const EMAIL_LABEL: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviado",
  delivered: "Entregue",
  opened: "Aberto",
  clicked: "Clicado",
  bounced: "Rejeitado",
  failed: "Falhou",
}

type Filter = "all" | "valid" | "invalid" | "responded" | "no_response"

const PAGE_SIZE = 30

export function EntriesTable({ entries }: { entries: Entry[] }) {
  const [filter, setFilter] = useState<Filter>("all")
  const [page, setPage] = useState(1)

  const filtered = entries.filter((e) => {
    switch (filter) {
      case "valid":
        return e.is_valid_phone && e.is_valid_email
      case "invalid":
        return e.is_valid_phone === false || e.is_valid_email === false
      case "responded":
        return e.has_responded
      case "no_response":
        return !e.has_responded
      default:
        return true
    }
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleFilterChange(f: Filter) {
    setFilter(f)
    setPage(1)
  }

  function downloadCSV() {
    const headers = [
      "Nome",
      "WhatsApp",
      "Email",
      "Dados",
      "WA Status",
      "Email Status",
      "Valido",
      "Respondeu",
      "Data",
    ]
    const rows = filtered.map((e) => [
      e.name,
      e.phone,
      e.email,
      JSON.stringify(e.custom_data),
      e.whatsapp_status,
      e.email_status,
      e.is_valid_phone && e.is_valid_email ? "Sim" : "Nao",
      e.has_responded ? "Sim" : "Nao",
      new Date(e.created_at).toLocaleString("pt-BR"),
    ])

    const csv =
      "\uFEFF" +
      [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "participantes.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })

  return (
    <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-stone-800">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "Todos"],
              ["valid", "Validos"],
              ["invalid", "Invalidos"],
              ["responded", "Responderam"],
              ["no_response", "Sem resposta"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleFilterChange(key)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                filter === key
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                  : "text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800"
              }`}
            >
              {label} ({key === "all" ? entries.length : entries.filter((e) => {
                if (key === "valid") return e.is_valid_phone && e.is_valid_email
                if (key === "invalid") return e.is_valid_phone === false || e.is_valid_email === false
                if (key === "responded") return e.has_responded
                return !e.has_responded
              }).length})
            </button>
          ))}
        </div>
        <button
          onClick={downloadCSV}
          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          Exportar CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
          <thead className="bg-gray-50 dark:bg-stone-800/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-stone-400">Nome</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-stone-400">WhatsApp</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-stone-400">E-mail</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-stone-400">Dados</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-stone-400">WA</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-stone-400">Email</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-stone-400">Valido</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-stone-400">Resp.</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-stone-400">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
            {paginated.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-stone-800/30">
                <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-stone-100">{e.name}</td>
                <td className="px-3 py-2 text-sm text-gray-500 font-mono dark:text-stone-400">{e.phone}</td>
                <td className="px-3 py-2 text-sm text-gray-500 dark:text-stone-400">{e.email}</td>
                <td className="px-3 py-2 text-xs text-gray-400 max-w-[200px] dark:text-stone-500">
                  <div
                    className="truncate"
                    title={Object.entries(e.custom_data ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"}
                  >
                    {Object.entries(e.custom_data ?? {})
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ") || "—"}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${WA_BADGE[e.whatsapp_status] ?? WA_BADGE.pending}`}>
                    {WA_LABEL[e.whatsapp_status] ?? e.whatsapp_status}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${EMAIL_BADGE[e.email_status] ?? EMAIL_BADGE.pending}`}>
                    {EMAIL_LABEL[e.email_status] ?? e.email_status}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  {e.is_valid_phone && e.is_valid_email ? (
                    <span className="text-green-600 dark:text-green-300">&#10003;</span>
                  ) : e.is_valid_phone === false || e.is_valid_email === false ? (
                    <span className="text-red-500 dark:text-red-300">&#10007;</span>
                  ) : (
                    <span className="text-gray-300 dark:text-stone-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {e.has_responded ? (
                    <span className="text-green-600 dark:text-green-300">&#10003;</span>
                  ) : (
                    <span className="text-gray-300 dark:text-stone-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-400 dark:text-stone-500">{formatDate(e.created_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-400 dark:text-stone-500">
                  Nenhum participante encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-stone-800">
          <p className="text-xs text-gray-500 dark:text-stone-400">
            Página {page} de {totalPages} — {filtered.length} participantes
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
