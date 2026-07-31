// Story 75-252 — texto de mensagem com URL clicável, usado nas 6 superfícies de
// conversa (lead, corretor, timeline e chat de obra dos dois lados).
//
// 🔒 Renderiza a partir de SEGMENTOS (linkify.ts), nunca de HTML: sem
// `dangerouslySetInnerHTML`, o XSS não tem por onde entrar. O texto é de terceiro.
//
// O estilo NÃO é imposto aqui: cada superfície passa sua classe (uma usa
// `whitespace-pre-wrap`, outra `pre-line`) — risco 3 da story, regressão visual.

import { tokenizeLinks } from "@web/lib/messages/linkify"

interface Props {
  content: string | null | undefined
  /** Classe do <p> — cada bolha mantém a sua (pre-wrap vs pre-line, cor, tamanho). */
  className?: string
}

export function MessageText({ content, className }: Props) {
  if (!content) return null
  const segmentos = tokenizeLinks(content)

  return (
    <p className={className}>
      {segmentos.map((s, i) =>
        s.tipo === "link" ? (
          <a
            key={i}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            // sublinhado + quebra: link longo de WhatsApp não pode estourar a bolha
            className="break-all underline decoration-1 underline-offset-2 hover:opacity-80"
          >
            {s.valor}
          </a>
        ) : (
          s.valor
        )
      )}
    </p>
  )
}
