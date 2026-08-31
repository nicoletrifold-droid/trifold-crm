/**
 * Story 900-22 — chrome do painel de plataforma.
 * Story 900-56 — a barra de 1 link vira navegação de verdade.
 *
 * O visual é deliberadamente DIFERENTE do `/dashboard`: barra escura e badge "PLATAFORMA".
 * Um operador com duas abas abertas não pode confundir "estou na Trifold" com "estou na
 * empresa do cliente X" — e essa confusão, num painel que cria e configura empresas, custa
 * caro. **Isso não muda nesta story**: o problema diagnosticado pelo dono do produto nunca foi
 * o contraste, foi a ausência de produto (`docs/ux/console-plataforma.md` §0).
 *
 * ## Por que item desabilitado, e não link
 *
 * Uma navegação de um item não é navegação, é breadcrumb. Mas trocá-la por cinco links dos
 * quais três dão 404 seria pior que o estado de hoje. Os itens sem rota aparecem como texto
 * não clicável com o rótulo "em breve" — a mesma regra de "fundação ausente usa `—`, nunca
 * finge que existe" (§5 do desenho), aplicada à navegação.
 */

import Link from "next/link"
import { requirePlatformAdmin } from "@web/lib/tenancy/platform-guard"

/**
 * Os 5 itens do desenho (§2.2), na ordem dele.
 *
 * `href: null` significa "a rota não existe ainda" — e isso é MEDIDO, não presumido:
 *   • `/platform/cobranca` → fase 4 do desenho; depende de `plans`/`tenant_invoices`, zero
 *     migrations.
 *   • `/platform/uso` → fase 2; depende do agregado `platform_org_usage_daily`, que não existe.
 *   • `/platform/trilha` → fase 1 do desenho (entrega 1.7), mas a rota NÃO existe nesta árvore:
 *     não há `app/platform/trilha/page.tsx`, e a story que a cria (`900-59`) ainda não foi
 *     escrita. A `900-57` diz isso com todas as letras ao mandar a aba de trilha da empresa
 *     apontar para si mesma "e **não** para `/platform/trilha` cross-org". Enquanto o arquivo
 *     não existir, um `<Link>` aqui seria exatamente o link morto que a AC2 existe para evitar.
 */
const ITENS_DA_NAVEGACAO: ReadonlyArray<{ rotulo: string; href: string | null }> = [
  { rotulo: "Visão geral", href: "/platform" },
  { rotulo: "Empresas", href: "/platform/orgs" },
  { rotulo: "Cobrança", href: null },
  { rotulo: "Uso & saúde", href: null },
  { rotulo: "Trilha", href: null },
]

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold tracking-wide text-slate-950">
              PLATAFORMA
            </span>
            <nav aria-label="Navegação da plataforma" className="flex items-center gap-4">
              {ITENS_DA_NAVEGACAO.map((item) =>
                item.href ? (
                  <Link
                    key={item.rotulo}
                    href={item.href}
                    className="text-sm font-medium hover:text-amber-400"
                  >
                    {item.rotulo}
                  </Link>
                ) : (
                  <span
                    key={item.rotulo}
                    aria-disabled="true"
                    className="flex items-baseline gap-1 text-sm font-medium text-slate-500"
                  >
                    {item.rotulo}
                    <span className="text-[10px] uppercase tracking-wide text-slate-600">
                      em breve
                    </span>
                  </span>
                ),
              )}
            </nav>
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
