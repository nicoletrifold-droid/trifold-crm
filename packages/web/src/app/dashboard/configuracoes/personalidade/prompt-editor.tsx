"use client"

import { useActionState } from "react"
import { ESTADO_INICIAL, savePromptAction, type SavePromptState } from "./actions"
import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  type ParityStatus,
} from "@web/lib/agent-prompts"
import { rotuloDeMotivoAusente, type VersaoDoPrompt } from "@web/lib/agent-prompt-versions"

/**
 * Story 87-1 — o editor de um prompt da Nicole, com as três coisas que faltavam:
 * motivo obrigatório (AC2), histórico legível ao lado do campo (AC3) e selo de
 * paridade contra o snapshot commitado (AC6).
 *
 * Client Component porque a AC2 exige MENSAGEM VISÍVEL de erro — a versão anterior era
 * uma server action que retornava `void` em toda rejeição, e "não gravou" em silêncio é
 * pior que gravar. O selo é calculado no servidor (o módulo de paridade usa `node:*`) e
 * chega aqui como dado simples.
 */

export type { VersaoDoPrompt }

type Props = {
  slug: string
  nome: string
  conteudo: string
  isAtivo: boolean
  isAdmin: boolean
  paridade: { status: ParityStatus; shaBanco: string; shaSnapshot: string | null }
  versoes: VersaoDoPrompt[]
  rows?: number
}

const SELO: Record<ParityStatus, { rotulo: string; classe: string; explicacao: string }> = {
  "em-paridade": {
    rotulo: "✅ em paridade",
    classe:
      "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
    explicacao: "O que está em produção é igual ao que está commitado no repositório.",
  },
  divergente: {
    rotulo: "⚠️ divergente do repositório",
    classe:
      "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    explicacao:
      "Produção mudou e ninguém devolveu ao repositório: não existe diff revisável desta versão. " +
      "Rode `npx tsx scripts/dump-agent-prompts.ts --write` e commite — ou reverta pelo histórico abaixo.",
  },
  "fora-do-snapshot": {
    rotulo: "⚠️ fora do snapshot",
    classe: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
    explicacao:
      "Este slug existe no banco e não existe no snapshot commitado — nunca foi capturado. " +
      "Rode `npx tsx scripts/dump-agent-prompts.ts --write` e commite.",
  },
}

function formatarData(iso: string): string {
  // timeZone explícito é a convenção do repo (ver instrumentation.ts): o servidor roda em
  // America/Sao_Paulo, e "quando isso foi editado?" não pode depender do fuso do navegador.
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  })
}

/** Primeira linha divergente — o mesmo recorte que o `--check --verbose` imprime. */
function primeiraDiferenca(antes: string, depois: string): string | null {
  const a = antes.split("\n")
  const b = depois.split("\n")
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `linha ${i + 1}\n- ${a[i] ?? "<ausente>"}\n+ ${b[i] ?? "<ausente>"}`
    }
  }
  return null
}

function Historico({ versoes }: { versoes: VersaoDoPrompt[] }) {
  if (versoes.length === 0) {
    return (
      <p className="mt-3 text-xs text-gray-500 dark:text-stone-400">
        Sem histórico ainda. Toda edição a partir de agora — inclusive por SQL direto — grava
        aqui quem mudou, quando e por quê (migration 219).
      </p>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-gray-500 dark:text-stone-400">
        Últimas {versoes.length} edições
      </p>
      {versoes.map((v) => {
        const diff = primeiraDiferenca(v.previous_content ?? "", v.new_content ?? "")
        return (
          <details
            key={v.id}
            className="rounded-md border border-gray-200 px-3 py-2 text-xs dark:border-stone-800"
          >
            <summary className="cursor-pointer marker:content-none">
              <span className="font-medium text-gray-800 dark:text-stone-200">
                {formatarData(v.created_at)}
              </span>
              <span className="text-gray-500 dark:text-stone-400">
                {" · "}
                {v.author_label ?? "system"}
                {" · "}
              </span>
              <span
                className={
                  v.change_reason
                    ? "text-gray-700 dark:text-stone-300"
                    : "italic text-amber-700 dark:text-amber-400"
                }
              >
                {v.change_reason ?? rotuloDeMotivoAusente(v)}
              </span>
            </summary>
            {diff ? (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px] text-gray-700 dark:bg-stone-800 dark:text-stone-300">
                {diff}
              </pre>
            ) : (
              <p className="mt-2 text-gray-500 dark:text-stone-400">
                Conteúdo idêntico — a edição mudou só o status de ativo.
              </p>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-gray-500 dark:text-stone-400">
                Ver o conteúdo anterior inteiro (é o alvo de rollback do runbook 87-1)
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px] text-gray-700 dark:bg-stone-800 dark:text-stone-300">
                {v.previous_content ?? ""}
              </pre>
            </details>
          </details>
        )
      })}
    </div>
  )
}

export function PromptEditor({
  slug,
  nome,
  conteudo,
  isAtivo,
  isAdmin,
  paridade,
  versoes,
  rows = 10,
}: Props) {
  const [state, formAction, pending] = useActionState<SavePromptState, FormData>(
    savePromptAction,
    ESTADO_INICIAL
  )

  // Motivo é por edição, não uma configuração: depois de gravar, o campo é REMONTADO
  // (key nova) e volta vazio, para que ninguém reaproveite sem querer a justificativa da
  // mudança anterior — o mesmo cuidado que o trigger tem no banco, onde o motivo só conta
  // quando muda no próprio UPDATE. Feito por `key` e não por efeito: `setState` dentro de
  // `useEffect` é cascata de render (e o lint deste repo barra).
  const chaveDoMotivo = state.status === "ok" ? `motivo-${state.salvoEm}` : "motivo-atual"

  const selo = SELO[paridade.status]

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${selo.classe}`}
          title={
            paridade.shaSnapshot
              ? `banco ${paridade.shaBanco} · snapshot ${paridade.shaSnapshot}`
              : `banco ${paridade.shaBanco} · sem entrada no snapshot`
          }
        >
          {selo.rotulo}
        </span>
        {!isAtivo && (
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-stone-700 dark:text-stone-200">
            inativo — a Nicole não lê este
          </span>
        )}
      </div>
      {paridade.status !== "em-paridade" && (
        <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">{selo.explicacao}</p>
      )}

      <form action={formAction}>
        <input type="hidden" name="slug" value={slug} />
        <textarea
          name="content"
          defaultValue={conteudo}
          rows={rows}
          disabled={!isAdmin}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 disabled:bg-gray-50 disabled:text-gray-600 dark:disabled:bg-stone-800/60 dark:disabled:text-stone-400"
        />

        {isAdmin && (
          <>
            <label
              htmlFor={`motivo-${slug}`}
              className="mt-3 block text-xs font-medium text-gray-600 dark:text-stone-300"
            >
              Por que está mudando? (obrigatório, mín. {MIN_REASON_LENGTH} caracteres)
            </label>
            <input
              key={chaveDoMotivo}
              id={`motivo-${slug}`}
              name="motivo"
              defaultValue=""
              maxLength={MAX_REASON_LENGTH}
              placeholder="ex.: corrige o nome do empreendimento — no cadastro é Yarden, não Yarden Residence"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-3 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {pending ? "Salvando..." : `Salvar ${nome}`}
            </button>
          </>
        )}

        {state.status === "erro" && (
          <p
            role="alert"
            className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300"
          >
            {state.message}
          </p>
        )}
        {state.status === "ok" && (
          <p
            role="status"
            className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-800 dark:bg-green-500/10 dark:text-green-300"
          >
            {state.message}
          </p>
        )}
      </form>

      <Historico versoes={versoes} />
    </div>
  )
}
