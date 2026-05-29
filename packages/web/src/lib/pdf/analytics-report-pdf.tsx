import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"

const BRAND = "#EA580C"
const DARK = "#1C1917"
const GRAY = "#78716C"
const LIGHT = "#F5F5F4"
const BORDER = "#E7E5E4"

export interface AnalyticsReportData {
  generatedAt: string
  weekRange: string
  totalLeads: number
  leadsToday: number
  leadsWeek: number
  leadsMonth: number
  stages: { name: string; color: string; count: number }[]
  properties: { name: string; count: number }[]
  sources: { label: string; count: number }[]
  brokers: { name: string; count: number }[]
  lostReasons: { reason: string; count: number }[]
}

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
  headerTitle: { fontFamily: "Helvetica-Bold", fontSize: 16, color: DARK },
  headerSub: { fontSize: 8, color: GRAY, marginTop: 2 },
  headerDate: { fontSize: 7, color: GRAY, textAlign: "right" },

  cardsRow: { flexDirection: "row", marginBottom: 16 },
  card: { flex: 1, backgroundColor: LIGHT, borderRadius: 4, padding: 10, marginRight: 8 },
  cardLast: { flex: 1, backgroundColor: LIGHT, borderRadius: 4, padding: 10 },
  cardLabel: { fontSize: 7, color: GRAY, marginBottom: 4 },
  cardValueDefault: { fontFamily: "Helvetica-Bold", fontSize: 20, color: DARK },
  cardValueBlue: { fontFamily: "Helvetica-Bold", fontSize: 20, color: "#2563EB" },
  cardValueOrange: { fontFamily: "Helvetica-Bold", fontSize: 20, color: BRAND },
  cardValueGreen: { fontFamily: "Helvetica-Bold", fontSize: 20, color: "#16A34A" },

  section: { marginBottom: 12, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 10 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 10, color: DARK, marginBottom: 8 },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  rowLabel: { fontSize: 8, color: GRAY, flex: 1, paddingRight: 8 },
  rowValue: { fontFamily: "Helvetica-Bold", fontSize: 8, color: DARK },

  cols2: { flexDirection: "row", marginBottom: 12 },
  colLeft: { flex: 1, marginRight: 6, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 10 },
  colRight: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 10 },
  cols2Last: { flexDirection: "row" },
  colLeftLast: { flex: 1, marginRight: 6, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 10 },
  colRightLast: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 10 },

  funnelRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  funnelLabel: { width: 90, fontSize: 7, color: GRAY },
  funnelBarBg: { flex: 1, height: 8, backgroundColor: BORDER, borderRadius: 2 },
  funnelBarFill: { height: 8, borderRadius: 2 },
  funnelCount: { width: 24, fontSize: 7, fontFamily: "Helvetica-Bold", color: DARK, textAlign: "right", marginLeft: 4 },
  noData: { fontSize: 8, color: GRAY },
})

export function AnalyticsReportPDF({ data }: { data: AnalyticsReportData }) {
  const maxCount = Math.max(...data.stages.map((st) => st.count), 1)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Relatório de Analytics</Text>
            <Text style={s.headerSub}>Trifold CRM · {data.weekRange}</Text>
          </View>
          <Text style={s.headerDate}>Gerado em {data.generatedAt}</Text>
        </View>

        {/* Metric cards */}
        <View style={s.cardsRow}>
          <View style={s.card}>
            <Text style={s.cardLabel}>Total de Leads</Text>
            <Text style={s.cardValueDefault}>{data.totalLeads}</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>Esta Semana</Text>
            <Text style={s.cardValueBlue}>{data.leadsWeek}</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>Este Mês</Text>
            <Text style={s.cardValueOrange}>{data.leadsMonth}</Text>
          </View>
          <View style={s.cardLast}>
            <Text style={s.cardLabel}>Hoje</Text>
            <Text style={s.cardValueGreen}>{data.leadsToday}</Text>
          </View>
        </View>

        {/* Funnel */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Funil de Conversão (mês atual)</Text>
          {data.stages.map((stage, i) => (
            <View key={i} style={s.funnelRow}>
              <Text style={s.funnelLabel}>{stage.name}</Text>
              <View style={s.funnelBarBg}>
                {stage.count > 0 && (
                  <View
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    style={{ ...s.funnelBarFill, width: `${Math.max((stage.count / maxCount) * 100, 2)}%` as any, backgroundColor: stage.color || BRAND } as any}
                  />
                )}
              </View>
              <Text style={s.funnelCount}>{stage.count}</Text>
            </View>
          ))}
          {data.stages.length === 0 && <Text style={s.noData}>Sem dados de funil</Text>}
        </View>

        {/* 2 columns: Properties | Sources */}
        <View style={s.cols2}>
          <View style={s.colLeft}>
            <Text style={s.sectionTitle}>Por Empreendimento</Text>
            {data.properties.map((p, i) => (
              <View key={i} style={i === data.properties.length - 1 ? s.tableRowLast : s.tableRow}>
                <Text style={s.rowLabel}>{p.name}</Text>
                <Text style={s.rowValue}>{p.count}</Text>
              </View>
            ))}
            {data.properties.length === 0 && <Text style={s.noData}>Sem dados</Text>}
          </View>
          <View style={s.colRight}>
            <Text style={s.sectionTitle}>Origens (mês)</Text>
            {data.sources.map((src, i) => (
              <View key={i} style={i === data.sources.length - 1 ? s.tableRowLast : s.tableRow}>
                <Text style={s.rowLabel}>{src.label}</Text>
                <Text style={s.rowValue}>{src.count}</Text>
              </View>
            ))}
            {data.sources.length === 0 && <Text style={s.noData}>Sem dados</Text>}
          </View>
        </View>

        {/* 2 columns: Brokers | Lost Reasons */}
        <View style={s.cols2Last}>
          <View style={s.colLeftLast}>
            <Text style={s.sectionTitle}>Performance por Corretor</Text>
            {data.brokers.map((b, i) => (
              <View key={i} style={i === data.brokers.length - 1 ? s.tableRowLast : s.tableRow}>
                <Text style={s.rowLabel}>{b.name}</Text>
                <Text style={s.rowValue}>{b.count} leads</Text>
              </View>
            ))}
            {data.brokers.length === 0 && <Text style={s.noData}>Nenhum corretor</Text>}
          </View>
          <View style={s.colRightLast}>
            <Text style={s.sectionTitle}>Motivos de Perda</Text>
            {data.lostReasons.map((r, i) => (
              <View key={i} style={i === data.lostReasons.length - 1 ? s.tableRowLast : s.tableRow}>
                <Text style={s.rowLabel}>{r.reason}</Text>
                <Text style={s.rowValue}>{r.count}</Text>
              </View>
            ))}
            {data.lostReasons.length === 0 && <Text style={s.noData}>Sem perdas registradas</Text>}
          </View>
        </View>
      </Page>
    </Document>
  )
}
