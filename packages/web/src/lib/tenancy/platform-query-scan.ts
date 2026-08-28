/**
 * Story 900-22b (Epic 900, Onda 2) — detector estático de leitura crua de tabela.
 *
 * A regra é **"qualquer `.from(<literal>)` chamado sobre algo que não seja `Buffer` ou
 * `Array`"** — não "tabela fora da lista". A lista fechada é aplicada em RUNTIME por
 * `platformQuery()`; este detector é a segunda rede, que garante que nenhum `.from()` cru
 * sobrevive dentro de `app/platform/**` e `app/api/platform/**`. Depois da migração da
 * `orgs/page.tsx`, o único caminho sancionado (`platformQuery`) nunca emite um literal nesses
 * diretórios — logo zero ocorrências é o estado correto, e o detector não precisa (nem pode)
 * diferenciar tabela permitida de proibida no nível do texto-fonte.
 *
 * O receiver é tratado POR EXCLUSÃO, não por adjacência ao ponto. Uma versão anterior desta
 * story usava `(\w+)\.from\(`, exigindo o identificador coladinho — cego para a forma que o
 * Prettier produz em query encadeada (`await db` ⏎ `.from("x")`, 1.511 das 1.768 ocorrências
 * reais em `packages/web/src`) e para receiver-chamada (`createAdminClient().from("x")`).
 * Medido contra o código real antes de fixar esta versão.
 *
 * Falso positivo conhecido e ACEITO: a chamada acende mesmo dentro de comentário ou de
 * template string. Isso falha na direção segura — deixa o teste VERMELHO com o código certo
 * (ruído visível e autocorretivo), nunca verde com o código errado. Se acontecer, o conserto
 * é reescrever o comentário, nunca afrouxar as exclusões do teste de varredura.
 */

/**
 * Devolve os nomes de tabela lidos cruamente no fonte, na ordem em que aparecem.
 * Fonte limpa ⇒ `[]`.
 */
export function detectRawTableReads(source: string): string[] {
  const pattern = /(?:^|[^\w$])(\w*)\s*\.\s*from\(\s*["']([a-zA-Z_]\w*)["']\s*\)/g
  const hits: string[] = []
  for (const match of source.matchAll(pattern)) {
    const receiver = match[1]
    // O grupo 2 não é opcional no padrão: se houve casamento, o nome da tabela existe.
    const table = match[2] as string
    // Homônimos da stdlib: `Buffer.from(...)` e `Array.from(...)` não são acesso a banco.
    if (receiver === "Buffer" || receiver === "Array") continue
    hits.push(table)
  }
  return hits
}
