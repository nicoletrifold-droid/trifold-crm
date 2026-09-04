"use client"

/**
 * Story 900-62 · AC7/AC8/AC9/AC10 — o botão "Editar" do card "Identidade" e o diálogo de três
 * seções que ele abre.
 *
 * ## O que NÃO mora aqui, e por quê
 *
 * `vitest.config.ts` casa `packages/web/src/**\/*.test.ts` — e **não** `.tsx`. Então toda decisão
 * escrita neste arquivo é decisão sem carrasco (medido no gate da `900-60`, QA-900-60-1). O que
 * decide vive em `@web/lib/tenancy/console-dados-empresa`:
 *   • `validarDadosDaEmpresa()` — a MESMA função que a rota usa. Não é "espelho" da validação do
 *     servidor; é a validação do servidor, importada. Duas implementações divergiriam em silêncio
 *     e o operador veria o botão liberado antes de levar um `400`.
 *   • `podeSalvar()` / `houveMudanca()` — a AC7.5.
 *   • `decidirDesfechoDaEdicao()` — a AC9/AC10: falha NÃO fecha, sucesso FECHA.
 *   • `AVISO_DO_IDENTIFICADOR` / `AVISO_DOS_DADOS_FISCAIS` — a AC8.
 * O que sobra aqui é a OBEDIÊNCIA a essas decisões, mais o desenho.
 *
 * ## Montagem e desmontagem em vez de prop `aberto`
 *
 * Mesmo motivo da `900-60`: com uma prop, o estado interno (os oito campos, o motivo, o erro)
 * sobrevive ao fechamento, e limpá-lo exigiria `setState` dentro de `useEffect` — cascata de
 * renderização que o ESLint deste repositório reprova. Pior: um motivo esquecido de uma edição
 * anterior seria enviado para a trilha de uma ação que ele não explica.
 *
 * ## Portal para o `<body>`
 *
 * O card mora num `grid` cujo contêiner tem `rounded-lg`/`overflow` próprios, e uma sobreposição
 * `fixed inset-0` declarada dentro de um contexto de empilhamento fica presa nele. É seguro
 * porque o diálogo só é montado a partir de um clique — nunca chega à renderização do servidor.
 */

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import {
  AVISO_DOS_DADOS_FISCAIS,
  AVISO_DO_IDENTIFICADOR,
  decidirDesfechoDaEdicao,
  podeSalvar,
  validarDadosDaEmpresa,
  type CorpoDaRespostaDaRota,
  type DadosDaEmpresaEditaveis,
} from "@web/lib/tenancy/console-dados-empresa"
import { maskCnpj, maskPhoneBR } from "@web/lib/validation/contato"

interface Props {
  orgId: string
  /** Os OITO valores como estão hoje no banco — a base de comparação da AC7.5. */
  inicial: DadosDaEmpresaEditaveis
  /**
   * `organizations.updated_at`, cru, como veio do PostgREST. **Nunca reformatado por `Date`**:
   * o valor viaja de volta como texto para a RPC comparar com `IS DISTINCT FROM`, e um
   * round-trip por `Date` perderia os microssegundos — a trava passaria a acusar conflito em
   * toda edição.
   */
  expectedUpdatedAt: string
}

export function EditarDadosEmpresa({ orgId, inicial, expectedUpdatedAt }: Props) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
      >
        Editar
      </button>
      {aberto && (
        <DialogoDeEdicao
          orgId={orgId}
          inicial={inicial}
          expectedUpdatedAt={expectedUpdatedAt}
          aoFechar={() => setAberto(false)}
        />
      )}
    </>
  )
}

function DialogoDeEdicao({
  orgId,
  inicial,
  expectedUpdatedAt,
  aoFechar,
}: Props & { aoFechar: () => void }) {
  const router = useRouter()
  const [dados, setDados] = useState<DadosDaEmpresaEditaveis>(inicial)
  const [motivo, setMotivo] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const primeiroCampo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    primeiroCampo.current?.focus()
  }, [])

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      // `Esc` não cancela um envio em curso: a requisição já saiu, e fechar aqui só esconderia o
      // desfecho de algo que vai acontecer de qualquer jeito.
      if (evento.key === "Escape" && !enviando) aoFechar()
    }
    document.addEventListener("keydown", aoTeclar)
    return () => document.removeEventListener("keydown", aoTeclar)
  }, [enviando, aoFechar])

  function mudar(campo: keyof DadosDaEmpresaEditaveis, valor: string) {
    setDados((atual) => ({ ...atual, [campo]: valor }))
  }

  // A dica embaixo do campo mostra o PRIMEIRO erro de formato — a mesma função da rota, então o
  // que aparece aqui é exatamente o que o servidor recusaria.
  const erroDeFormato = validarDadosDaEmpresa(dados).erro
  const habilitado = podeSalvar(inicial, dados) && !enviando

  async function salvar() {
    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch(`/api/platform/orgs/${orgId}/dados`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dados, expectedUpdatedAt, reason: motivo }),
      })
      const corpo = (await res.json().catch(() => ({}))) as CorpoDaRespostaDaRota
      const desfecho = decidirDesfechoDaEdicao(res.ok, res.status, corpo)
      setErro(desfecho.erro)
      if (!desfecho.fecha) {
        // AC9 — o diálogo FICA ABERTO, com os oito campos digitados intactos.
        setEnviando(false)
        return
      }
      // AC10 — a página é Server Component: `router.refresh()` refaz a leitura sem recarregar a
      // página inteira. Mesmo padrão de `<ReenviarConvite />` e de `integrations-panel.tsx:130`.
      router.refresh()
      aoFechar()
    } catch {
      // OBS-2 do gate da 900-62: NÃO dizer "nada foi alterado" aqui. A requisição pode ter
      // chegado, gravado e a resposta ter se perdido na volta — o `catch` do `fetch` não
      // distingue "não saiu" de "não voltou". O diálogo fica aberto com os oito campos
      // digitados; o que muda é a frase parar de afirmar o que não foi medido.
      setErro(
        "Não foi possível falar com o servidor — não dá para confirmar se a alteração foi " +
          "gravada. Recarregue a página para ver o estado atual.",
      )
      setEnviando(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !enviando) aoFechar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-editar-dados-empresa"
        // Três seções + oito campos passam da altura da viewport em telas de notebook. Com o
        // rolamento na SOBREPOSIÇÃO, o diálogo abre pelo meio: o título fica acima do topo e os
        // botões abaixo do rodapé — medido em 1280×1080 nesta story. Aqui o contêiner é limitado
        // a 90vh e quem rola é o MIOLO; título e botões ficam sempre à vista.
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-xl"
      >
        <h2
          id="titulo-editar-dados-empresa"
          className="shrink-0 border-b border-slate-800 px-5 py-4 text-base font-semibold text-slate-100"
        >
          Editar dados da empresa
        </h2>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        <Secao titulo="Identidade">
          <Campo
            id="editar-nome"
            rotulo="Nome"
            valor={dados.name}
            aoMudar={(v) => mudar("name", v)}
            desabilitado={enviando}
            ref={primeiroCampo}
          />
          <Campo
            id="editar-slug"
            rotulo="Identificador"
            valor={dados.slug}
            aoMudar={(v) => mudar("slug", v)}
            desabilitado={enviando}
            mono
            dica="minúsculas, números e hífen — ex.: acme-imoveis"
          />
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{AVISO_DO_IDENTIFICADOR}</p>
        </Secao>

        <Secao titulo="Contato">
          <Campo
            id="editar-contato-nome"
            rotulo="Responsável"
            valor={dados.contatoNome}
            aoMudar={(v) => mudar("contatoNome", v)}
            desabilitado={enviando}
          />
          <Campo
            id="editar-contato-email"
            rotulo="E-mail"
            valor={dados.contatoEmail}
            aoMudar={(v) => mudar("contatoEmail", v)}
            desabilitado={enviando}
          />
          <Campo
            id="editar-contato-telefone"
            rotulo="Telefone"
            valor={dados.contatoTelefone}
            // Máscara progressiva reaproveitada de `contato.ts` (isomórfica, Story 80-1) — não
            // duplicada aqui.
            aoMudar={(v) => mudar("contatoTelefone", maskPhoneBR(v))}
            desabilitado={enviando}
          />
        </Secao>

        <Secao titulo="Dados fiscais">
          <Campo
            id="editar-fiscal-cnpj"
            rotulo="CNPJ"
            valor={dados.fiscalCnpj ? maskCnpj(dados.fiscalCnpj) : ""}
            // O estado guarda o que o operador vê (mascarado); quem tira a máscara para gravar é
            // `normalizeCpfCnpj` dentro de `validarDadosDaEmpresa` — a lição da Story 75-282 é
            // gravar cru e mascarar na exibição.
            aoMudar={(v) => mudar("fiscalCnpj", maskCnpj(v))}
            desabilitado={enviando}
            mono
          />
          <Campo
            id="editar-fiscal-razao"
            rotulo="Razão social"
            valor={dados.fiscalRazaoSocial}
            aoMudar={(v) => mudar("fiscalRazaoSocial", v)}
            desabilitado={enviando}
          />
          <div>
            <label htmlFor="editar-fiscal-endereco" className="block text-xs text-slate-400">
              Endereço
            </label>
            <textarea
              id="editar-fiscal-endereco"
              rows={2}
              value={dados.fiscalEndereco}
              onChange={(e) => mudar("fiscalEndereco", e.target.value)}
              disabled={enviando}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 disabled:opacity-50"
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{AVISO_DOS_DADOS_FISCAIS}</p>
        </Secao>

        <div className="mt-4">
          <label htmlFor="editar-motivo" className="block text-xs text-slate-400">
            Motivo (opcional — fica na trilha de auditoria)
          </label>
          <input
            id="editar-motivo"
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={enviando}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 disabled:opacity-50"
          />
        </div>

        {/* O erro de FORMATO (local) e o erro do SERVIDOR são dois avisos diferentes, de
            propósito: o primeiro diz por que o botão está travado; o segundo, o que o banco
            recusou. Colapsá-los faria "corrija o CNPJ" e "outra pessoa editou" virarem a mesma
            frase. */}
        {!erro && erroDeFormato && (
          <p className="mt-3 text-xs text-amber-400">{erroDeFormato.mensagem}</p>
        )}
        {erro && (
          <p
            role="alert"
            className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
          >
            {erro}
          </p>
        )}

        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-800 px-5 py-4">
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
            onClick={salvar}
            // `disabled` de verdade, não só aparência: um botão que parece inerte e responde ao
            // clique é pior que nenhum.
            disabled={!habilitado}
            className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 space-y-2 border-t border-slate-800 pt-3 first:mt-0 first:border-t-0 first:pt-4">
      <h3 className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  desabilitado,
  mono,
  dica,
  ref,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  desabilitado: boolean
  mono?: boolean
  dica?: string
  ref?: React.Ref<HTMLInputElement>
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-slate-400">
        {rotulo}
      </label>
      <input
        id={id}
        ref={ref}
        type="text"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        disabled={desabilitado}
        className={`mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 disabled:opacity-50 ${
          mono ? "font-mono text-xs" : ""
        }`}
      />
      {dica && <p className="mt-0.5 text-[0.65rem] text-slate-500">{dica}</p>}
    </div>
  )
}
