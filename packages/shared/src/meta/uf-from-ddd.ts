/**
 * Deriva a UF a partir do DDD de um telefone brasileiro já normalizado.
 *
 * [Story 86-9 — AC7]
 *
 * ⚠️ POR QUE SÓ A UF, E NUNCA A CIDADE
 *
 * O DDD determina a UF de forma 1:1 (44 → PR). A CIDADE, não: o DDD 44 cobre
 * Maringá, Umuarama, Campo Mourão e dezenas de municípios. Inferir `ct` a partir
 * do DDD não é um palpite inofensivo — o Meta compara o hash recebido com o que
 * ele conhece do usuário, e um hash que não casa conta como chave COBERTA e NÃO
 * correspondida. Ou seja: mandar cidade inferida **derruba** a nota de
 * correspondência (EMQ) em vez de subir.
 *
 * Por isso este módulo expõe apenas `ufFromDDD`. Não adicione `cidadeFromDDD`.
 */

/**
 * DDD → sigla da UF. Fonte: Plano Nacional de Numeração (Anatel).
 * Os DDDs não listados (ex.: 20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56-60,
 * 70, 72, 76, 78, 80, 90) não existem no plano — `ufFromDDD` devolve `null`.
 */
const DDD_TO_UF: Readonly<Record<string, string>> = {
  // Sudeste
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP',
  '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ',
  '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG',
  '37': 'MG', '38': 'MG',
  // Sul
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC',
  '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  // Centro-Oeste
  '61': 'DF',
  '62': 'GO', '64': 'GO',
  '63': 'TO',
  '65': 'MT', '66': 'MT',
  '67': 'MS',
  // Norte
  '68': 'AC',
  '69': 'RO',
  '91': 'PA', '93': 'PA', '94': 'PA',
  '92': 'AM', '97': 'AM',
  '95': 'RR',
  '96': 'AP',
  // Nordeste
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
  '79': 'SE',
  '81': 'PE', '87': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE', '88': 'CE',
  '86': 'PI', '89': 'PI',
  '98': 'MA', '99': 'MA',
}

/**
 * Extrai a UF de um telefone brasileiro.
 *
 * Aceita o formato canônico de `normalizePhoneBR` (`55DD9NNNNNNNN`) e também
 * entradas cruas com máscara — a extração é feita só sobre os dígitos.
 *
 * @param phone telefone em qualquer formato, ou `null`/`undefined`
 * @returns sigla da UF em MAIÚSCULAS (ex.: `'PR'`), ou `null` quando não é um
 *          telefone brasileiro reconhecível ou o DDD não existe no plano.
 *
 * @example
 *   ufFromDDD('5544997344650') // 'PR'
 *   ufFromDDD('(44) 99734-4650') // 'PR'
 *   ufFromDDD('5511999999999') // 'SP'
 *   ufFromDDD('5520999999999') // null — DDD 20 não existe
 *   ufFromDDD('1234567890')    // null — não é BR (sem DDI 55)
 */
export function ufFromDDD(phone: string | null | undefined): string | null {
  if (!phone) return null

  const digits = phone.replace(/\D/g, '')

  // Telefone BR canônico: 55 + DDD (2) + assinante (8 ou 9) = 12 ou 13 dígitos.
  // Só lemos o DDD quando o DDI 55 está presente: sem ele não há como saber se
  // os dois primeiros dígitos são um DDD ou o começo de um número estrangeiro.
  if (!digits.startsWith('55')) return null
  if (digits.length !== 12 && digits.length !== 13) return null

  const ddd = digits.slice(2, 4)
  return DDD_TO_UF[ddd] ?? null
}
