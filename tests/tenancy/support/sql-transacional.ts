/**
 * Story 900-51 — o transporte dos carrascos da Camada B.
 *
 * ## Por que Management API e não PostgREST
 *
 * Os seis carrascos que o `@po` exigiu precisam de **controle de transação**: "apague a linha e
 * chame a RPC", "grave um segredo e confira que ele NÃO promoveu o status", "trunque a tabela de
 * auditoria" — nada disso pode deixar resíduo num banco compartilhado, e nada disso é expressável
 * pelo PostgREST, que não tem `BEGIN`/`ROLLBACK`. `consultarCatalogo` (da 900-25) já é o único
 * transporte deste repositório capaz de rodar SQL arbitrário contra o projeto, e ele passa por
 * `confirmarDestinoDeTeste()` — ou seja, a mesma allowlist de refs que protege o resto da suíte
 * protege estes blocos.
 *
 * ## Por que cada bloco coleta em tabela temporária em vez de simplesmente lançar
 *
 * Um carrasco cujo sucesso é "a chamada levantou exceção" não pode usar a exceção como transporte:
 * a Management API devolve `ok:false` e o corpo do erro TRUNCADO em 800 caracteres, e o `ROLLBACK`
 * do fim do bloco nunca roda. Coletando `SQLSTATE` numa temp table, a transação chega inteira ao
 * `ROLLBACK` e o teste recebe os códigos de TODOS os cenários — inclusive os que deveriam ter
 * levantado e não levantaram, que é o caso que interessa.
 */
import { consultarCatalogo } from "./ambiente"

/**
 * Roda `BEGIN … ROLLBACK` com o corpo dado e devolve o mapa `k → v` coletado em `_res`.
 *
 * O corpo recebe uma temp table `_res(k text, v text)` já criada e já com `GRANT ALL` para
 * `service_role` — sem o grant, um bloco que faz `SET LOCAL ROLE service_role` não consegue
 * escrever o próprio resultado, e o sintoma (`42501: permission denied for table _res`) parece um
 * achado sobre a tabela sob teste.
 */
export async function rodarBlocoTransacional(corpo: string): Promise<Record<string, string>> {
  const sql = `
BEGIN;
CREATE TEMP TABLE _res(k text, v text) ON COMMIT DROP;
GRANT ALL ON _res TO service_role;
${corpo}
SELECT k, v FROM _res ORDER BY k;
ROLLBACK;
`
  const linhas = await consultarCatalogo<{ k: string; v: string }>(sql)
  const mapa: Record<string, string> = {}
  for (const l of linhas) mapa[l.k] = l.v
  return mapa
}

/**
 * Guarda de vivacidade do próprio transporte.
 *
 * Um bloco que falhe silenciosamente (ou uma condição que nunca execute) produziria um mapa vazio,
 * e `expect(mapa.x).toBe(undefined)` ficaria verde em vários carrascos ao mesmo tempo. Esta função
 * transforma "a chave não veio" em falha NOMEADA, com o mapa inteiro no texto.
 */
export function exigir(mapa: Record<string, string>, chave: string): string {
  const v = mapa[chave]
  if (v === undefined) {
    throw new Error(
      `carrasco: a chave "${chave}" não foi produzida pelo bloco SQL — o cenário não rodou. ` +
        `Chaves recebidas: ${JSON.stringify(Object.keys(mapa))}`,
    )
  }
  return v
}
