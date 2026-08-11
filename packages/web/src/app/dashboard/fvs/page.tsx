import Link from "next/link"
import { redirect } from "next/navigation"
import { MapPin, ClipboardList, Users } from "lucide-react"
import { getServerUser } from "@web/lib/auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { canAccess } from "@web/lib/permissions"

// Módulo FVS — Story 75-293 (etapa 1: cadastros). A fila de vistorias, a ficha
// no celular e as pendências são as etapas 2-3 (stories futuras).
export const dynamic = "force-dynamic"

export default async function FvsPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "fvs"))) {
    redirect("/dashboard")
  }

  const admin = createAdminClient()
  const count = (table: string) =>
    admin.from(table).select("id", { count: "exact", head: true }).eq("org_id", user.orgId)
  const [locais, servicos, equipes] = await Promise.all([
    count("fvs_locais"),
    count("fvs_servicos"),
    count("fvs_equipes"),
  ])

  const cards = [
    {
      href: "/dashboard/fvs/locais",
      icon: <MapPin className="h-6 w-6" />,
      title: "Locais",
      desc: "Apartamentos, halls e áreas comuns de cada obra — a régua de tudo.",
      count: locais.count ?? 0,
    },
    {
      href: "/dashboard/fvs/servicos",
      icon: <ClipboardList className="h-6 w-6" />,
      title: "Serviços e fichas-modelo",
      desc: "A lista de itens a conferir de cada serviço. Serviço novo entra por cadastro, não por desenvolvimento.",
      count: servicos.count ?? 0,
    },
    {
      href: "/dashboard/fvs/equipes",
      icon: <Users className="h-6 w-6" />,
      title: "Equipes",
      desc: "Quem executou o serviço — equipe própria ou empreiteiro.",
      count: equipes.count ?? 0,
    },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Vistorias</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        Controle de serviços no canteiro (FVS) — cadastros da primeira versão. A fila de
        vistorias e a ficha no celular entram na próxima etapa.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-stone-200 bg-white p-5 transition hover:border-[#E8856A] dark:border-stone-800 dark:bg-stone-900 dark:hover:border-[#E8856A]"
          >
            <div className="flex items-center justify-between text-stone-400 dark:text-stone-500">
              {c.icon}
              <span className="text-2xl font-bold text-stone-900 dark:text-white">{c.count}</span>
            </div>
            <h2 className="mt-3 font-semibold text-stone-900 dark:text-white">{c.title}</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
