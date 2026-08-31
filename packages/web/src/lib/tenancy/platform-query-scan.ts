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
 *
 * ⚠️ ESTE ARQUIVO TEM **DOIS** DETECTORES, e é de propósito (Story 900-42a / SEC-001).
 * `detectRawTableReads` cobre `.from(<literal>)`; `detectEmbeddedTableReads` cobre o
 * aninhamento do PostgREST, que vaza linhas de outra tabela SEM emitir `.from()` nenhum e por
 * isso era invisível para este arquivo inteiro. Enquanto só o primeiro existia, o comentário
 * acima afirmava uma fronteira que o código não media. Quem varrer os diretórios de plataforma
 * precisa chamar OS DOIS — um só não é "a segunda rede", é metade dela.
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

/**
 * Story 900-42a (SEC-001) — a MESMA rede, para o segundo mecanismo de vazamento.
 *
 * `detectRawTableReads` acima procura `.from(<literal>)`. Embedding do PostgREST nunca emite
 * `.from()`: `platformQuery("organizations", "id, leads(name, phone)")` devolve linhas de
 * `leads` porque o servidor resolve a FK `org_id` sozinho. Medido contra `trifold-crm-dev` em
 * 2026-08-31: HTTP 200, 6 linhas de `leads` aninhadas, todas com `phone` não-nulo. Ou seja: até
 * esta story, a "segunda rede" vigiava uma forma de vazamento e era **cega** para a outra —
 * enquanto o comentário de topo dizia que garantia que "nenhuma leitura crua sobrevive".
 *
 * COMO A DETECÇÃO FUNCIONA, e por que não é um parser: `[^)]*` para no PRIMEIRO `)`. Numa
 * chamada limpa esse `)` é o fecha-parênteses da própria chamada, e o grupo capturado é a lista
 * de argumentos inteira, sem `(`. Numa chamada com embedding, o primeiro `)` é o do
 * aninhamento — então o grupo capturado carrega o `(` que o abriu. A presença do `(` no grupo
 * É o sinal. Nenhuma sintaxe do PostgREST precisa ser entendida.
 *
 * LIMITE CONHECIDO, e é de propósito: `platformQuery(tabela, colunas)` com `colunas` vindo de
 * VARIÁVEL não acende aqui — o texto-fonte não tem `(` nenhum. Esse caso é coberto pela outra
 * rede, a de RUNTIME (`platformQuery()` inspeciona o valor, não o literal), que é justamente
 * o que a 900-42a fechou. As duas redes cobrem formas diferentes de propósito; nenhuma delas
 * sozinha é suficiente, e é por isso que esta função existe além daquela checagem.
 *
 * Falso positivo conhecido e ACEITO, igual ao detector acima: um `platformQuery(` dentro de
 * comentário ou template string acende. Falha na direção segura. O conserto é reescrever o
 * comentário, nunca afrouxar a régua.
 */
export function detectEmbeddedTableReads(source: string): string[] {
  const pattern = /(?:platformQuery|\.\s*select)\(([^)]*)/g
  const hits: string[] = []
  for (const match of source.matchAll(pattern)) {
    // O grupo 1 não é opcional no padrão: se houve casamento, o texto capturado existe.
    const argumentos = match[1] as string
    if (argumentos.includes("(")) hits.push(argumentos.trim())
  }
  return hits
}
