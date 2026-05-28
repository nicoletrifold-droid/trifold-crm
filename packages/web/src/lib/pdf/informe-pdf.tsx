import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { ComputedInforme } from "@web/lib/integrations/sienge/types"

const BRAND = "#E8856A"
const DARK = "#1C1917"
const GRAY = "#78716C"
const LIGHT = "#F5F5F4"
const BORDER = "#E7E5E4"
const GREEN = "#059669"

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
  headerLeft: {},
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    color: DARK,
  },
  headerSub: {
    fontSize: 8,
    color: GRAY,
    marginTop: 2,
  },
  headerRight: { alignItems: "flex-end" },
  headerDate: { fontSize: 7, color: GRAY },
  // ── Section label
  sectionLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: GRAY,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 14,
  },
  // ── Info row
  infoRow: { flexDirection: "row", marginBottom: 2 },
  infoKey: { fontSize: 8, color: GRAY, width: 140 },
  infoVal: { fontFamily: "Helvetica-Bold", fontSize: 8, color: DARK, flex: 1 },
  // ── Summary boxes
  summaryRow: {
    flexDirection: "row",
    marginTop: 14,
    marginBottom: 14,
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
  summaryBoxGreen: { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" },
  summaryBoxDark: { backgroundColor: DARK, borderColor: DARK },
  summaryBoxLast: { marginRight: 0 },
  summaryLabel: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    color: GRAY,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryLabelGreen: { color: GREEN },
  summaryLabelLight: { color: "#A8A29E" },
  summaryValue: { fontFamily: "Helvetica-Bold", fontSize: 12, color: DARK },
  summaryValueGreen: { color: GREEN },
  summaryValueLight: { color: "#FFFFFF" },
  summaryNote: { fontSize: 6, color: GRAY, marginTop: 2 },
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
  tableRowAlt: { backgroundColor: "#FAFAF9" },
  tableRowTotal: {
    flexDirection: "row",
    backgroundColor: LIGHT,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginTop: 2,
  },
  cell: { fontSize: 8, color: DARK },
  cellBold: { fontFamily: "Helvetica-Bold", fontSize: 8, color: DARK },
  cellGray: { fontSize: 8, color: GRAY },
  cMonth: { width: "22%" },
  cParcelas: { width: "13%" },
  cDescricao: { flex: 1 },
  cValor: { width: "22%", textAlign: "right" as const },
  // ── Note box
  noteBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    borderRadius: 5,
    padding: 10,
    marginTop: 14,
    backgroundColor: LIGHT,
  },
  noteText: { fontSize: 7, color: GRAY, lineHeight: 1.4 },
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
  footerText: { fontSize: 6, color: GRAY },
})

function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

interface InformePDFProps {
  obraName: string
  clienteName: string
  clienteCpf: string | null
  informe: ComputedInforme
  geradoEm: string
}

export function InformePDF({ obraName, clienteName, clienteCpf, informe, geradoEm }: InformePDFProps) {
  const totalRows = informe.monthlyBreakdown.length

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.headerTitle}>Informe de Rendimentos</Text>
            <Text style={s.headerSub}>Ano-Calendário {informe.year} · Para fins de IRPF</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerDate}>Emitido em {geradoEm}</Text>
          </View>
        </View>

        {/* Emitente */}
        <Text style={s.sectionLabel}>Emitente</Text>
        <View style={s.infoRow}>
          <Text style={s.infoKey}>Empreendimento</Text>
          <Text style={s.infoVal}>{obraName}</Text>
        </View>
        {informe.contractNumbers.length > 0 && (
          <View style={s.infoRow}>
            <Text style={s.infoKey}>Contrato(s)</Text>
            <Text style={s.infoVal}>{informe.contractNumbers.join(", ")}</Text>
          </View>
        )}

        {/* Beneficiário */}
        <Text style={s.sectionLabel}>Beneficiário / Declarante</Text>
        <View style={s.infoRow}>
          <Text style={s.infoKey}>Nome</Text>
          <Text style={s.infoVal}>{clienteName}</Text>
        </View>
        {clienteCpf && (
          <View style={s.infoRow}>
            <Text style={s.infoKey}>CPF</Text>
            <Text style={s.infoVal}>{clienteCpf}</Text>
          </View>
        )}

        {/* Resumo */}
        <View style={s.summaryRow}>
          <View style={[s.summaryBox, s.summaryBoxGreen]}>
            <Text style={[s.summaryLabel, s.summaryLabelGreen]}>Pago em {informe.year}</Text>
            <Text style={[s.summaryValue, s.summaryValueGreen]}>
              {fmtCurrency(informe.totalPaidInYear)}
            </Text>
            <Text style={s.summaryNote}>
              {informe.monthlyBreakdown.reduce((n, m) => n + m.installments.length, 0)} parcela(s) quitada(s)
            </Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Total Acumulado Pago</Text>
            <Text style={s.summaryValue}>{fmtCurrency(informe.accumulatedPaid)}</Text>
            <Text style={s.summaryNote}>Todos os anos</Text>
          </View>
          <View style={[s.summaryBox, s.summaryBoxDark, s.summaryBoxLast]}>
            <Text style={[s.summaryLabel, s.summaryLabelLight]}>Saldo Devedor</Text>
            <Text style={[s.summaryValue, s.summaryValueLight]}>
              {fmtCurrency(informe.remainingBalance)}
            </Text>
            <Text style={[s.summaryNote, { color: "#A8A29E" }]}>
              de {fmtCurrency(informe.totalContractValue)} total
            </Text>
          </View>
        </View>

        {/* Tabela mensal */}
        <Text style={s.sectionLabel}>Pagamentos no Ano-Calendário {informe.year}</Text>

        {informe.monthlyBreakdown.length === 0 ? (
          <View style={s.noteBox}>
            <Text style={s.noteText}>
              Não foram registrados pagamentos no ano {informe.year}.
            </Text>
          </View>
        ) : (
          <>
            <View style={s.tableHead}>
              <Text style={[s.tableHeadCell, s.cMonth]}>Mês</Text>
              <Text style={[s.tableHeadCell, s.cParcelas]}>Parcelas</Text>
              <Text style={[s.tableHeadCell, s.cDescricao]}>Datas</Text>
              <Text style={[s.tableHeadCell, s.cValor]}>Valor Pago</Text>
            </View>

            {informe.monthlyBreakdown.map((m, idx) => (
              <View
                key={m.month}
                style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}
              >
                <Text style={[s.cellBold, s.cMonth]}>{m.monthName}</Text>
                <Text style={[s.cellGray, s.cParcelas]}>{m.installments.length}</Text>
                <Text style={[s.cellGray, s.cDescricao]}>
                  {m.installments.map((i) => fmtDate(i.date)).join(", ")}
                </Text>
                <Text style={[s.cellBold, s.cValor]}>{fmtCurrency(m.value)}</Text>
              </View>
            ))}

            <View style={s.tableRowTotal}>
              <Text style={[s.cellBold, s.cMonth]}>TOTAL {informe.year}</Text>
              <Text style={[s.cellGray, s.cParcelas]}>
                {informe.monthlyBreakdown.reduce((n, m) => n + m.installments.length, 0)}
              </Text>
              <Text style={[s.cellGray, s.cDescricao]}></Text>
              <Text style={[s.cellBold, s.cValor]}>{fmtCurrency(informe.totalPaidInYear)}</Text>
            </View>
          </>
        )}

        {/* Nota */}
        <View style={s.noteBox}>
          <Text style={s.noteText}>
            Este informe é gerado com base nos dados registrados no sistema financeiro do empreendimento e
            destina-se à comprovação de pagamentos para fins de Declaração de Imposto de Renda Pessoa Física (IRPF).
            {"\n"}Os valores de "Bens e Direitos" a serem declarados correspondem ao saldo devedor atual (
            {fmtCurrency(informe.remainingBalance)}) ao final do exercício. O valor pago no ano (
            {fmtCurrency(informe.totalPaidInYear)}) deve ser declarado na ficha de Bens e Direitos como
            acréscimo patrimonial. Em caso de dúvidas, consulte seu contador.
            {"\n"}Documento gerado automaticamente — não possui validade jurídica sem assinatura.
            {totalRows > 0 ? ` Fonte: ${informe.source === "sienge" ? "API Sienge" : "Extrato financeiro calculado"}.` : ""}
          </Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Informe de Rendimentos · {obraName} · Ano {informe.year}
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
