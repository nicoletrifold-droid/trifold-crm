import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { FormattedInstallment } from "@web/lib/integrations/sienge/types"
import { getNonCashLabel, getOpenBalance } from "@web/lib/integrations/sienge/installments"

const BRAND = "#E8856A"
const DARK = "#1C1917"
const GRAY = "#78716C"
const LIGHT = "#F5F5F4"
const BORDER = "#E7E5E4"

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: DARK,
    backgroundColor: "#FFFFFF",
    paddingTop: 36,
    paddingBottom: 52,
    paddingHorizontal: 36,
  },
  // ── Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingBottom: 10,
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    borderBottomStyle: "solid",
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    color: DARK,
  },
  headerSub: {
    fontSize: 8,
    color: GRAY,
    marginTop: 2,
  },
  headerDate: {
    fontSize: 7,
    color: GRAY,
    textAlign: "right",
  },
  // ── Info boxes
  infoRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  infoBox: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 5,
    padding: 10,
    marginRight: 8,
  },
  infoBoxLast: {
    marginRight: 0,
  },
  infoLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    color: GRAY,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  infoValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: DARK,
  },
  infoValueSm: {
    fontSize: 8,
    color: GRAY,
    marginTop: 1,
  },
  // ── Table
  tableHead: {
    flexDirection: "row",
    backgroundColor: DARK,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 1,
  },
  tableHeadCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: "solid",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  tableRowAlt: {
    backgroundColor: "#FAFAF9",
  },
  cell: {
    fontSize: 8,
    color: DARK,
  },
  cellGray: {
    fontSize: 8,
    color: GRAY,
  },
  // Sub-linha de baixa (parcela com 2+ pagamentos)
  receiptRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: "solid",
    paddingVertical: 3,
    paddingHorizontal: 8,
    paddingLeft: 24,
    backgroundColor: "#FAFAF9",
  },
  receiptText: {
    fontSize: 7,
    color: GRAY,
  },
  // Column widths (somam 100%)
  cParcela: { width: "8%" },
  cTipo: { width: "9%" },
  cVenc: { width: "12%" },
  cOrig: { width: "14%", textAlign: "right" as const },
  cPago: { width: "14%", textAlign: "right" as const },
  cSaldo: { width: "14%", textAlign: "right" as const },
  cStatus: { width: "13%", paddingLeft: 8 },
  cPgto: { width: "16%", paddingLeft: 8 },
  // Status pill badges
  badgePago: { backgroundColor: "#D1FAE5", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start" as const },
  badgePagoText: { fontFamily: "Helvetica-Bold", fontSize: 6, color: "#059669" },
  badgeParcial: { backgroundColor: "#E0F2FE", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start" as const },
  badgeParcialText: { fontFamily: "Helvetica-Bold", fontSize: 6, color: "#0369A1" },
  badgeBoleto: { backgroundColor: "#FEF3C7", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start" as const },
  badgeBoletoText: { fontFamily: "Helvetica-Bold", fontSize: 6, color: "#D97706" },
  badgeAberto: { backgroundColor: "#F5F5F4", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start" as const },
  badgeAbertoText: { fontFamily: "Helvetica-Bold", fontSize: 6, color: GRAY },
  badgeRenegociada: { backgroundColor: "#EDE9FE", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start" as const },
  badgeRenegociadaText: { fontFamily: "Helvetica-Bold", fontSize: 6, color: "#6D28D9" },
  notaBox: { marginTop: 10, padding: 8, backgroundColor: LIGHT, borderRadius: 4 },
  notaText: { fontSize: 7, color: GRAY, lineHeight: 1.5 },
  // ── Summary
  summaryRow: {
    flexDirection: "row",
    marginTop: 12,
  },
  summaryBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    borderRadius: 5,
    padding: 10,
    marginRight: 8,
  },
  summaryBoxDark: {
    backgroundColor: DARK,
    borderColor: DARK,
  },
  summaryBoxLast: {
    marginRight: 0,
  },
  summaryLabel: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    color: GRAY,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryLabelLight: {
    color: "#A8A29E",
  },
  summaryValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: DARK,
  },
  summaryValueLight: {
    color: "#FFFFFF",
  },
  // ── Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    borderTopStyle: "solid",
    paddingTop: 6,
  },
  footerText: {
    fontSize: 6,
    color: GRAY,
  },
})

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
}

const COND: Record<string, string> = {
  AT: "À Vista",
  PI: "Entrada",
  PM: "Parcela",
  CH: "Chave",
}

interface ExtratoPDFProps {
  obraName: string
  clienteName: string
  clienteCpf: string | null
  installments: FormattedInstallment[]
  de?: string
  ate?: string
  geradoEm: string
}

export function ExtratoPDF({
  obraName,
  clienteName,
  clienteCpf,
  installments,
  de,
  ate,
  geradoEm,
}: ExtratoPDFProps) {
  // Total pago = baixas em dinheiro, inclusive as parciais de parcelas em
  // aberto. Baixa que não é pagamento (reparcelamento, distrato, cancelamento…)
  // não entra: já foi filtrada em getFinancialStatement.
  const totalPago = installments.reduce((sum, i) => sum + (i.receiptValue ?? 0), 0)

  // PARCIAL, BOLETO_GERADO e EM_ABERTO somados como "Em aberto" (total ainda
  // devido). RENEGOCIADA vale 0 — a parcela foi baixada sem pagamento.
  const totalAberto = installments.reduce((sum, i) => sum + getOpenBalance(i), 0)

  const semPagamento = installments.filter((i) => i.status === "RENEGOCIADA").length

  const periodoLabel =
    de && ate
      ? `${fmtDate(de)} a ${fmtDate(ate)}`
      : de
        ? `A partir de ${fmtDate(de)}`
        : ate
          ? `Até ${fmtDate(ate)}`
          : "Todas as parcelas"

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Extrato de Cliente</Text>
            <Text style={s.headerSub}>{obraName}</Text>
          </View>
          <Text style={s.headerDate}>Gerado em {geradoEm}</Text>
        </View>

        {/* Info row */}
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Cliente</Text>
            <Text style={s.infoValue}>{clienteName}</Text>
            {clienteCpf ? <Text style={s.infoValueSm}>CPF: {clienteCpf}</Text> : null}
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Empreendimento</Text>
            <Text style={s.infoValue}>{obraName}</Text>
          </View>
          <View style={[s.infoBox, s.infoBoxLast]}>
            <Text style={s.infoLabel}>Período</Text>
            <Text style={s.infoValue}>{periodoLabel}</Text>
            <Text style={s.infoValueSm}>
              {installments.length} parcela{installments.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        {/* Table header */}
        <View style={s.tableHead}>
          <Text style={[s.tableHeadCell, s.cParcela]}>Parcela</Text>
          <Text style={[s.tableHeadCell, s.cTipo]}>Tipo</Text>
          <Text style={[s.tableHeadCell, s.cVenc]}>Vencimento</Text>
          <Text style={[s.tableHeadCell, s.cOrig]}>Valor Original</Text>
          <Text style={[s.tableHeadCell, s.cPago]}>Pago</Text>
          <Text style={[s.tableHeadCell, s.cSaldo]}>Saldo</Text>
          <Text style={[s.tableHeadCell, s.cStatus]}>Status</Text>
          <Text style={[s.tableHeadCell, s.cPgto]}>Dt. Pagamento</Text>
        </View>

        {/* Table rows */}
        {installments.map((inst, idx) => {
          const pago = inst.receiptValue ?? 0
          const saldo = getOpenBalance(inst)

          return (
            <View key={`${inst.billReceivableId}-${inst.installmentId}`}>
              <View style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.cell, s.cParcela]}>{inst.installmentNumber}</Text>
                <Text style={[s.cellGray, s.cTipo]}>{COND[inst.conditionType] ?? inst.conditionType}</Text>
                <Text style={[s.cell, s.cVenc]}>{fmtDate(inst.dueDate)}</Text>
                <Text style={[s.cell, s.cOrig]}>{fmtCurrency(inst.originalValue)}</Text>
                <Text style={[s.cell, s.cPago]}>{pago > 0 ? fmtCurrency(pago) : "—"}</Text>
                <Text style={[s.cell, s.cSaldo]}>{fmtCurrency(saldo)}</Text>
                <View style={s.cStatus}>
                  {inst.status === "PAGO" ? (
                    <View style={s.badgePago}><Text style={s.badgePagoText}>Pago</Text></View>
                  ) : inst.status === "PARCIAL" ? (
                    <View style={s.badgeParcial}><Text style={s.badgeParcialText}>Parcial</Text></View>
                  ) : inst.status === "RENEGOCIADA" ? (
                    <View style={s.badgeRenegociada}><Text style={s.badgeRenegociadaText}>{getNonCashLabel(inst)}</Text></View>
                  ) : inst.status === "BOLETO_GERADO" ? (
                    <View style={s.badgeBoleto}><Text style={s.badgeBoletoText}>Boleto</Text></View>
                  ) : (
                    <View style={s.badgeAberto}><Text style={s.badgeAbertoText}>Em aberto</Text></View>
                  )}
                </View>
                <Text style={[s.cellGray, s.cPgto]}>
                  {inst.receiptDate ? fmtDate(inst.receiptDate) : "—"}
                </Text>
              </View>
              {/* Baixas por dia — valor alinhado sob a coluna Pago (Story 75-284/285) */}
              {inst.receipts.length > 1 &&
                inst.receipts.map((r, ri) => (
                  <View key={ri} style={s.receiptRow}>
                    <Text style={[s.receiptText, { width: "43%" }]}>
                      Baixa {ri + 1} de {inst.receipts.length} — {fmtDate(r.receiptDate)}
                    </Text>
                    <Text style={[s.receiptText, { width: "14%", textAlign: "right" }]}>
                      {fmtCurrency(r.receiptValue)}
                    </Text>
                    <Text style={{ width: "43%" }} />
                  </View>
                ))}
            </View>
          )
        })}

        {/* Summary */}
        <View style={s.summaryRow}>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Total Pago</Text>
            <Text style={s.summaryValue}>{fmtCurrency(totalPago)}</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Total em Aberto</Text>
            <Text style={s.summaryValue}>{fmtCurrency(totalAberto)}</Text>
          </View>
          <View style={[s.summaryBox, s.summaryBoxDark, s.summaryBoxLast]}>
            <Text style={[s.summaryLabel, s.summaryLabelLight]}>Total Geral</Text>
            <Text style={[s.summaryValue, s.summaryValueLight]}>
              {fmtCurrency(totalPago + totalAberto)}
            </Text>
          </View>
        </View>

        {/* Nota das baixas sem pagamento — explica por que parcelas aparecem sem valor pago */}
        {semPagamento > 0 && (
          <View style={s.notaBox}>
            <Text style={s.notaText}>
              {semPagamento === 1
                ? "1 parcela foi baixada sem pagamento"
                : `${semPagamento} parcelas foram baixadas sem pagamento`}
              : são baixas que o Sienge registra sem entrada de dinheiro — renegociação,
              substituição, cancelamento, distrato ou adiantamento. Elas não entram no
              total pago nem no total em aberto para não contar a mesma dívida duas vezes.
            </Text>
          </View>
        )}

        {/* Footer (fixed on every page) */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Documento gerado automaticamente — não possui validade jurídica sem assinatura.
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
