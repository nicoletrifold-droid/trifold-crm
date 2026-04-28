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
  pending: "bg-gray-100 text-gray-500",
  sent: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  read: "bg-green-200 text-green-800",
  failed: "bg-red-100 text-red-700",
}

const EMAIL_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  sent: "bg-gray-200 text-gray-600",
  delivered: "bg-orange-100 text-orange-700",
  opened: "bg-green-100 text-green-700",
  clicked: "bg-blue-100 text-blue-700",
  bounced: "bg-red-100 text-red-700",
  failed: "bg-red-200 text-red-800",
}

type Filter = "all" | "valid" | "invalid" | "responded" | "no_response"

export function EntriesTable({ entries }: { entries: Entry[] }) {
  const [filter, setFilter] = useState<Filter>("all")

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
    <div className="rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex gap-2">
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
              onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                filter === key
                  ? "bg-orange-100 text-orange-700"
                  : "text-gray-500 hover:bg-gray-100"
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
          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Exportar CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Nome</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">WhatsApp</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">E-mail</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Dados</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">WA</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Email</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Valido</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Resp.</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-sm font-medium text-gray-900">{e.name}</td>
                <td className="px-3 py-2 text-sm text-gray-500 font-mono">{e.phone}</td>
                <td className="px-3 py-2 text-sm text-gray-500">{e.email}</td>
                <td className="px-3 py-2 text-xs text-gray-400">
                  {Object.entries(e.custom_data ?? {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${WA_BADGE[e.whatsapp_status] ?? WA_BADGE.pending}`}>
                    {e.whatsapp_status}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${EMAIL_BADGE[e.email_status] ?? EMAIL_BADGE.pending}`}>
                    {e.email_status}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  {e.is_valid_phone && e.is_valid_email ? (
                    <span className="text-green-600">&#10003;</span>
                  ) : e.is_valid_phone === false || e.is_valid_email === false ? (
                    <span className="text-red-500">&#10007;</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {e.has_responded ? (
                    <span className="text-green-600">&#10003;</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-400">{formatDate(e.created_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-400">
                  Nenhum participante encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
