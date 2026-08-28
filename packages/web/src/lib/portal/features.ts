/**
 * Feature flags do portal do cliente.
 */

/**
 * Informe de Rendimentos (IRPF).
 *
 * Desligado em 26/08/2026: os valores vindos do Sienge ainda não estão
 * alinhados/conferidos e o documento não pode ser exposto ao cliente enquanto
 * não for confiável.
 *
 * Com `false`, o card no Financeiro aparece desabilitado ("Em breve"), a página
 * `/cliente/[obra_id]/financeiro/informe` mostra o aviso no lugar dos dados e a
 * rota de PDF responde 404. Trocar para `true` reativa os três de uma vez.
 */
export const INFORME_RENDIMENTOS_ENABLED = false
