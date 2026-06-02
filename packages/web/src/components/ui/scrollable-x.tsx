"use client"

import { useEffect, useRef } from "react"

interface ScrollableXProps {
  children: React.ReactNode
  className?: string
  innerClassName?: string
}

/**
 * ScrollableX — wrapper that hides the native horizontal scrollbar and
 * replaces it with a sticky mirror bar fixed to the bottom of the viewport.
 *
 * Usage (drop-in for `<div className="overflow-x-auto ...">`):
 *   <ScrollableX className="rounded-lg bg-white shadow-sm ...">
 *     <table>...</table>
 *   </ScrollableX>
 */
export function ScrollableX({ children, className = "", innerClassName = "" }: ScrollableXProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)

  // Track whether a scroll event was triggered programmatically so we
  // don't create an infinite ping-pong between the two scroll listeners.
  const syncingRef = useRef(false)

  useEffect(() => {
    const content = contentRef.current
    const mirror = mirrorRef.current
    const ghost = ghostRef.current
    if (!content || !mirror || !ghost) return

    // Update the ghost element's width to match the scrollable content width,
    // so the mirror bar's thumb reflects the real content width.
    function updateWidth() {
      if (!content || !ghost) return
      ghost.style.width = `${content.scrollWidth}px`
    }

    // Sync mirror → content
    function onMirrorScroll() {
      if (!content || !mirror) return
      if (syncingRef.current) return
      syncingRef.current = true
      content.scrollLeft = mirror.scrollLeft
      syncingRef.current = false
    }

    // Sync content → mirror
    function onContentScroll() {
      if (!content || !mirror) return
      if (syncingRef.current) return
      syncingRef.current = true
      mirror.scrollLeft = content.scrollLeft
      syncingRef.current = false
    }

    updateWidth()

    const ro = new ResizeObserver(updateWidth)
    ro.observe(content)
    // Also observe direct children (e.g. the <table>) so we pick up width changes
    for (const child of Array.from(content.children)) {
      ro.observe(child)
    }

    mirror.addEventListener("scroll", onMirrorScroll, { passive: true })
    content.addEventListener("scroll", onContentScroll, { passive: true })

    return () => {
      ro.disconnect()
      mirror.removeEventListener("scroll", onMirrorScroll)
      content.removeEventListener("scroll", onContentScroll)
    }
  }, [])

  return (
    <div className={className}>
      {/* Scrollable content — native scrollbar hidden */}
      <div
        ref={contentRef}
        className={`overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${innerClassName}`}
      >
        {children}
      </div>

      {/* Mirror scrollbar — sticky to bottom of viewport */}
      <div
        ref={mirrorRef}
        className="sticky bottom-0 overflow-x-auto"
        style={{ height: 12 }}
      >
        {/* Ghost element that carries the scrollable width */}
        <div ref={ghostRef} style={{ height: 1 }} />
      </div>
    </div>
  )
}
