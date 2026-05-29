"use client"

import { useEffect, useState } from "react"

interface WeatherData {
  temp: number
  emoji: string
  label: string
  cachedAt: number
}

const CACHE_KEY = "trifold_weather"
const CACHE_TTL = 30 * 60 * 1000 // 30 min

function wmoToWeather(code: number): { emoji: string; label: string } {
  if (code === 0)                          return { emoji: "☀️",  label: "Céu limpo" }
  if (code === 1)                          return { emoji: "🌤️", label: "Predominantemente limpo" }
  if (code === 2)                          return { emoji: "⛅",  label: "Parcialmente nublado" }
  if (code === 3)                          return { emoji: "☁️",  label: "Nublado" }
  if (code === 45 || code === 48)          return { emoji: "🌫️", label: "Névoa" }
  if (code >= 51 && code <= 55)            return { emoji: "🌦️", label: "Garoa" }
  if (code >= 61 && code <= 65)            return { emoji: "🌧️", label: "Chuva" }
  if (code === 66 || code === 67)          return { emoji: "🌨️", label: "Chuva congelante" }
  if ((code >= 71 && code <= 77))          return { emoji: "❄️",  label: "Neve" }
  if (code >= 80 && code <= 82)            return { emoji: "🌦️", label: "Pancadas de chuva" }
  if (code === 85 || code === 86)          return { emoji: "🌨️", label: "Pancadas de neve" }
  if (code === 95)                         return { emoji: "⛈️",  label: "Tempestade" }
  if (code === 96 || code === 99)          return { emoji: "⛈️",  label: "Tempestade com granizo" }
  return { emoji: "🌡️", label: "Clima" }
}

function loadCache(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as WeatherData
    if (Date.now() - data.cachedAt > CACHE_TTL) return null
    return data
  } catch {
    return null
  }
}

function saveCache(data: WeatherData) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch { /* ignore */ }
}

interface Props {
  /** "dark" = sempre escuro (portal). "system" = respeita tema (dashboard). */
  variant?: "dark" | "system"
  className?: string
}

export function WeatherWidget({ variant = "system", className = "" }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null)

  useEffect(() => {
    const cached = loadCache()
    if (cached) { setWeather(cached); return }

    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${coords.latitude.toFixed(4)}` +
            `&longitude=${coords.longitude.toFixed(4)}` +
            `&current=temperature_2m,weather_code&timezone=auto`

          const res = await fetch(url)
          if (!res.ok) return
          const json = await res.json() as {
            current: { temperature_2m: number; weather_code: number }
          }
          const { emoji, label } = wmoToWeather(json.current.weather_code)
          const data: WeatherData = {
            temp: Math.round(json.current.temperature_2m),
            emoji,
            label,
            cachedAt: Date.now(),
          }
          saveCache(data)
          setWeather(data)
        } catch { /* falha silenciosa */ }
      },
      () => { /* permissão negada — não exibe nada */ },
      { timeout: 8000, maximumAge: CACHE_TTL }
    )
  }, [])

  if (!weather) return null

  const textCls =
    variant === "dark"
      ? "text-stone-400"
      : "text-stone-500 dark:text-stone-400"

  return (
    <span
      title={`${weather.label} — ${weather.temp}°C`}
      aria-label={`Temperatura atual: ${weather.temp}°C, ${weather.label}`}
      className={`flex items-center gap-1 select-none ${textCls} ${className}`}
    >
      <span className="text-base leading-none" aria-hidden="true">{weather.emoji}</span>
      <span className="text-sm font-medium tabular-nums">{weather.temp}°</span>
    </span>
  )
}
