import { WeatherWidget } from "@web/components/weather-widget"

export default function ClienteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-stone-950">
      {/* Previsão do tempo — top-right
          Mobile: fica logo abaixo do header (top-16 = 64px, header ocupa h-14 = 56px)
          Desktop: canto superior direito da tela */}
      <WeatherWidget
        variant="dark"
        className="fixed right-4 top-16 z-20 lg:top-4"
      />
      {children}
    </div>
  )
}
