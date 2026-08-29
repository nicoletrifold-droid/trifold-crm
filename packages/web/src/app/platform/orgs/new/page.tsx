"use client"

/**
 * Story 900-22 — wizard de provisionamento.
 * Story 900-22b — passa a exigir o e-mail do administrador da empresa.
 *
 * Nome, slug e e-mail do admin. **Sem seleção de plano ou módulos**, e isso é deliberado:
 * `plans` e `org_module_grants` só existem a partir da Onda 3. Antecipar os campos aqui criaria
 * dependência de artefato que ainda não existe — o defeito que a validação do @po apontou
 * no epic.
 *
 * POR QUE O REDIRECT É CONDICIONAL (900-22b, AC-A7): provisionar tem um efeito externo que pode
 * falhar sozinho — o convite do admin. A org fica de pé de qualquer jeito, então a resposta é de
 * sucesso; mas `router.push` + `router.refresh` apagariam a mensagem antes de alguém a ler.
 * Navegar automaticamente só no caminho em que não há nada a dizer (`"invited"`).
 */

import { useState } from "react"
import { useRouter } from "next/navigation"

function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export default function NovaOrgPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [aviso, setAviso] = useState<string | null>(null)
  const [slugEditado, setSlugEditado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const slugFinal = slugEditado ? slug : slugify(name)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setEnviando(true)
    try {
      const res = await fetch("/api/platform/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: slugFinal, adminEmail }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErro(json.message ?? json.error ?? "Falha ao provisionar")
        return
      }

      // A empresa foi criada. O convite é que pode ter falhado — e essa mensagem só existe
      // aqui, então navegar agora a perderia. Ver AC-A7.
      const convite = json.adminInvite
      if (convite?.status === "failed") {
        setAviso(
          `Empresa criada, mas o convite do administrador falhou: ${convite.message ?? "motivo não informado"}. ` +
            `Use "Reenviar" na lista de empresas.`,
        )
        return
      }
      if (convite?.status === "already_active") {
        setAviso(
          convite.emailIgnored
            ? "Empresa retomada. O e-mail informado foi ignorado — o administrador já está ativo."
            : "Empresa retomada. O administrador já estava ativo.",
        )
        return
      }

      router.push("/platform/orgs")
      router.refresh()
    } catch {
      setErro("Erro de rede")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-1 text-xl font-semibold">Nova empresa</h1>
      <p className="mb-6 text-sm text-slate-400">
        Cria a organização com roles, permissões e as etapas do Kanban. O plano é definido
        depois.
      </p>

      <form onSubmit={submeter} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm text-slate-300" htmlFor="name">
            Nome da empresa
          </label>
          <input
            id="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Imóveis"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300" htmlFor="slug">
            Identificador
          </label>
          <input
            id="slug"
            value={slugFinal}
            onChange={(e) => {
              setSlugEditado(true)
              setSlug(e.target.value)
            }}
            placeholder="acme-imoveis"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm outline-none focus:border-amber-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Minúsculas, números e hífen. Gerado a partir do nome — edite se precisar.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300" htmlFor="adminEmail">
            E-mail do admin
          </label>
          <input
            id="adminEmail"
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="admin@acme.com.br"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Recebe o link para criar a senha e entra como administrador da empresa. É quem
            consegue logar nela no primeiro dia.
          </p>
        </div>

        {aviso && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <p>{aviso}</p>
            <button
              type="button"
              onClick={() => {
                router.push("/platform/orgs")
                router.refresh()
              }}
              className="mt-2 rounded border border-amber-500/50 px-2 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
            >
              Ver empresas
            </button>
          </div>
        )}

        {erro && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {erro}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!name.trim() || enviando}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {enviando ? "Provisionando…" : "Criar empresa"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/platform/orgs")}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
