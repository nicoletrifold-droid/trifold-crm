"use client"

import { useState, useEffect } from "react"
import { Link2, Link2Off, RefreshCw, Loader2, Check, AlertCircle } from "lucide-react"

interface Enterprise {
  id: number
  name: string
  city: string | null
  totalUnits: number
}

interface ObraSiengeSectionProps {
  obraId: string
  sienge_enterprise_id: number | null
  sienge_enterprise_name: string | null
  sienge_sync_status: string | null
  sienge_last_synced_at: string | null
  userRole: string
}

type SyncStatus = "never" | "syncing" | "done" | "error"

function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function StatusBadge({ status }: { status: SyncStatus }) {
  const label: Record<SyncStatus, string> = {
    never: "Nunca sincronizado",
    syncing: "Sincronizando…",
    done: "Sincronizado",
    error: "Erro no sync",
  }
  const cls: Record<SyncStatus, string> = {
    never: "bg-stone-700/50 text-stone-300",
    syncing: "bg-blue-500/15 text-blue-300",
    done: "bg-emerald-500/15 text-emerald-300",
    error: "bg-red-500/15 text-red-300",
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls[status]}`}
    >
      {label[status]}
    </span>
  )
}

export function ObraSiengeSection({
  obraId,
  sienge_enterprise_id,
  sienge_enterprise_name,
  sienge_sync_status,
  sienge_last_synced_at,
  userRole,
}: ObraSiengeSectionProps) {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(
    sienge_enterprise_id
  )
  const [enterpriseName, setEnterpriseName] = useState<string | null>(
    sienge_enterprise_name
  )
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    (sienge_sync_status as SyncStatus) ?? "never"
  )
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    sienge_last_synced_at
  )

  const [showPicker, setShowPicker] = useState(false)
  const [enterprises, setEnterprises] = useState<Enterprise[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Limpa mensagens após 8s
  useEffect(() => {
    if (!syncMessage && !syncError) return
    const t = setTimeout(() => {
      setSyncMessage(null)
      setSyncError(null)
    }, 8000)
    return () => clearTimeout(t)
  }, [syncMessage, syncError])

  // Permissão: só admin/supervisor
  if (userRole !== "admin" && userRole !== "supervisor") {
    return null
  }

  async function openPicker() {
    setShowPicker(true)
    if (enterprises.length > 0) return
    setLoadingList(true)
    setListError(null)
    try {
      const res = await fetch("/api/admin/sienge/enterprises")
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setListError(
          data.error === "sienge_unavailable"
            ? "Serviço Sienge indisponível. Tente novamente."
            : data.error ?? "Erro ao listar empreendimentos"
        )
        return
      }
      const data = await res.json()
      setEnterprises(data.enterprises ?? [])
    } catch {
      setListError("Erro de rede ao listar empreendimentos")
    } finally {
      setLoadingList(false)
    }
  }

  async function selectEnterprise(ent: Enterprise) {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/sienge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sienge_enterprise_id: ent.id,
          sienge_enterprise_name: ent.name,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? "Falha ao vincular")
        return
      }
      setEnterpriseId(ent.id)
      setEnterpriseName(ent.name)
      setSyncStatus("never")
      setLastSyncedAt(null)
      setShowPicker(false)
    } finally {
      setSaving(false)
    }
  }

  async function unlinkEnterprise() {
    if (!confirm("Remover vínculo com empreendimento Sienge?")) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/sienge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sienge_enterprise_id: null,
          sienge_enterprise_name: null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? "Falha ao desvincular")
        return
      }
      setEnterpriseId(null)
      setEnterpriseName(null)
      setSyncStatus("never")
      setLastSyncedAt(null)
    } finally {
      setSaving(false)
    }
  }

  async function runSync() {
    setSyncing(true)
    setSyncStatus("syncing")
    setSyncMessage(null)
    setSyncError(null)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/sienge/sync`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setSyncStatus("error")
        setSyncError(data.error ?? "Falha no sync")
        return
      }
      setSyncStatus("done")
      setLastSyncedAt(new Date().toISOString())
      setSyncMessage(
        `Sincronizado: ${data.synced ?? 0} contratos, ${data.created ?? 0} novos clientes, ${data.invited ?? 0} convidados`
      )
    } catch {
      setSyncStatus("error")
      setSyncError("Erro de rede no sync")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
          Integração Sienge
        </h2>
        {enterpriseId ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            Vinculado
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-stone-700/50 px-2.5 py-0.5 text-xs font-semibold text-stone-300">
            Não vinculado
          </span>
        )}
      </div>

      {enterpriseId ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-stone-400">
              Empreendimento Sienge
            </p>
            <p className="font-medium text-gray-900 dark:text-stone-100">
              {enterpriseName ?? `ID ${enterpriseId}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-stone-800">
            <StatusBadge status={syncStatus} />
            <span className="text-xs text-gray-500 dark:text-stone-400">
              Última sync: {formatDateTime(lastSyncedAt)}
            </span>
          </div>

          {syncMessage && (
            <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
              {syncMessage}
            </div>
          )}
          {syncError && (
            <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              <AlertCircle className="mr-1.5 inline h-4 w-4" />
              {syncError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={runSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#F27A5E] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d4705a] disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {syncing ? "Sincronizando…" : "Sincronizar agora"}
            </button>
            <button
              onClick={unlinkEnterprise}
              disabled={saving || syncing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              <Link2Off className="h-4 w-4" />
              Desvincular
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-stone-400">
            Vincule esta obra a um empreendimento Sienge para sincronizar
            clientes, contratos e dados financeiros automaticamente.
          </p>
          <button
            onClick={openPicker}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#F27A5E] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d4705a] disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            Vincular empreendimento
          </button>
        </div>
      )}

      {/* Modal picker */}
      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !saving && setShowPicker(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-stone-800 bg-stone-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                Selecionar empreendimento Sienge
              </h3>
              <button
                onClick={() => setShowPicker(false)}
                disabled={saving}
                className="text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {loadingList && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
              </div>
            )}

            {listError && (
              <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                <AlertCircle className="mr-1.5 inline h-4 w-4" />
                {listError}
              </div>
            )}

            {!loadingList && !listError && enterprises.length === 0 && (
              <p className="py-8 text-center text-sm text-stone-400">
                Nenhum empreendimento encontrado.
              </p>
            )}

            {!loadingList && enterprises.length > 0 && (
              <ul className="max-h-96 space-y-1.5 overflow-y-auto">
                {enterprises.map((ent) => (
                  <li key={ent.id}>
                    <button
                      onClick={() => selectEnterprise(ent)}
                      disabled={saving}
                      className="flex w-full items-start justify-between rounded-lg border border-stone-800 bg-stone-950 px-3 py-2.5 text-left transition-colors hover:border-[#F27A5E] hover:bg-stone-800 disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {ent.name}
                        </p>
                        <p className="text-xs text-stone-400">
                          {ent.city ? `${ent.city} · ` : ""}
                          {ent.totalUnits} unidades
                        </p>
                      </div>
                      <span className="ml-2 text-xs text-stone-500">
                        #{ent.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
