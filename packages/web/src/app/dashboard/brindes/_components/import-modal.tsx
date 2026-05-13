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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">Importar Destinatários</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Cole os dados no formato CSV (separador <code className="bg-gray-100 px-1 rounded">;</code>):</p>
            <p className="mb-2 text-xs text-gray-500">
              <code className="bg-gray-100 px-1 rounded text-xs">obra_nome;tipo;nome;observacao;endereco_raw</code><br />
              tipo: <code className="bg-gray-100 px-1 rounded text-xs">mae</code>, <code className="bg-gray-100 px-1 rounded text-xs">pai</code> ou <code className="bg-gray-100 px-1 rounded text-xs">outro</code>
            </p>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setResult(null); setError(null) }}
              rows={8}
              placeholder={"COMUNIDADE EVANGELICA;mae;Maria Silva;Retirar na portaria;Rua das Flores 123, Maringá - PR\nFORTEGREEN;pai;João Souza;;OBRA FORTEGREEN"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {preview.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">Preview (primeiras {preview.length} linhas):</p>
              <div className="overflow-x-auto rounded-md border border-gray-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Obra", "Tipo", "Nome", "Observação", "Endereço"].map((h) => (
                        <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 text-gray-900">{r.obra_nome || <span className="text-red-500">—</span>}</td>
                        <td className="px-2 py-1 text-gray-600">{r.tipo}</td>
                        <td className="px-2 py-1 text-gray-900">{r.nome || <span className="text-red-500">—</span>}</td>
                        <td className="px-2 py-1 text-gray-500">{r.observacao}</td>
                        <td className="px-2 py-1 text-gray-500 max-w-32 truncate">{r.endereco_raw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className={`rounded-md px-3 py-2 text-sm ${result.errors.length > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>
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

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
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
