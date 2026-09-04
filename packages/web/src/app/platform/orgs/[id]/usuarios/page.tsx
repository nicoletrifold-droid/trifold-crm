/**
 * Story 900-57 · AC6 — a aba Usuários, esqueleto honesto.
 *
 * `users` ESTÁ na lista de tabelas legíveis, então a listagem é tecnicamente possível — mas ela
 * não foi construída, e desenhar uma tabela vazia com cabeçalho seria pior do que dizer que a
 * tela não existe. O que a Trifold precisa hoje sobre o pessoal de uma empresa é quem é o
 * administrador, e isso o Resumo já mostra.
 *
 * Nenhuma consulta a banco nesta rota, de propósito.
 */

import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function UsuariosDaEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orgId } = await params
  return (
    <section className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Usuários</h2>
      <p className="mt-2 text-sm text-slate-300">
        ○ A listagem de usuários da empresa ainda não foi construída.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        O card{" "}
        <Link href={`/platform/orgs/${orgId}`} className="text-amber-400 hover:underline">
          Administrador
        </Link>{" "}
        do Resumo já mostra quem administra esta empresa.
      </p>
    </section>
  )
}
