import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { FormattedInstallment } from "@web/lib/integrations/sienge/types"

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
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: "solid",
    paddingVertical: 6,
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
  // Column widths
  cParcela: { width: "13%" },
  cTipo: { width: "11%" },
  cVenc: { width: "14%" },
  cOrig: { width: "16%", textAlign: "right" as const },
  cSaldo: { width: "16%", textAlign: "right" as const },
  cStatus: { width: "13%" },
  cPgto: { width: "17%" },
  // Status colors
  sPago: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#059669" },
  sBoleto: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#D97706" },
  sAberto: { fontFamily: "Helvetica-Bold", fontSize: 7, color: GRAY },
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
  const totalPago = installments
    .filter((i) => i.status === "PAGO")
    .reduce((sum, i) => sum + (i.receiptValue ?? i.originalValue), 0)

  // BOLETO_GERADO e EM_ABERTO somados como "Em aberto" (total ainda devido)
  const totalAberto = installments
    .filter((i) => i.status !== "PAGO")
    .reduce((sum, i) => sum + (i.currentBalance > 0 ? i.currentBalance : i.originalValue), 0)

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
          <Text style={[s.tableHeadCell, s.cSaldo]}>Saldo/Pago</Text>
          <Text style={[s.tableHeadCell, s.cStatus]}>Status</Text>
          <Text style={[s.tableHeadCell, s.cPgto]}>Dt. Pagamento</Text>
        </View>

        {/* Table rows */}
        {installments.map((inst, idx) => {
          const valor =
            inst.status === "PAGO"
              ? (inst.receiptValue ?? inst.originalValue)
              : inst.currentBalance > 0
                ? inst.currentBalance
                : inst.originalValue

          return (
            <View
              key={`${inst.billReceivableId}-${inst.installmentId}`}
              style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}
            >
              <Text style={[s.cell, s.cParcela]}>{inst.installmentNumber}</Text>
              <Text style={[s.cellGray, s.cTipo]}>{COND[inst.conditionType] ?? inst.conditionType}</Text>
              <Text style={[s.cell, s.cVenc]}>{fmtDate(inst.dueDate)}</Text>
              <Text style={[s.cell, s.cOrig]}>{fmtCurrency(inst.originalValue)}</Text>
              <Text style={[s.cell, s.cSaldo]}>{fmtCurrency(valor)}</Text>
              <View style={s.cStatus}>
                <Text
                  style={
                    inst.status === "PAGO"
                      ? s.sPago
                      : inst.status === "BOLETO_GERADO"
                        ? s.sBoleto
                        : s.sAberto
                  }
                >
                  {inst.status === "PAGO" ? "Pago" : inst.status === "BOLETO_GERADO" ? "Boleto" : "Em aberto"}
                </Text>
              </View>
              <Text style={[s.cellGray, s.cPgto]}>
                {inst.receiptDate ? fmtDate(inst.receiptDate) : "—"}
              </Text>
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
