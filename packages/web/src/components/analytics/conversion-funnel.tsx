"use client"

// Story 75-318 — Funil de Conversão em 4 andares com "líquido" animado.
// Pedido do Marcos (13/08): formato de funil de verdade (não barras), 4 andares:
// Atendimento → Visita (Agendada + Visitou dividindo o MESMO andar, cores
// distintas) → Proposta → Fechamento, com os números do pipeline dentro e uma
// animação de água enchendo cada andar. Respeita prefers-reduced-motion
// (líquido fica estático). SVG puro — sem lib externa (CSP dos padrões da casa).

import { liquidFillFraction, type FunnelTiers } from "@web/lib/analytics/funnel-tiers"

interface ConversionFunnelProps {
  tiers: FunnelTiers
  /** Story 75-323 — entradas do período: régua do nível e base das conversões.
   *  Ausente (ou 0) mantém o comportamento da 75-320, com o maior andar no teto. */
  base?: number
}

// Geometria: viewBox 0..720 de largura; andares centrados em x=360.
// Cada andar é um trapézio (topo mais largo que a base) com cantos suaves.
const TIERS = [
  { top: 700, bottom: 560, y: 0, h: 88 },
  { top: 540, bottom: 400, y: 100, h: 88 }, // andar dividido (VA | Visitou)
  { top: 380, bottom: 240, y: 200, h: 88 },
  { top: 220, bottom: 120, y: 300, h: 88 },
] as const

function trapezoid(top: number, bottom: number, y: number, h: number, cx = 360): string {
  const tl = cx - top / 2
  const tr = cx + top / 2
  const bl = cx - bottom / 2
  const br = cx + bottom / 2
  return `M ${tl} ${y} L ${tr} ${y} L ${br} ${y + h} L ${bl} ${y + h} Z`
}

/** Metade esquerda/direita de um trapézio, com um respiro central de 3px. */
function halfTrapezoid(
  top: number,
  bottom: number,
  y: number,
  h: number,
  side: "left" | "right",
  cx = 360,
  gap = 3
): string {
  if (side === "left") {
    return `M ${cx - top / 2} ${y} L ${cx - gap} ${y} L ${cx - gap} ${y + h} L ${cx - bottom / 2} ${y + h} Z`
  }
  return `M ${cx + gap} ${y} L ${cx + top / 2} ${y} L ${cx + bottom / 2} ${y + h} L ${cx + gap} ${y + h} Z`
}

/** Onda horizontal (2 cristas) que percorre a largura do funil, para o clipPath do andar. */
function wavePath(y: number, amplitude: number): string {
  // largura 1440 (2× o viewBox) para o loop de translateX ficar contínuo
  let d = `M -720 ${y}`
  for (let x = -720; x < 1440; x += 180) {
    d += ` q 45 ${-amplitude} 90 0 q 45 ${amplitude} 90 0`
  }
  d += ` L 1440 400 L -720 400 Z`
  return d
}

interface LiquidTierProps {
  clipId: string
  path: string
  color: string
  y: number
  h: number
  delay: number
  /** 0..1 — fração do andar preenchida (75-320: proporcional ao volume). */
  fill: number
}

/** Um andar preenchido de "líquido": base translúcida + 2 ondas defasadas na superfície. */
function LiquidTier({ clipId, path, color, y, h, delay, fill }: LiquidTierProps) {
  const surface = y + h * (1 - fill)
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <path d={path} />
        </clipPath>
      </defs>
      {/* vidro do andar (fundo) */}
      <path d={path} fill={color} opacity={0.16} />
      {/* líquido, recortado pelo próprio andar */}
      <g clipPath={`url(#${clipId})`}>
        <rect x={0} y={surface} width={720} height={h} fill={color} opacity={0.55} />
        <path
          d={wavePath(surface, 7)}
          fill={color}
          opacity={0.65}
          className="funil-onda"
          style={{ animationDelay: `${delay}s` }}
        />
        <path
          d={wavePath(surface + 3, 5)}
          fill={color}
          opacity={0.4}
          className="funil-onda funil-onda--lenta"
          style={{ animationDelay: `${delay + 0.8}s` }}
        />
        {/* brilho superior, efeito de vidro */}
        <rect x={0} y={y} width={720} height={10} fill="white" opacity={0.08} />
      </g>
      {/* contorno */}
      <path d={path} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={1.5} />
    </g>
  )
}

function TierText({
  x,
  y,
  label,
  count,
  share,
  small = false,
}: {
  x: number
  y: number
  label: string
  count: number
  /** Story 75-323 — % sobre as entradas do período; null quando não há base. */
  share?: number | null
  small?: boolean
}) {
  return (
    <g textAnchor="middle" style={{ pointerEvents: "none" }}>
      <text
        x={x}
        y={y - 12}
        className="fill-stone-800 dark:fill-white"
        style={{ fontSize: small ? 13 : 15, fontWeight: 600, opacity: 0.95 }}
      >
        {label}
      </text>
      <text
        x={x}
        y={y + 16}
        className="fill-stone-900 dark:fill-white"
        style={{ fontSize: small ? 24 : 30, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}
      >
        {count}
      </text>
      {share != null && (
        <text
          x={x}
          y={y + 32}
          className="fill-stone-600 dark:fill-stone-300"
          style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
        >
          {share}% das entradas
        </text>
      )}
    </g>
  )
}

export function ConversionFunnel({ tiers, base }: ConversionFunnelProps) {
  const [t1, t2, t3, t4] = TIERS
  // 75-320: o maior andar dita a régua — ele fica "cheio" e os demais proporcionais.
  // 75-323: com o número de entradas do período em mãos, a régua passa a ser ELE.
  // Assim o topo do funil deixa de estar sempre cheio: se 84 entraram e 36 chegaram
  // ao Atendimento, o primeiro andar mostra essa perda em vez de fingir 100%.
  const maxCount = Math.max(
    tiers.atendimento.count,
    tiers.visitaAgendada.count,
    tiers.visitou.count,
    tiers.proposta.count,
    tiers.fechamento.count
  )
  const referencia = base && base > 0 ? base : maxCount
  const nivel = (count: number) => liquidFillFraction(count, referencia)
  const share = (count: number) =>
    base && base > 0 ? Math.round((count / base) * 100) : null
  return (
    <div className="mx-auto w-full max-w-xl">
      <style>{`
        .funil-onda { animation: funilOnda 7s linear infinite; }
        .funil-onda--lenta { animation-duration: 11s; animation-direction: reverse; }
        @keyframes funilOnda { from { transform: translateX(0); } to { transform: translateX(-360px); } }
        @media (prefers-reduced-motion: reduce) { .funil-onda { animation: none; } }
      `}</style>
      <svg viewBox="0 0 720 400" role="img" aria-label="Funil de conversão em 4 etapas" className="h-auto w-full">
        {/* Andar 1 — Atendimento */}
        <LiquidTier clipId="funil-t1" path={trapezoid(t1.top, t1.bottom, t1.y, t1.h)} color={tiers.atendimento.color} y={t1.y} h={t1.h} delay={0} fill={nivel(tiers.atendimento.count)} />
        <TierText x={360} y={t1.y + t1.h / 2} label={tiers.atendimento.label} count={tiers.atendimento.count} share={share(tiers.atendimento.count)} />

        {/* Andar 2 — Visita: Agendada | Visitou (mesmo andar, cores distintas) */}
        <LiquidTier clipId="funil-t2a" path={halfTrapezoid(t2.top, t2.bottom, t2.y, t2.h, "left")} color={tiers.visitaAgendada.color} y={t2.y} h={t2.h} delay={0.4} fill={nivel(tiers.visitaAgendada.count)} />
        <LiquidTier clipId="funil-t2b" path={halfTrapezoid(t2.top, t2.bottom, t2.y, t2.h, "right")} color={tiers.visitou.color} y={t2.y} h={t2.h} delay={1.1} fill={nivel(tiers.visitou.count)} />
        <TierText x={360 - (t2.top + t2.bottom) / 8} y={t2.y + t2.h / 2} label={tiers.visitaAgendada.label} count={tiers.visitaAgendada.count} share={share(tiers.visitaAgendada.count)} small />
        <TierText x={360 + (t2.top + t2.bottom) / 8} y={t2.y + t2.h / 2} label={tiers.visitou.label} count={tiers.visitou.count} share={share(tiers.visitou.count)} small />

        {/* Andar 3 — Proposta */}
        <LiquidTier clipId="funil-t3" path={trapezoid(t3.top, t3.bottom, t3.y, t3.h)} color={tiers.proposta.color} y={t3.y} h={t3.h} delay={0.7} fill={nivel(tiers.proposta.count)} />
        <TierText x={360} y={t3.y + t3.h / 2} label={tiers.proposta.label} count={tiers.proposta.count} share={share(tiers.proposta.count)} />

        {/* Andar 4 — Fechamento */}
        <LiquidTier clipId="funil-t4" path={trapezoid(t4.top, t4.bottom, t4.y, t4.h)} color={tiers.fechamento.color} y={t4.y} h={t4.h} delay={1.5} fill={nivel(tiers.fechamento.count)} />
        <TierText x={360} y={t4.y + t4.h / 2} label={tiers.fechamento.label} count={tiers.fechamento.count} share={share(tiers.fechamento.count)} />
      </svg>
    </div>
  )
}
