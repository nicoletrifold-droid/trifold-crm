"use client"

/**
 * Story 900-58 · AC6 — o menu `⋯` de uma linha da lista de empresas.
 *
 * É a ÚNICA parte desta story que vira JavaScript no navegador. A busca e os filtros são
 * `<form method="GET">` lido no servidor (AC1), e a linha clicável é um `<Link>` esticado por
 * CSS (AC5) — nenhum dos dois precisa de cliente. Aqui precisa, e por um motivo só:
 * `navigator.clipboard` não existe no servidor.
 *
 * ## Três itens, e o quarto tem dono
 *
 * "Ativar/Desativar" NÃO entra aqui — é mutação de plataforma com confirmação e trilha, escopo
 * da `900-60`. O menu nasce com três itens e ganha o quarto lá, sem reescrita: por isso os itens
 * são um `<ul>` de elementos independentes e não um componente que assume "dois links e um
 * botão".
 *
 * ## `z-10` e `relative` não são estética
 *
 * A linha inteira é clicável por um pseudo-elemento `after:absolute after:inset-0` que cobre o
 * `<tr>`. Sem `relative z-10` aqui, esse pseudo-elemento ficaria POR CIMA deste botão e o clique
 * no `⋯` navegaria para a empresa — o menu existiria e seria inalcançável. Ver o comentário do
 * `page.tsx` sobre conflito de clique.
 *
 * ## O menu é `position: fixed`, e isso foi MEDIDO — não é preferência
 *
 * A tabela mora num contêiner `overflow-hidden` (é o que arredonda os cantos). Um menu
 * `absolute` dentro de uma célula é descendente desse contêiner e é CORTADO por ele. Medido no
 * navegador, 3 empresas, viewport 1440×900: o menu da ÚLTIMA linha ficava em `y=399..505` e o
 * contêiner terminava em `y=415` — sobrava uma faixa de 16px e os três itens eram inalcançáveis.
 * Pior que um menu ausente: ele aparece, e não obedece.
 *
 * ⚠️ `isVisible()` do Playwright dizia `true` para o item cortado — ele mede caixa e
 * `display`, não recorte de ancestral. Quem reprovou foi a captura de tela.
 *
 * `fixed` escapa do recorte de qualquer ancestral com `overflow`, e a posição vem do retângulo
 * do botão. O preço é que a caixa não acompanha rolagem — por isso o menu FECHA ao rolar, que é
 * o comportamento padrão de um dropdown e não deixa a caixa órfã do seu botão.
 *
 * ## Copiar pode não estar disponível, e isso não pode virar silêncio
 *
 * `navigator.clipboard` é `undefined` em contexto inseguro (HTTP sem `localhost`) e o
 * `writeText` rejeita quando a permissão é negada. Nos dois casos o rótulo diz que NÃO copiou —
 * um "Copiado!" otimista faria o operador colar o identificador errado num chamado.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

/** Quanto tempo o rótulo fica em "Copiado!" antes de voltar ao normal. */
const MS_DE_FEEDBACK = 2000

type EstadoDaCopia = "parado" | "copiado" | "falhou"

/** Altura aproximada da caixa (3 itens), usada só para decidir se ela abre para cima. */
const ALTURA_ESTIMADA = 116

interface Posicao {
  /** Distância da direita da janela — o menu alinha pela borda direita do botão. */
  right: number
  /** Uma das duas, nunca as duas: abaixo do botão, ou acima dele. */
  top?: number
  bottom?: number
}

export function OrgRowMenu({ orgId, slug }: { orgId: string; slug: string }) {
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState<Posicao | null>(null)
  const [copia, setCopia] = useState<EstadoDaCopia>("parado")
  const caixa = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)

  function alternar() {
    if (aberto) {
      setAberto(false)
      return
    }
    const r = botao.current?.getBoundingClientRect()
    if (r) {
      const direita = window.innerWidth - r.right
      // Cabe abaixo? Se não, abre para cima. Sem isto, a última linha de uma lista longa
      // empurraria a caixa para fora da janela — o mesmo defeito do recorte, por outra porta.
      setPosicao(
        r.bottom + ALTURA_ESTIMADA <= window.innerHeight
          ? { right: direita, top: r.bottom + 4 }
          : { right: direita, bottom: window.innerHeight - r.top + 4 },
      )
    }
    setAberto(true)
  }

  // Fechar no clique fora e no Escape. Sem isso o menu fica aberto sobre a linha seguinte e o
  // pseudo-elemento de clique daquela linha passa a ser coberto por ele.
  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(evento: MouseEvent) {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false)
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false)
    }
    // A caixa é `fixed`: ela não acompanha a rolagem, então rolar tem que FECHAR. `true` na
    // fase de captura porque quem rola pode ser um contêiner interno, não a janela.
    function aoRolar() {
      setAberto(false)
    }
    document.addEventListener("mousedown", aoClicarFora)
    document.addEventListener("keydown", aoTeclar)
    window.addEventListener("scroll", aoRolar, true)
    window.addEventListener("resize", aoRolar)
    return () => {
      document.removeEventListener("mousedown", aoClicarFora)
      document.removeEventListener("keydown", aoTeclar)
      window.removeEventListener("scroll", aoRolar, true)
      window.removeEventListener("resize", aoRolar)
    }
  }, [aberto])

  // O rótulo volta ao normal sozinho; o `clearTimeout` evita que um clique novo herde o
  // temporizador do anterior e apague o feedback antes da hora.
  useEffect(() => {
    if (copia === "parado") return
    const t = setTimeout(() => setCopia("parado"), MS_DE_FEEDBACK)
    return () => clearTimeout(t)
  }, [copia])

  async function copiarIdentificador() {
    try {
      // `?.` porque em contexto inseguro `navigator.clipboard` é `undefined` — sem a checagem
      // isto lançaria `TypeError` e o `catch` diria "falhou", o que por acaso está certo; com
      // ela, o caminho é explícito em vez de acidental.
      const area = navigator.clipboard
      if (!area) {
        setCopia("falhou")
        return
      }
      await area.writeText(slug)
      setCopia("copiado")
    } catch {
      setCopia("falhou")
    }
  }

  const rotuloDaCopia =
    copia === "copiado"
      ? "Copiado!"
      : copia === "falhou"
        ? "Não foi possível copiar"
        : "Copiar identificador"

  return (
    <div ref={caixa} className="relative z-10 inline-block text-left">
      <button
        type="button"
        ref={botao}
        onClick={alternar}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Ações da empresa"
        className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
      >
        ⋯
      </button>

      {aberto && posicao && (
        <ul
          role="menu"
          // `fixed` + coordenadas do botão: a caixa escapa do `overflow-hidden` do contêiner da
          // tabela. É inline porque a posição é medida em runtime — o Tailwind v4 descobre
          // classe varrendo texto-fonte, e uma classe montada por interpolação não existiria no
          // CSS gerado.
          style={{ position: "fixed", right: posicao.right, top: posicao.top, bottom: posicao.bottom }}
          className="z-50 w-56 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 text-xs shadow-lg"
        >
          <li role="none">
            <Link
              role="menuitem"
              href={`/platform/orgs/${orgId}`}
              className="block px-3 py-2 text-slate-200 hover:bg-slate-800"
            >
              Ver empresa
            </Link>
          </li>
          <li role="none">
            <Link
              role="menuitem"
              href={`/platform/orgs/${orgId}/integracoes`}
              className="block px-3 py-2 text-slate-200 hover:bg-slate-800"
            >
              Integrações
            </Link>
          </li>
          <li role="none">
            <button
              role="menuitem"
              type="button"
              onClick={copiarIdentificador}
              className={
                copia === "falhou"
                  ? "block w-full px-3 py-2 text-left text-red-300 hover:bg-slate-800"
                  : copia === "copiado"
                    ? "block w-full px-3 py-2 text-left text-emerald-400 hover:bg-slate-800"
                    : "block w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800"
              }
            >
              {rotuloDaCopia}
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
