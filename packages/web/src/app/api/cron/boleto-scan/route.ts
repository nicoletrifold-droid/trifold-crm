import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { getFinancialStatement, getReceivableBill } from "@web/lib/integrations/sienge/client"
import { notifyNovoBoleto, notifyBoletoLembrete, portalNotificacoesPausadas } from "@web/lib/notificacoes"
import type { BoletoLembreteMarco } from "@web/lib/notificacoes"
import { lembreteEventKey } from "@web/lib/boleto-lembrete-key"

// Story 75-101 — Notificação de novo boleto via VARREDURA (não só webhook).
//
// O webhook do Sienge (Story 75-76, evento PAYMENT_SLIP_REGISTERED) não dispara para
// esta conta: os boletos aparecem como "Boleto gerado" (generatedBillet=true) — estado
// ANTERIOR à confirmação bancária que o webhook escuta. Aqui detectamos pelo NOSSO lado,
// varrendo /customer-financial-statements (a mesma fonte do portal) e notificando via
// notifyNovoBoleto. Dedup compartilhado com o webhook (sienge_webhook_dedup, chave
// receivableBillId:installmentId) → cada boleto notifica UMA vez, venha de onde vier.
//
// Story 75-141 — PASSO DE LEMBRETES (aditivo). Na rodada das 09 BRT (12 UTC), sobre as
// MESMAS parcelas com boleto em aberto, dispara lembretes de cobrança amigável: no
// vencimento (venc_hoje) e no atraso (+5d/+15d). Dedup por MARCO+parcela, com chaves
// prefixadas distintas (não colidem com a chave de "novo boleto"). getFinancialStatement
// vira status=PAGO/hasBoleto=false quando o cliente paga → o ciclo para sozinho.
//
// CADÊNCIA (31/08/2026) — 2 rodadas/dia: 09 e 18 BRT (12 e 21 UTC). Eram 4 (09/12/15/18
// BRT). O corte devolve ~330 chamadas/dia à cota do Sienge, que é de 1.000/dia POR
// ASSINATURA e estava em 844/dia (84%), com 2.018 requisições excedidas em agosto.
// Cada rodada custa 1 getFinancialStatement por cliente ativo — ESTIMADOS em ~165 a
// partir do salto de consumo de junho→julho no painel do Sienge, não medidos no banco.
// Pela mesma estimativa, esta varredura respondia por ~4/5 do consumo total da conta.
// TRADE-OFF ACEITO: como o webhook não cobre este caso (ver acima), a varredura é o
// ÚNICO detector de boleto novo — a detecção passa de ~3h para até 15h no pior caso.
// Os intervalos são desiguais de propósito: 9h entre as rodadas (09→18 BRT) e 15h da
// noite para a manhã (18→09). Equalizar em 12h+12h exigiria rodar às 21 BRT, e a rodada
// dispara notificação ao cliente — WhatsApp de boleto às nove da noite é pior que a
// latência. As 15h caem inteiras na madrugada: boleto gerado depois das 18h é visto
// às 09h, o que na prática é "de manhã".
// Não reduzir abaixo de 2 sem antes filtrar quem é varrido (hoje varremos todo cliente
// ativo, inclusive quem não tem parcela próxima do vencimento).

const EVENT_TYPE = "BOLETO_SCAN"
const PAGE_DELAY_MS = 300

// Story 75-141 — event_type informativo por marco (o dedup usa event_key prefixado; o
// event_type NÃO entra no conflito — o PK da tabela é só event_key).
const LEMBRETE_EVENT_TYPE: Record<BoletoLembreteMarco, string> = {
  venc_hoje: "BOLETO_LEMBRETE_VENC",
  atraso5: "BOLETO_LEMBRETE_ATRASO5",
  atraso15: "BOLETO_LEMBRETE_ATRASO15",
}

/** "2026-07-10" → "10/07/2026". */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0]?.split("-") ?? []
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** "Hoje" (y/m/d como inteiros) em America/Sao_Paulo — nunca UTC cru (Story 75-141). */
function hojeSaoPaulo(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

/** Hora (0-23) em America/Sao_Paulo. */
function horaSaoPaulo(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now)
  return Number(parts.find((p) => p.type === "hour")?.value)
}

/**
 * Diferença inteira de dias de calendário entre "hoje" (BRT) e o vencimento da parcela.
 * Positivo = em atraso. Compara como datas de calendário via Date.UTC nos DOIS lados
 * (evita o bug de ±1 dia do fuso). Retorna null se a data for inválida.
 */
function diffDiasVencimento(dueDateIso: string, hoje: { y: number; m: number; d: number }): number | null {
  const [y, m, d] = (dueDateIso.split("T")[0]?.split("-") ?? []).map(Number)
  if (!y || !m || !d) return null
  const dueUTC = Date.UTC(y, m - 1, d)
  const hojeUTC = Date.UTC(hoje.y, hoje.m - 1, hoje.d)
  return Math.round((hojeUTC - dueUTC) / 86_400_000)
}

/** Mapeia a diferença de dias para o marco de lembrete (0 → venc, 5/15 → atraso), ou null. */
function marcoParaDiff(diff: number | null): BoletoLembreteMarco | null {
  if (diff === 0) return "venc_hoje"
  if (diff === 5) return "atraso5"
  if (diff === 15) return "atraso15"
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("[BOLETO_SCAN] CRON_SECRET não configurado")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (portalNotificacoesPausadas()) {
    console.log("[BOLETO_SCAN] portal pausado (PORTAL_NOTIF_PAUSED) — nada a fazer")
    return NextResponse.json({ ok: true, paused: true })
  }

  const admin = createAdminClient()

  // Story 75-141 — o passo de lembretes só roda na rodada das 09 BRT (= 12 UTC). A outra
  // rodada (18 BRT) mantém APENAS a detecção de novo boleto (75-101, inalterada).
  const now = new Date()
  const hoje = hojeSaoPaulo(now)
  const rodarLembretes = horaSaoPaulo(now) === 9

  const { data: clientes, error: clientesErr } = await admin
    .from("users")
    .select("id, name, email, phone, sienge_customer_id")
    .eq("role", "cliente")
    .eq("is_active", true)
    .not("sienge_customer_id", "is", null)

  if (clientesErr) {
    console.error("[BOLETO_SCAN] erro ao listar clientes:", clientesErr.message)
    return NextResponse.json({ ok: false, error: clientesErr.message }, { status: 500 })
  }

  let notified = 0
  let suppressed = 0
  let clientErrors = 0
  let lembretesVenc = 0
  let lembretesAtraso5 = 0
  let lembretesAtraso15 = 0
  const scanned = clientes?.length ?? 0

  for (const cliente of clientes ?? []) {
    const customerId = cliente.sienge_customer_id as number | null
    if (!customerId) continue

    // Memoização de getReceivableBill por billReceivableId, compartilhada entre a detecção
    // de novo boleto e o passo de lembretes (não repete chamadas ao Sienge). Só resultados
    // OK são cacheados — falha transitória lança e NÃO é memoizada (re-tenta no próximo run).
    const billCache = new Map<number, Awaited<ReturnType<typeof getReceivableBill>>>()
    const getBillMemo = async (id: number) => {
      if (billCache.has(id)) return billCache.get(id)!
      const bill = await getReceivableBill(id)
      billCache.set(id, bill)
      return bill
    }
    // Memoização da obra por enterpriseCode e do vínculo por obraId (cliente fixo na iteração).
    const obraCache = new Map<number, { id: string; name: string; org_id: string } | null>()
    const resolveObra = async (enterpriseCode: number) => {
      if (obraCache.has(enterpriseCode)) return obraCache.get(enterpriseCode)!
      const { data: obra } = await admin
        .from("obras")
        .select("id, name, org_id")
        .eq("sienge_enterprise_id", enterpriseCode)
        .is("deleted_at", null)
        .maybeSingle()
      const val = (obra as { id: string; name: string; org_id: string } | null) ?? null
      obraCache.set(enterpriseCode, val)
      return val
    }
    const vinculoCache = new Map<string, boolean>()
    const clienteVinculado = async (obraId: string) => {
      if (vinculoCache.has(obraId)) return vinculoCache.get(obraId)!
      const { data: vinculo } = await admin
        .from("cliente_obras")
        .select("obra_id")
        .eq("obra_id", obraId)
        .eq("user_id", cliente.id)
        .maybeSingle()
      const val = !!vinculo
      vinculoCache.set(obraId, val)
      return val
    }

    try {
      const installments = await getFinancialStatement(customerId)
      // Parcelas com boleto gerado e saldo em aberto, do vencimento mais próximo ao mais distante.
      const abertos = installments
        .filter((i) => i.hasBoleto)
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))

      // ── Passo 1: detecção de NOVO BOLETO (75-101, roda em TODAS as rodadas) ──
      let sentForClient = false

      for (const inst of abertos) {
        const eventKey = `${inst.billReceivableId}:${inst.installmentId}`

        // Reivindica o slot (atômico, compartilhado com o webhook). Só as inéditas contam.
        const { data: claimed, error: claimError } = await admin.rpc("claim_sienge_webhook", {
          p_event_key: eventKey,
          p_event_type: EVENT_TYPE,
        })
        if (claimError) {
          console.error("[BOLETO_SCAN] claim falhou — pulando parcela:", { eventKey, err: claimError.message })
          continue
        }
        if (claimed !== true) continue // já notificado (run anterior ou webhook)

        // Anti-flood: no máximo 1 notificação por cliente por execução. As demais
        // parcelas inéditas ficam marcadas (claimadas) sem enviar — o portal já as mostra.
        if (sentForClient) {
          suppressed++
          continue
        }

        // Resolve a obra do título (mesma lógica do webhook 75-76).
        let released = false
        try {
          const bill = await getBillMemo(inst.billReceivableId)
          if (!bill?.customerId || bill.enterpriseCode == null) {
            console.warn("[BOLETO_SCAN] título sem customerId/enterpriseCode — mantendo claimado", { eventKey })
            continue
          }

          const obra = await resolveObra(bill.enterpriseCode)

          if (!obra) {
            console.warn("[BOLETO_SCAN] sem obra para enterpriseCode — mantendo claimado", {
              eventKey,
              enterpriseCode: bill.enterpriseCode,
            })
            continue
          }

          if (!(await clienteVinculado(obra.id))) {
            console.warn("[BOLETO_SCAN] cliente não vinculado à obra no portal — mantendo claimado", {
              userId: cliente.id,
              obraId: obra.id,
            })
            continue
          }

          await notifyNovoBoleto({
            orgId: obra.org_id,
            userId: cliente.id,
            nome: cliente.name,
            email: cliente.email,
            phone: cliente.phone,
            obraId: obra.id,
            obraName: obra.name,
            vencimento: formatDate(inst.dueDate),
          })
          sentForClient = true
          notified++
        } catch (err) {
          // Falha transitória (Sienge indisponível): libera o claim para re-tentar no próximo run.
          released = true
          await admin.from("sienge_webhook_dedup").delete().eq("event_key", eventKey)
          throw err
        } finally {
          if (released) {
            console.warn("[BOLETO_SCAN] claim liberado por falha transitória", { eventKey })
          }
        }
      }

      // ── Passo 2: LEMBRETES de vencimento/atraso (75-141, SÓ na rodada das 09 BRT) ──
      // Story 75-147: AGRUPADO por (marco, obra) — 1 mensagem por cliente+obra+marco/dia, em
      // vez de 1 por parcela. Dedup por (marco, obra, vencimento). Sem cap "1 msg/cliente/run".
      if (rodarLembretes) {
        // Pré-passo: resolve a obra de cada parcela em marco e agrupa. Resolver a obra ANTES do
        // claim é necessário p/ agrupar; falha transitória do Sienge aqui lança e cai no catch
        // por-cliente (nada foi claimado → re-tenta no próximo run — mais limpo que release de claim).
        const grupos = new Map<
          string,
          { marco: BoletoLembreteMarco; obra: { id: string; name: string; org_id: string }; dueDate: string; count: number }
        >()
        for (const inst of abertos) {
          const marco = marcoParaDiff(diffDiasVencimento(inst.dueDate, hoje))
          if (!marco) continue

          const bill = await getBillMemo(inst.billReceivableId)
          if (!bill?.customerId || bill.enterpriseCode == null) {
            console.warn("[BOLETO_SCAN] lembrete: título sem customerId/enterpriseCode — pulando parcela", {
              billReceivableId: inst.billReceivableId,
              installmentId: inst.installmentId,
            })
            continue
          }

          const obra = await resolveObra(bill.enterpriseCode)
          if (!obra) {
            console.warn("[BOLETO_SCAN] lembrete: sem obra para enterpriseCode — pulando parcela", {
              enterpriseCode: bill.enterpriseCode,
            })
            continue
          }

          if (!(await clienteVinculado(obra.id))) {
            console.warn("[BOLETO_SCAN] lembrete: cliente não vinculado à obra — pulando parcela", {
              userId: cliente.id,
              obraId: obra.id,
            })
            continue
          }

          // Dentro de um (marco, obra) o vencimento é sempre o mesmo → o 1º define o dueDate do grupo.
          const gkey = `${marco}::${obra.id}`
          const g = grupos.get(gkey)
          if (g) g.count++
          else grupos.set(gkey, { marco, obra, dueDate: inst.dueDate, count: 1 })
        }

        // Envio: 1 claim + 1 notificação por grupo. A chave inclui o CLIENTE e o vencimento —
        // sem o cliente, o claim colidia entre clientes da mesma obra+vencimento e só o 1º
        // recebia (Story 75-145-b). Com o cliente: 1 envio por cliente+obra+marco/dia.
        for (const g of grupos.values()) {
          const dueKey = g.dueDate.split("T")[0] ?? g.dueDate
          const eventKey = lembreteEventKey(g.marco, g.obra.id, cliente.id, dueKey)
          const { data: claimed, error: claimError } = await admin.rpc("claim_sienge_webhook", {
            p_event_key: eventKey,
            p_event_type: LEMBRETE_EVENT_TYPE[g.marco],
          })
          if (claimError) {
            console.error("[BOLETO_SCAN] claim de lembrete falhou — pulando grupo:", { eventKey, err: claimError.message })
            continue
          }
          if (claimed !== true) continue // grupo já enviado nesta janela

          await notifyBoletoLembrete({
            orgId: g.obra.org_id,
            userId: cliente.id,
            nome: cliente.name,
            email: cliente.email,
            phone: cliente.phone,
            obraId: g.obra.id,
            obraName: g.obra.name,
            vencimento: formatDate(g.dueDate),
            marco: g.marco,
            quantidade: g.count,
          })

          if (g.marco === "venc_hoje") lembretesVenc++
          else if (g.marco === "atraso5") lembretesAtraso5++
          else lembretesAtraso15++
        }
      }
    } catch (err) {
      clientErrors++
      console.error("[BOLETO_SCAN] erro no cliente — pulando:", {
        userId: cliente.id,
        err: err instanceof Error ? err.message : String(err),
      })
    }

    await sleep(PAGE_DELAY_MS)
  }

  const summary = {
    ok: true,
    scanned,
    notified,
    suppressed,
    clientErrors,
    lembretes: rodarLembretes,
    lembretesVenc,
    lembretesAtraso5,
    lembretesAtraso15,
  }
  console.log("[BOLETO_SCAN] concluído:", summary)
  return NextResponse.json(summary)
}
