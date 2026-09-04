"use client"

/**
 * Story 900-60 · AC3/AC5/AC7 — o diálogo de confirmação de pausar / retomar uma empresa.
 *
 * ## Portal para o `<body>`, e isso foi medido na story anterior
 *
 * A tabela de `/platform/orgs` mora num contêiner `overflow-hidden` (é o que arredonda os
 * cantos) e cada `⋯` vive dentro de um `relative z-10`, que é um CONTEXTO DE EMPILHAMENTO. Uma
 * sobreposição `fixed inset-0 z-50` declarada ali dentro fica presa nesse contexto: ela cobriria
 * a própria linha e ficaria POR BAIXO do `⋯` das linhas seguintes, que são irmãs de mesmo
 * `z-index` e vêm depois no DOM. O portal para `document.body` é a única forma que escapa dos
 * dois — do recorte e do empilhamento.
 *
 * `document.body` é seguro porque este componente **só é montado a partir de um clique** — ou
 * seja, depois da hidratação. Ele nunca chega à renderização do servidor.
 *
 * ## Não é o padrão de confirmação destrutiva (AC3)
 *
 * Pausar é reversível: retomar desfaz. Digitar o nome da empresa (o padrão da exclusão de obra,
 * Story 36-3) seria desproporcional, e um atrito que o operador aprende a atravessar no
 * automático protege menos que um motivo obrigatório, que ele tem que escrever.
 *
 * ## Falha NÃO fecha o diálogo (AC7)
 *
 * O erro aparece dentro dele, e o `motivo` já digitado permanece. Fechar em cima de uma falha
 * faria o operador reabrir, redigitar e — no caso de um 5xx que na verdade gravou — pausar duas
 * vezes. E o inverso também vale: nada aqui pinta "salvo" por otimismo. A tela só atualiza
 * depois de um `200`, porque só o `200` significa que o `UPDATE` e a linha de trilha aconteceram
 * na mesma transação.
 *
 * ⚠️ **Quem DECIDE isso não mora aqui** — mora em `decidirDesfecho()`
 * (`lib/tenancy/console-pausa-empresa.ts`), e a razão é que este arquivo é `.tsx`: o
 * `vitest.config.ts` casa `*.test.ts` e nada mais, então uma decisão escrita aqui dentro é uma
 * decisão sem carrasco — foi exatamente o que o gate mediu (QA-900-60-1). O que sobrou neste
 * componente é a OBEDIÊNCIA à decisão, e essa parte é medida por régua de forma sobre o trecho do
 * `confirmar()` em `console-pausa-empresa.test.ts`: `aoFechar()` aparece uma única vez ali dentro,
 * e imediatamente depois do `router.refresh()`.
 */

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import {
  decidirDesfecho,
  motivoEhValido,
  partirNaEnfase,
  textoDaConfirmacao,
  type CorpoDeErroDaRota,
} from "@web/lib/tenancy/console-pausa-empresa"

interface Props {
  orgId: string
  nome: string
  /** Estado ATUAL da empresa. O diálogo pede o inverso dele. */
  isActive: boolean
  aoFechar: () => void
}

/**
 * ⚠️ **Este componente só é MONTADO quando o diálogo abre** — quem controla isso é o
 * `{dialogo && <PausarEmpresaDialog …/>}` do `org-row-menu.tsx`, e não uma prop `aberto`.
 *
 * A diferença não é estilo. Com uma prop `aberto`, o estado interno (`motivo`, `erro`)
 * SOBREVIVE ao fechamento, e limpá-lo exigiria um `setState` dentro de um `useEffect` — que é
 * cascata de renderização, e o ESLint deste repositório reprova. Pior: um motivo esquecido de
 * uma confirmação anterior seria enviado para a trilha de uma ação que ele não explica.
 * Montagem e desmontagem dão o estado limpo de graça, e sem efeito nenhum.
 */
export function PausarEmpresaDialog({ orgId, nome, isActive, aoFechar }: Props) {
  const router = useRouter()
  const [motivo, setMotivo] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  const texto = textoDaConfirmacao(isActive)

  // Foco no campo ao montar. Não mexe em estado — não há cascata de renderização aqui.
  useEffect(() => {
    campo.current?.focus()
  }, [])

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      // `Esc` não cancela um envio em curso: a requisição já saiu, e fechar aqui só esconderia
      // do operador o desfecho de algo que vai acontecer de qualquer jeito.
      if (evento.key === "Escape" && !enviando) aoFechar()
    }
    document.addEventListener("keydown", aoTeclar)
    return () => document.removeEventListener("keydown", aoTeclar)
  }, [enviando, aoFechar])

  const podeConfirmar = motivoEhValido(motivo) && !enviando

  async function confirmar() {
    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch(`/api/platform/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: texto.isActiveDesejado, reason: motivo }),
      })
      const corpo = (await res.json().catch(() => ({}))) as CorpoDeErroDaRota
      // A decisão inteira do desfecho vem de fora — inclusive a mensagem que chega ao operador.
      // Sem ela, "motivo obrigatório" e "banco fora do ar" viram o mesmo "não deu certo", e ele
      // tenta de novo a coisa errada.
      const desfecho = decidirDesfecho(res.ok, res.status, corpo)
      setErro(desfecho.erro)
      if (!desfecho.fecha) {
        // AC7 — o diálogo FICA ABERTO, com o motivo digitado intacto. Nada de `aoFechar()` aqui.
        setEnviando(false)
        return
      }
      // AC7 — a lista é um Server Component: `router.refresh()` refaz a leitura sem recarregar a
      // página inteira. Mesmo padrão de `integrations-panel.tsx:130`.
      router.refresh()
      aoFechar()
    } catch {
      setErro("Não foi possível falar com o servidor. Nada foi alterado.")
      setEnviando(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      // Clicar no fundo fecha, como qualquer diálogo — mas não durante o envio, pelo mesmo
      // motivo do `Esc`.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !enviando) aoFechar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-pausar-empresa"
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
      >
        <h2 id="titulo-pausar-empresa" className="text-base font-semibold text-slate-100">
          {texto.titulo}
        </h2>
        <p className="mt-1 text-sm text-slate-300">{nome}</p>

        {/* AC3.2 — as três frases, nesta ordem, verbatim. O que está em negrito é a parte que
            o operador não tem como adivinhar sozinho. */}
        <div className="mt-4 space-y-2 text-xs leading-relaxed text-slate-400">
          {texto.frases.map((frase) => {
            const { antes, forte, depois } = partirNaEnfase(frase)
            return (
              <p key={frase.texto}>
                {antes}
                {forte ? <strong className="font-semibold text-slate-200">{forte}</strong> : null}
                {depois}
              </p>
            )
          })}
        </div>

        <label htmlFor="motivo-pausar-empresa" className="mt-4 block text-xs text-slate-400">
          Motivo (obrigatório — fica na trilha de auditoria)
        </label>
        <textarea
          id="motivo-pausar-empresa"
          ref={campo}
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          disabled={enviando}
          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-600"
          placeholder="Por que esta empresa está sendo pausada ou retomada?"
        />

        {erro && (
          <p role="alert" className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={aoFechar}
            disabled={enviando}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            // AC3.4 — desabilitado até o motivo ter conteúdo. `disabled` de verdade, não só
            // aparência: um botão que parece inerte e responde ao clique é pior que nenhum.
            disabled={!podeConfirmar}
            className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? "Salvando…" : texto.rotuloDoBotao}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
