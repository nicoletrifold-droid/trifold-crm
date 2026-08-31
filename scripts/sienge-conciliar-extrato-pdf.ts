/**
 * Concilia o "total pago" do portal com o extrato oficial do Sienge, título a
 * título, usando o PDF "Extrato Cliente Histórico" como fonte da verdade.
 *
 * É o script que faltava: a conciliação de 28/08/2026 (Story 75-369) foi feita
 * de forma ad-hoc e não ficou versionada — foi o Concern C1 daquele gate. Este
 * substitui aquele processo e serve para qualquer conferência futura.
 *
 * O que compara, por título (`billReceivableId`):
 *
 * | Coluna do PDF   | Significado                                  | Lado do portal |
 * |-----------------|----------------------------------------------|----------------|
 * | `Valor baixa`   | tudo que foi baixado, inclusive baixa contábil | (não usado)  |
 * | `Recto líquido` | valor + acréscimo − desconto = o que entrou   | `netReceiptValue` das baixas em dinheiro |
 *
 * Quando a baixa NÃO é pagamento (distrato, substituição, reparcelamento…), o
 * Sienge deixa o Recto líquido em branco e escreve o motivo na linha — então o
 * "Total título → Recto líquido" já é, por construção, só o dinheiro que entrou.
 *
 * Uso:
 *   npx tsx scripts/sienge-conciliar-extrato-pdf.ts <extrato1.pdf> [extrato2.pdf ...] \
 *     [--env-file <path>] [--json <out>]
 *
 * Requer `pdftotext` (poppler) no PATH. Só faz GET no Sienge e SELECT no Supabase.
 */

import { readFileSync, writeFileSync, existsSync } from "fs"
import { resolve } from "path"
import { execFileSync } from "child_process"
import { tmpdir } from "os"
import { join } from "path"
import { isCashReceipt, getCashReceiptValue } from "../packages/web/src/lib/integrations/sienge/installments"
import type { SiengeFinancialStatementsResponse } from "../packages/web/src/lib/integrations/sienge/types"

// ── Env ───────────────────────────────────────────────────────────────

function loadEnv(path: string): boolean {
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
// Complementa: variáveis "sensitive" voltam vazias do `vercel env pull`.
loadEnv(resolve(__dirname, "../packages/web/.env.local"))

const REQUIRED = ["SIENGE_SUBDOMAIN", "SIENGE_USERNAME", "SIENGE_PASSWORD"]
const missing = REQUIRED.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error(`Faltam variáveis de ambiente: ${missing.join(", ")}`)
  process.exit(1)
}

const pdfs = process.argv
  .slice(2)
  .filter((a) => a.toLowerCase().endsWith(".pdf"))
  .map((a) => resolve(a))

if (pdfs.length === 0) {
  console.error("Passe ao menos um PDF do 'Extrato Cliente Histórico'.")
  process.exit(1)
}
for (const p of pdfs) {
  if (!existsSync(p)) {
    console.error(`PDF não encontrado: ${p}`)
    process.exit(1)
  }
}

// ── Parse do PDF ──────────────────────────────────────────────────────

/** "1.234,56" → 1234.56 */
function parseBR(value: string): number {
  return parseFloat(value.replace(/\./g, "").replace(",", "."))
}

const NUM = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g

type TituloOficial = {
  billReceivableId: number
  documento: string
  empreendimento: string
  clienteIds: number[]
  clienteNome: string
  valorBaixa: number
  acrescimo: number
  desconto: number
  rectoLiquido: number
  /** Baixas que o Sienge marcou com motivo (*** Distrato ***, etc.). */
  baixasComMotivo: number
}

function extractText(pdfPath: string): string {
  const out = join(tmpdir(), `extrato-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
  execFileSync("pdftotext", ["-layout", pdfPath, out])
  return readFileSync(out, "utf-8")
}

function parseExtrato(text: string): TituloOficial[] {
  const titulos: TituloOficial[] = []
  let atual: Partial<TituloOficial> | null = null
  let empreendimento = ""
  // No layout do relatório, `Cliente(s)` aparece ANTES da linha `Título`, no
  // cabeçalho do bloco. Guardamos o último visto para aplicar ao próximo título
  // — associá-lo ao bloco corrente desalinharia todos os clientes por um título.
  let clientesPendentes: number[] = []
  let nomePendente = ""

  const push = () => {
    if (
      atual &&
      atual.billReceivableId !== undefined &&
      atual.rectoLiquido !== undefined
    ) {
      titulos.push({
        billReceivableId: atual.billReceivableId,
        documento: atual.documento ?? "",
        empreendimento: atual.empreendimento ?? "",
        clienteIds: atual.clienteIds ?? [],
        clienteNome: atual.clienteNome ?? "",
        valorBaixa: atual.valorBaixa ?? 0,
        acrescimo: atual.acrescimo ?? 0,
        desconto: atual.desconto ?? 0,
        rectoLiquido: atual.rectoLiquido,
        baixasComMotivo: atual.baixasComMotivo ?? 0,
      })
    }
  }

  for (const line of text.split("\n")) {
    const emp = line.match(/Empreendimento\s+(.+?)\s*\(\d+\)/)
    if (emp) empreendimento = emp[1].trim()

    const cli = line.match(/Cliente\(s\)\s+(.+)/)
    if (cli) {
      clientesPendentes = [...cli[1].matchAll(/\((\d+)\)/g)].map((m) =>
        parseInt(m[1], 10)
      )
      nomePendente = cli[1].replace(/\(\d+\).*/, "").trim()
      continue
    }

    const tit = line.match(/^\s*Título\s+(\d+)/)
    if (tit) {
      push()
      atual = {
        billReceivableId: parseInt(tit[1], 10),
        empreendimento,
        clienteIds: clientesPendentes,
        clienteNome: nomePendente,
        baixasComMotivo: 0,
      }
      clientesPendentes = []
      nomePendente = ""
      continue
    }
    if (!atual) continue

    const doc = line.match(/Documento\s+([A-Z0-9.\-/]+)/)
    if (doc) {
      atual.documento = doc[1]
      continue
    }

    if (line.includes("***")) atual.baixasComMotivo = (atual.baixasComMotivo ?? 0) + 1

    if (line.includes("Total título")) {
      const nums = [...line.matchAll(NUM)].map((m) => parseBR(m[0]))
      // Colunas: valor original, saldo atual, valor baixa, acréscimo, desconto,
      // recto líquido. Pegamos as quatro últimas — as primeiras variam de
      // presença quando o título não tem saldo ou não tem baixa.
      if (nums.length >= 4) {
        const [valorBaixa, acrescimo, desconto, rectoLiquido] = nums.slice(-4)
        atual.valorBaixa = valorBaixa
        atual.acrescimo = acrescimo
        atual.desconto = desconto
        atual.rectoLiquido = rectoLiquido
      } else {
        atual.valorBaixa = 0
        atual.acrescimo = 0
        atual.desconto = 0
        atual.rectoLiquido = 0
      }
    }
  }
  push()
  return titulos
}

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

type LadoPortal = {
  nominal: number
  liquido: number
  baixasCash: number
  ultimaBaixa: string | null
}

const CENTAVO = 0.005

async function main() {
  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  console.log("\n📑 Conciliação portal × extrato oficial do Sienge\n")

  // ── 1. Lado oficial ────────────────────────────────────────────────
  const oficiais: TituloOficial[] = []
  for (const pdf of pdfs) {
    const titulos = parseExtrato(extractText(pdf))
    console.log(`  ${pdf.split("/").pop()}: ${titulos.length} títulos`)
    oficiais.push(...titulos)
  }
  const porId = new Map(oficiais.map((t) => [t.billReceivableId, t]))
  const clientes = [...new Set(oficiais.flatMap((t) => t.clienteIds))]
  console.log(
    `  → ${porId.size} títulos distintos · ${clientes.length} clientes distintos\n`
  )

  // ── 2. Lado portal (API, mesma regra de produção) ──────────────────
  const portal = new Map<number, LadoPortal>()
  // Um título com dois titulares (cônjuges) volta na consulta de CADA um deles.
  // Sem esta guarda o mesmo título seria somado duas vezes e o portal apareceria
  // com o dobro do oficial.
  const titulosProcessados = new Set<number>()
  let i = 0
  for (const customerId of clientes) {
    i++
    process.stdout.write(`\r  consultando ${i}/${clientes.length}…   `)
    let data: SiengeFinancialStatementsResponse
    try {
      data = await siengeGet<SiengeFinancialStatementsResponse>(
        `/customer-financial-statements?customerId=${customerId}`
      )
    } catch (err) {
      console.log(`\n  ⚠️  cliente ${customerId}: ${(err as Error).message}`)
      continue
    }
    for (const statement of data.results ?? []) {
      for (const bill of statement.billsReceivable ?? []) {
        if (!porId.has(bill.billReceivableId)) continue
        if (titulosProcessados.has(bill.billReceivableId)) continue
        titulosProcessados.add(bill.billReceivableId)
        const entry: LadoPortal = {
          nominal: 0,
          liquido: 0,
          baixasCash: 0,
          ultimaBaixa: null,
        }
        for (const inst of bill.installments ?? []) {
          for (const r of inst.receipts ?? []) {
            if (!isCashReceipt(r)) continue
            entry.nominal += r.receiptValue
            entry.liquido += getCashReceiptValue(r)
            entry.baixasCash++
            if (!entry.ultimaBaixa || r.receiptDate > entry.ultimaBaixa) {
              entry.ultimaBaixa = r.receiptDate
            }
          }
        }
        portal.set(bill.billReceivableId, entry)
      }
    }
    await sleep(120)
  }
  process.stdout.write("\r".padEnd(40) + "\r")

  // ── 3. Comparação ──────────────────────────────────────────────────
  let totalOficial = 0
  let totalLiquido = 0
  let totalNominal = 0
  let encontrados = 0
  const naoEncontrados: TituloOficial[] = []
  const divergentesLiquido: Array<{
    t: TituloOficial
    p: LadoPortal
    delta: number
  }> = []
  const divergentesNominal: number[] = []

  for (const t of oficiais) {
    const p = portal.get(t.billReceivableId)
    totalOficial += t.rectoLiquido
    if (!p) {
      naoEncontrados.push(t)
      continue
    }
    encontrados++
    totalLiquido += p.liquido
    totalNominal += p.nominal
    const delta = p.liquido - t.rectoLiquido
    if (Math.abs(delta) > CENTAVO) divergentesLiquido.push({ t, p, delta })
    if (Math.abs(p.nominal - t.rectoLiquido) > CENTAVO) {
      divergentesNominal.push(t.billReceivableId)
    }
  }

  console.log("── Base ─────────────────────────────────────────────────")
  console.log(`  títulos no extrato:        ${oficiais.length}`)
  console.log(`  encontrados na API:        ${encontrados}`)
  console.log(`  não encontrados:           ${naoEncontrados.length}`)

  console.log("\n── Total pago ───────────────────────────────────────────")
  console.log(`  extrato oficial (Recto líquido):  R$ ${fmt(totalOficial)}`)
  console.log(`  portal AGORA (líquido):           R$ ${fmt(totalLiquido)}`)
  console.log(`  portal ANTES (nominal):           R$ ${fmt(totalNominal)}`)
  console.log(`  delta agora × oficial:            R$ ${fmt(totalLiquido - totalOficial)}`)
  console.log(`  delta antes × oficial:            R$ ${fmt(totalNominal - totalOficial)}`)

  console.log("\n── Títulos ao centavo ───────────────────────────────────")
  console.log(
    `  batendo com a regra NOVA (líquido):  ${encontrados - divergentesLiquido.length}/${encontrados}`
  )
  console.log(
    `  batendo com a regra ANTIGA (nominal): ${encontrados - divergentesNominal.length}/${encontrados}`
  )

  if (divergentesLiquido.length > 0) {
    console.log(`\n  Divergências da regra nova (${divergentesLiquido.length}):\n`)
    for (const d of divergentesLiquido.sort(
      (a, b) => Math.abs(b.delta) - Math.abs(a.delta)
    )) {
      console.log(
        `    título ${d.t.billReceivableId} ${d.t.documento} (${d.t.clienteNome})\n` +
          `      oficial=${fmt(d.t.rectoLiquido)} portal=${fmt(d.p.liquido)} delta=${fmt(d.delta)}` +
          `  [última baixa na API: ${d.p.ultimaBaixa ?? "—"}]`
      )
    }
  }

  if (naoEncontrados.length > 0) {
    console.log(`\n  Títulos do extrato ausentes na API (${naoEncontrados.length}):`)
    for (const t of naoEncontrados) {
      console.log(
        `    ${t.billReceivableId} ${t.documento} (${t.clienteNome}) — oficial R$ ${fmt(t.rectoLiquido)}`
      )
    }
  }

  const outFile = argValue("--json")
  if (outFile) {
    writeFileSync(
      resolve(outFile),
      JSON.stringify(
        {
          geradoEm: new Date().toISOString(),
          pdfs,
          base: { titulos: oficiais.length, encontrados, naoEncontrados: naoEncontrados.length },
          totais: { totalOficial, totalLiquido, totalNominal },
          batendo: {
            regraNova: encontrados - divergentesLiquido.length,
            regraAntiga: encontrados - divergentesNominal.length,
            de: encontrados,
          },
          divergentesLiquido: divergentesLiquido.map((d) => ({
            billReceivableId: d.t.billReceivableId,
            documento: d.t.documento,
            oficial: d.t.rectoLiquido,
            portal: d.p.liquido,
            delta: d.delta,
            ultimaBaixaApi: d.p.ultimaBaixa,
          })),
          naoEncontrados: naoEncontrados.map((t) => ({
            billReceivableId: t.billReceivableId,
            documento: t.documento,
            oficial: t.rectoLiquido,
          })),
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
