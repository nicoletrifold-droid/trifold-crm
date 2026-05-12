"use client"

import { useEffect, useState } from "react"

interface AnimatedProgressBarProps {
  pct: number
  className?: string
}

export function AnimatedProgressBar({ pct, className = "" }: AnimatedProgressBarProps) {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setWidth(pct), 120)
    return () => clearTimeout(timer)
  }, [pct])

  return (
    <div className={`h-3 w-full rounded-full bg-stone-800 ${className}`}>
      <div
        className="h-3 rounded-full bg-[#F27A5E]"
        style={{
          width: `${width}%`,
          transition: "width 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  )
}
