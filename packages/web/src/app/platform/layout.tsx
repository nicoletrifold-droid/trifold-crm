/**
 * Story 900-22 — chrome do painel de plataforma.
 *
 * O visual é deliberadamente DIFERENTE do `/dashboard`: barra escura e badge "PLATAFORMA".
 * Um operador com duas abas abertas não pode confundir "estou na Trifold" com "estou na
 * empresa do cliente X" — e essa confusão, num painel que cria e configura empresas, custa
 * caro.
 */

import Link from "next/link"
import { requirePlatformAdmin } from "@web/lib/tenancy/platform-guard"

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold tracking-wide text-slate-950">
              PLATAFORMA
            </span>
            <Link href="/platform/orgs" className="text-sm font-medium hover:text-amber-400">
              Empresas
            </Link>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>{admin.email}</span>
            <Link href="/dashboard" className="hover:text-slate-200">
              ← Voltar ao CRM
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
