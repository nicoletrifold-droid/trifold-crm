/**
 * Identificador estável do visitante, usado como `external_id` nos eventos Meta.
 *
 * [Story 86-9 — AC2]
 *
 * O `external_id` é a chave de correspondência de maior impacto no EMQ, mas o
 * `lead_id` do CRM só existe depois que a pessoa dá nome e telefone. Sem um id
 * próprio, os eventos de topo de funil (`ViewContent`, `InitiateCheckout`)
 * sairiam sem `external_id` nenhum, e o Meta não teria como ligá-los ao `Lead`
 * que vem depois — a mesma sessão viraria dois desconhecidos.
 *
 * Este módulo resolve isso: um UUID gerado na primeira visita e reusado em todos
 * os eventos. Quando o lead nasce, os dois ids viajam JUNTOS no `external_id`
 * (ver `buildCapiUserData`), costurando o funil inteiro.
 */

const STORAGE_KEY = 'trifold_visitor_id'

/**
 * Fallback em memória para navegação anônima / storage bloqueado. Vale enquanto
 * a aba viver — o suficiente para costurar os eventos de UMA sessão de
 * preenchimento, que é exatamente o caso de uso.
 */
let memoryFallback: string | null = null

function novoId(): string {
  // `crypto.randomUUID` exige contexto seguro (https), o que é sempre o caso em
  // produção. O fallback cobre http://localhost em navegadores antigos.
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // segue para o fallback
  }
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Devolve o id do visitante, criando-o na primeira chamada.
 *
 * Nunca lança: qualquer falha de storage cai no fallback em memória. No
 * servidor (sem `window`) devolve string vazia — o chamador omite o campo.
 */
export function getVisitorId(): string {
  if (typeof window === 'undefined') return ''

  try {
    const existente = window.localStorage.getItem(STORAGE_KEY)
    if (existente) return existente
    const id = novoId()
    window.localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    // Navegação anônima, storage cheio ou bloqueado por política do navegador.
    memoryFallback ??= novoId()
    return memoryFallback
  }
}
