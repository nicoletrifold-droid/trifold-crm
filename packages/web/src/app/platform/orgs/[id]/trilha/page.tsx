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
import { leituraFalhou } from "@web/lib/tenancy/console-visao-geral"
import {
  AVISO_DE_LEITURA_QUE_NAO_VOLTOU,
  estadoDaLeitura,
  recortarComExcedente,
} from "@web/lib/tenancy/console-leitura"
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

  // CodeRabbit #547 — `LIMITE_DE_LINHAS + 1`, e o `+ 1` é a EVIDÊNCIA. Com `.limit(100)` e
  // exatamente 100 registros existindo, o aviso "há mais registros" acendia sem que existisse
  // uma 101ª linha: a tela afirmava um fato que ninguém mediu. Buscando uma a mais, quem prova
  // "há mais" é o registro excedente — e ele NÃO é renderizado, senão a tela mostraria 101
  // linhas dizendo que mostra 100.
  const resposta = await platformQuery(
    "platform_audit_log",
    "id, action, actor_type, created_at, metadata",
    orgId,
  )
    .order("created_at", { ascending: false })
    .limit(LIMITE_DE_LINHAS + 1)
  const recebidas = (resposta.data ?? []) as unknown as LinhaDeTrilhaDaPlataforma[]
  const { visiveis: linhas, haMais } = recortarComExcedente(recebidas, LIMITE_DE_LINHAS)
  // E o outro `error` descartado: sem ele, um timeout virava "Nenhuma ação registrada ainda" —
  // a frase mais forte desta tela, sobre a tabela que é append-only e imutável por trigger.
  const estado = estadoDaLeitura({ falhou: leituraFalhou(resposta), quantidade: linhas.length })

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Trilha</h2>

      {estado === "falhou" ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-8 text-center text-sm text-amber-300">
          {AVISO_DE_LEITURA_QUE_NAO_VOLTOU}
        </div>
      ) : estado === "vazio" ? (
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
          {haMais && (
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
