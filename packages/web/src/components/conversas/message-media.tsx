/* eslint-disable @next/next/no-img-element */
// Story 75-85 — render de mídia de uma mensagem (imagem/áudio/documento) a partir de
// metadata.media_type + metadata.media_url. Sem hooks → usável em server e client.
// Fallback: media_type sem url → rótulo (não renderiza <img> quebrado).

export function MessageMedia({
  mediaType,
  mediaUrl,
  downloadFailed,
  onRetry,
  retrying,
  transcribed,
}: {
  mediaType?: string | null
  mediaUrl?: string | null
  /** Story 75-289 (AC4) — `metadata.media_download_failed`. */
  downloadFailed?: boolean
  /** Ação de baixar de novo. Sem ela, só o aviso é exibido (ex.: render server). */
  onRetry?: () => void
  retrying?: boolean
  /**
   * `metadata.transcribed` de áudio. `false` = baixou e o Whisper falhou (a
   * transcrição é fail-open); `undefined` = não se aplica / mensagem legada, e nesse
   * caso NÃO se acusa falha (não há como distinguir de áudio antigo sem a marca).
   */
  transcribed?: boolean
}) {
  if (!mediaType && !mediaUrl) return null

  // Story 75-289 (AC4): mídia que NÃO baixou tinha o mesmo rótulo cinza de mídia
  // "ainda carregando" — o corretor não tinha como saber que o lead mandou um áudio
  // que ninguém nunca vai ouvir. Foi assim que 2 mensagens de voz de um lead em
  // etapa SDR passaram batidas em 10/08.
  if (downloadFailed && !mediaUrl) {
    const rotulo =
      mediaType === "image" ? "imagem" : mediaType === "document" ? "documento" : "mensagem de voz"
    return (
      <div className="mt-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 dark:border-red-800/60 dark:bg-red-950/40">
        <p className="text-xs font-medium text-red-700 dark:text-red-300">
          ⚠️ O lead enviou uma {rotulo} que não foi baixada
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-1 text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-900 disabled:opacity-50 dark:text-red-300 dark:hover:text-red-200"
          >
            {retrying ? "Baixando…" : "Baixar agora"}
          </button>
        ) : (
          <p className="mt-0.5 text-[11px] text-red-600/80 dark:text-red-400/80">
            Abra a conversa do lead para tentar baixar.
          </p>
        )}
      </div>
    )
  }

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
        {/* Story 75-289 (AC4): áudio baixado SEM transcrição não é mensagem perdida —
            o corretor ouve. Mas a Nicole é alimentada pelo TEXTO, então sem
            transcrição ela responde cega. Isso precisa aparecer. */}
        {transcribed === false && (
          <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 dark:bg-amber-950/40">
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Sem transcrição — a Nicole não leu este áudio
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="mt-0.5 text-[11px] font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950 disabled:opacity-50 dark:text-amber-300"
              >
                {retrying ? "Transcrevendo…" : "Transcrever agora"}
              </button>
            )}
          </div>
        )}
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
