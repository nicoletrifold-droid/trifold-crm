import type { FC } from "react"
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

/**
 * Composição de exemplo (Hello World) — animação simples pra explorar o Remotion.
 * O título entra com um "spring" (escala) e fade-in. Edite e veja ao vivo no Studio.
 */
export const HelloWorld: FC<{ titulo: string }> = ({ titulo }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scale = spring({ frame, fps, config: { damping: 200 } })
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" })
  const subOpacity = interpolate(frame, [25, 50], [0, 1], { extrapolateRight: "clamp" })

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0F0F0F",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Helvetica, Arial, sans-serif",
      }}
    >
      <div style={{ transform: `scale(${scale})`, opacity }}>
        <div style={{ color: "#F27A5E", fontSize: 96, fontWeight: 800, letterSpacing: 2 }}>
          {titulo}
        </div>
      </div>
      <div style={{ marginTop: 16, color: "#cbd5e1", fontSize: 28, opacity: subOpacity }}>
        Feito com Remotion 🎬
      </div>
    </AbsoluteFill>
  )
}
