/**
 * Padroniza o fuso horário do SERVIDOR em Brasília (Story 75-33).
 *
 * O banco guarda tudo em UTC (timestamptz). Sem isto, datas renderizadas no
 * servidor (Vercel = UTC) apareciam em UTC, divergindo do navegador. O Brasil
 * não usa mais horário de verão → America/Sao_Paulo é UTC-3 fixo. A Vercel
 * RESERVA o env var `TZ`, então definimos em código no startup do runtime Node.
 */
import { avaliarRefDoAmbiente, textoDoBanner } from "@web/lib/env-banner"

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = "America/Sao_Paulo"

    // Story 900-3b (AC2): banner de ambiente. A DECISÃO mora em `lib/env-banner.ts`
    // (função pura, testada em unidade); aqui só se imprime. Os três estados falam —
    // `"ok"` inclusive, porque um verde que não nomeia o ref é indistinguível de não
    // haver banner nenhum.
    //
    // ⚠️ `process.stderr.write`, NÃO `console.log` — medido em 2026-08-29.
    // `next.config.ts` declara `compiler.removeConsole: { exclude: ["error","warn"] }`.
    // A transformação do SWC apaga `console.log`/`.info`/`.debug`, e (medido no Next
    // 16.2.2 com Turbopack) ela roda TAMBÉM em `next dev`: a primeira versão deste
    // banner usava `console.log` no caminho `"ok"` e simplesmente não aparecia — o
    // estado saudável ficava mudo, que é o defeito exato que esta AC existe para não
    // ter. `process.stderr.write` não passa por essa transformação, e stderr é onde
    // diagnóstico de boot pertence (não polui um stdout que alguém possa estar
    // canalizando).
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const nodeEnv = process.env.NODE_ENV
    const estado = avaliarRefDoAmbiente(url, nodeEnv)
    process.stderr.write(`${textoDoBanner(estado, url, nodeEnv)}\n`)
  }
}
