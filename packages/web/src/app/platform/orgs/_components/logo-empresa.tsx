"use client"

/**
 * Story 900-63 · AC8/AC9 — o bloco do logo dentro do card "Identidade".
 *
 * 🔴 **METADE 1 de 2.** Isto GUARDA o arquivo. `organizations.logo_url` não é lido por nenhuma
 * tela do CRM do cliente — login, cabeçalho, sidebar e e-mails continuam mostrando a marca da
 * Trifold. Quem troca a marca é a `900-64`. Por isso o texto de `AVISO_DE_QUE_ISTO_SO_GUARDA` é
 * OBRIGATÓRIO logo abaixo do botão (AC9), e por isso o placeholder de "sem logo" é neutro e
 * **não** a marca da Trifold: mostrar a marca da Trifold aqui sugeriria, erradamente, que é ela
 * que o cliente vê por causa deste cadastro.
 *
 * ## O que NÃO mora aqui, e por quê
 *
 * `vitest.config.ts` casa `packages/web/src/**\/*.test.ts` — e **não** `.tsx`. Toda decisão
 * escrita neste arquivo seria decisão sem carrasco (medido no gate da `900-60`, QA-900-60-1). O
 * que decide vive em `@web/lib/tenancy/console-logo-empresa`:
 *   • `validarArquivoDeLogo()` — a MESMA função que a rota usa. Não é "espelho" da validação do
 *     servidor; é a validação do servidor, importada.
 *   • `decidirDesfechoDoLogo()` — falha NÃO some com o erro, sucesso recarrega.
 *   • `avisoDeArquivoNaoRemovido()` — o `DELETE` que limpou o cadastro mas não apagou o arquivo.
 *   • `urlDePreVisualizacao()` — a marca de versão que impede a tela de mostrar o logo ANTIGO.
 *   • `AVISO_DE_QUE_ISTO_SO_GUARDA` — a AC9.
 * O que sobra aqui é a OBEDIÊNCIA a essas decisões, mais o desenho. Há régua estática em
 * `platform-query-scan.test.ts` prendendo o CONSUMO de cada uma: função pura bem testada com
 * componente que a ignora é o mesmo verde vazio.
 */

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AVISO_DE_QUE_ISTO_SO_GUARDA,
  EXTENSAO_POR_MIME,
  avisoDeArquivoNaoRemovido,
  decidirDesfechoDoLogo,
  urlDePreVisualizacao,
  validarArquivoDeLogo,
  type CorpoDaRespostaDoLogo,
} from "@web/lib/tenancy/console-logo-empresa"

interface Props {
  orgId: string
  /** `organizations.logo_url` como está hoje no banco — `null` quando não há logo. */
  logoUrl: string | null
  /**
   * `organizations.updated_at`, cru, como veio do PostgREST. **Nunca reformatado por `Date`**: o
   * valor viaja de volta para a RPC comparar com `IS DISTINCT FROM`, e um round-trip por `Date`
   * perderia os microssegundos — a trava passaria a acusar conflito em toda escrita.
   */
  expectedUpdatedAt: string
}

/** O `accept` do seletor de arquivo sai da MESMA lista da rota — não de literais repetidos aqui. */
const TIPOS_ACEITOS = Object.keys(EXTENSAO_POR_MIME).join(",")

export function LogoDaEmpresa({ orgId, logoUrl, expectedUpdatedAt }: Props) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const seletor = useRef<HTMLInputElement>(null)

  const previa = urlDePreVisualizacao(logoUrl, expectedUpdatedAt)

  /** O trecho comum aos dois verbos: envia, decide o desfecho, e NUNCA afirma o que não voltou. */
  async function agir(pedido: () => Promise<Response>) {
    setOcupado(true)
    setErro(null)
    setAviso(null)
    try {
      const res = await pedido()
      const corpo = (await res.json().catch(() => ({}))) as CorpoDaRespostaDoLogo
      const desfecho = decidirDesfechoDoLogo(res.ok, res.status, corpo)
      setErro(desfecho.erro)
      if (!desfecho.sucesso) {
        setOcupado(false)
        return
      }
      setAviso(avisoDeArquivoNaoRemovido(corpo))
      // A página é Server Component: `router.refresh()` refaz a leitura sem recarregar a página
      // inteira. Mesmo padrão de `<EditarDadosEmpresa />` e de `integrations-panel.tsx:130`.
      router.refresh()
    } catch {
      // O `catch` do `fetch` não distingue "não saiu" de "não voltou": a requisição pode ter
      // chegado, gravado, e a resposta ter se perdido na volta. A frase não afirma nenhum dos
      // dois — mesma correção que a OBS-2 do gate da `900-62` impôs ao diálogo de edição.
      setErro(
        "Não foi possível falar com o servidor — não dá para confirmar se a alteração foi " +
          "gravada. Recarregue a página para ver o estado atual.",
      )
    }
    setOcupado(false)
  }

  async function enviar(arquivo: File) {
    // A MESMA validação da rota, aqui só para poupar o round-trip. Ela NÃO é a autoridade — a
    // rota revalida, e é ela que decide.
    const recusa = validarArquivoDeLogo({ tipo: arquivo.type, tamanho: arquivo.size })
    if (recusa) {
      setErro(recusa.mensagem)
      return
    }
    const formulario = new FormData()
    formulario.append("file", arquivo)
    formulario.append("expectedUpdatedAt", expectedUpdatedAt)
    await agir(() =>
      fetch(`/api/platform/orgs/${orgId}/logo`, { method: "POST", body: formulario }),
    )
  }

  async function remover() {
    await agir(() =>
      fetch(`/api/platform/orgs/${orgId}/logo`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt }),
      }),
    )
  }

  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      <h3 className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
        Logo
      </h3>

      <div className="mt-2 flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700 bg-slate-950">
          {previa ? (
            // `next/image` exigiria cadastrar o host do Storage em `remotePatterns`; a URL aqui é
            // pública e de baixa frequência, e o `<img>` é o que as outras telas deste console
            // usam. O `?v=` de `urlDePreVisualizacao` é o que impede o navegador de servir o logo
            // ANTIGO do cache quando a extensão não mudou.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previa} alt="Logo da empresa" className="max-h-16 max-w-16 object-contain" />
          ) : (
            // Placeholder NEUTRO, e nunca a marca da Trifold: a marca aqui sugeriria que é ela
            // que o cliente vê por causa deste cadastro — que é exatamente o que a AC9 nega.
            <span className="text-[0.6rem] uppercase tracking-wide text-slate-600">sem logo</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => seletor.current?.click()}
              disabled={ocupado}
              className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ocupado ? "Enviando…" : "Enviar logo"}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={remover}
                disabled={ocupado}
                className="rounded border border-red-500/40 px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remover
              </button>
            )}
          </div>

          <input
            ref={seletor}
            type="file"
            accept={TIPOS_ACEITOS}
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0]
              // O `value` é limpo SEMPRE, e antes do envio: sem isso, escolher o mesmo arquivo
              // duas vezes seguidas não dispara `change` e o segundo clique não faria nada.
              e.target.value = ""
              if (arquivo) void enviar(arquivo)
            }}
          />

          {/* AC9 — obrigatório, não opcional. É o que impede esta tela de prometer um efeito que
              o levantamento da story mediu como inexistente. */}
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            {AVISO_DE_QUE_ISTO_SO_GUARDA}
          </p>

          {aviso && (
            <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {aviso}
            </p>
          )}
          {erro && (
            <p
              role="alert"
              className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              {erro}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
