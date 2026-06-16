import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@web/lib/supabase/server"
import { Building2, ChevronRight } from "lucide-react"
import { logout } from "@web/app/login/actions"

type ObraRow = {
  id: string
  name: string
  progress_pct: number | null
  status: string | null
  properties: { name: string; city: string } | null
}

export default async function SelecionarObraPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/cliente")

  const { data: userData } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("auth_id", user.id)
    .single()

  if (!userData || userData.role !== "cliente") redirect("/cliente")

  const { data: vinculos } = await supabase
    .from("cliente_obras")
    .select(`
      obra_id,
      numero_unidade,
      is_primary,
      obras!obra_id (
        id,
        name,
        progress_pct,
        status,
        properties!property_id (
          name,
          city
        )
      )
    `)
    .eq("user_id", userData.id)
    .order("is_primary", { ascending: false })

  if (!vinculos || vinculos.length === 0) redirect("/cliente/sem-obra")
  if (vinculos.length === 1) redirect(`/cliente/${vinculos[0]!.obra_id}`)

  const userName = userData.name ?? "Cliente"

  return (
    <div className="flex min-h-screen flex-col bg-stone-950 px-4 pb-10 pt-10">
      {/* Logo */}
      <div className="mb-8 flex justify-center">
        <Image
          src="/logo-trifold.svg"
          alt="Trifold"
          width={140}
          height={16}
          priority
          className="brightness-0 invert"
        />
      </div>

      {/* Greeting */}
      <div className="mb-6 text-center">
        <p className="text-sm text-stone-400">Olá, {userName}</p>
        <h1 className="mt-1 text-xl font-semibold text-stone-100">
          Selecione seu imóvel
        </h1>
      </div>

      {/* Cards */}
      <div className="mx-auto w-full max-w-sm space-y-3">
        {vinculos.map((v) => {
          const obra = v.obras as unknown as ObraRow | null
          if (!obra) return null

          const progressPct = obra.progress_pct ?? 0
          const statusLabel =
            obra.status === "in_progress"
              ? "Em construção"
              : obra.status === "delivered"
              ? "Entregue"
              : obra.status === "planned"
              ? "Planejado"
              : (obra.status ?? "—")

          return (
            <Link
              key={v.obra_id}
              href={`/cliente/${v.obra_id}`}
              className="flex items-center gap-4 rounded-2xl border border-stone-800 bg-stone-900 p-4 transition-colors active:bg-stone-800"
            >
              {/* Icon */}
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#F27A5E]/15">
                <Building2 className="h-6 w-6 text-[#F27A5E]" />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-stone-100">
                  {obra.properties?.name ?? obra.name}
                </p>
                {v.numero_unidade && (
                  <p className="text-sm text-stone-400">{v.numero_unidade}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-800">
                    <div
                      className="h-full rounded-full bg-[#F27A5E]"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-stone-500">
                    {progressPct}%
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-stone-500">{statusLabel}</p>
              </div>

              <ChevronRight className="h-5 w-5 flex-shrink-0 text-stone-600" />
            </Link>
          )
        })}
      </div>

      {/* Logout */}
      <div className="mt-8 flex justify-center">
        <form action={logout}>
          <button
            type="submit"
            className="text-xs text-stone-600 underline-offset-2 hover:text-stone-400 hover:underline"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  )
}
