"use client"

import { useEffect, useState } from "react"
import { Search, X, Plus, User } from "lucide-react"

export interface ClienteCRMObraResumida {
  obra_id: string
  obra_nome: string | null
  numero_unidade: string | null
}

export interface ClienteCRMResumido {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  obras: ClienteCRMObraResumida[]
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_estado: string | null
  endereco_cep: string | null
  endereco_referencia: string | null
}

interface ObraOption {
  id: string
  name: string
}

interface ClienteCrmSearchProps {
  clienteId: string | null
  onClienteSelect: (cliente: ClienteCRMResumido | null) => void
}

type SearchHit = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  obras: ClienteCRMObraResumida[]
}

const inp =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
const lbl = "mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300"

const EMPTY_NEW_CRM = {
  nome: "",
  email: "",
  telefone: "",
  obra_id: "",
  numero_unidade: "",
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function ClienteCrmSearch({ clienteId, onClienteSelect }: ClienteCrmSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [selectedNome, setSelectedNome] = useState<string | null>(null)
  const [loadingBadge, setLoadingBadge] = useState(false)

  const [showNewForm, setShowNewForm] = useState(false)
  const [newCrm, setNewCrm] = useState({ ...EMPTY_NEW_CRM })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [obras, setObras] = useState<ObraOption[]>([])

  // Carrega lista de obras (somente quando o sub-form abrir)
  useEffect(() => {
    if (!showNewForm) return
    let aborted = false
    fetch("/api/admin/obras")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Erro ao carregar obras"))))
      .then((d: { obras?: ObraOption[] }) => {
        if (!aborted) setObras(d.obras ?? [])
      })
      .catch(() => {
        if (!aborted) setObras([])
      })
    return () => {
      aborted = true
    }
  }, [showNewForm])

  // Hidrata o badge quando o modal abre com cliente_id já preenchido
  useEffect(() => {
    if (!clienteId) {
      setSelectedNome(null)
      return
    }
    // Já temos um nome (selecionado nesta sessão) — não refazer fetch.
    if (selectedNome) return
    let aborted = false
    setLoadingBadge(true)
    fetch(`/api/admin/clientes/${clienteId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Erro"))))
      .then((payload: { data?: { nome?: string } }) => {
        if (!aborted) setSelectedNome(payload.data?.nome ?? null)
      })
      .catch(() => {
        // graceful degradation: badge apenas mostra "Vinculado" sem nome
        if (!aborted) setSelectedNome(null)
      })
      .finally(() => {
        if (!aborted) setLoadingBadge(false)
      })
    return () => {
      aborted = true
    }
    // selectedNome intencionalmente fora das deps: só refaz fetch se clienteId mudar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  async function handleSearch() {
    const term = query.trim()
    if (!term) {
      setSearchError("Digite um nome ou email para buscar.")
      return
    }
    setSearching(true)
    setSearchError(null)
    setResults(null)
    try {
      const param = isEmailLike(term) ? `email=${encodeURIComponent(term)}` : `q=${encodeURIComponent(term)}`
      const res = await fetch(`/api/admin/clientes/search?${param}`)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setSearchError(data.error ?? "Erro ao buscar clientes.")
        return
      }
      const { data } = (await res.json()) as { data: SearchHit[] }
      setResults((data ?? []).slice(0, 5))
    } catch {
      setSearchError("Erro de rede ao buscar clientes.")
    } finally {
      setSearching(false)
    }
  }

  async function handleSelect(hit: SearchHit) {
    // Buscar dados completos (endereço) do cliente para preenchimento
    try {
      const res = await fetch(`/api/admin/clientes/${hit.id}`)
      if (!res.ok) {
        // Fallback: usar somente os dados resumidos
        const fallback: ClienteCRMResumido = {
          id: hit.id,
          nome: hit.nome,
          email: hit.email,
          telefone: hit.telefone,
          obras: hit.obras,
          endereco_logradouro: null,
          endereco_numero: null,
          endereco_complemento: null,
          endereco_bairro: null,
          endereco_cidade: null,
          endereco_estado: null,
          endereco_cep: null,
          endereco_referencia: null,
        }
        setSelectedNome(hit.nome)
        setResults(null)
        setQuery("")
        onClienteSelect(fallback)
        return
      }
      const payload = (await res.json()) as {
        data: {
          id: string
          nome: string
          email: string | null
          telefone: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          endereco_complemento: string | null
          endereco_bairro: string | null
          endereco_cidade: string | null
          endereco_estado: string | null
          endereco_cep: string | null
          endereco_referencia: string | null
          clientes_obras_vinculos?: Array<{
            obra_id: string
            numero_unidade: string | null
            obras: { id: string; name: string } | { id: string; name: string }[] | null
          }>
        }
      }
      const c = payload.data
      const obrasMapped: ClienteCRMObraResumida[] = (c.clientes_obras_vinculos ?? []).map((v) => {
        const obra = Array.isArray(v.obras) ? v.obras[0] : v.obras
        return {
          obra_id: v.obra_id,
          obra_nome: obra?.name ?? null,
          numero_unidade: v.numero_unidade ?? null,
        }
      })
      const full: ClienteCRMResumido = {
        id: c.id,
        nome: c.nome,
        email: c.email,
        telefone: c.telefone,
        obras: obrasMapped.length > 0 ? obrasMapped : hit.obras,
        endereco_logradouro: c.endereco_logradouro,
        endereco_numero: c.endereco_numero,
        endereco_complemento: c.endereco_complemento,
        endereco_bairro: c.endereco_bairro,
        endereco_cidade: c.endereco_cidade,
        endereco_estado: c.endereco_estado,
        endereco_cep: c.endereco_cep,
        endereco_referencia: c.endereco_referencia,
      }
      setSelectedNome(full.nome)
      setResults(null)
      setQuery("")
      onClienteSelect(full)
    } catch {
      setSearchError("Erro ao carregar dados do cliente.")
    }
  }

  function handleUnlink() {
    setSelectedNome(null)
    setResults(null)
    setQuery("")
    onClienteSelect(null)
  }

  async function handleCreateCrm() {
    if (creating) return
    const nome = newCrm.nome.trim()
    if (!nome) {
      setCreateError("Nome é obrigatório.")
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch("/api/admin/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          email: newCrm.email.trim() || null,
          telefone: newCrm.telefone.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setCreateError(data.error ?? "Erro ao criar cliente CRM.")
        return
      }
      const { data: created } = (await res.json()) as {
        data: { id: string; nome: string; email: string | null; telefone: string | null }
      }

      const finalObras: ClienteCRMObraResumida[] = []
      // Vincular obra (opcional)
      if (newCrm.obra_id) {
        const vRes = await fetch(`/api/admin/clientes/${created.id}/obras`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            obra_id: newCrm.obra_id,
            numero_unidade: newCrm.numero_unidade.trim() || null,
          }),
        })
        if (vRes.ok) {
          finalObras.push({
            obra_id: newCrm.obra_id,
            obra_nome: findObraName(newCrm.obra_id),
            numero_unidade: newCrm.numero_unidade.trim() || null,
          })
        }
        // Se vincular falhar, seguir com o cliente criado mesmo assim (não bloquear UX).
      }

      const fullCliente: ClienteCRMResumido = {
        id: created.id,
        nome: created.nome,
        email: created.email,
        telefone: created.telefone,
        obras: finalObras,
        endereco_logradouro: null,
        endereco_numero: null,
        endereco_complemento: null,
        endereco_bairro: null,
        endereco_cidade: null,
        endereco_estado: null,
        endereco_cep: null,
        endereco_referencia: null,
      }

      setSelectedNome(created.nome)
      setNewCrm({ ...EMPTY_NEW_CRM })
      setShowNewForm(false)
      setQuery("")
      setResults(null)
      onClienteSelect(fullCliente)
    } catch {
      setCreateError("Erro de rede.")
    } finally {
      setCreating(false)
    }
  }

  // Helper para localizar o nome da obra a partir do select carregado
  function findObraName(obraId: string): string | null {
    if (!obraId) return null
    return obras.find((o) => o.id === obraId)?.name ?? null
  }

  return (
    <div className="rounded-md border border-orange-200 bg-orange-50/40 p-3 dark:border-orange-500/30 dark:bg-orange-500/5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">
          Vincular a Cliente CRM
        </p>
        {clienteId && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-2.5 py-0.5 text-xs font-medium text-white">
            <User className="h-3 w-3" />
            {loadingBadge ? "Carregando..." : `Vinculado: ${selectedNome ?? "cliente"}`}
            <button
              type="button"
              onClick={handleUnlink}
              className="ml-1 rounded-full p-0.5 hover:bg-white/20"
              aria-label="Desvincular cliente"
              title="Desvincular cliente"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {!clienteId && (
        <>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void handleSearch()
                }
              }}
              className={inp}
              placeholder="Buscar por nome ou email..."
              disabled={searching}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              aria-label="Buscar cliente"
              title="Buscar cliente"
            >
              <Search className="h-4 w-4" />
              {searching ? "..." : "Buscar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewForm((s) => !s)
                setCreateError(null)
              }}
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-orange-300 px-2 py-2 text-sm text-orange-700 hover:bg-orange-100 dark:border-orange-500/50 dark:text-orange-300 dark:hover:bg-orange-500/10"
              aria-label="Criar novo cliente CRM"
              title="Criar novo cliente CRM"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {searchError && (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">
              {searchError}
            </p>
          )}

          {results && results.length === 0 && (
            <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-stone-800/50 dark:text-stone-400">
              Nenhum cliente encontrado. Use o botão &quot;+&quot; para criar um novo.
            </p>
          )}

          {results && results.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {results.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => void handleSelect(hit)}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-orange-400 hover:bg-orange-50 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-orange-500/50 dark:hover:bg-orange-500/5"
                  >
                    <div className="font-medium text-gray-900 dark:text-stone-100">{hit.nome}</div>
                    <div className="text-xs text-gray-500 dark:text-stone-400">
                      {hit.email ?? "sem email"}
                      {hit.obras.length > 0 && (
                        <>
                          {" · "}
                          {hit.obras
                            .map((o) => o.obra_nome ?? "obra")
                            .slice(0, 2)
                            .join(", ")}
                          {hit.obras.length > 2 && ` +${hit.obras.length - 2}`}
                        </>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showNewForm && (
            <div className="mt-3 rounded-md border border-gray-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-800/50">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-stone-500">
                Novo Cliente CRM
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className={lbl}>
                    Nome <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newCrm.nome}
                    onChange={(e) => setNewCrm((c) => ({ ...c, nome: e.target.value }))}
                    className={inp}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label className={lbl}>Email</label>
                  <input
                    type="email"
                    value={newCrm.email}
                    onChange={(e) => setNewCrm((c) => ({ ...c, email: e.target.value }))}
                    className={inp}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label className={lbl}>Telefone</label>
                  <input
                    type="text"
                    value={newCrm.telefone}
                    onChange={(e) => setNewCrm((c) => ({ ...c, telefone: e.target.value }))}
                    className={inp}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div>
                  <label className={lbl}>Obra</label>
                  <select
                    value={newCrm.obra_id}
                    onChange={(e) => setNewCrm((c) => ({ ...c, obra_id: e.target.value }))}
                    className={inp}
                  >
                    <option value="">— Sem obra —</option>
                    {obras.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Unidade</label>
                  <input
                    type="text"
                    value={newCrm.numero_unidade}
                    onChange={(e) => setNewCrm((c) => ({ ...c, numero_unidade: e.target.value }))}
                    className={inp}
                    placeholder="Apto 101"
                    disabled={!newCrm.obra_id}
                  />
                </div>
              </div>
              {createError && (
                <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">
                  {createError}
                </p>
              )}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewForm(false)
                    setNewCrm({ ...EMPTY_NEW_CRM })
                    setCreateError(null)
                  }}
                  disabled={creating}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateCrm}
                  disabled={creating}
                  className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {creating ? "Criando..." : "Criar e usar"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
