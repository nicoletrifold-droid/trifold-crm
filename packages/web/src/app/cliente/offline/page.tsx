export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-950 px-6 text-center">
      <div className="mb-6 text-5xl">📡</div>
      <h1 className="mb-2 text-xl font-semibold text-stone-100">Você está offline</h1>
      <p className="text-stone-400">
        Conecte-se à internet para ver o progresso da sua obra.
      </p>
    </div>
  )
}
