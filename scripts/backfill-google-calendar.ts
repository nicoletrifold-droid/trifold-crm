/**
 * Story 75-275 — empurra para o Google Calendar as visitas FUTURAS já marcadas que
 * ficaram sem espelho (`google_event_id IS NULL`).
 *
 * POR QUE EXISTE: no dia em que a integração liga, tudo que foi agendado antes continua
 * invisível. A copa abriria um calendário vazio, concluiria que "não funciona" e voltaria
 * a perguntar no corredor — e a gente perderia a chance de a coisa nascer confiável.
 *
 * SÓ FUTURO: visita que já passou não gera café. Registrar retroativo em massa só
 * poluiria a semana da copa com histórico.
 *
 * IDEMPOTENTE: grava `google_event_id`, então a linha sai do recorte na segunda rodada.
 * Pode rodar de novo sem duplicar.
 *
 * Uso (na raiz do repo, com as 3 GOOGLE_* + as 2 SUPABASE_* no ambiente):
 *   npx tsx --tsconfig packages/web/tsconfig.json scripts/backfill-google-calendar.ts --dry-run
 *   npx tsx --tsconfig packages/web/tsconfig.json scripts/backfill-google-calendar.ts
 *
 * ⚠️ O `--tsconfig` NÃO é decoração: `google-mirror.ts` importa por alias `@web/*`, que só
 * existe no tsconfig do pacote web. Sem a flag, o tsx roda com o tsconfig da raiz e morre
 * com `Cannot find module '@web/lib/google-calendar'`. Descoberto rodando de verdade.
 */
import { createClient } from "@supabase/supabase-js"

const DRY = process.argv.includes("--dry-run")

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.")
  process.exit(1)
}
for (const k of ["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_CALENDAR_ID"]) {
  if (!process.env[k]) {
    console.error(`Falta ${k} no ambiente — sem isso o espelho é no-op e o backfill não faria nada.`)
    process.exit(1)
  }
}

async function main() {
  // Import dinâmico: o lib de calendário lê as env vars no topo do módulo, então só pode
  // ser carregado DEPOIS da checagem acima.
  const { mirrorCreate } = await import("../packages/web/src/lib/appointments/google-mirror")

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!)

  const { data: rows, error } = await supabase
    .from("appointments")
    .select("id, scheduled_at, duration_minutes, location, notes, client_name, team, lead:leads!lead_id(name)")
    .is("google_event_id", null)
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })

  if (error) {
    console.error("Erro ao buscar appointments:", error.message)
    process.exit(1)
  }

  const list = rows ?? []
  console.log(`${list.length} visita(s) futura(s) sem espelho.`)
  if (!list.length) return

  let ok = 0
  let fail = 0
  for (const a of list) {
    const when = new Date(a.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const nome = (a as { lead?: { name?: string } | null }).lead?.name ?? a.client_name ?? "sem nome"
    const tag = a.team === "imob" ? "[IMOB] " : ""

    if (DRY) {
      console.log(`  [dry] ${when} · ${tag}${nome}`)
      continue
    }

    const eventId = await mirrorCreate(
      supabase,
      {
        id: a.id,
        scheduled_at: a.scheduled_at,
        duration_minutes: a.duration_minutes,
        location: a.location,
        notes: a.notes,
        client_name: a.client_name,
        team: a.team,
      },
      { displayName: nome }
    )

    if (eventId) {
      ok++
      console.log(`  ✅ ${when} · ${tag}${nome}`)
    } else {
      fail++
      console.log(`  ❌ ${when} · ${tag}${nome} — ver metadata.google_sync`)
    }
  }

  if (!DRY) console.log(`\nEspelhadas: ${ok} · falhas: ${fail}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
