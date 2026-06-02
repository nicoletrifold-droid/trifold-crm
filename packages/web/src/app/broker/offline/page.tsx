export default function BrokerOfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-stone-950 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-800">
        <svg
          className="h-8 w-8 text-stone-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z"
          />
        </svg>
      </div>

      <div>
        <h1 className="text-xl font-bold text-stone-100">Você está offline</h1>
        <p className="mt-2 max-w-xs text-sm text-stone-500">
          Sem conexão com a internet. Verifique seu Wi-Fi ou dados móveis e tente novamente.
        </p>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white active:bg-orange-700"
      >
        Tentar novamente
      </button>
    </div>
  )
}
