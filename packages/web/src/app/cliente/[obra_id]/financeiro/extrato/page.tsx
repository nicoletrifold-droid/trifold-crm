import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { createClient } from "@web/lib/supabase/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getFinancialStatement } from "@web/lib/integrations/sienge/client"
import type { FormattedInstallment } from "@web/lib/integrations/sienge/types"
import { ExtratoClient } from "./_components/extrato-client"

interface PageProps {
  params: Promise<{ obra_id: string }>
  searchParams: Promise<{ de?: string; ate?: string; unidade?: string }>
}

export default async function ExtratoPage({ params, searchParams }: PageProps) {
  const { obra_id } = await params
  const { de, ate, unidade } = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: portalUserBase } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single()

  if (!portalUserBase) redirect("/login")

  const { data: acesso } = await supabase
    .from("cliente_obras")
    .select("obra_id")
    .eq("obra_id", obra_id)
    .eq("user_id", portalUserBase.id)
    .single()

  const { data: obra } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .single()

  if (!obra || !acesso) redirect("/cliente/sem-obra")

  let installments: FormattedInstallment[] = []
  let siengeConfigured = false
  let siengeUnavailable = false

  const { data: portalUser } = await supabase
    .from("users")
    .select("id, sienge_customer_id, cpf, email")
    .eq("auth_id", user.id)
    .single()

  let siengeCustomerId: number | null = portalUser?.sienge_customer_id ?? null

  // Fallback por email via clientes_obras_vinculos
  if (!siengeCustomerId && portalUser?.email) {
    const { data: vinculos } = await supabase
      .from("clientes_obras_vinculos")
      .select("clientes(sienge_customer_id, email)")
      .eq("obra_id", obra_id)

    for (const v of vinculos ?? []) {
      const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      if ((c as { email?: string | null })?.email === portalUser.email) {
        siengeCustomerId =
          (c as { sienge_customer_id?: number | null })?.sienge_customer_id ?? null
        if (siengeCustomerId) {
          const adminClient = createAdminClient()
          await adminClient
            .from("users")
            .update({ sienge_customer_id: siengeCustomerId })
            .eq("id", portalUser.id)
        }
        break
      }
    }
  }

  if (siengeCustomerId) {
    siengeConfigured = true
    try {
      installments = await getFinancialStatement(siengeCustomerId)

      // Filtra por contrato da obra (se houver)
      const { data: vinculos } = await supabase
        .from("clientes_obras_vinculos")
        .select("sienge_contract_numbers, clientes(sienge_customer_id)")
        .eq("obra_id", obra_id)

      const vinculo = (vinculos ?? []).find((v) => {
        const c = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
        return (
          (c as { sienge_customer_id?: number | null })?.sienge_customer_id ===
          siengeCustomerId
        )
      })

      const contractNumbers =
        (vinculo as { sienge_contract_numbers?: string[] | null } | undefined)
          ?.sienge_contract_numbers ?? []

      if (contractNumbers.length > 0) {
        installments = installments.filter((i) => contractNumbers.includes(i.documentId))
      }

      // Aplica filtro de período
      if (de) installments = installments.filter((i) => i.dueDate >= de)
      if (ate) installments = installments.filter((i) => i.dueDate <= ate)

      // Ordena por vencimento
      installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    } catch {
      siengeUnavailable = true
    }
  }

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Mobile header */}
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/90 backdrop-blur-sm lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs text-stone-500">Financeiro · Extrato</p>
          <p className="text-sm font-semibold text-white">{obra.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 lg:py-8">
        <Link
          href={`/cliente/${obra_id}/financeiro`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-stone-400 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>

        <h1 className="mb-6 text-xl font-bold text-white lg:text-2xl">Extrato</h1>

        {/* Filtro de período */}
        {siengeConfigured && !siengeUnavailable && (
          <form
            method="GET"
            className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-stone-800 bg-stone-900 p-4"
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-400">Vencimento de</label>
              <input
                type="date"
                name="de"
                defaultValue={de ?? ""}
                className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white placeholder-stone-500 focus:border-[#E8856A] focus:outline-none"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-400">até</label>
              <input
                type="date"
                name="ate"
                defaultValue={ate ?? ""}
                className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white placeholder-stone-500 focus:border-[#E8856A] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-stone-700 bg-stone-800 px-4 py-2 text-sm font-medium text-stone-300 transition-colors hover:border-stone-600 hover:text-white"
            >
              Filtrar
            </button>
            {(de || ate) && (
              <a
                href={`/cliente/${obra_id}/financeiro/extrato`}
                className="rounded-lg px-4 py-2 text-sm text-stone-500 transition-colors hover:text-stone-300"
              >
                Limpar
              </a>
            )}
          </form>
        )}

        {!siengeConfigured && (
          <div className="rounded-xl border border-stone-800 bg-stone-900 px-6 py-12 text-center">
            <p className="text-sm font-medium text-white">Extrato indisponível</p>
            <p className="mt-1 text-sm text-stone-500">
              O extrato financeiro ainda não foi vinculado. Entre em contato com a construtora.
            </p>
          </div>
        )}

        {siengeConfigured && siengeUnavailable && (
          <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-6 py-12 text-center">
            <p className="text-sm font-medium text-amber-300">Serviço temporariamente indisponível</p>
            <p className="mt-1 text-sm text-stone-500">
              Não foi possível conectar ao sistema financeiro. Tente novamente em alguns minutos.
            </p>
          </div>
        )}

        {siengeConfigured && !siengeUnavailable && (
          <ExtratoClient
            obraId={obra_id}
            installments={installments}
            unidadeInicial={unidade}
            de={de}
            ate={ate}
          />
        )}
      </main>
    </div>
  )
}
