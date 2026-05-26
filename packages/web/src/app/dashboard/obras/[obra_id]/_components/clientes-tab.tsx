"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { UserPlus, Trash2, Pencil, Check, X, Search, Lock } from "lucide-react"

interface Cliente {
  id: string         // vinculo_id (clientes_obras_vinculos.id)
  name: string
  cpf: string
  email: string
  is_primary: boolean
  numero_unidade: string | null
}

interface ClientesTabProps {
  obraId: string
  clientes: Cliente[]
}

interface CrmClienteEncontrado {
  id: string
  nome: string
  cpf: string | null
  email: string | null
}

function isValidCpfFormat(cpf: string): boolean {
  return cpf.replace(/\D/g, "").length === 11
}

export function ClientesTab({ obraId, clientes }: ClientesTabProps) {
  const router = useRouter()

  // ── Formulário A: criar / acesso para cliente ─────────────────────────
  const [cpfA, setCpfA] = useState("")
  const [nomeA, setNomeA] = useState("")
  const [emailA, setEmailA] = useState("")
  const [senhaA, setSenhaA] = useState("")
  const [unidadeA, setUnidadeA] = useState("")
  const [savingA, setSavingA] = useState(false)
  const [errorA, setErrorA] = useState<string | null>(null)

  // Estado do lookup por CPF no formulário A
  const [searchingCpfA, setSearchingCpfA] = useState(false)
  const [crmClienteA, setCrmClienteA] = useState<CrmClienteEncontrado | null>(null)
  const [cpfABuscado, setCpfABuscado] = useState("")
  const cpfAAbortRef = useRef<AbortController | null>(null)

  // ── Formulário B: vincular por CPF ────────────────────────────────────
  const [cpfB, setCpfB] = useState("")
  const [unidadeB, setUnidadeB] = useState("")
  const [savingB, setSavingB] = useState(false)
  const [errorB, setErrorB] = useState<string | null>(null)
  const [crmClienteB, setCrmClienteB] = useState<CrmClienteEncontrado | null>(null)
  const [searchingCrm, setSearchingCrm] = useState(false)
  const [cpfBBuscado, setCpfBBuscado] = useState("")
  const crmAbortRef = useRef<AbortController | null>(null)

  // ── Edição inline de unidade ──────────────────────────────────────────
  const [editingUnidade, setEditingUnidade] = useState<string | null>(null)
  const [unidadeInput, setUnidadeInput] = useState("")
  const [savingUnidade, setSavingUnidade] = useState(false)

  // ── Lookup CPF no formulário A ────────────────────────────────────────

  async function buscarCpfParaCriar(cpfRaw: string) {
    const cpf = cpfRaw.trim()
    if (!isValidCpfFormat(cpf)) return
    if (cpf === cpfABuscado) return

    cpfAAbortRef.current?.abort()
    const controller = new AbortController()
    cpfAAbortRef.current = controller

    setCpfABuscado(cpf)
    setSearchingCpfA(true)
    setCrmClienteA(null)
    setNomeA("")
    setEmailA("")

    try {
      const res = await fetch(
        `/api/admin/clientes/search?cpf=${encodeURIComponent(cpf)}`,
        { signal: controller.signal }
      )
      if (controller.signal.aborted) return
      if (res.ok) {
        const json = (await res.json()) as { data?: CrmClienteEncontrado[] }
        if (controller.signal.aborted) return
        const found = json.data?.[0] ?? null
        setCrmClienteA(found)
        if (found) {
          // Preenche automaticamente com dados do CRM
          setNomeA(found.nome)
          setEmailA(found.email ?? "")
        }
      }
    } catch {
      // graceful degradation
    } finally {
      if (cpfAAbortRef.current === controller) {
        setSearchingCpfA(false)
      }
    }
  }

  function handleCpfAChange(value: string) {
    setCpfA(value)
    if (!value.trim()) {
      cpfAAbortRef.current?.abort()
      setCrmClienteA(null)
      setCpfABuscado("")
      setNomeA("")
      setEmailA("")
    } else if (crmClienteA && value.trim() !== cpfABuscado) {
      cpfAAbortRef.current?.abort()
      setCrmClienteA(null)
      setCpfABuscado("")
    }
  }

  async function handleCreateCliente(e: React.FormEvent) {
    e.preventDefault()
    const cpf = cpfA.trim()
    const nome = nomeA.trim()
    const email = emailA.trim()
    if (!cpf || !nome || !email || !senhaA) return
    setErrorA(null)
    setSavingA(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/clientes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          cpf,
          email,
          senha_temporaria: senhaA,
          numero_unidade: unidadeA.trim() || undefined,
          // Sinaliza ao backend que o cliente CRM já existe (só criar portal + vínculo)
          crm_id: crmClienteA?.id ?? undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao criar cliente")
      }
      setCpfA("")
      setNomeA("")
      setEmailA("")
      setSenhaA("")
      setUnidadeA("")
      setCrmClienteA(null)
      setCpfABuscado("")
      router.refresh()
    } catch (err) {
      setErrorA(err instanceof Error ? err.message : "Erro ao criar cliente")
    } finally {
      setSavingA(false)
    }
  }

  // ── Formulário B: busca e vínculo por CPF ─────────────────────────────

  async function buscarClientePorCpf(cpfRaw: string) {
    const cpf = cpfRaw.trim()
    if (!isValidCpfFormat(cpf)) return
    if (cpf === cpfBBuscado) return

    crmAbortRef.current?.abort()
    const controller = new AbortController()
    crmAbortRef.current = controller

    setCpfBBuscado(cpf)
    setSearchingCrm(true)
    setCrmClienteB(null)
    setErrorB(null)

    try {
      const res = await fetch(
        `/api/admin/clientes/search?cpf=${encodeURIComponent(cpf)}`,
        { signal: controller.signal }
      )
      if (controller.signal.aborted) return
      if (!res.ok) {
        setErrorB(
          "CPF não encontrado no cadastro. Cadastre em Configurações → Clientes antes de vincular."
        )
        return
      }
      const json = (await res.json()) as { data?: CrmClienteEncontrado[] }
      if (controller.signal.aborted) return
      const found = json.data?.[0] ?? null
      setCrmClienteB(found)
      if (!found) {
        setErrorB(
          "CPF não encontrado no cadastro. Cadastre em Configurações → Clientes antes de vincular."
        )
      }
    } catch {
      // silêncio em abort
    } finally {
      if (crmAbortRef.current === controller) setSearchingCrm(false)
    }
  }

  function handleCpfBChange(value: string) {
    setCpfB(value)
    if (!value.trim()) {
      crmAbortRef.current?.abort()
      setCrmClienteB(null)
      setCpfBBuscado("")
      setErrorB(null)
    } else if (crmClienteB && value.trim() !== cpfBBuscado) {
      crmAbortRef.current?.abort()
      setCrmClienteB(null)
    }
  }

  async function handleVincularCliente(e: React.FormEvent) {
    e.preventDefault()
    if (!cpfB.trim()) return
    setErrorB(null)
    setSavingB(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/clientes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpf: cpfB.trim(),
          numero_unidade: unidadeB.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao vincular cliente")
      }
      setCpfB("")
      setUnidadeB("")
      setCrmClienteB(null)
      setCpfBBuscado("")
      router.refresh()
    } catch (err) {
      setErrorB(err instanceof Error ? err.message : "Erro ao vincular cliente")
    } finally {
      setSavingB(false)
    }
  }

  // ── Lista ─────────────────────────────────────────────────────────────

  async function handleDesvincular(vinculoId: string) {
    if (!window.confirm("Desvincular este cliente da obra?")) return
    try {
      const res = await fetch(
        `/api/admin/obras/${obraId}/clientes/${vinculoId}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao desvincular")
      }
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao desvincular")
    }
  }

  function startEditUnidade(cliente: Cliente) {
    setEditingUnidade(cliente.id)
    setUnidadeInput(cliente.numero_unidade ?? "")
  }

  function cancelEditUnidade() {
    setEditingUnidade(null)
    setUnidadeInput("")
  }

  async function handleSalvarUnidade(vinculoId: string) {
    setSavingUnidade(true)
    try {
      const res = await fetch(
        `/api/admin/obras/${obraId}/clientes/${vinculoId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numero_unidade: unidadeInput.trim() || null }),
        }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Erro ao salvar unidade")
      }
      setEditingUnidade(null)
      setUnidadeInput("")
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar unidade")
    } finally {
      setSavingUnidade(false)
    }
  }

  // ── Derivações do estado do formulário A ──────────────────────────────

  // CPF foi buscado e encontrado no CRM
  const cpfEncontradoNoCrm = !!crmClienteA
  // CPF foi buscado e NÃO encontrado no CRM
  const cpfNaoEncontrado =
    cpfABuscado.length > 0 && !searchingCpfA && !crmClienteA

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
  const inputReadonlyCls =
    "w-full rounded-lg border border-stone-600 bg-stone-800/60 px-3 py-2 text-sm text-stone-300 cursor-not-allowed"

  return (
    <div className="space-y-5">
      {/* Lista de clientes vinculados */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
          Clientes Vinculados ({clientes.length})
        </h2>
        {clientes.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-stone-400">
            Nenhum cliente vinculado a esta obra.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-stone-800">
            {clientes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-stone-100">
                    {c.name}
                  </p>
                  {c.cpf && (
                    <p className="text-xs text-gray-500 dark:text-stone-400">
                      CPF: {c.cpf}
                    </p>
                  )}
                  {c.email && (
                    <p className="text-xs text-gray-400 dark:text-stone-500">
                      {c.email}
                    </p>
                  )}
                  {editingUnidade === c.id ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <input
                        type="text"
                        value={unidadeInput}
                        onChange={(e) => setUnidadeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSalvarUnidade(c.id)
                          if (e.key === "Escape") cancelEditUnidade()
                        }}
                        placeholder="Ex: 203"
                        autoFocus
                        className="w-28 rounded border border-gray-300 px-2 py-0.5 text-xs focus:border-orange-500 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                      />
                      <button
                        onClick={() => handleSalvarUnidade(c.id)}
                        disabled={savingUnidade}
                        className="rounded p-0.5 text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/15"
                        title="Salvar"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={cancelEditUnidade}
                        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 dark:text-stone-500 dark:hover:bg-stone-800"
                        title="Cancelar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    c.numero_unidade && (
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-stone-500">
                        Unidade {c.numero_unidade}
                      </p>
                    )
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  {editingUnidade !== c.id && (
                    <button
                      onClick={() => startEditUnidade(c)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                      title="Editar unidade"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDesvincular(c.id)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-stone-500 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                    title="Desvincular"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Formulário B: Vincular por CPF */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
          Vincular cliente por CPF
        </h2>
        <p className="mb-4 text-xs text-gray-400 dark:text-stone-500">
          O cliente deve estar cadastrado em{" "}
          <span className="font-medium text-orange-500">
            Configurações → Clientes
          </span>
          .
        </p>
        <form onSubmit={handleVincularCliente} className="space-y-3">
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="CPF do cliente (000.000.000-00) *"
                value={cpfB}
                onChange={(e) => handleCpfBChange(e.target.value)}
                onBlur={(e) => buscarClientePorCpf(e.target.value)}
                required
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => buscarClientePorCpf(cpfB)}
                disabled={searchingCrm || !isValidCpfFormat(cpfB)}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <Search className="h-3.5 w-3.5" />
                {searchingCrm ? "Buscando..." : "Buscar"}
              </button>
            </div>
            {crmClienteB && (
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200">
                <span className="font-medium">✓ Cliente encontrado:</span>{" "}
                {crmClienteB.nome}
                {crmClienteB.email && (
                  <span className="ml-1 text-green-600 dark:text-green-400">
                    — {crmClienteB.email}
                  </span>
                )}
              </div>
            )}
          </div>
          <input
            type="text"
            placeholder="Nº da unidade / apartamento (opcional)"
            value={unidadeB}
            onChange={(e) => setUnidadeB(e.target.value)}
            className={inputCls}
          />
          {errorB && (
            <p className="text-xs text-red-600 dark:text-red-300">{errorB}</p>
          )}
          <button
            type="submit"
            disabled={savingB || !cpfB.trim() || !crmClienteB}
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50 dark:border-orange-400 dark:text-orange-300 dark:hover:bg-orange-500/15"
          >
            {savingB ? "Vinculando..." : "Vincular"}
          </button>
        </form>
      </section>

      {/* Formulário A: Criar acesso / novo cliente */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-stone-400">
          Criar acesso ao portal
        </h2>
        <p className="mb-4 text-xs text-gray-400 dark:text-stone-500">
          Digite o CPF — se o cliente já estiver no CRM, os dados são
          preenchidos automaticamente.
        </p>
        <form onSubmit={handleCreateCliente} className="space-y-3">
          {/* CPF — sempre primeiro */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="CPF (000.000.000-00) *"
              value={cpfA}
              onChange={(e) => handleCpfAChange(e.target.value)}
              onBlur={(e) => buscarCpfParaCriar(e.target.value)}
              required
              className={inputCls}
            />
            {isValidCpfFormat(cpfA) && cpfA.trim() !== cpfABuscado && (
              <button
                type="button"
                onClick={() => buscarCpfParaCriar(cpfA)}
                disabled={searchingCpfA}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <Search className="h-3.5 w-3.5" />
                {searchingCpfA ? "..." : "Buscar"}
              </button>
            )}
          </div>

          {searchingCpfA && (
            <p className="text-xs text-gray-400 dark:text-stone-500">
              Consultando cadastro...
            </p>
          )}

          {/* Badge CRM encontrado */}
          {cpfEncontradoNoCrm && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200">
              <Check className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Dados puxados do CRM —{" "}
                <span className="font-medium">{crmClienteA!.nome}</span>.
                Informe apenas a senha para criar o acesso ao portal.
              </span>
            </div>
          )}

          {/* Badge CPF novo */}
          {cpfNaoEncontrado && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              CPF não encontrado no CRM. Preencha os dados para criar o cadastro
              e o acesso ao portal.
            </div>
          )}

          {/* Nome — readonly se veio do CRM */}
          {(cpfEncontradoNoCrm || cpfNaoEncontrado) && (
            <div className="relative">
              <input
                type="text"
                placeholder="Nome completo *"
                value={nomeA}
                onChange={(e) => !cpfEncontradoNoCrm && setNomeA(e.target.value)}
                readOnly={cpfEncontradoNoCrm}
                required
                className={cpfEncontradoNoCrm ? inputReadonlyCls : inputCls}
              />
              {cpfEncontradoNoCrm && (
                <Lock className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" />
              )}
            </div>
          )}

          {/* Email — readonly se veio do CRM */}
          {(cpfEncontradoNoCrm || cpfNaoEncontrado) && (
            <div className="relative">
              <input
                type="email"
                placeholder="Email (acesso ao portal) *"
                value={emailA}
                onChange={(e) =>
                  !cpfEncontradoNoCrm && setEmailA(e.target.value)
                }
                readOnly={cpfEncontradoNoCrm}
                required
                className={cpfEncontradoNoCrm ? inputReadonlyCls : inputCls}
              />
              {cpfEncontradoNoCrm && (
                <Lock className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" />
              )}
            </div>
          )}

          {/* Senha — sempre editável */}
          {(cpfEncontradoNoCrm || cpfNaoEncontrado) && (
            <input
              type="password"
              placeholder="Senha temporária *"
              value={senhaA}
              onChange={(e) => setSenhaA(e.target.value)}
              required
              className={inputCls}
            />
          )}

          {/* Nº unidade — sempre editável */}
          {(cpfEncontradoNoCrm || cpfNaoEncontrado) && (
            <input
              type="text"
              placeholder="Nº da unidade / apartamento (opcional)"
              value={unidadeA}
              onChange={(e) => setUnidadeA(e.target.value)}
              className={inputCls}
            />
          )}

          {errorA && (
            <p className="text-xs text-red-600 dark:text-red-300">{errorA}</p>
          )}

          {(cpfEncontradoNoCrm || cpfNaoEncontrado) && (
            <button
              type="submit"
              disabled={
                savingA ||
                !cpfA.trim() ||
                !nomeA.trim() ||
                !emailA.trim() ||
                !senhaA
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              {savingA
                ? "Criando..."
                : cpfEncontradoNoCrm
                  ? "Criar Acesso e Vincular"
                  : "Criar no CRM e Vincular"}
            </button>
          )}
        </form>
      </section>
    </div>
  )
}
