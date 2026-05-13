"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

interface ImportModalProps {
  onClose: () => void
}

interface ImportRecord {
  obra_nome: string
  tipo: string
  nome: string
  observacao: string
  endereco_raw: string
}

function parseCsvLines(text: string): ImportRecord[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(";")
      return {
        obra_nome: parts[0]?.trim() ?? "",
        tipo: parts[1]?.trim().toLowerCase() ?? "",
        nome: parts[2]?.trim() ?? "",
        observacao: parts[3]?.trim() ?? "",
        endereco_raw: parts[4]?.trim() ?? "",
      }
    })
}

export function ImportModal({ onClose }: ImportModalProps) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ inserted: number; errors: { index: number; reason: string }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const preview = parseCsvLines(text).slice(0, 5)

  async function handleImport() {
    const records = parseCsvLines(text)
    if (records.length === 0) { setError("Nenhum registro para importar."); return }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/brindes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      })
      const data = (await res.json()) as typeof result
      if (!res.ok) {
        setError((data as unknown as { error?: string }).error ?? "Erro no import.")
        return
      }
      setResult(data)
      if (data && data.inserted > 0) router.refresh()
    } catch {
      setError("Erro de rede.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 dark:bg-black/70">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-stone-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">Importar Destinatários</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700 dark:text-stone-300">Cole os dados no formato CSV (separador <code className="bg-gray-100 px-1 rounded dark:bg-stone-800 dark:text-stone-300">;</code>):</p>
            <p className="mb-2 text-xs text-gray-500 dark:text-stone-400">
              <code className="bg-gray-100 px-1 rounded text-xs dark:bg-stone-800 dark:text-stone-300">obra_nome;tipo;nome;observacao;endereco_raw</code><br />
              tipo: <code className="bg-gray-100 px-1 rounded text-xs dark:bg-stone-800 dark:text-stone-300">mae</code>, <code className="bg-gray-100 px-1 rounded text-xs dark:bg-stone-800 dark:text-stone-300">pai</code> ou <code className="bg-gray-100 px-1 rounded text-xs dark:bg-stone-800 dark:text-stone-300">outro</code>
            </p>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setResult(null); setError(null) }}
              rows={8}
              placeholder={"COMUNIDADE EVANGELICA;mae;Maria Silva;Retirar na portaria;Rua das Flores 123, Maringá - PR\nFORTEGREEN;pai;João Souza;;OBRA FORTEGREEN"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>

          {preview.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500 dark:text-stone-400">Preview (primeiras {preview.length} linhas):</p>
              <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-stone-800">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-stone-800/50">
                    <tr>
                      {["Obra", "Tipo", "Nome", "Observação", "Endereço"].map((h) => (
                        <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-500 dark:text-stone-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
                    {preview.map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 text-gray-900 dark:text-stone-100">{r.obra_nome || <span className="text-red-500">—</span>}</td>
                        <td className="px-2 py-1 text-gray-600 dark:text-stone-300">{r.tipo}</td>
                        <td className="px-2 py-1 text-gray-900 dark:text-stone-100">{r.nome || <span className="text-red-500">—</span>}</td>
                        <td className="px-2 py-1 text-gray-500 dark:text-stone-400">{r.observacao}</td>
                        <td className="px-2 py-1 text-gray-500 max-w-32 truncate dark:text-stone-400">{r.endereco_raw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className={`rounded-md px-3 py-2 text-sm ${result.errors.length > 0 ? "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" : "bg-green-50 text-green-800 dark:bg-green-500/15 dark:text-green-200"}`}>
              <p className="font-medium">{result.inserted} registro(s) importado(s)</p>
              {result.errors.length > 0 && (
                <ul className="mt-1 text-xs space-y-0.5">
                  {result.errors.map((e) => (
                    <li key={e.index}>Linha {e.index + 1}: {e.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-stone-800">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-stone-300 dark:hover:bg-stone-800">
            Fechar
          </button>
          <button type="button" onClick={handleImport} disabled={loading || !text.trim()}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
            {loading ? "Importando..." : "Importar"}
          </button>
        </div>
      </div>
    </div>
  )
}
