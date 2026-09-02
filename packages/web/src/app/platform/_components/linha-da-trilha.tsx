/**
 * Story 900-57 · AC5 — uma linha de `platform_audit_log`, desenhada num lugar só.
 *
 * Extraída porque DOIS lugares desta story já a usam (o card "Últimas ações" do Resumo e a aba
 * Trilha) e a `900-59` (Trilha cross-org) usa um terceiro. Duplicar o JSX é como duas telas do
 * console passam a discordar sobre o mesmo fato — foi assim que o tile de WhatsApp nasceu
 * mentindo (QA-900-51-2).
 *
 * `empresa` é opcional de propósito: dentro da casca de uma empresa o nome dela já está na faixa
 * de identidade e repeti-lo em cada linha é ruído; numa lista cross-org ele é a coluna que
 * distingue as linhas. Quem sabe o contexto é quem renderiza.
 */

import { FUSO_DO_CONSOLE } from "@web/lib/tenancy/console-leitura"

/** A forma de `platform_audit_log` que a tela precisa. */
export interface LinhaDeTrilhaDaPlataforma {
  id: string
  action: string
  actor_type: string
  created_at: string
  metadata: Record<string, unknown> | null
}

/** O que a linha mostra quando `metadata.actor_label` não veio, ou não veio utilizável. */
export const ATOR_SEM_ROTULO = "sem rótulo"

/**
 * Quem agiu.
 *
 * `metadata.actor_label` é o que as rotas de plataforma gravam; quando ele não veio, a linha diz
 * "sem rótulo" em vez de inventar um nome. `actor_type` (`platform` | `org`) fica sempre visível
 * porque é ele que distingue "a Trifold mexeu" de "o cliente mexeu" — a pergunta que a trilha
 * existe para responder.
 *
 * EXPORTADA de propósito (QA-900-57-3): `metadata` é `Record<string, unknown>` — quer dizer que
 * o TypeScript não garante NADA sobre `actor_label`, e os quatro caminhos daqui (string útil,
 * ausente, vazia/só espaço, tipo errado) são lógica de verdade que o `type-check` não exercita.
 * É função pura sobre objeto simples: não precisa de render, nem de sessão, nem de banco.
 */
export function rotuloDoAtor(linha: LinhaDeTrilhaDaPlataforma): string {
  const rotulo = linha.metadata?.actor_label
  return typeof rotulo === "string" && rotulo.trim() !== "" ? rotulo : ATOR_SEM_ROTULO
}

export function LinhaDaTrilhaDaPlataforma({
  linha,
  empresa,
}: {
  linha: LinhaDeTrilhaDaPlataforma
  empresa?: string
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2 text-xs">
      <span className="font-mono text-slate-500">
        {new Date(linha.created_at).toLocaleString("pt-BR", { timeZone: FUSO_DO_CONSOLE })}
      </span>
      <span className="text-slate-300">{rotuloDoAtor(linha)}</span>
      <span className="text-slate-500">({linha.actor_type})</span>
      {empresa && <span className="text-slate-400">{empresa}</span>}
      <span className="font-medium text-slate-200">{linha.action}</span>
    </li>
  )
}

/** A moldura das duas listas de trilha desta story — mesma borda, mesma divisória. */
export function ListaDeTrilha({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
      {children}
    </ul>
  )
}
