interface Mensagem {
  id: string
  content: string | null
  created_at: string
  sender_type: string
}

interface MensagensListProps {
  mensagens: Mensagem[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function MensagensList({ mensagens }: MensagensListProps) {
  if (mensagens.length === 0) {
    return (
      <p className="text-sm text-stone-500">Nenhuma atualização ainda.</p>
    )
  }

  return (
    <ul className="space-y-3">
      {mensagens.map((msg) => {
        const text = msg.content ?? ""
        const truncated = text.length > 200 ? `${text.slice(0, 200)}...` : text

        return (
          <li
            key={msg.id}
            className="rounded-xl border border-stone-800 bg-stone-900/60 p-4"
          >
            <p className="mb-1 text-xs text-stone-500">{formatDate(msg.created_at)}</p>
            <p className="text-sm leading-relaxed text-white">{truncated}</p>
          </li>
        )
      })}
    </ul>
  )
}
