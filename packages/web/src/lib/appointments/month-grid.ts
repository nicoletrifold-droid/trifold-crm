// Story 75-335 (Epic 89) — a grade mensal do calendário público.
//
// Pedido do Marcos: apresentar a agenda como o Calendly — mês em grade, clicar
// no dia, horários ao lado. Antes era uma fileira de chips com os próximos dias
// abertos, que não dá noção de calendário.
//
// A conta de calendário (em que coluna cai o dia 1, quantas semanas o mês tem,
// quais dias estão disponíveis) é pura e mora aqui: o projeto não tem jsdom, e
// erro de calendário é do tipo que só aparece no dia 31.

export interface CelulaDoMes {
  /** `YYYY-MM-DD` no fuso da org, ou null para preenchimento antes/depois do mês. */
  date: string | null
  dia: number | null
  /** Tem horário oferecido neste dia. */
  disponivel: boolean
}

/** Segunda a domingo — como o Calendly e como o brasileiro lê calendário. */
export const DIAS_DA_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

export function nomeDoMes(ano: number, mes: number): string {
  return `${MESES[mes - 1]} de ${ano}`
}

/** `YYYY-MM` de uma data `YYYY-MM-DD`. */
export function mesDaData(date: string): string {
  return date.slice(0, 7)
}

/**
 * Os meses que têm ao menos um dia disponível, em ordem.
 *
 * O horizonte da agenda é de 14 dias (`buildDayOptions`), então normalmente há
 * um ou dois meses. Navegar para além disso mostraria um mês inteiro cinza — daí
 * a navegação ser limitada a esta lista em vez de livre.
 */
export function mesesDisponiveis(datas: string[]): string[] {
  const meses = [...new Set(datas.map(mesDaData))]
  return meses.sort()
}

/**
 * Monta a grade de um mês: semanas de 7 células, começando na segunda.
 *
 * Células fora do mês vêm com `date: null` para a tela renderizar vazio — em vez
 * de mostrar dias do mês vizinho, que confundem quem está escolhendo data.
 */
export function gradeDoMes(params: {
  /** `YYYY-MM` */
  mes: string
  /** Datas `YYYY-MM-DD` com horário livre. */
  disponiveis: string[]
}): CelulaDoMes[][] {
  const [anoStr, mesStr] = params.mes.split("-")
  const ano = Number(anoStr)
  const mesNum = Number(mesStr)
  if (!ano || !mesNum || mesNum < 1 || mesNum > 12) return []

  const set = new Set(params.disponiveis)

  // Date.UTC evita que o fuso do NAVEGADOR mude o dia — a grade é sobre o
  // calendário do fuso da org, que já veio resolvido nas datas.
  const primeiro = new Date(Date.UTC(ano, mesNum - 1, 1))
  const diasNoMes = new Date(Date.UTC(ano, mesNum, 0)).getUTCDate()

  // getUTCDay: 0=domingo. A grade começa na segunda, então domingo vira 6.
  const dowPrimeiro = (primeiro.getUTCDay() + 6) % 7

  const celulas: CelulaDoMes[] = []
  for (let i = 0; i < dowPrimeiro; i++) celulas.push({ date: null, dia: null, disponivel: false })
  for (let d = 1; d <= diasNoMes; d++) {
    const date = `${ano}-${String(mesNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    celulas.push({ date, dia: d, disponivel: set.has(date) })
  }
  while (celulas.length % 7 !== 0) celulas.push({ date: null, dia: null, disponivel: false })

  const semanas: CelulaDoMes[][] = []
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))
  return semanas
}

/** Rótulo longo do dia escolhido, para o painel de horários. */
export function rotuloDoDia(date: string): string {
  const [a, m, d] = date.split("-").map(Number)
  if (!a || !m || !d) return date
  const dt = new Date(Date.UTC(a, m - 1, d))
  const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(dt)
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${d} de ${MESES[m - 1]}`
}
