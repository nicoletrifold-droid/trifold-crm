import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { logEvent } from "@web/lib/logger"

/**
 * Story 75-352 — trava de run para cron que está sendo invocado mais de uma vez
 * por agendamento.
 *
 * O caso concreto: `/api/cron/followup` deixou dois recibos `FOLLOWUP_EXECUTED`
 * no MESMO segundo (19/08 22:01:10, "98 processed" e "99 processed"). Duas
 * execuções concorrentes da mesma run, intercaladas lead a lead. O manifesto de
 * cron da Vercel tem a rota uma única vez e não há pg_cron apontando para ela —
 * o segundo gatilho é externo ao repo. Esta trava não depende de descobrir qual é.
 *
 * `minIntervalSeconds` é a distância mínima entre duas runs do mesmo job, e cobre
 * os dois formatos do problema com um número só: invocação concorrente (a segunda
 * chega enquanto a primeira roda) e retry (chega depois da primeira terminar).
 * Para um cron de 2h, 90 minutos deixa folga para atraso de agendamento sem abrir
 * espaço para a duplicata.
 */

/** 90 min — para o cron de 2 em 2 horas. */
export const INTERVALO_MINIMO_FOLLOWUP_SEGUNDOS = 90 * 60

/**
 * 144h (6 dias) — para o relatório semanal (`"0 2 * * 1"`, Story 75-367).
 *
 * O cron roda a cada 168h, então 144h deixam 24h inteiras de folga para atraso de
 * agendamento sem risco de confundir a run desta semana com a da próxima (o evento
 * mais próximo possível está a 7 dias). A distância real observada entre as duas
 * invocações duplicadas foi de ~60s — qualquer intervalo de poucos minutos já
 * cobriria o caso concreto; a margem larga é de graça aqui.
 */
export const INTERVALO_MINIMO_ANALYTICS_REPORT_SEGUNDOS = 144 * 60 * 60

/**
 * Reivindica a run. Devolve o `run_id` para quem ganhou e `null` para quem chegou
 * depois — nesse caso o chamador deve sair sem fazer nada.
 *
 * **Fail-open de propósito.** Se o RPC falhar (migration 234 ainda não aplicada,
 * banco fora), a função devolve um id sintético e a run SEGUE, gritando no log. O
 * motivo: quem impede envio duplicado de verdade é o claim por lead
 * (`claimFollowUp`); esta trava só evita trabalho repetido. Fechar aqui
 * transformaria uma falha de infraestrutura em "nenhum lead recebe follow-up".
 */
export async function claimCronRun(
  supabase: SupabaseClient,
  job: string,
  minIntervalSeconds: number
): Promise<{ runId: string | null; claimed: boolean }> {
  const { data, error } = await supabase.rpc("claim_cron_run", {
    p_job: job,
    p_min_interval_seconds: minIntervalSeconds,
  })

  if (error) {
    logEvent({
      level: "error",
      category: "cron",
      event_type: "CRON_LOCK_INDISPONIVEL",
      message: `claim_cron_run falhou para "${job}" — run seguiu SEM trava: ${error.message}`,
      metadata: { job, erro: error.message },
      source: "lib/cron/claim-run",
    })
    return { runId: null, claimed: true }
  }

  // O RPC devolve o uuid da run, ou null quando outra invocação já reivindicou.
  const runId = (data as string | null) ?? null
  return { runId, claimed: runId !== null }
}

/**
 * Fecha a run: registra que terminou e com que números. É o recibo no banco — a
 * pergunta "esse cron rodou?" já custou 29 dias de follow-up parado (75-350) e um
 * recibo que dizia "16 messages" com zero entregas (75-351).
 *
 * Best-effort: nunca lança. A trava não depende disto (o intervalo mínimo é medido
 * pelo `started_at`), então falhar aqui custa o recibo, não a correção.
 */
export async function finishCronRun(
  supabase: SupabaseClient,
  runId: string | null,
  result: Record<string, unknown>
): Promise<void> {
  if (!runId) return

  const { error } = await supabase.rpc("finish_cron_run", {
    p_run_id: runId,
    p_result: result,
  })

  if (error) {
    logEvent({
      level: "warn",
      category: "cron",
      event_type: "CRON_RECIBO_NAO_GRAVOU",
      message: `finish_cron_run falhou para a run ${runId}: ${error.message}`,
      metadata: { run_id: runId, erro: error.message },
      source: "lib/cron/claim-run",
    })
  }
}
