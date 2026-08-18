// Story 75-338 (Epic 89) — máscara de telefone do formulário público.
//
// Pedido do Marcos: "no telefone está texto livre, já coloque no formato
// correto de telefone" + campo de DDI com Brasil pré-preenchido.
//
// A conta é pura e mora aqui: onde entra o parêntese, quando o nono dígito
// aparece, quantos dígitos cabem. Erro de máscara é do tipo que só se vê
// digitando — e o projeto não tem jsdom.

export interface Ddi {
  codigo: string
  pais: string
  bandeira: string
  /** Dígitos do número nacional, sem DDI. Brasil: 10 (fixo) ou 11 (celular). */
  maxDigitos: number
}

/**
 * Lista curta de propósito: um seletor com 200 países numa tela de captação é
 * atrito. Brasil primeiro, e os que aparecem de fato em lead de imóvel em
 * Maringá (fronteira, comunidade e investidor de fora).
 */
export const DDIS: Ddi[] = [
  { codigo: "55", pais: "Brasil", bandeira: "🇧🇷", maxDigitos: 11 },
  { codigo: "1", pais: "EUA / Canadá", bandeira: "🇺🇸", maxDigitos: 10 },
  { codigo: "351", pais: "Portugal", bandeira: "🇵🇹", maxDigitos: 9 },
  { codigo: "595", pais: "Paraguai", bandeira: "🇵🇾", maxDigitos: 9 },
  { codigo: "54", pais: "Argentina", bandeira: "🇦🇷", maxDigitos: 10 },
  { codigo: "598", pais: "Uruguai", bandeira: "🇺🇾", maxDigitos: 8 },
]

export const DDI_PADRAO = "55"

export function ddiPorCodigo(codigo: string): Ddi {
  return DDIS.find((d) => d.codigo === codigo) ?? DDIS[0]!
}

/** Só os dígitos, cortados no máximo do país. */
export function apenasDigitos(raw: string, max: number): string {
  return raw.replace(/\D/g, "").slice(0, max)
}

/**
 * Máscara brasileira, progressiva — formata enquanto a pessoa digita, sem
 * esperar o número ficar completo:
 *   4        → (44
 *   449      → (44) 9
 *   44999999 → (44) 9999-9999      ← 10 dígitos: fixo
 *   449999999 → (44) 99999-999     ← 11 dígitos: celular, o 9º dígito empurra
 *
 * Fixo e celular só se distinguem no 11º dígito, então a quebra do hífen muda
 * de posição no fim. Formatar antes disso deixaria o fixo com hífen no lugar
 * errado durante a digitação.
 */
export function formatarTelefoneBR(raw: string): string {
  const d = apenasDigitos(raw, 11)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const resto = d.slice(2)
  if (resto.length <= 4) return `(${ddd}) ${resto}`
  // ≤ 10 dígitos totais = fixo (4+4); 11 = celular (5+4).
  const corte = d.length <= 10 ? 4 : 5
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`
}

/** Fora do Brasil não inventamos formato: só agrupa em blocos de 3. */
export function formatarTelefoneInternacional(raw: string, max: number): string {
  const d = apenasDigitos(raw, max)
  return d.replace(/(\d{3})(?=\d)/g, "$1 ").trim()
}

export function formatarTelefone(raw: string, ddi: string): string {
  const info = ddiPorCodigo(ddi)
  return info.codigo === "55"
    ? formatarTelefoneBR(raw)
    : formatarTelefoneInternacional(raw, info.maxDigitos)
}

/**
 * O valor gravado: `+DDI` seguido dos dígitos nacionais.
 *
 * `normalizePhoneBR` (que a API usa para achar/criar o lead) descarta tudo que
 * não é dígito, então este formato chega lá como 5544999990000 — exatamente o
 * que ela espera de um número brasileiro. Guardar com o `+` mantém legível na
 * ficha e não atrapalha a normalização.
 */
export function montarTelefone(ddi: string, nacional: string): string {
  const info = ddiPorCodigo(ddi)
  const d = apenasDigitos(nacional, info.maxDigitos)
  return d ? `+${info.codigo} ${formatarTelefone(d, ddi)}` : ""
}

/** Separa um valor já gravado de volta em DDI + nacional (para reabrir o campo). */
export function separarTelefone(valor: string): { ddi: string; nacional: string } {
  const m = /^\+(\d{1,3})\s*(.*)$/.exec(valor.trim())
  if (!m) return { ddi: DDI_PADRAO, nacional: valor }
  const codigo = DDIS.find((d) => d.codigo === m[1])?.codigo ?? DDI_PADRAO
  return { ddi: codigo, nacional: m[2] ?? "" }
}

/** Está completo o bastante para ser um telefone daquele país? */
export function telefoneCompleto(nacional: string, ddi: string): boolean {
  const info = ddiPorCodigo(ddi)
  const d = apenasDigitos(nacional, info.maxDigitos)
  // Brasil aceita 10 (fixo) ou 11 (celular); os demais exigem o comprimento cheio.
  return info.codigo === "55" ? d.length >= 10 : d.length === info.maxDigitos
}
