/**
 * Story 900-57 · AC5 — a Trilha desta empresa.
 *
 * `platform_audit_log` existe desde a migration 248, é append-only por trigger + `REVOKE`, tem
 * índice em `(org_id, created_at DESC)` — e, em produção, **zero linhas**, porque a única tela
 * que escrevia nela nunca foi usada. Uma trilha que ninguém consegue ler é indistinguível de uma
 * trilha que não existe, e era exatamente esse o estado.
 *
 * Sem filtro de período e sem paginação nesta fase, de propósito: escolher a janela é decisão de
 * produto que esta story não toma. O limite de 100 linhas existe para a tela não depender do
 * corte silencioso do PostgREST — quando ele é alcançado, a tela DIZ isso, em vez de deixar o
 * operador achar que viu tudo.
 */

import { platformQuery } from "@web/lib/tenancy/platform-query"
import {
  LinhaDaTrilhaDaPlataforma,
  ListaDeTrilha,
  type LinhaDeTrilhaDaPlataforma,
} from "../../../_components/linha-da-trilha"

export const dynamic = "force-dynamic"

/** Limite NOMEADO, e bem abaixo do teto de 1.000 do PostgREST, para o corte ser o nosso. */
const LIMITE_DE_LINHAS = 100

export default async function TrilhaDaEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orgId } = await params

  const { data } = await platformQuery(
    "platform_audit_log",
    "id, action, actor_type, created_at, metadata",
    orgId,
  )
    .order("created_at", { ascending: false })
    .limit(LIMITE_DE_LINHAS)
  const linhas = (data ?? []) as unknown as LinhaDeTrilhaDaPlataforma[]

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Trilha</h2>

      {linhas.length === 0 ? (
        <div className="rounded-lg border border-slate-800 px-4 py-8 text-center text-sm text-slate-400">
          Nenhuma ação registrada ainda. Toda ação da plataforma sobre esta empresa aparece aqui.
        </div>
      ) : (
        <>
          <ListaDeTrilha>
            {linhas.map((linha) => (
              <LinhaDaTrilhaDaPlataforma key={linha.id} linha={linha} />
            ))}
          </ListaDeTrilha>
          {linhas.length >= LIMITE_DE_LINHAS && (
            <p className="text-xs text-amber-400">
              Mostrando as {LIMITE_DE_LINHAS} ações mais recentes — há mais registros que esta
              tela ainda não pagina.
            </p>
          )}
        </>
      )}

      <p className="text-xs text-slate-500">
        A trilha é imutável: não pode ser editada nem apagada por ninguém.
      </p>
    </section>
  )
}
