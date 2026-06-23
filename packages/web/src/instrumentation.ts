/**
 * Padroniza o fuso horário do SERVIDOR em Brasília (Story 75-33).
 *
 * O banco guarda tudo em UTC (timestamptz). Sem isto, datas renderizadas no
 * servidor (Vercel = UTC) apareciam em UTC, divergindo do navegador. O Brasil
 * não usa mais horário de verão → America/Sao_Paulo é UTC-3 fixo. A Vercel
 * RESERVA o env var `TZ`, então definimos em código no startup do runtime Node.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = "America/Sao_Paulo"
  }
}
