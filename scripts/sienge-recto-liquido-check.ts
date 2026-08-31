/**
 * Mede, contra a API real do Sienge, se `netReceiptValue` é exatamente o
 * "Recto líquido" do extrato oficial — a pergunta que decide a Q1 da Story
 * 75-369 ("juros de atraso e desconto entram no total pago?", decisão do
 * financeiro em 31/08/2026: entram).
 *
 * Duas provas independentes, nenhuma delas dependendo de PDF:
 *
 * 1. **Identidade aritmética.** Para cada baixa em dinheiro, confere se
 *    `netReceiptValue == receiptValue + interestValue + additionalValue − discountValue`.
 *    Se bater em 100% das baixas, `netReceiptValue` NÃO subtrai
 *    `administrativeFee` nem `insuranceAmount` e é o Recto líquido. Qualquer
 *    divergência é impressa com os campos, para ver por qual delas ele passa.
 *
 * 2. **Total pago nos dois critérios.** Soma o total pago do Vind + Yarden por
 *    `receiptValue` (regra atual em produção) e por Recto líquido, e compara com
 *    o número oficial que a conciliação de 28/08/2026 registrou na story.
 *
 * Uso:
 *   npx tsx scripts/sienge-recto-liquido-check.ts [--env-file <path>] [--json <out>]
 *
 * Só faz GET no Sienge e SELECT no Supabase — não escreve em lugar nenhum.
 */

import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { createClient } from "@supabase/supabase-js"
import { isCashReceipt } from "../packages/web/src/lib/integrations/sienge/installments"
import type {
  SiengeFinancialStatementsResponse,
  SiengeReceipt,
} from "../packages/web/src/lib/integrations/sienge/types"

// ── Env ───────────────────────────────────────────────────────────────

function loadEnv(path: string) {
  let content: string
  try {
    content = readFileSync(path, "utf-8")
  } catch {
    return false
  }
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
  return true
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

const envFile = argValue("--env-file")
if (envFile && !loadEnv(resolve(envFile))) {
  console.error(`Não consegui ler o env em ${envFile}`)
  process.exit(1)
}
// Sempre complementa com o .env.local: variáveis marcadas como "sensitive" na
// Vercel voltam vazias no `env pull` (é o caso da service role key), e o que já
// veio do --env-file não é sobrescrito.
loadEnv(resolve(__dirname, "../packages/web/.env.local"))

const REQUIRED = [
  "SIENGE_SUBDOMAIN",
  "SIENGE_USERNAME",
  "SIENGE_PASSWORD",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]
const missing = REQUIRED.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error(`Faltam variáveis de ambiente: ${missing.join(", ")}`)
  console.error(`Passe --env-file com um arquivo que as tenha (ex: vercel env pull).`)
  process.exit(1)
}

// ── Alvo oficial (conciliação de 28/08/2026, registrada na Story 75-369) ──

const OFICIAL = {
  totalPagoSienge: 14_522_414.77,
  totalPagoPortalAntes: 14_521_692.99,
  titulos: 89,
  clientes: 71,
}

const OBRAS = [
  { nome: "Vind Residence", id: "74bd0414-d978-4f4e-b65c-3e25e6e40877" },
  { nome: "Yarden", id: "ba344a5e-6bd6-4a08-8f9f-0405992b0b34" },
]

// ── Sienge ────────────────────────────────────────────────────────────

const baseUrl = `https://api.sienge.com.br/${process.env.SIENGE_SUBDOMAIN}/public/api/v1`
const authHeader = `Basic ${Buffer.from(
  `${process.env.SIENGE_USERNAME}:${process.env.SIENGE_PASSWORD}`
).toString("base64")}`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function siengeGet<T>(path: string): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1))
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: authHeader, Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`)
      return (await res.json()) as T
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError ?? new Error(`Falha em ${path}`)
}

// ── Recto líquido ─────────────────────────────────────────────────────

/**
 * O Recto líquido como o extrato oficial define: valor + acréscimo − desconto.
 * `interestValue` e `additionalValue` são os dois campos de acréscimo da API
 * (juros e "valor adicional"); o extrato os apresenta somados.
 */
function rectoLiquidoCalculado(r: SiengeReceipt): number {
  const extra = r as SiengeReceipt & { additionalValue?: number }
  return (
    r.receiptValue +
    (r.interestValue ?? 0) +
    (extra.additionalValue ?? 0) -
    (r.discountValue ?? 0)
  )
}

const CENTAVO = 0.005

type Divergencia = {
  customerId: number
  billReceivableId: number
  installmentNumber: string
  receiptDate: string
  receiptType: string | null
  receiptValue: number
  netReceiptValue: number | null
  calculado: number
  delta: number
  interestValue: number
  additionalValue: number
  discountValue: number
  administrativeFee: number
  insuranceAmount: number
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  console.log("\n📐 netReceiptValue × Recto líquido — Story 75-369 / Q1\n")

  // Clientes do Vind e do Yarden, pela mesma porta que o portal usa.
  const customerIds = new Set<number>()
  for (const obra of OBRAS) {
    const { data, error } = await supabase
      .from("clientes_obras_vinculos")
      .select("clientes(sienge_customer_id)")
      .eq("obra_id", obra.id)
    if (error) {
      console.error(`Erro ao buscar vínculos de ${obra.nome}: ${error.message}`)
      process.exit(1)
    }
    let n = 0
    for (const v of data ?? []) {
      const cliente = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      const id = (cliente as { sienge_customer_id: number | null } | null)
        ?.sienge_customer_id
      if (id) {
        customerIds.add(id)
        n++
      }
    }
    console.log(`  ${obra.nome}: ${n} vínculos com sienge_customer_id`)
  }
  console.log(`  → ${customerIds.size} clientes distintos a consultar\n`)

  let totalPorReceiptValue = 0
  let totalPorNetReceipt = 0
  let totalPorCalculado = 0
  let baixasCash = 0
  let semNetReceipt = 0
  let comFeeOuSeguro = 0
  let titulosComPagamento = 0
  let clientesComExtrato = 0
  const divergencias: Divergencia[] = []
  const tiposVistos = new Map<string, number>()

  let i = 0
  for (const customerId of customerIds) {
    i++
    process.stdout.write(`\r  consultando ${i}/${customerIds.size}…   `)
    let data: SiengeFinancialStatementsResponse
    try {
      data = await siengeGet<SiengeFinancialStatementsResponse>(
        `/customer-financial-statements?customerId=${customerId}`
      )
    } catch (err) {
      console.log(`\n  ⚠️  cliente ${customerId}: ${(err as Error).message}`)
      continue
    }
    if ((data.results ?? []).length > 0) clientesComExtrato++

    for (const statement of data.results ?? []) {
      for (const bill of statement.billsReceivable ?? []) {
        let billTemPagamento = false
        for (const inst of bill.installments ?? []) {
          for (const r of inst.receipts ?? []) {
            const tipo = r.receiptType ?? "(sem tipo)"
            tiposVistos.set(tipo, (tiposVistos.get(tipo) ?? 0) + 1)
            if (!isCashReceipt(r)) continue

            billTemPagamento = true
            baixasCash++

            const extra = r as SiengeReceipt & {
              additionalValue?: number
              administrativeFee?: number
              insuranceAmount?: number
            }
            const calculado = rectoLiquidoCalculado(r)
            const net = r.netReceiptValue ?? null

            totalPorReceiptValue += r.receiptValue
            totalPorCalculado += calculado
            totalPorNetReceipt += net ?? r.receiptValue
            if (net === null) semNetReceipt++
            if ((extra.administrativeFee ?? 0) > 0 || (extra.insuranceAmount ?? 0) > 0) {
              comFeeOuSeguro++
            }

            if (net !== null && Math.abs(net - calculado) > CENTAVO) {
              divergencias.push({
                customerId,
                billReceivableId: bill.billReceivableId,
                installmentNumber: inst.installmentNumber,
                receiptDate: r.receiptDate,
                receiptType: r.receiptType ?? null,
                receiptValue: r.receiptValue,
                netReceiptValue: net,
                calculado,
                delta: net - calculado,
                interestValue: r.interestValue ?? 0,
                additionalValue: extra.additionalValue ?? 0,
                discountValue: r.discountValue ?? 0,
                administrativeFee: extra.administrativeFee ?? 0,
                insuranceAmount: extra.insuranceAmount ?? 0,
              })
            }
          }
        }
        if (billTemPagamento) titulosComPagamento++
      }
    }
    await sleep(120) // respeita o rate limit do Sienge
  }
  process.stdout.write("\r".padEnd(40) + "\r")

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  console.log("── Base consultada ──────────────────────────────────────")
  console.log(`  clientes com extrato:      ${clientesComExtrato}`)
  console.log(`  títulos com pagamento:     ${titulosComPagamento}`)
  console.log(`  baixas em dinheiro:        ${baixasCash}`)
  console.log(`  (referência oficial 28/08: ${OFICIAL.titulos} títulos · ${OFICIAL.clientes} clientes)`)

  console.log("\n── Prova 1: netReceiptValue == valor + acréscimo − desconto ──")
  console.log(`  baixas conferidas:         ${baixasCash - semNetReceipt}`)
  console.log(`  sem netReceiptValue:       ${semNetReceipt}`)
  console.log(`  com fee/seguro > 0:        ${comFeeOuSeguro}`)
  console.log(`  divergências:              ${divergencias.length}`)
  if (divergencias.length === 0) {
    console.log(
      `  ✅ identidade confirmada — netReceiptValue É o Recto líquido (não desconta fee nem seguro)`
    )
  } else {
    console.log(`  ❌ identidade NÃO se sustenta. Primeiras 10:\n`)
    for (const d of divergencias.slice(0, 10)) {
      console.log(
        `    título ${d.billReceivableId} parc ${d.installmentNumber} ${d.receiptDate} [${d.receiptType}]\n` +
          `      receiptValue=${fmt(d.receiptValue)} juros=${fmt(d.interestValue)} adicional=${fmt(d.additionalValue)} ` +
          `desconto=${fmt(d.discountValue)} fee=${fmt(d.administrativeFee)} seguro=${fmt(d.insuranceAmount)}\n` +
          `      net=${fmt(d.netReceiptValue ?? 0)} calculado=${fmt(d.calculado)} delta=${fmt(d.delta)}`
      )
    }
  }

  console.log("\n── Prova 2: total pago nos dois critérios ────────────────")
  console.log(`  por receiptValue (produção hoje):  R$ ${fmt(totalPorReceiptValue)}`)
  console.log(`  por netReceiptValue:               R$ ${fmt(totalPorNetReceipt)}`)
  console.log(`  por valor+acréscimo−desconto:      R$ ${fmt(totalPorCalculado)}`)
  console.log(`  extrato oficial 28/08 (Sienge):    R$ ${fmt(OFICIAL.totalPagoSienge)}`)
  console.log(
    `  delta net × oficial:               R$ ${fmt(totalPorNetReceipt - OFICIAL.totalPagoSienge)}`
  )
  console.log(
    `  delta receiptValue × oficial:      R$ ${fmt(totalPorReceiptValue - OFICIAL.totalPagoSienge)}`
  )
  console.log(
    `  ganho da mudança:                  R$ ${fmt(totalPorNetReceipt - totalPorReceiptValue)}`
  )
  console.log(
    `  ⚠️  a base de hoje pode ter baixas novas depois de 28/08 — o delta contra o oficial\n` +
      `     é indicativo; a prova dura é a identidade da Prova 1.`
  )

  console.log("\n── Tipos de baixa vistos ────────────────────────────────")
  for (const [tipo, n] of [...tiposVistos.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)} × ${tipo}`)
  }

  const outFile = argValue("--json")
  if (outFile) {
    writeFileSync(
      resolve(outFile),
      JSON.stringify(
        {
          geradoEm: new Date().toISOString(),
          base: { clientesComExtrato, titulosComPagamento, baixasCash },
          prova1: {
            conferidas: baixasCash - semNetReceipt,
            semNetReceipt,
            comFeeOuSeguro,
            divergencias,
          },
          prova2: {
            totalPorReceiptValue,
            totalPorNetReceipt,
            totalPorCalculado,
            oficial: OFICIAL,
          },
          tiposVistos: Object.fromEntries(tiposVistos),
        },
        null,
        2
      ),
      "utf-8"
    )
    console.log(`\n📄 JSON salvo em ${outFile}`)
  }

  console.log("")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
