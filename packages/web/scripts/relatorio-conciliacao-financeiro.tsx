/**
 * Gera o PDF de conferência para o financeiro a partir do JSON produzido por
 * `scripts/sienge-conciliar-extrato-pdf.ts`.
 *
 * Vive em `packages/web/scripts/` porque depende de `@react-pdf/renderer`, que é
 * dependência do pacote web e não resolve da raiz do monorepo.
 *
 * Uso (a partir de packages/web):
 *   npx tsx scripts/relatorio-conciliacao-financeiro.tsx <conciliacao.json> <saida.pdf>
 *
 * Todo número agregado vem do JSON — nada é recalculado à mão. A única exceção é
 * `LINHAS_EXTRATO_ADIANTAMENTO`, a ilustração das duas linhas do extrato oficial
 * do CT.VIND-904, transcritas do PDF do Sienge: o JSON guarda o total por título,
 * não o detalhe de cada baixa.
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToFile,
} from "@react-pdf/renderer"

// A hifenização automática do @react-pdf quebra palavras em pontos ruins
// ("escol-heram"). Documento de poucas páginas não precisa dela.
Font.registerHyphenationCallback((word) => [word])

// ── Dados ─────────────────────────────────────────────────────────────

type Detalhe = {
  billReceivableId: number
  documento: string
  empreendimento: string
  cliente: string
  oficial: number
  portalLiquido: number
  portalNominal: number
  valorBaixa: number
  acrescimo: number
  desconto: number
  baixasComMotivo: number
  bateRegraNova: boolean
  bateRegraAntiga: boolean
}

type Conciliacao = {
  geradoEm: string
  base: { titulos: number; encontrados: number; naoEncontrados: number }
  totais: { totalOficial: number; totalLiquido: number; totalNominal: number }
  batendo: { regraNova: number; regraAntiga: number; de: number }
  divergentesLiquido: Array<{
    billReceivableId: number
    documento: string
    oficial: number
    portal: number
    delta: number
  }>
  detalhe: Detalhe[]
}

const [jsonPath, outPath] = process.argv.slice(2)
if (!jsonPath || !outPath) {
  console.error(
    "Uso: npx tsx scripts/relatorio-conciliacao-financeiro.tsx <conciliacao.json> <saida.pdf>"
  )
  process.exit(1)
}

const dados = JSON.parse(readFileSync(resolve(jsonPath), "utf-8")) as Conciliacao

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtSigned = (v: number) => `${v > 0 ? "+ " : v < 0 ? "- " : ""}R$ ${fmt(Math.abs(v))}`

const { totais, batendo, base } = dados
const deltaAgora = totais.totalLiquido - totais.totalOficial
const deltaAntes = totais.totalNominal - totais.totalOficial
const passaramABater = dados.detalhe.filter((t) => t.bateRegraNova && !t.bateRegraAntiga)
const acrescimoTotal = dados.detalhe.reduce((s, t) => s + t.acrescimo, 0)
const descontoTotal = dados.detalhe.reduce((s, t) => s + t.desconto, 0)
const comBaixaContabil = dados.detalhe.filter((t) => t.baixasComMotivo > 0).length
const divergente = dados.divergentesLiquido[0]
const maioresGanhos = [...passaramABater]
  .sort(
    (a, b) =>
      Math.abs(b.portalNominal - b.oficial) - Math.abs(a.portalNominal - a.oficial)
  )
  .slice(0, 14)

/**
 * Transcrição literal das duas linhas do "Extrato Cliente Histórico" (CT.VIND-904,
 * título 10578) que explicam a única divergência. Os líquidos que o portal calcula
 * para essas mesmas baixas — R$ 1.178,01 e R$ 1.180,37 — foram conferidos na API.
 */
const LINHAS_EXTRATO_ADIANTAMENTO = [
  {
    par: "6",
    tipo: "Parcelas Mensais",
    original: "1.168,75",
    dataBaixa: "02/05/2024",
    valorBaixa: "1.188,05",
    recto: "*** Abatimento de Adiantamento ***",
  },
  {
    par: "7",
    tipo: "Parcelas Mensais",
    original: "1.168,75",
    dataBaixa: "02/05/2024",
    valorBaixa: "1.188,05",
    recto: "*** Abatimento de Adiantamento ***",
  },
]

const dataDoc = new Date(dados.geradoEm).toLocaleDateString("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})

// ── Estilo (mesma identidade do PDF do extrato) ───────────────────────

const BRAND = "#E8856A"
const DARK = "#1C1917"
const GRAY = "#78716C"
const LIGHT = "#F5F5F4"
const BORDER = "#E7E5E4"
const GREEN = "#15803D"

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: DARK,
    backgroundColor: "#FFFFFF",
    paddingTop: 38,
    paddingBottom: 54,
    paddingHorizontal: 40,
  },
  eyebrow: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 1.4,
    color: GRAY,
    marginBottom: 14,
  },
  h1: { fontFamily: "Helvetica-Bold", fontSize: 19, lineHeight: 1.25, marginBottom: 8 },
  lead: { fontSize: 10, lineHeight: 1.55, color: DARK, marginBottom: 6 },
  meta: { fontSize: 8, color: GRAY, lineHeight: 1.5, marginBottom: 18 },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    marginTop: 22,
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 1.5,
    borderBottomColor: BRAND,
    borderBottomStyle: "solid",
  },
  p: { fontSize: 9.5, lineHeight: 1.55, marginBottom: 8 },
  // cards
  cardRow: { flexDirection: "row", marginBottom: 6 },
  card: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 5,
    padding: 11,
    marginRight: 8,
  },
  cardLast: { marginRight: 0 },
  cardLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    letterSpacing: 0.9,
    color: GRAY,
    marginBottom: 5,
  },
  cardValue: { fontFamily: "Helvetica-Bold", fontSize: 17, marginBottom: 4 },
  cardText: { fontSize: 7.5, lineHeight: 1.45, color: GRAY },
  // tabela
  tableCaption: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 0.9,
    color: GRAY,
    marginBottom: 5,
  },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: DARK,
    borderBottomStyle: "solid",
    paddingBottom: 4,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 0.5, color: GRAY },
  tr: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    borderBottomStyle: "solid",
  },
  trLast: { borderBottomWidth: 0 },
  td: { fontSize: 9 },
  tdBold: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  right: { textAlign: "right" },
  // destaque
  callout: {
    backgroundColor: LIGHT,
    borderLeftWidth: 3,
    borderLeftColor: BRAND,
    borderLeftStyle: "solid",
    borderRadius: 3,
    padding: 11,
    marginTop: 10,
    marginBottom: 4,
  },
  calloutTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginBottom: 5 },
  calloutText: { fontSize: 8.5, lineHeight: 1.5, color: DARK },
  mono: { fontFamily: "Courier", fontSize: 7.5, lineHeight: 1.6 },
  monoBox: {
    backgroundColor: "#FAFAF9",
    borderWidth: 0.5,
    borderColor: BORDER,
    borderStyle: "solid",
    borderRadius: 3,
    padding: 9,
    marginTop: 8,
    marginBottom: 8,
  },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 40,
    right: 40,
    fontSize: 7,
    color: GRAY,
    lineHeight: 1.5,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    borderTopStyle: "solid",
    paddingTop: 7,
  },
  ok: { color: GREEN, fontFamily: "Helvetica-Bold" },
  extratoCaption: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    letterSpacing: 0.8,
    color: GRAY,
    marginBottom: 6,
  },
  extratoHead: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: GRAY,
    borderBottomStyle: "solid",
    paddingBottom: 3,
  },
  extratoTh: { fontFamily: "Helvetica-Bold", fontSize: 5.8, color: GRAY },
  extratoTr: { flexDirection: "row", paddingTop: 4 },
  extratoTd: { fontFamily: "Courier", fontSize: 7 },
  extratoTdMotivo: { fontFamily: "Courier-Bold", fontSize: 7, color: BRAND },
})

// ── Documento ─────────────────────────────────────────────────────────

function Relatorio() {
  return (
    <Document
      title="Portal do Cliente — fechamento da conferência com o Sienge"
      author="Trifold"
      subject="Conciliação do total pago: portal × extrato oficial do Sienge"
    >
      {/* ── Página 1 — o resultado ─────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>
          PORTAL DO CLIENTE · TRIFOLD · CONFERÊNCIA DO FINANCEIRO
        </Text>

        <Text style={s.h1}>As duas decisões estão aplicadas e o portal fechou</Text>
        <Text style={s.lead}>
          Vocês responderam as duas perguntas que a conferência anterior deixou em
          aberto. As duas foram aplicadas e os mesmos {base.titulos} contratos foram
          reconferidos, um por um, contra os extratos oficiais.
        </Text>
        <Text style={s.meta}>
          {base.encontrados} de {base.titulos} contratos encontrados nos dois lados ·
          extratos “Extrato Cliente Histórico” do Vind e do Yarden, correção até
          28/08/2026 · documento gerado em {dataDoc}
        </Text>

        <View style={s.cardRow}>
          <View style={s.card}>
            <Text style={s.cardLabel}>CONTRATOS BATENDO AO CENTAVO</Text>
            <Text style={s.cardValue}>
              {batendo.regraNova} de {batendo.de}
            </Text>
            <Text style={s.cardText}>
              Antes das decisões, {batendo.regraAntiga} de {batendo.de}.
            </Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>CONTRATOS QUE PASSARAM A FECHAR</Text>
            <Text style={s.cardValue}>{passaramABater.length}</Text>
            <Text style={s.cardText}>
              São os que ficavam alguns reais fora por causa de juros e desconto.
            </Text>
          </View>
          <View style={[s.card, s.cardLast]}>
            <Text style={s.cardLabel}>ÚNICA DIFERENÇA QUE RESTA</Text>
            <Text style={s.cardValue}>R$ {fmt(Math.abs(deltaAgora))}</Text>
            <Text style={s.cardText}>
              Um contrato, e é a regra que vocês escolheram manter.
            </Text>
          </View>
        </View>

        <Text style={s.h2}>Antes e depois</Text>

        <Text style={s.tableCaption}>
          SOMA DOS {base.titulos} CONTRATOS CONFERIDOS
        </Text>
        <View style={s.thead}>
          <Text style={[s.th, { flex: 3 }]}>ORIGEM DO NÚMERO</Text>
          <Text style={[s.th, s.right, { flex: 2 }]}>TOTAL PAGO</Text>
          <Text style={[s.th, s.right, { flex: 2 }]}>DIFERENÇA CONTRA O SIENGE</Text>
        </View>
        <View style={s.tr}>
          <Text style={[s.td, { flex: 3 }]}>Extrato oficial do Sienge</Text>
          <Text style={[s.tdBold, s.right, { flex: 2 }]}>
            R$ {fmt(totais.totalOficial)}
          </Text>
          <Text style={[s.td, s.right, { flex: 2 }]}>—</Text>
        </View>
        <View style={s.tr}>
          <Text style={[s.td, { flex: 3 }]}>Portal — antes das duas decisões</Text>
          <Text style={[s.td, s.right, { flex: 2 }]}>
            R$ {fmt(totais.totalNominal)}
          </Text>
          <Text style={[s.td, s.right, { flex: 2 }]}>{fmtSigned(deltaAntes)}</Text>
        </View>
        <View style={[s.tr, s.trLast]}>
          <Text style={[s.tdBold, { flex: 3 }]}>Portal — agora</Text>
          <Text style={[s.tdBold, s.right, { flex: 2 }]}>
            R$ {fmt(totais.totalLiquido)}
          </Text>
          <Text style={[s.tdBold, s.right, { flex: 2 }]}>{fmtSigned(deltaAgora)}</Text>
        </View>

        <Text style={[s.p, { marginTop: 12 }]}>
          A diferença que sobra trocou de causa. Antes eram juros de atraso que o
          cliente pagou e o portal não mostrava — dinheiro de verdade faltando na
          conta. Agora é um adiantamento aparecendo em um contrato em vez de outro,
          por decisão de vocês: o dinheiro está lá, no lugar que vocês escolheram.
        </Text>

        <Text style={s.h2}>As duas decisões, e o que cada uma fez</Text>
        <View style={s.thead}>
          <Text style={[s.th, { flex: 2.6 }]}>DECISÃO DE VOCÊS</Text>
          <Text style={[s.th, { flex: 4.4 }]}>O QUE MUDOU NO PORTAL</Text>
        </View>
        <View style={s.tr}>
          <Text style={[s.tdBold, { flex: 2.6 }]}>
            1. “Sim, entram no total pago”
          </Text>
          <Text style={[s.td, { flex: 4.4 }]}>
            O total pago passou a incluir juros de atraso e a descontar
            abatimentos — a coluna “Recto líquido” do extrato. {passaramABater.length}{" "}
            contratos que ficavam alguns reais fora passaram a bater ao centavo.
          </Text>
        </View>
        <View style={[s.tr, s.trLast]}>
          <Text style={[s.tdBold, { flex: 2.6 }]}>
            2. “Manter, contar no abatimento”
          </Text>
          <Text style={[s.td, { flex: 4.4 }]}>
            Nada — confirma o que já estava em produção. É a razão da única
            diferença que restou, detalhada na última página.
          </Text>
        </View>

        <View style={s.callout}>
          <Text style={s.calloutTitle}>O saldo devedor continua idêntico</Text>
          <Text style={s.calloutText}>
            Nada nesta rodada mexeu no saldo devedor — ele já fechava nos{" "}
            {base.titulos} contratos e continua fechando. O que estava incompleto era
            o total pago, e é só ele que mudou.
          </Text>
        </View>

        <Text style={s.footer}>
          Conferência automatizada: os extratos em PDF foram lidos contrato a contrato
          e comparados com o número que o portal calcula para o mesmo cliente, usando
          o mesmo código que roda em produção. Casamento pelo número do título.
        </Text>
      </Page>

      {/* ── Página 2 — decisão 1 ───────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>DECISÃO 1 · JUROS DE ATRASO E DESCONTO</Text>

        <Text style={s.h1}>“Sim, entram no total pago”</Text>
        <Text style={s.lead}>
          O portal passou a somar o <Text style={s.tdBold}>Recto líquido</Text> — valor
          da parcela + acréscimo - desconto —, a mesma conta que o extrato de vocês
          apresenta. Antes somava só o valor nominal da parcela.
        </Text>

        <View style={[s.cardRow, { marginTop: 8 }]}>
          <View style={s.card}>
            <Text style={s.cardLabel}>ACRÉSCIMO NOS {base.titulos} CONTRATOS</Text>
            <Text style={s.cardValue}>R$ {fmt(acrescimoTotal)}</Text>
            <Text style={s.cardText}>Juros e multa que os clientes pagaram.</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>DESCONTO NOS {base.titulos} CONTRATOS</Text>
            <Text style={s.cardValue}>R$ {fmt(descontoTotal)}</Text>
            <Text style={s.cardText}>Abatimentos concedidos por vocês.</Text>
          </View>
          <View style={[s.card, s.cardLast]}>
            <Text style={s.cardLabel}>CONTRATOS CORRIGIDOS</Text>
            <Text style={s.cardValue}>{passaramABater.length}</Text>
            <Text style={s.cardText}>
              Não fechavam ao centavo e agora fecham.
            </Text>
          </View>
        </View>

        <Text style={s.h2}>Os contratos com a maior correção</Text>
        <Text style={s.tableCaption}>
          O QUE O EXTRATO MOSTRA · O QUE O PORTAL MOSTRAVA · O QUE MOSTRA AGORA
        </Text>
        <View style={s.thead}>
          <Text style={[s.th, { flex: 2.2 }]}>CONTRATO</Text>
          <Text style={[s.th, s.right, { flex: 2 }]}>EXTRATO OFICIAL</Text>
          <Text style={[s.th, s.right, { flex: 2 }]}>PORTAL ANTES</Text>
          <Text style={[s.th, s.right, { flex: 2 }]}>PORTAL AGORA</Text>
          <Text style={[s.th, s.right, { flex: 1.8 }]}>DESVIO ANTES</Text>
        </View>
        {maioresGanhos.map((t, i) => (
          <View
            key={t.billReceivableId}
            style={[s.tr, i === maioresGanhos.length - 1 ? s.trLast : {}]}
          >
            <Text style={[s.td, { flex: 2.2 }]}>{t.documento}</Text>
            <Text style={[s.td, s.right, { flex: 2 }]}>{fmt(t.oficial)}</Text>
            <Text style={[s.td, s.right, { flex: 2 }]}>{fmt(t.portalNominal)}</Text>
            <Text style={[s.tdBold, s.right, { flex: 2 }]}>
              {fmt(t.portalLiquido)}
            </Text>
            <Text style={[s.td, s.right, { flex: 1.8 }]}>
              {t.portalNominal - t.oficial > 0 ? "+ " : "- "}
              {fmt(Math.abs(t.portalNominal - t.oficial))}
            </Text>
          </View>
        ))}

        <Text style={[s.p, { marginTop: 12 }]}>
          Em todos eles a coluna “Portal agora” é igual ao extrato, ao centavo. Desvio
          negativo era juro que o cliente pagou e o portal não mostrava; desvio
          positivo era desconto que vocês concederam e o portal não abatia.
        </Text>

        <View style={s.callout}>
          <Text style={s.calloutTitle}>O que o cliente vai notar na tela</Text>
          <Text style={s.calloutText}>
            Uma parcela paga em atraso passa a mostrar valor pago um pouco{" "}
            <Text style={s.tdBold}>acima</Text> do valor da parcela — porque foi isso
            que ele pagou. Uma parcela com desconto mostra{" "}
            <Text style={s.tdBold}>abaixo</Text>, e continua marcada como quitada. É o
            mesmo comportamento do extrato oficial, e vale a pena a equipe de
            atendimento saber disso antes de a primeira pergunta chegar.
          </Text>
        </View>

        <Text style={s.footer}>
          {comBaixaContabil} dos {base.titulos} contratos têm baixa contábil (distrato
          ou substituição). Todos continuam exibindo apenas o dinheiro que entrou —
          a regra confirmada na conferência anterior segue valendo, sem alteração.
        </Text>
      </Page>

      {/* ── Página 3 — decisão 2 ───────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>DECISÃO 2 · ADIANTAMENTO</Text>

        <Text style={s.h1}>“Manter, contar no abatimento”</Text>
        <Text style={s.lead}>
          Nada mudou no portal por conta desta decisão — ela confirma o que já estava
          em produção. Mas é ela que explica, sozinha, a única diferença que restou na
          conferência.
        </Text>

        {divergente ? (
          <>
            <Text style={s.h2}>A única diferença: {divergente.documento}</Text>
            <View style={s.thead}>
              <Text style={[s.th, { flex: 3 }]}>ORIGEM DO NÚMERO</Text>
              <Text style={[s.th, s.right, { flex: 2 }]}>TOTAL PAGO NO CONTRATO</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { flex: 3 }]}>Extrato oficial do Sienge</Text>
              <Text style={[s.td, s.right, { flex: 2 }]}>
                R$ {fmt(divergente.oficial)}
              </Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { flex: 3 }]}>Portal</Text>
              <Text style={[s.td, s.right, { flex: 2 }]}>
                R$ {fmt(divergente.portal)}
              </Text>
            </View>
            <View style={[s.tr, s.trLast]}>
              <Text style={[s.tdBold, { flex: 3 }]}>Diferença</Text>
              <Text style={[s.tdBold, s.right, { flex: 2 }]}>
                R$ {fmt(Math.abs(divergente.delta))}
              </Text>
            </View>

            <Text style={[s.p, { marginTop: 12 }]}>
              A diferença é exatamente o crédito de adiantamento que quitou duas
              parcelas deste contrato em 02/05/2024. No extrato, essas duas linhas
              aparecem com valor na coluna “Valor baixa” e{" "}
              <Text style={s.tdBold}>sem Recto líquido</Text>:
            </Text>

            <View style={s.monoBox}>
              <Text style={s.extratoCaption}>
                EXTRATO CLIENTE HISTÓRICO · {divergente.documento} · LINHAS REAIS
              </Text>
              <View style={s.extratoHead}>
                <Text style={[s.extratoTh, { flex: 0.6 }]}>PAR</Text>
                <Text style={[s.extratoTh, { flex: 2.4 }]}>TIPO CONDIÇÃO</Text>
                <Text style={[s.extratoTh, s.right, { flex: 1.5 }]}>VALOR ORIG.</Text>
                <Text style={[s.extratoTh, s.right, { flex: 1.5 }]}>DATA BAIXA</Text>
                <Text style={[s.extratoTh, s.right, { flex: 1.5 }]}>VALOR BAIXA</Text>
                <Text style={[s.extratoTh, s.right, { flex: 4 }]}>RECTO LÍQUIDO</Text>
              </View>
              {LINHAS_EXTRATO_ADIANTAMENTO.map((l) => (
                <View key={l.par} style={s.extratoTr}>
                  <Text style={[s.extratoTd, { flex: 0.6 }]}>{l.par}</Text>
                  <Text style={[s.extratoTd, { flex: 2.4 }]}>{l.tipo}</Text>
                  <Text style={[s.extratoTd, s.right, { flex: 1.5 }]}>
                    {l.original}
                  </Text>
                  <Text style={[s.extratoTd, s.right, { flex: 1.5 }]}>
                    {l.dataBaixa}
                  </Text>
                  <Text style={[s.extratoTd, s.right, { flex: 1.5 }]}>
                    {l.valorBaixa}
                  </Text>
                  <Text style={[s.extratoTdMotivo, s.right, { flex: 4 }]}>
                    {l.recto}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={s.p}>
              O Sienge deixa em branco porque, para ele, esse dinheiro já foi contado
              quando o adiantamento entrou — em outro título, que não aparece neste
              extrato. O portal faz o contrário, seguindo a decisão de vocês: conta no
              momento em que o crédito quita a parcela. Somados, os dois abatimentos
              dão R$ 1.178,01 + R$ 1.180,37 = R$ {fmt(Math.abs(divergente.delta))} —
              exatamente a diferença da tabela acima.
            </Text>

            <View style={s.callout}>
              <Text style={s.calloutTitle}>
                Não é erro: é a decisão de vocês funcionando
              </Text>
              <Text style={s.calloutText}>
                O cliente pagou esse valor uma vez e ele aparece uma vez. A escolha é
                só sobre em qual contrato ele aparece. Nesta base de {base.titulos}{" "}
                contratos, é o único caso — se algum dia vocês quiserem seguir o
                critério do Sienge, este é o único contrato que mudaria.
              </Text>
            </View>
          </>
        ) : (
          <Text style={s.p}>
            Nenhuma diferença restou nesta conferência: todos os {batendo.de} contratos
            batem ao centavo.
          </Text>
        )}

        <Text style={s.h2}>Onde isso fica registrado</Text>
        <Text style={s.p}>
          A conferência deixou de ser um trabalho manual. A comparação inteira — ler os
          extratos, casar por número de título e confrontar com o que o portal calcula
          — virou um procedimento que pode ser repetido a qualquer momento, com
          qualquer extrato novo que vocês emitirem. Basta pedir.
        </Text>

        <Text style={s.footer}>
          Portal do Cliente · Trifold · documento gerado em {dataDoc}. As duas decisões
          estão em produção. Documentos anteriores desta conferência:
          sienge-tipos-de-baixa-conferencia-financeiro.pdf e
          conciliacao-portal-sienge-vind-yarden.pdf.
        </Text>
      </Page>
    </Document>
  )
}

renderToFile(<Relatorio />, resolve(outPath))
  .then(() => console.log(`✅ PDF gerado em ${resolve(outPath)}`))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
