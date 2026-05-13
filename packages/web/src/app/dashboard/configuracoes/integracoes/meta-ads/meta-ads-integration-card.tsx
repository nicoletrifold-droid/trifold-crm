'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  initialData: {
    has_token: boolean
    last_4: string | null
    ad_account_id: string | null
    status: string | null
    last_synced_at: string | null
  }
}

type TestResult = { ok: true; name: string; currency: string } | { ok: false; error: string }

const STATUS_LABELS: Record<string, string> = {
  active: 'Conectado',
  disconnected: 'Não testado',
  error: 'Erro de conexão',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  disconnected: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
}

export function MetaAdsIntegrationCard({ initialData }: Props) {
  const router = useRouter()

  const [token, setToken] = useState('')
  const [adAccountId, setAdAccountId] = useState(initialData.ad_account_id ?? '')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [currentStatus, setCurrentStatus] = useState(initialData.status)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setTestResult(null)

    try {
      const res = await fetch('/api/meta-ads/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ad_account_id: adAccountId }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string; detail?: string }
        setSaveError(data.detail ?? data.error ?? 'Erro ao salvar')
        return
      }

      setToken('')
      setCurrentStatus('disconnected')
      router.refresh()
    } catch {
      setSaveError('Erro de rede. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/meta-ads/account/test')
      const data = (await res.json()) as TestResult

      setTestResult(data)
      if (data.ok) {
        setCurrentStatus('active')
      } else {
        setCurrentStatus('error')
      }
      router.refresh()
    } catch {
      setTestResult({ ok: false, error: 'Erro de rede. Tente novamente.' })
    } finally {
      setTesting(false)
    }
  }

  const statusLabel = currentStatus ? STATUS_LABELS[currentStatus] : null
  const statusColor = currentStatus ? STATUS_COLORS[currentStatus] : ''

  return (
    <div className="space-y-6">
      {initialData.has_token && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-stone-800 dark:bg-stone-800/50">
          <div className="text-sm text-gray-600 dark:text-stone-300">
            <span className="font-medium">Token salvo</span>
            {initialData.last_4 && (
              <span className="ml-2 font-mono text-gray-400 dark:text-stone-500">····{initialData.last_4}</span>
            )}
            {initialData.ad_account_id && (
              <span className="ml-3 text-gray-500 dark:text-stone-400">Conta: {initialData.ad_account_id}</span>
            )}
          </div>
          {statusLabel && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
              {statusLabel}
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300">
            Ad Account ID
          </label>
          <input
            type="text"
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            placeholder="act_1234567890"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-stone-400">
            Encontre em: Meta Business Suite → Configurações → Contas de anúncios
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300">
            System User Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={initialData.has_token ? 'Novo token (deixe vazio para manter atual)' : 'EAABwzLixnjY…'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-stone-400">
            System User Token com permissões ads_read, ads_management
          </p>
        </div>

        {saveError && (
          <p className="text-sm text-red-600 dark:text-red-300">{saveError}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || (!token && !adAccountId)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar token'}
          </button>

          {initialData.has_token && (
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {testing ? 'Testando…' : 'Testar conexão'}
            </button>
          )}
        </div>
      </form>

      {testResult && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            testResult.ok
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
          }`}
        >
          {testResult.ok ? (
            <span>
              Conectado com sucesso — <strong>{testResult.name}</strong> ({testResult.currency})
            </span>
          ) : (
            <span>
              {testResult.error === 'token_invalid'
                ? 'Token inválido ou expirado. Verifique o System User Token.'
                : testResult.error === 'permission_denied'
                  ? 'Permissão insuficiente. O token precisa de ads_read e ads_management.'
                  : `Erro ao conectar: ${testResult.error}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
