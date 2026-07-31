// Story 75-252 — tokeniza URLs no texto de mensagem para virarem link clicável.
//
// 🔒 SEGURANÇA POR CONSTRUÇÃO: esta função devolve SEGMENTOS, nunca HTML. O React
// monta os nós a partir deles, então `dangerouslySetInnerHTML` nunca entra na
// jogada e XSS fica impossível — não por sanitizar bem, mas por não existir
// caminho de injeção. O texto vem de terceiro (o lead escreve o que quiser).
//
// Só `http` e `https` viram link. `javascript:`, `data:`, `vbscript:` e afins
// ficam TEXTO.

export type SegmentoMensagem =
  | { tipo: "texto"; valor: string }
  | { tipo: "link"; valor: string; href: string }

/**
 * Detecção deliberadamente CONSERVADORA (risco 1 da story): exige esquema
 * explícito `http(s)://` OU o prefixo `www.`. Não adivinha domínio por TLD, senão
 * `arquivo.pdf` e `visite trifold.eng.br` virariam link errado.
 */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi

/** Pontuação que costuma encostar no fim da URL numa frase e não faz parte dela. */
const PONTUACAO_FINAL = /[.,;:!?]+$/

/**
 * Corta pontuação final e parêntese/colchete desbalanceado (AC6).
 * `veja https://x.com/a.` → o ponto não entra.
 * `(https://x.com/a)` → o `)` não entra.
 * `https://x.com/a_(b)` → o `)` ENTRA, porque está balanceado.
 */
function aparar(bruto: string): string {
  let url = bruto.replace(PONTUACAO_FINAL, "")
  for (const [abre, fecha] of [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ] as const) {
    while (url.endsWith(fecha)) {
      const abertos = url.split(abre).length - 1
      const fechados = url.split(fecha).length - 1
      if (fechados <= abertos) break // balanceado: o fecha pertence à URL
      url = url.slice(0, -1)
    }
  }
  // aspas/apóstrofo colados no fim
  return url.replace(/["']+$/, "")
}

/** PURA: `www.x.com` ganha https:// no href; o TEXTO exibido não muda (AC4). */
function hrefDe(url: string): string | null {
  const comEsquema = /^https?:\/\//i.test(url) ? url : `https://${url}`
  try {
    const u = new URL(comEsquema)
    // AC3 — allowlist de esquema. Nada além de http/https.
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * PURA (AC7): quebra o texto em segmentos de texto e link. Sem DOM, sem React.
 */
export function tokenizeLinks(texto: string): SegmentoMensagem[] {
  if (!texto) return []
  const out: SegmentoMensagem[] = []
  let cursor = 0

  for (const m of texto.matchAll(URL_RE)) {
    const bruto = m[0]
    const inicio = m.index!
    const url = aparar(bruto)
    const href = hrefDe(url)

    // Não é link válido (esquema recusado, URL malformada) → segue como texto.
    if (!href || url.length === 0) continue

    if (inicio > cursor) out.push({ tipo: "texto", valor: texto.slice(cursor, inicio) })
    out.push({ tipo: "link", valor: url, href })
    cursor = inicio + url.length // o que foi aparado volta para o texto
  }

  if (cursor < texto.length) out.push({ tipo: "texto", valor: texto.slice(cursor) })
  return out
}

/** Conveniência para testes e para decidir se vale renderizar link. */
export function temLink(texto: string): boolean {
  return tokenizeLinks(texto).some((s) => s.tipo === "link")
}
