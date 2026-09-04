/**
 * Story 75-373 — SEC-001: o relatório impresso de brindes escapa HTML.
 *
 * ## Por que este arquivo existe, e por que ele tem DUAS réguas
 *
 * O HTML de `buildPrintHtml` vai para `window.open("", "_blank")` + `document.write()`.
 * Janela `about:blank` aberta por script herda a origem do opener, e o cookie
 * `sb-*-auth-token` do Supabase SSR não é `httpOnly` — um `<script>` interpolado cru ali
 * rouba a sessão de quem imprime. O payload é gravável por outro usuário da mesma org.
 *
 * 1. **Régua de PRESENÇA (AC5):** injeção parametrizada, **um caso por sítio**, nos 9
 *    sítios. Um único registro com todos os campos hostis de uma vez seria falso verde:
 *    um sítio esquecido continuaria "coberto" porque outro sítio já teria falhado a
 *    asserção. Cada caso afirma no FRAGMENTO onde aquele sítio mora, para que o vermelho
 *    aponte o sítio certo, e só depois no documento inteiro.
 * 2. **Régua de ALCANCE (AC6):** varredura do texto-fonte da própria `buildPrintHtml`.
 *    A régua de presença nunca fica vermelha por causa de uma coluna que ainda não
 *    existe — ela mede os 9 de hoje. Quem acrescentar uma 10ª interpolação de dado daqui
 *    a três meses precisa ver vermelho, e é a régua de alcance que faz isso: toda
 *    interpolação do recorte tem que estar em `SEGURAS_DECLARADAS` (com o motivo escrito
 *    ao lado) **ou** começar com `escapeHtml(`.
 *
 * ## As quatro armadilhas da régua de alcance, todas fechadas de propósito
 *
 * - **Recorte fail-closed que aprova o vazio.** `trechoDelimitado` devolve `""` quando
 *   não acha uma das pontas — e `""` tem ZERO interpolações, o que aprovaria qualquer
 *   coisa. É o oposto do uso original dele (lá `""` reprova um `toContain`). Daí o SINAL
 *   DE VIDA: `>= 25` interpolações e `>= 23` expressões únicas, números medidos.
 * - **Regex ingênua.** `\$\{[^}]*\}` corta na primeira `}` e trunca
 *   `${i % 2 === 0 ? "par" : "impar"}`. A extração aqui conta profundidade de chaves.
 * - **Comentário citando uma interpolação.** Não é hipótese neste arquivo: o comentário
 *   do AC9 dentro de `buildPrintHtml` cita `brinde-tamanho.ts` escrevendo a interpolação
 *   do `label` em prosa. Sem `linhasDeCodigo()` (via `codigoDe`, dentro de
 *   `trechoDelimitado`) a régua contaria 27/25 e reprovaria com duas expressões fantasma.
 * - **O perdão é da EXPRESSÃO, nunca da variável.** `${cargo}` é declarado seguro porque
 *   é um fragmento de HTML já montado — mas `${d.cargo}`, que vive DENTRO da construção
 *   daquele fragmento e portanto dentro do recorte, é medido à parte e tem que carregar
 *   `escapeHtml(`. Tirar o escape de lá amanhã devolve `d.cargo` à lista de não-cobertas.
 *
 * Ambiente node: nenhuma das funções toca DOM. O `"use client"` do arquivo-fonte não
 * impede o import (precedente de runtime no repo: `components/conversas/message-media.test.ts`).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it, expect } from "vitest"
import { trechoDelimitado } from "@web/lib/tenancy/fonte-scan"
import { buildBrinde, buildEndereco, buildPrintHtml, escapeHtml } from "./print-modal"
import type { Destinatario, Entrega } from "./types"

const PAYLOAD = "<script>alert(1)</script>"
const ESCAPADO = "&lt;script&gt;alert(1)&lt;/script&gt;"

/** Destinatário limpo (nenhum caractere especial), com sobrescrita por caso. */
function destinatario(over: Partial<Destinatario> = {}): Destinatario {
  return {
    id: "d-1",
    org_id: "org-1",
    obra_nome: "Residencial Alfa",
    tipo: "mae",
    nome: "Maria Silva",
    cargo: null,
    observacao: null,
    endereco_logradouro: null,
    endereco_numero: null,
    endereco_complemento: null,
    endereco_bairro: null,
    endereco_cidade: null,
    endereco_estado: null,
    endereco_cep: null,
    endereco_referencia: "Rua das Flores 100",
    brinde_tipo_id: null,
    cliente_id: null,
    created_at: "2026-09-04",
    updated_at: "2026-09-04",
    brindes_tipos: null,
    ...over,
  }
}

const SEM_ENTREGAS: Record<string, Entrega> = {}

/**
 * O trecho de `html` que vai de `abre` até o primeiro `fecha` depois dela.
 *
 * Fail-closed de propósito: ponta ausente devolve `""`, e `""` reprova o `toContain` que
 * é a asserção do caso. Um fragmento que não foi encontrado nunca pode virar aprovação.
 */
function fragmento(html: string, abre: string, fecha: string): string {
  const i = html.indexOf(abre)
  if (i < 0) return ""
  const j = html.indexOf(fecha, i + abre.length)
  if (j < 0) return ""
  return html.slice(i, j + fecha.length)
}

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — o helper isolado
// ─────────────────────────────────────────────────────────────────────────────

describe("escapeHtml (AC1)", () => {
  it("escapa os 5 caracteres clássicos", () => {
    expect(escapeHtml("&")).toBe("&amp;")
    expect(escapeHtml("<")).toBe("&lt;")
    expect(escapeHtml(">")).toBe("&gt;")
    expect(escapeHtml('"')).toBe("&quot;")
    expect(escapeHtml("'")).toBe("&#39;")
  })

  it("🔴 o `&` é escapado PRIMEIRO — senão o escape se come a si mesmo", () => {
    // A asserção que É a AC vem primeiro: se a ordem inverter, `<` viraria `&lt;` e o
    // `&` desse `&lt;` seria reescapado, produzindo `&amp;lt;a &amp; b&amp;gt;`.
    expect(escapeHtml("<a & b>")).toBe("&lt;a &amp; b&gt;")
    expect(escapeHtml("<a & b>")).not.toBe("&amp;lt;a &amp; b&amp;gt;")
  })

  it("string vazia e texto sem caractere especial saem intactos", () => {
    expect(escapeHtml("")).toBe("")
    expect(escapeHtml("Residencial Alfa 100 - Curitiba PR")).toBe("Residencial Alfa 100 - Curitiba PR")
  })

  it("não é idempotente por construção — aplicar duas vezes duplo-escapa", () => {
    // Isto NÃO é um defeito: é a razão pela qual a regra da story é "escapa no `${}`,
    // uma vez só". O teste existe para que a regra tenha uma consequência visível.
    expect(escapeHtml(escapeHtml("Alfa & Beta"))).toBe("Alfa &amp;amp; Beta")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC5 — injeção, um caso por sítio, nos 9 sítios
// ─────────────────────────────────────────────────────────────────────────────

describe("buildPrintHtml — injeção por sítio (AC5)", () => {
  it("sítio 1 — d.observacao (<span class=obs>)", () => {
    const html = buildPrintHtml([destinatario({ observacao: PAYLOAD })], SEM_ENTREGAS, undefined, false, [])
    expect(fragmento(html, '<span class="obs">', "</span>")).toContain(ESCAPADO)
    expect(html).not.toContain("<script>")
  })

  it("sítio 2 — d.cargo (<span class=cargo>)", () => {
    const html = buildPrintHtml([destinatario({ cargo: PAYLOAD })], SEM_ENTREGAS, undefined, false, [])
    expect(fragmento(html, '<span class="cargo">', "</span>")).toContain(ESCAPADO)
    expect(html).not.toContain("<script>")
  })

  it("sítio 3 — d.obra_nome (<td class=obra>)", () => {
    const html = buildPrintHtml([destinatario({ obra_nome: PAYLOAD })], SEM_ENTREGAS, undefined, false, [])
    expect(fragmento(html, '<td class="obra">', "</td>")).toContain(ESCAPADO)
    expect(html).not.toContain("<script>")
  })

  it("sítio 4 — d.nome (<td class=nome>)", () => {
    const html = buildPrintHtml([destinatario({ nome: PAYLOAD })], SEM_ENTREGAS, undefined, false, [])
    expect(fragmento(html, '<td class="nome">', "</td>")).toContain(ESCAPADO)
    expect(html).not.toContain("<script>")
  })

  it("sítio 5 — buildEndereco(d) (<td class=endereco>)", () => {
    const d = destinatario({ endereco_referencia: PAYLOAD })
    // A função continua devolvendo TEXTO cru: o escape mora no `${}`, não nela.
    expect(buildEndereco(d)).toBe(PAYLOAD)
    const html = buildPrintHtml([d], SEM_ENTREGAS, undefined, false, [])
    expect(fragmento(html, '<td class="endereco">', "</td>")).toContain(ESCAPADO)
    expect(html).not.toContain("<script>")
  })

  it("sítio 6 — buildBrinde(d) (<td class=brinde>)", () => {
    const d = destinatario({ brindes_tipos: { nome: PAYLOAD, tamanho: null, cor: null } })
    // Idem: `buildBrinde` não sabe que HTML existe.
    expect(buildBrinde(d)).toBe(PAYLOAD)
    const html = buildPrintHtml([d], SEM_ENTREGAS, undefined, false, [])
    expect(fragmento(html, '<td class="brinde">', "</td>")).toContain(ESCAPADO)
    expect(html).not.toContain("<script>")
  })

  it("sítio 7a — titulo dentro de <title> (AC3, uso 1 de 2)", () => {
    const html = buildPrintHtml([destinatario()], SEM_ENTREGAS, PAYLOAD, false, [])
    expect(fragmento(html, "<title>", "</title>")).toContain(ESCAPADO)
    expect(html).not.toContain("<script>")
  })

  it("sítio 7b — o MESMO titulo dentro de <h1> (AC3, uso 2 de 2)", () => {
    // Asserção separada de propósito: escapar na origem cobre os dois usos, mas "a
    // variável foi transformada" não é a AC — os dois SÍTIOS DE USO é que são.
    const html = buildPrintHtml([destinatario()], SEM_ENTREGAS, PAYLOAD, false, [])
    expect(fragmento(html, "<h1>", "</h1>")).toContain(ESCAPADO)
    expect(html).not.toContain("<script>")
  })

  it("sítio 8 — rótulos de filtro (<p class=filtros>) — vetor CRUZADO, não self-XSS", () => {
    // `filters.obra_nome` e `filters.tamanho` são `<select>` alimentados por dados do
    // banco/catálogo: o payload vem de OUTRO usuário da org. Só `nome` e `cidade` são
    // `<input>` digitado. Esta AC tem a mesma prioridade das demais.
    const html = buildPrintHtml([destinatario()], SEM_ENTREGAS, undefined, false, [`Obra: ${PAYLOAD}`])
    expect(fragmento(html, '<p class="filtros">', "</p>")).toContain(ESCAPADO)
    expect(html).not.toContain("<script>")
  })

  it("sítio 9 — resumo (<p class=resumo>), o mesmo vetor de buildBrinde", () => {
    // O `label` do resumo é `${t.nome} ${t.tamanho}` (brinde-tamanho.ts:69) — as mesmas
    // duas colunas de `brindes_tipos`. Fragmento próprio para que o vermelho aponte o
    // resumo, e não a célula do brinde.
    const html = buildPrintHtml(
      [destinatario({ brindes_tipos: { nome: PAYLOAD, tamanho: "G", cor: null } })],
      SEM_ENTREGAS,
      undefined,
      false,
      [],
    )
    expect(fragmento(html, '<p class="resumo">', "</p>")).toContain(ESCAPADO)
    expect(html).not.toContain("<script>")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC7 / R4 — duplo-escape é bug visível ao usuário
// ─────────────────────────────────────────────────────────────────────────────

describe("sem duplo-escape (AC7 / R4)", () => {
  it("🔴 uma obra chamada `Alfa & Beta` sai `Alfa &amp; Beta`, nunca `Alfa &amp;amp; Beta`", () => {
    const html = buildPrintHtml([destinatario({ obra_nome: "Alfa & Beta" })], SEM_ENTREGAS, undefined, false, [])
    const celula = fragmento(html, '<td class="obra">', "</td>")
    expect(celula).toContain("Alfa &amp; Beta")
    expect(celula).not.toContain("&amp;amp;")
  })

  it("titulo com `&` é escapado UMA vez, e nos dois usos", () => {
    // O sítio de maior risco de duplo-escape: `titulo` é escapado na ORIGEM e interpolado
    // duas vezes. Um `escapeHtml(titulo)` a mais em qualquer um dos usos apareceria aqui.
    const html = buildPrintHtml([destinatario()], SEM_ENTREGAS, "Dia das Maes & Pais", false, [])
    expect(fragmento(html, "<title>", "</title>")).toContain("Dia das Maes &amp; Pais")
    expect(fragmento(html, "<h1>", "</h1>")).toContain("Dia das Maes &amp; Pais")
    expect(html).not.toContain("&amp;amp;")
  })

  it("resumo e filtros com `&` não duplo-escapam", () => {
    const html = buildPrintHtml(
      [destinatario({ brindes_tipos: { nome: "Caneca & Copo", tamanho: null, cor: null } })],
      SEM_ENTREGAS,
      undefined,
      false,
      ["Obra: Alfa & Beta"],
    )
    expect(fragmento(html, '<p class="resumo">', "</p>")).toContain("Caneca &amp; Copo")
    expect(fragmento(html, '<p class="filtros">', "</p>")).toContain("Alfa &amp; Beta")
    expect(html).not.toContain("&amp;amp;")
  })

  it("dado sem caractere especial atravessa intacto — o caso comum não muda", () => {
    const html = buildPrintHtml(
      [destinatario({ obra_nome: "Residencial Alfa", nome: "Maria Silva", cargo: "Engenheira" })],
      SEM_ENTREGAS,
      "Dia das Maes",
      false,
      ["Obra: Residencial Alfa"],
    )
    expect(html).toContain('<td class="obra">Residencial Alfa</td>')
    expect(html).toContain('<span class="cargo">Engenheira</span>')
    expect(html).toContain("<h1>Controle de Brindes — Dia das Maes</h1>")
    expect(html).toContain('<p class="filtros">Filtros: Obra: Residencial Alfa</p>')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC6 — régua de ALCANCE: pega o sítio que ainda não existe
// ─────────────────────────────────────────────────────────────────────────────

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const FONTE = path.join(AQUI, "print-modal.tsx")

/** Ponta de abertura do recorte. Sabotá-la é a mutação de controle (b) do AC6. */
const ABERTURA = "function buildPrintHtml"
/** Ponta de fechamento: o `</html>` seguido da crase que fecha o `return`. */
const FECHAMENTO = "</html>`"

/**
 * As 14 interpolações declaradas SEGURAS, cada uma com o motivo ao lado.
 *
 * O motivo escrito é o que dá valor à lista: sem ele isto é um mapa de nomes, e mapa de
 * nomes já cegou uma régua neste repositório. Acrescentar uma entrada aqui é uma decisão
 * de segurança, não um conserto de teste.
 */
const SEGURAS_DECLARADAS: Record<string, string> = {
  titulo: "escapada na ORIGEM, no ternário do `titulo` (AC3) — os dois usos herdam",
  cargo: "fragmento de HTML já montado; o dado cru dentro dele (`d.cargo`) é medido à parte",
  observacao: "fragmento de HTML já montado; `d.observacao` é medido à parte",
  rows: "fragmento montado pelo `map`; cada dado dentro dele é medido à parte",
  statusCell: "fragmento montado só de `STATUS_LABEL` + literais fixos",
  filtrosInfo: "fragmento; o dado dentro dele (`activeFilters.join`) é medido à parte",
  resumoInfo: "fragmento; o dado dentro dele (`resumo`) é medido à parte",
  "TIPO_LABEL[d.tipo] ?? d.tipo":
    "dicionário fechado; o ramo `??` é morto por `CHECK (tipo IN ('mae','pai','outro'))` " +
    "(031_controle_brindes.sql:36), intacto nas 6 migrations posteriores da tabela",
  'entrega ? STATUS_LABEL[entrega.status] : "Pendente"': "dicionário fechado + literal fixo",
  statusHeader: "um de dois literais fixos, decidido por `hasDate`",
  hoje: "`new Date().toLocaleDateString(\"pt-BR\", …)` — data formatada, sem dado de usuário",
  "records.length": "número",
  "i + 1": "número",
  'i % 2 === 0 ? "par" : "impar"': "dois literais fixos",
}

/**
 * Toda interpolação `${…}` de `codigo`, com BALANCEAMENTO de chaves.
 *
 * Contador de profundidade, não regex: `\$\{[^}]*\}` cortaria
 * `${i % 2 === 0 ? "par" : "impar"}` na primeira `}` e produziria expressões truncadas —
 * falso verde silencioso. `${` sem fechamento é ignorado (não pode virar aprovação nem
 * expressão fantasma).
 */
function interpolacoesDe(codigo: string): string[] {
  const achadas: string[] = []
  for (let i = 0; i < codigo.length - 1; i++) {
    if (codigo[i] !== "$" || codigo[i + 1] !== "{") continue
    let profundidade = 1
    let j = i + 2
    for (; j < codigo.length; j++) {
      if (codigo[j] === "{") profundidade++
      else if (codigo[j] === "}") profundidade--
      if (profundidade === 0) break
    }
    if (profundidade !== 0) continue
    achadas.push(codigo.slice(i + 2, j).trim())
    i = j
  }
  return achadas
}

describe("régua de alcance de escape em buildPrintHtml (AC6)", () => {
  const fonte = fs.readFileSync(FONTE, "utf-8")
  // `trechoDelimitado` já aplica `codigoDe`/`linhasDeCodigo`: comentário citando uma
  // interpolação em prosa não conta (e há um, no comentário do AC9).
  const recorte = trechoDelimitado(fonte, ABERTURA, FECHAMENTO)
  const todas = interpolacoesDe(recorte)
  const unicas = [...new Set(todas)].sort()

  it("🔴 SINAL DE VIDA — o recorte achou a função de verdade", () => {
    // Sem esta asserção a régua abaixo é uma farsa: recorte fail-closed devolve `""`,
    // `""` tem zero interpolações, e um conjunto vazio de não-cobertas APROVA TUDO.
    // Números medidos pelo @po e reconferidos aqui: 25 interpolações, 23 únicas.
    expect(todas.length).toBeGreaterThanOrEqual(25)
    expect(unicas.length).toBeGreaterThanOrEqual(23)
  })

  it("🔴 toda interpolação do recorte está escapada ou declarada segura, com motivo", () => {
    const naoCobertas = unicas.filter(
      (e) => !Object.hasOwn(SEGURAS_DECLARADAS, e) && !e.startsWith("escapeHtml("),
    )
    // `.toEqual([])` sobre o conjunto ordenado, nunca `.some`/`.includes`/`toContain`:
    // uma interpolação nova que não seja nenhuma das duas coisas aparece aqui e o
    // vermelho NOMEIA a expressão. O perdão é da expressão, nunca da variável.
    expect(naoCobertas).toEqual([])
  })

  it("nenhum perdão declarado está morto — a lista não apodrece", () => {
    // Declarar segura uma expressão que não existe mais é um perdão sem sítio: some da
    // fonte e fica na lista, e a próxima expressão com aquele nome nasce perdoada.
    const declaradasSemSitio = Object.keys(SEGURAS_DECLARADAS).filter((e) => !unicas.includes(e))
    expect(declaradasSemSitio).toEqual([])
  })

  it("cada expressão declarada segura tem um motivo escrito", () => {
    // O tipo `Record<string, string>` obriga a escrever ALGO; ele não impede `""`.
    // "número" é motivo suficiente — o que não é motivo é o vazio.
    const semMotivo = Object.entries(SEGURAS_DECLARADAS)
      .filter(([, motivo]) => motivo.trim() === "")
      .map(([e]) => e)
    expect(semMotivo).toEqual([])
  })
})
