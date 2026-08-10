import { createAdminClient } from "@web/lib/supabase/admin"

type EventLevel = "error" | "warn" | "info"
type EventCategory = "bot" | "ai" | "webhook" | "auth" | "cron" | "system"

interface LogEventParams {
  level: EventLevel
  category: EventCategory
  event_type: string
  message: string
  metadata?: Record<string, unknown>
  source?: string
  request_id?: string
  org_id?: string
}

/** PostgreSQL `unique_violation`. Ver `logEventOnce`. */
const PG_UNIQUE_VIOLATION = "23505"

/** O log do Vercel é o mesmo nos dois caminhos — extraído para não divergirem. */
function logToConsole(params: LogEventParams): void {
  const prefix = `[${params.level.toUpperCase()}] [${params.category}] [${params.event_type}]`
  if (params.level === "error") {
    console.error(prefix, params.message, params.metadata ?? "")
  } else if (params.level === "warn") {
    console.warn(prefix, params.message, params.metadata ?? "")
  } else {
    console.log(prefix, params.message, params.metadata ?? "")
  }
}

function buildRow(params: LogEventParams) {
  return {
    org_id: params.org_id ?? null,
    level: params.level,
    category: params.category,
    event_type: params.event_type,
    message: params.message,
    metadata: params.metadata ?? {},
    source: params.source ?? null,
    request_id: params.request_id ?? null,
  }
}

/**
 * Log a system event to the system_events table.
 * Fire-and-forget — never blocks the request, never crashes the system.
 *
 * ⚠️ Story 87-6: fire-and-forget significa que a escrita **pode não acontecer**.
 * Numa lambda serverless, o processo congela no `return` do handler e a promise
 * pendente morre com ele. Isso já custou um evento em produção (o recibo
 * `NICOLE_LASTRO_DIARIO` da run de 10/08 11:38 UTC — inexistente no banco,
 * embora a run tenha comprovadamente gravado o alerta que a precede). Se o
 * evento é a ÚLTIMA escrita antes do response, use `logEventOnce` (aguardado).
 */
export function logEvent(params: LogEventParams): void {
  // Always log to console for Vercel logs
  logToConsole(params)

  // Fire-and-forget: write to Supabase without blocking
  try {
    const supabase = createAdminClient()
    Promise.resolve(supabase.from("system_events").insert(buildRow(params)))
      .then((result) => {
        if (result.error) {
          console.error("[LOGGER_FALLBACK] Failed to write system_event:", result.error.message)
        }
      })
      .catch((err) => {
        console.error("[LOGGER_FALLBACK] Supabase insert crashed:", err)
      })
  } catch (err) {
    console.error("[LOGGER_FALLBACK] Logger initialization failed:", err)
  }
}

/**
 * Story 87-6 — a versão AGUARDADA e DEDUPLICÁVEL do `logEvent`.
 *
 * Duas diferenças, e as duas importam:
 *
 * 1. **`await`.** A inserção acontece DENTRO da request. É o que impede a lambda
 *    de congelar em cima de uma escrita pendente. Custo: a latência de um insert
 *    — aceitável em cron, e é por isso que o `logEvent` dos ~200 outros pontos de
 *    chamada NÃO foi migrado (Armadilha 2 da story).
 *
 * 2. **`dedupe_key`.** Vai para `metadata.dedupe_key`, coberto pelo índice único
 *    parcial `ux_system_events_dedupe_key (event_type, metadata->>'dedupe_key')`
 *    da migration 218. Quem grava a linha REIVINDICOU o evento; quem leva `23505`
 *    perdeu a corrida e não deve alertar. Evento sem `dedupe_key` não é tocado
 *    pelo índice — o opt-in é por metadata.
 *
 * `23505` devolve `{ inserted: false }` e **não** é logado como falha: é o dedupe
 * funcionando. **Qualquer outro erro também devolve `false`, mas vai para o
 * `LOGGER_FALLBACK`** — sem isso "o banco caiu" viraria "já estava lá", que é a
 * classe de falha silenciosa que esta família de stories existe para não repetir.
 *
 * Não lança. O pior caso é `{ inserted: false }` com o erro no console.
 */
export async function logEventOnce(
  params: LogEventParams & { dedupe_key?: string }
): Promise<{ inserted: boolean }> {
  const { dedupe_key, ...rest } = params
  const withKey: LogEventParams =
    dedupe_key === undefined
      ? rest
      : { ...rest, metadata: { ...(rest.metadata ?? {}), dedupe_key } }

  logToConsole(withKey)

  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from("system_events").insert(buildRow(withKey))
    if (!error) return { inserted: true }
    // O PostgREST devolve `{ code: "23505", message: 'duplicate key value …' }`.
    // Casar por `code`: o texto muda com locale e com a versão do Postgres.
    if (error.code === PG_UNIQUE_VIOLATION) return { inserted: false }
    console.error("[LOGGER_FALLBACK] Failed to write system_event:", error.message)
    return { inserted: false }
  } catch (err) {
    console.error("[LOGGER_FALLBACK] Supabase insert crashed:", err)
    return { inserted: false }
  }
}
