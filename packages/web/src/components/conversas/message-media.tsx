/* eslint-disable @next/next/no-img-element */
// Story 75-85 — render de mídia de uma mensagem (imagem/áudio/documento) a partir de
// metadata.media_type + metadata.media_url. Sem hooks → usável em server e client.
// Fallback: media_type sem url → rótulo (não renderiza <img> quebrado).

export function MessageMedia({
  mediaType,
  mediaUrl,
}: {
  mediaType?: string | null
  mediaUrl?: string | null
}) {
  if (!mediaType && !mediaUrl) return null

  const isImage = mediaType === "image"
  const isAudio = mediaType === "audio" || mediaType === "voice"
  const isDoc = mediaType === "document"

  if (isImage) {
    return mediaUrl ? (
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 block">
        <img
          src={mediaUrl}
          alt="Imagem enviada"
          className="max-h-64 max-w-[260px] rounded-lg object-cover"
          loading="lazy"
        />
      </a>
    ) : (
      <span className="mt-1 inline-flex items-center gap-1 text-xs opacity-70">📷 Imagem</span>
    )
  }

  if (isAudio) {
    // Player nativo + link "baixar áudio". WhatsApp manda voz em OGG/Opus, que NÃO toca
    // no Safari/iPhone — nesses casos o usuário lê a transcrição (conteúdo da mensagem) e,
    // se quiser ouvir, baixa o arquivo. Em Chrome/Android/Firefox o player toca direto.
    return mediaUrl ? (
      <div className="mt-1.5 w-full max-w-[260px]">
        <audio controls src={mediaUrl} className="w-full" />
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="mt-1 inline-flex items-center gap-1 text-xs underline opacity-80"
        >
          ⬇️ Baixar áudio
        </a>
      </div>
    ) : (
      <span className="mt-1 inline-flex items-center gap-1 text-xs opacity-70">🎤 Mensagem de voz</span>
    )
  }

  if (isDoc) {
    return mediaUrl ? (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 text-xs underline opacity-90"
      >
        📄 Abrir documento
      </a>
    ) : (
      <span className="mt-1 inline-flex items-center gap-1 text-xs opacity-70">📄 Documento</span>
    )
  }

  // Tipo desconhecido mas com url → link genérico.
  return mediaUrl ? (
    <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs underline opacity-90">
      📎 Abrir anexo
    </a>
  ) : null
}
