"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Plus, Users, X } from "lucide-react"
import type { ObraOption } from "./clientes-page-client"

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]

interface ClienteModalProps {
  mode: "create" | "edit"
  clienteId?: string
  obras: ObraOption[]
  onClose: (refresh: boolean) => void
}

interface VinculoExistente {
  id: string
  obra_id: string
  numero_unidade: string | null
  obra: { id: string; nome: string } | null
}

interface VinculoNovo {
  tempId: string
  obra_id: string
  numero_unidade: string | null
}

const EMPTY_FIELDS = {
  nome: "",
  cpf: "",
  rg: "",
  email: "",
  telefone: "",
  whatsapp: "",
  data_nascimento: "",
  estado_civil: "",
  profissao: "",
  endereco_logradouro: "",
  endereco_numero: "",
  endereco_complemento: "",
  endereco_bairro: "",
  endereco_cidade: "",
  endereco_estado: "",
  endereco_cep: "",
  endereco_referencia: "",
  observacao: "",
}

type FieldKey = keyof typeof EMPTY_FIELDS

interface ClienteApiResponse {
  id: string
  nome: string | null
  cpf: string | null
  rg: string | null
  email: string | null
  telefone: string | null
  whatsapp: string | null
  data_nascimento: string | null
  estado_civil: string | null
  profissao: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_estado: string | null
  endereco_cep: string | null
  endereco_referencia: string | null
  observacao: string | null
  sienge_customer_id: number | null
  clientes_obras_vinculos:
    | Array<{
        id: string
        obra_id: string
        numero_unidade: string | null
        obras:
          | { id: string; name: string }
          | { id: string; name: string }[]
          | null
      }>
    | null
}

function s(v: string | null | undefined): string {
  return v ?? ""
}

function validateCpf(value: string): string | null {
  if (!value.trim()) return "CPF é obrigatório."
  if (!/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value.trim())) {
    return "CPF inválido. Use o formato 000.000.000-00."
  }
  return null
}

function validateEmail(value: string): string | null {
  if (!value.trim()) return null // e-mail é opcional no CRM
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return "E-mail inválido."
  }
  return null
}

export function ClienteModal({
  mode,
  clienteId,
  obras,
  onClose,
}: ClienteModalProps) {
  const [fields, setFields] = useState({ ...EMPTY_FIELDS })
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string | null>>>({})
  const [loading, setLoading] = useState(false)
  const [loadingCliente, setLoadingCliente] = useState(mode === "edit")
  const [error, setError] = useState<string | null>(null)

  // Collapsible sections — starts collapsed on mobile, expanded on desktop
  const [pessoaisOpen, setPessoaisOpen] = useState(true)
  const [enderecoOpen, setEnderecoOpen] = useState(false)

  const [vinculosExistentes, setVinculosExistentes] = useState<
    VinculoExistente[]
  >([])
  const [vinculosParaAdicionar, setVinculosParaAdicionar] = useState<
    VinculoNovo[]
  >([])
  const [vinculosParaRemover, setVinculosParaRemover] = useState<string[]>([])

  const [novaObraId, setNovaObraId] = useState("")
  const [novoNumeroUnidade, setNovoNumeroUnidade] = useState("")

  // Carregar cliente em modo edição
  useEffect(() => {
    if (mode !== "edit" || !clienteId) return
    let aborted = false
    setLoadingCliente(true)
    fetch(`/api/admin/clientes/${clienteId}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Erro ao carregar cliente"))
      )
      .then((payload: { data: ClienteApiResponse }) => {
        if (aborted) return
        const c = payload.data
        setFields({
          nome: s(c.nome),
          cpf: s(c.cpf),
          rg: s(c.rg),
          email: s(c.email),
          telefone: s(c.telefone),
          whatsapp: s(c.whatsapp),
          data_nascimento: s(c.data_nascimento),
          estado_civil: s(c.estado_civil),
          profissao: s(c.profissao),
          endereco_logradouro: s(c.endereco_logradouro),
          endereco_numero: s(c.endereco_numero),
          endereco_complemento: s(c.endereco_complemento),
          endereco_bairro: s(c.endereco_bairro),
          endereco_cidade: s(c.endereco_cidade),
          endereco_estado: s(c.endereco_estado),
          endereco_cep: s(c.endereco_cep),
          endereco_referencia: s(c.endereco_referencia),
          observacao: s(c.observacao),
        })

        const vincs = (c.clientes_obras_vinculos ?? []).map((v) => {
          const obra = Array.isArray(v.obras) ? v.obras[0] : v.obras
          return {
            id: v.id,
            obra_id: v.obra_id,
            numero_unidade: v.numero_unidade,
            obra: obra ? { id: obra.id, nome: obra.name } : null,
          } satisfies VinculoExistente
        })
        setVinculosExistentes(vincs)
        // Expandir endereço se tiver dados preenchidos
        if (c.endereco_logradouro || c.endereco_cidade) {
          setEnderecoOpen(true)
        }
      })
      .catch(() => {
        if (!aborted) setError("Erro ao carregar dados do cliente.")
      })
      .finally(() => {
        if (!aborted) setLoadingCliente(false)
      })
    return () => {
      aborted = true
    }
  }, [mode, clienteId])

  function set(field: FieldKey, value: string) {
    setFields((f) => ({ ...f, [field]: value }))
    // Limpar erro ao digitar
    if (fieldErrors[field]) {
      setFieldErrors((e) => ({ ...e, [field]: null }))
    }
  }

  function handleBlur(field: FieldKey) {
    if (field === "cpf") {
      setFieldErrors((e) => ({ ...e, cpf: validateCpf(fields.cpf) }))
    } else if (field === "email") {
      setFieldErrors((e) => ({ ...e, email: validateEmail(fields.email) }))
    }
  }

  function obraNome(id: string): string {
    return obras.find((o) => o.id === id)?.name ?? "(obra)"
  }

  function handleAddVinculo() {
    const obraId = novaObraId.trim()
    if (!obraId) return
    // Evitar duplicar vínculos para a mesma obra (existente não removido OU já adicionado)
    const jaExiste =
      vinculosExistentes.some(
        (v) => v.obra_id === obraId && !vinculosParaRemover.includes(v.id)
      ) || vinculosParaAdicionar.some((v) => v.obra_id === obraId)
    if (jaExiste) {
      setError("Esta obra já está vinculada ao cliente.")
      return
    }
    setError(null)
    setVinculosParaAdicionar((prev) => [
      ...prev,
      {
        tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        obra_id: obraId,
        numero_unidade: novoNumeroUnidade.trim() || null,
      },
    ])
    setNovaObraId("")
    setNovoNumeroUnidade("")
  }

  function handleRemoveVinculoExistente(id: string) {
    setVinculosParaRemover((prev) =>
      prev.includes(id) ? prev : [...prev, id]
    )
  }

  function handleUndoRemoveVinculoExistente(id: string) {
    setVinculosParaRemover((prev) => prev.filter((x) => x !== id))
  }

  function handleRemoveVinculoNovo(tempId: string) {
    setVinculosParaAdicionar((prev) => prev.filter((v) => v.tempId !== tempId))
  }

  function buildBodyForCreate(): Record<string, string | null> {
    const body: Record<string, string | null> = {
      nome: fields.nome.trim(),
      cpf: fields.cpf.trim() || null,
    }
    const optionalFields: FieldKey[] = [
      "rg",
      "email",
      "telefone",
      "whatsapp",
      "data_nascimento",
      "estado_civil",
      "profissao",
      "endereco_logradouro",
      "endereco_numero",
      "endereco_complemento",
      "endereco_bairro",
      "endereco_cidade",
      "endereco_estado",
      "endereco_cep",
      "endereco_referencia",
      "observacao",
    ]
    for (const f of optionalFields) {
      const v = fields[f].trim()
      body[f] = v ? v : null
    }
    return body
  }

  function buildBodyForPatch(): Record<string, string | null> {
    return buildBodyForCreate()
  }

  async function persistVinculos(targetClienteId: string): Promise<string[]> {
    const errors: string[] = []

    for (const vinculoId of vinculosParaRemover) {
      try {
        const res = await fetch(
          `/api/admin/clientes/${targetClienteId}/obras/${vinculoId}`,
          { method: "DELETE" }
        )
        if (!res.ok && res.status !== 204) {
          const d = (await res.json().catch(() => ({}))) as { error?: string }
          errors.push(d.error ?? `Erro ao remover vínculo.`)
        }
      } catch {
        errors.push("Erro de rede ao remover vínculo.")
      }
    }

    for (const novo of vinculosParaAdicionar) {
      try {
        const res = await fetch(
          `/api/admin/clientes/${targetClienteId}/obras`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              obra_id: novo.obra_id,
              numero_unidade: novo.numero_unidade,
            }),
          }
        )
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string }
          errors.push(
            d.error ?? `Erro ao adicionar vínculo com ${obraNome(novo.obra_id)}.`
          )
        }
      } catch {
        errors.push(
          `Erro de rede ao adicionar vínculo com ${obraNome(novo.obra_id)}.`
        )
      }
    }

    return errors
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return

    if (!fields.nome.trim()) {
      setError("Nome é obrigatório.")
      return
    }

    // Validar CPF e email antes de submeter
    const cpfErr = validateCpf(fields.cpf)
    const emailErr = validateEmail(fields.email)
    if (cpfErr || emailErr) {
      setFieldErrors({ cpf: cpfErr, email: emailErr })
      return
    }

    setLoading(true)
    setError(null)

    try {
      let targetId: string

      if (mode === "create") {
        const res = await fetch("/api/admin/clientes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBodyForCreate()),
        })
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string }
          setError(d.error ?? "Erro ao criar cliente.")
          return
        }
        const { data } = (await res.json()) as { data: { id: string } }
        targetId = data.id
      } else {
        if (!clienteId) {
          setError("ID do cliente ausente.")
          return
        }
        const res = await fetch(`/api/admin/clientes/${clienteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBodyForPatch()),
        })
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string }
          setError(d.error ?? "Erro ao salvar alterações.")
          return
        }
        targetId = clienteId
      }

      const vinculoErrors = await persistVinculos(targetId)
      if (vinculoErrors.length > 0) {
        setError(
          `Cliente salvo, mas houve erros em vínculos: ${vinculoErrors.join(" | ")}`
        )
        onClose(true)
        return
      }

      onClose(true)
    } catch {
      setError("Erro de rede.")
    } finally {
      setLoading(false)
    }
  }

  const inp = (hasErr?: boolean) =>
    `w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
      hasErr
        ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-500/70"
        : "border-gray-300 focus:border-orange-500 focus:ring-orange-500 dark:border-stone-700"
    } dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500`

  const lbl =
    "mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300"
  const secTitle =
    "text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-stone-500"

  const SectionToggle = ({
    title,
    open,
    onToggle,
  }: {
    title: string
    open: boolean
    onToggle: () => void
  }) => (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left transition-colors hover:bg-gray-50 dark:hover:bg-stone-800/40"
    >
      <p className={secTitle}>{title}</p>
      {open ? (
        <ChevronUp className="h-4 w-4 text-gray-400 dark:text-stone-500" />
      ) : (
        <ChevronDown className="h-4 w-4 text-gray-400 dark:text-stone-500" />
      )}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10 dark:bg-black/70">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-orange-600" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">
              {mode === "create" ? "Novo Cliente" : "Editar Cliente"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={loading}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadingCliente ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400 dark:text-stone-500">
            Carregando dados do cliente...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 px-5 py-4">

            {/* ── DADOS OBRIGATÓRIOS ─────────────────────────────────── */}
            <div>
              <p className={`mb-2 ${secTitle}`}>Dados Obrigatórios</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={lbl}>
                    Nome <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fields.nome}
                    onChange={(e) => set("nome", e.target.value)}
                    required
                    className={inp()}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label className={lbl}>
                    CPF <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fields.cpf}
                    onChange={(e) => set("cpf", e.target.value)}
                    onBlur={() => handleBlur("cpf")}
                    required
                    className={inp(!!fieldErrors.cpf)}
                    placeholder="000.000.000-00"
                  />
                  {fieldErrors.cpf && (
                    <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                      {fieldErrors.cpf}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl}>E-mail</label>
                  <input
                    type="email"
                    value={fields.email}
                    onChange={(e) => set("email", e.target.value)}
                    onBlur={() => handleBlur("email")}
                    className={inp(!!fieldErrors.email)}
                    placeholder="email@exemplo.com"
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── DADOS COMPLEMENTARES (colapsível) ─────────────────── */}
            <div className="rounded-md border border-gray-200 dark:border-stone-700">
              <div className="px-3 py-2">
                <SectionToggle
                  title="Dados Complementares"
                  open={pessoaisOpen}
                  onToggle={() => setPessoaisOpen((v) => !v)}
                />
              </div>
              {pessoaisOpen && (
                <div className="border-t border-gray-100 px-3 pb-3 pt-3 dark:border-stone-700/60">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>RG</label>
                      <input
                        type="text"
                        value={fields.rg}
                        onChange={(e) => set("rg", e.target.value)}
                        className={inp()}
                      />
                    </div>
                    <div>
                      <label className={lbl}>Telefone</label>
                      <input
                        type="text"
                        value={fields.telefone}
                        onChange={(e) => set("telefone", e.target.value)}
                        className={inp()}
                        placeholder="(00) 0000-0000"
                      />
                    </div>
                    <div>
                      <label className={lbl}>WhatsApp</label>
                      <input
                        type="text"
                        value={fields.whatsapp}
                        onChange={(e) => set("whatsapp", e.target.value)}
                        className={inp()}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <div>
                      <label className={lbl}>Data de Nascimento</label>
                      <input
                        type="date"
                        value={fields.data_nascimento}
                        onChange={(e) => set("data_nascimento", e.target.value)}
                        className={inp()}
                      />
                    </div>
                    <div>
                      <label className={lbl}>Estado Civil</label>
                      <input
                        type="text"
                        value={fields.estado_civil}
                        onChange={(e) => set("estado_civil", e.target.value)}
                        className={inp()}
                        placeholder="Solteiro, Casado..."
                      />
                    </div>
                    <div>
                      <label className={lbl}>Profissão</label>
                      <input
                        type="text"
                        value={fields.profissao}
                        onChange={(e) => set("profissao", e.target.value)}
                        className={inp()}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={lbl}>Observação</label>
                      <textarea
                        value={fields.observacao}
                        onChange={(e) => set("observacao", e.target.value)}
                        className={`${inp()} min-h-[60px]`}
                        placeholder="Notas adicionais sobre o cliente..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── ENDEREÇO (colapsível) ──────────────────────────────── */}
            <div className="rounded-md border border-gray-200 dark:border-stone-700">
              <div className="px-3 py-2">
                <SectionToggle
                  title="Endereço"
                  open={enderecoOpen}
                  onToggle={() => setEnderecoOpen((v) => !v)}
                />
              </div>
              {enderecoOpen && (
                <div className="border-t border-gray-100 px-3 pb-3 pt-3 dark:border-stone-700/60">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className={lbl}>Logradouro</label>
                      <input
                        type="text"
                        value={fields.endereco_logradouro}
                        onChange={(e) => set("endereco_logradouro", e.target.value)}
                        className={inp()}
                        placeholder="Rua, Av..."
                      />
                    </div>
                    <div>
                      <label className={lbl}>Número</label>
                      <input
                        type="text"
                        value={fields.endereco_numero}
                        onChange={(e) => set("endereco_numero", e.target.value)}
                        className={inp()}
                        placeholder="123"
                      />
                    </div>
                    <div>
                      <label className={lbl}>Complemento</label>
                      <input
                        type="text"
                        value={fields.endereco_complemento}
                        onChange={(e) => set("endereco_complemento", e.target.value)}
                        className={inp()}
                        placeholder="Apto, Casa..."
                      />
                    </div>
                    <div>
                      <label className={lbl}>Bairro</label>
                      <input
                        type="text"
                        value={fields.endereco_bairro}
                        onChange={(e) => set("endereco_bairro", e.target.value)}
                        className={inp()}
                      />
                    </div>
                    <div>
                      <label className={lbl}>CEP</label>
                      <input
                        type="text"
                        value={fields.endereco_cep}
                        onChange={(e) => set("endereco_cep", e.target.value)}
                        className={inp()}
                        placeholder="00000-000"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={lbl}>Cidade</label>
                      <input
                        type="text"
                        value={fields.endereco_cidade}
                        onChange={(e) => set("endereco_cidade", e.target.value)}
                        className={inp()}
                      />
                    </div>
                    <div>
                      <label className={lbl}>Estado</label>
                      <select
                        value={fields.endereco_estado}
                        onChange={(e) => set("endereco_estado", e.target.value)}
                        className={inp()}
                      >
                        <option value="">UF</option>
                        {UF_OPTIONS.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className={lbl}>Referência</label>
                      <input
                        type="text"
                        value={fields.endereco_referencia}
                        onChange={(e) => set("endereco_referencia", e.target.value)}
                        className={inp()}
                        placeholder='Ex: "Próximo ao mercado"'
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── OBRAS VINCULADAS ───────────────────────────────────── */}
            <div>
              <p className={`mb-2 ${secTitle}`}>Obras Vinculadas</p>

              <div className="space-y-2">
                {vinculosExistentes.length === 0 &&
                  vinculosParaAdicionar.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-stone-500">
                      Nenhuma obra vinculada.
                    </p>
                  )}

                {vinculosExistentes.map((v) => {
                  const marcadoParaRemover = vinculosParaRemover.includes(v.id)
                  return (
                    <div
                      key={v.id}
                      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                        marcadoParaRemover
                          ? "border-red-200 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/5"
                          : "border-gray-200 dark:border-stone-700"
                      }`}
                    >
                      <div
                        className={`min-w-0 text-sm ${
                          marcadoParaRemover
                            ? "text-gray-400 line-through dark:text-stone-500"
                            : "text-gray-700 dark:text-stone-200"
                        }`}
                      >
                        <span className="font-medium">
                          {v.obra?.nome ?? "(obra)"}
                        </span>
                        {v.numero_unidade && (
                          <span className="text-gray-500 dark:text-stone-400">
                            {" "}
                            — un. {v.numero_unidade}
                          </span>
                        )}
                      </div>
                      {marcadoParaRemover ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleUndoRemoveVinculoExistente(v.id)
                          }
                          className="text-xs text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
                        >
                          Desfazer
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemoveVinculoExistente(v.id)}
                          className="text-gray-400 hover:text-red-600 dark:text-stone-500 dark:hover:text-red-300"
                          aria-label="Remover vínculo"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )
                })}

                {vinculosParaAdicionar.map((v) => (
                  <div
                    key={v.tempId}
                    className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/5"
                  >
                    <div className="min-w-0 text-sm text-gray-700 dark:text-stone-200">
                      <span className="font-medium">
                        {obraNome(v.obra_id)}
                      </span>
                      {v.numero_unidade && (
                        <span className="text-gray-500 dark:text-stone-400">
                          {" "}
                          — un. {v.numero_unidade}
                        </span>
                      )}
                      <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">
                        (novo)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveVinculoNovo(v.tempId)}
                      className="text-gray-400 hover:text-red-600 dark:text-stone-500 dark:hover:text-red-300"
                      aria-label="Remover vínculo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Novo vínculo */}
              <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-stone-700 dark:bg-stone-800/50">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-stone-500">
                  Adicionar vínculo
                </p>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <label className={lbl}>Obra</label>
                    <select
                      value={novaObraId}
                      onChange={(e) => setNovaObraId(e.target.value)}
                      className={inp()}
                    >
                      <option value="">Selecione uma obra</option>
                      {obras.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className={lbl}>Unidade</label>
                    <input
                      type="text"
                      value={novoNumeroUnidade}
                      onChange={(e) => setNovoNumeroUnidade(e.target.value)}
                      className={inp()}
                      placeholder="Ex: 101"
                    />
                  </div>
                  <div className="col-span-2 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddVinculo}
                      disabled={!novaObraId}
                      className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" /> Add
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3 dark:border-stone-800">
              <button
                type="button"
                onClick={() => onClose(false)}
                disabled={loading}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {loading
                  ? "Salvando..."
                  : mode === "create"
                    ? "Criar"
                    : "Salvar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
