/**
 * Story 900-63 · AC3/AC4/AC8/AC9 — as decisões do logo da empresa, FORA do componente e FORA da
 * rota.
 *
 * ## Por que este módulo existe
 *
 * `vitest.config.ts` inclui `packages/web/src/**\/*.test.ts` — e **não** `.tsx`. Decisão escrita
 * dentro de um componente é decisão sem carrasco; foi assim que a `900-60` (QA-900-60-1) mediu um
 * `aoFechar()` acrescentado ao ramo de erro deixando `tsc` rc=0 e a suíte INTEIRA verde. Mesmo
 * arranjo de `console-dados-empresa.ts`, pelo mesmo motivo.
 *
 * ## Uma implementação de validação, dois consumidores
 *
 * `validarArquivoDeLogo()` é chamada pela rota (que é a fonte da verdade) **e** pelo componente
 * (para recusar antes do round-trip). Duas implementações divergiriam em silêncio, e o operador
 * veria o arquivo aceito na tela e recusado pelo servidor.
 *
 * ## 🔴 ESTA STORY É A METADE 1 DE 2 (AC0)
 *
 * `organizations.logo_url` tem ZERO consumidores no CRM do cliente. Guardar o arquivo **não muda
 * nada em nenhuma tela** — a exibição é a `900-64`. `AVISO_DE_QUE_ISTO_SO_GUARDA` é a forma disso
 * na tela, e é obrigatória (AC9): sem ela a UI afirmaria um efeito que o levantamento desta story
 * mediu como inexistente.
 */

/**
 * AC1/AC3 — os três tipos aceitos, e a extensão de cada um.
 *
 * **É a MESMA lista do `allowed_mime_types` do bucket** (`254_logo_da_empresa.sql`), e as duas
 * precisam continuar iguais: a do bucket é a segunda rede, a daqui é o erro legível. Sem SVG, de
 * propósito — SVG carrega script embutido e nenhum bucket deste projeto o aceita.
 *
 * A extensão faz parte do caminho no Storage, e é por isso que ela mora aqui e não numa expressão
 * dentro da rota: trocar `jpg` por `jpeg` muda o caminho do objeto e, com ele, quais objetos a
 * purga da AC4 considera "antigos".
 */
export const EXTENSAO_POR_MIME: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

/**
 * AC1/AC3 — 2 MB. Cap de ENGENHARIA declarado como tal, não pedido do dono do produto.
 *
 * Duas redes com o MESMO número: esta (erro legível, antes do upload) e o `file_size_limit` do
 * bucket (que devolveria um erro de Storage cru). O bucket sozinho não basta porque a mensagem
 * dele não é para humano; esta sozinha não basta porque a rota não é o único jeito de escrever no
 * bucket se um dia a `service_role` for usada de outro lugar.
 */
export const LIMITE_DE_BYTES = 2 * 1024 * 1024

/**
 * A extensão de um MIME aceito, ou `null`.
 *
 * `Object.hasOwn`, e **nunca** `in` nem a verdade do valor. Medido nesta story: `"constructor" in
 * EXTENSAO_POR_MIME` é `true` pela cadeia de protótipos, e `EXTENSAO_POR_MIME["constructor"]` é a
 * função `Object` — truthy. Um arquivo com `type: "constructor"` seria classificado como aceito e
 * o caminho gravado carregaria o CÓDIGO-FONTE da função como "extensão". O `in` deixou o teste
 * vermelho aqui antes de chegar à tela.
 */
function extensaoDe(mime: string): string | null {
  return Object.hasOwn(EXTENSAO_POR_MIME, mime) ? (EXTENSAO_POR_MIME[mime] ?? null) : null
}

/** O que a rota devolve, e o que o componente traduz. */
export interface RecusaDeArquivo {
  codigo: string
  status: number
  mensagem: string
}

/** Só o que a decisão precisa de um arquivo — não é `File`, para o teste não precisar de DOM. */
export interface ArquivoDeLogo {
  tipo: string
  tamanho: number
}

/**
 * AC3 — a validação, em UMA função, na ordem em que a AC a escreve.
 *
 * `null` = arquivo aceito. Ordem: ausência (400) antes de tipo (422) antes de tamanho (422).
 * A ordem importa: um arquivo de 5 MB **e** de tipo errado é primeiro um tipo errado — trocar a
 * extensão não faria ele caber.
 *
 * ⚠️ `arquivo` aceita `null` de propósito. `formData.get("file")` devolve `null` quando o campo
 * não veio, e um valor default de parâmetro comeria justamente o caso que a AC nomeia
 * (`ARQUIVO_OBRIGATORIO`).
 */
export function validarArquivoDeLogo(arquivo: ArquivoDeLogo | null): RecusaDeArquivo | null {
  if (!arquivo) {
    return {
      codigo: "ARQUIVO_OBRIGATORIO",
      status: 400,
      mensagem: "Escolha um arquivo de imagem para enviar.",
    }
  }
  if (!extensaoDe(arquivo.tipo)) {
    return {
      codigo: "TIPO_NAO_SUPORTADO",
      status: 422,
      mensagem: "Tipo de arquivo não suportado. Use PNG, JPEG ou WebP.",
    }
  }
  if (arquivo.tamanho > LIMITE_DE_BYTES) {
    return {
      codigo: "ARQUIVO_MUITO_GRANDE",
      status: 422,
      mensagem: "O arquivo passa de 2 MB.",
    }
  }
  return null
}

/** O caminho do objeto no bucket, para um tipo já validado. Ver `objetosAPurgar` logo abaixo. */
export function caminhoDoLogo(orgId: string, mime: string): string {
  const ext = extensaoDe(mime)
  if (!ext) {
    // Inalcançável por `validarArquivoDeLogo`, e é justamente por isso que estoura em vez de
    // inventar uma extensão: um caminho `.../logo.undefined` seria gravado sem ninguém notar.
    throw new Error(`MIME sem extensão mapeada: ${mime}`)
  }
  return `${orgId}/logo.${ext}`
}

/** O nome que o Storage cria sozinho para representar prefixo vazio — não é objeto do logo. */
export const PLACEHOLDER_DE_PASTA_VAZIA = ".emptyFolderPlaceholder"

/**
 * AC4 (CORREÇÃO PO) — quais objetos do prefixo `{org_id}/` precisam sumir.
 *
 * ## O defeito que esta função existe para fechar
 *
 * `{org_id}/logo.{ext}` **não** é "um arquivo por empresa", e o `upsert: true` **não** substitui
 * o que está em outro caminho. Enviar `logo.png` e depois `logo.webp` produz DOIS caminhos: o
 * `.png` antigo continua no bucket, **publicamente legível** (o bucket é `public`), fora de
 * qualquer trilha, e `logo_url` aponta só para o novo. Não há cron de limpeza para este bucket —
 * ninguém nunca mais o remove.
 *
 * Devolve caminhos COMPLETOS (`{org_id}/{nome}`), porque é isso que `remove()` recebe. `list()`
 * devolve nome relativo ao prefixo, e passar o relativo para `remove()` apagaria — silenciosamente
 * e com sucesso aparente — nada.
 *
 * O placeholder de pasta vazia fica de fora: apagá-lo não é errado, mas é ruído numa lista que o
 * carrasco da AC4 conta ("exatamente 1 objeto").
 */
export function objetosAPurgar(orgId: string, nomes: string[], destino: string): string[] {
  return nomes
    .filter((nome) => nome !== PLACEHOLDER_DE_PASTA_VAZIA)
    .map((nome) => `${orgId}/${nome}`)
    .filter((caminho) => caminho !== destino)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// AC9 — o que a UI DECLARA. É o texto que impede a tela de prometer o que ela não faz.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * AC0/AC9, normativa. A `900-62` já anunciou que esta story ia precisar repetir a mesma
 * honestidade dos dados fiscais (`AVISO_DOS_DADOS_FISCAIS`): guardar um dado não é o mesmo que
 * ele ter efeito.
 *
 * Medido: `git grep -n "logo_url" packages/web/src supabase/migrations` devolvia UMA ocorrência —
 * a definição da coluna em `001_base_schema.sql:62`. Nenhuma tela de login, cabeçalho, sidebar,
 * e-mail transacional ou export lê essa coluna. Quem liga os pontos é a `900-64`.
 */
export const AVISO_DE_QUE_ISTO_SO_GUARDA =
  "Isto guarda o arquivo — ainda não há tela do CRM do cliente (login, cabeçalho, e-mails) " +
  "lendo este logo automaticamente. É um cadastro pronto para quando essa exibição existir."

// ─────────────────────────────────────────────────────────────────────────────────────────────
// AC8 — o desfecho do envio e da remoção
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface CorpoDaRespostaDoLogo {
  error?: unknown
  message?: unknown
  /** DELETE — `false` quando `logo_url` foi limpo mas o objeto não saiu do bucket. */
  arquivoRemovido?: unknown
}

export interface DesfechoDoLogo {
  /**
   * Encerrar o envio como sucesso é AFIRMAR ao operador que gravou. Só o `200` autoriza — e aqui
   * `200` quer dizer que o `UPDATE` e a linha de trilha aconteceram na MESMA transação da
   * migration `254`.
   */
  sucesso: boolean
  /** A mensagem de ERRO que o operador lê. `null` no sucesso; nunca a string vazia. */
  erro: string | null
}

/**
 * AC8 — as frases por código.
 *
 * Elas vivem no CLIENTE, e não só no servidor, pelo mesmo motivo da `900-62`:
 * `CONFLITO_DE_CONCORRENCIA` precisa dizer ao operador **o que fazer** ("recarregue a página"), e
 * isso é sobre a tela, não sobre o banco.
 */
export const MENSAGEM_POR_CODIGO_DO_LOGO: Readonly<Record<string, string>> = {
  ARQUIVO_OBRIGATORIO: "Escolha um arquivo de imagem para enviar.",
  TIPO_NAO_SUPORTADO: "Tipo de arquivo não suportado. Use PNG, JPEG ou WebP.",
  ARQUIVO_MUITO_GRANDE: "O arquivo passa de 2 MB.",
  CONFLITO_DE_CONCORRENCIA:
    "Os dados desta empresa foram alterados por outra pessoa enquanto você estava nesta tela. " +
    "Recarregue a página antes de tentar de novo.",
  EXPECTED_UPDATED_AT_REQUIRED:
    "Recarregue a página: falta a marca de versão dos dados que você abriu.",
}

/**
 * AC8 — decide o desfecho a partir da resposta da rota.
 *
 * ## Falha NÃO some com o painel, sucesso recarrega
 *
 * Mesma decisão da `900-60`/`900-62`, e é a que precisa de carrasco: escrita dentro do `.tsx` ela
 * não teria juiz nenhum. O código VENCE o `message` do servidor porque o `message` é verdadeiro
 * mas às vezes cru (o PostgREST fala de "schema cache"). Códigos desconhecidos caem no primeiro
 * campo NÃO-BRANCO — `""` não é nullish, e um `??` deixaria o operador olhando uma tela sem uma
 * palavra sobre o que houve.
 */
export function decidirDesfechoDoLogo(
  ok: boolean,
  status: number,
  corpo: CorpoDaRespostaDoLogo,
): DesfechoDoLogo {
  if (ok) return { sucesso: true, erro: null }

  const codigo = typeof corpo.error === "string" ? corpo.error : ""
  const conhecida = MENSAGEM_POR_CODIGO_DO_LOGO[codigo]
  if (conhecida) return { sucesso: false, erro: conhecida }

  const doServidor = [corpo.message, corpo.error].find(
    (m): m is string => typeof m === "string" && m.trim() !== "",
  )
  return { sucesso: false, erro: doServidor ?? `Falhou (HTTP ${status}).` }
}

/**
 * AC4 — o aviso de que o cadastro foi limpo mas o ARQUIVO continua no balde.
 *
 * A ordem da remoção é RPC → Storage (a inversa deixaria `logo_url` apontando para um `404`
 * público). Quando o `remove()` falha depois de a RPC ter passado, o desfecho é honesto mas
 * assimétrico: para o operador o logo saiu (nenhuma tela aponta para ele), e ao mesmo tempo um
 * arquivo publicamente legível continua no bucket. Dizer "removido" e calar sobre isso seria a
 * tela afirmando mais do que aconteceu.
 *
 * `null` quando não há o que avisar — inclusive quando o campo não veio na resposta, porque
 * "não sei" não autoriza afirmar que ficou lixo para trás.
 */
export function avisoDeArquivoNaoRemovido(corpo: CorpoDaRespostaDoLogo): string | null {
  if (corpo.arquivoRemovido !== false) return null
  return (
    "O cadastro do logo foi limpo, mas o arquivo não pôde ser apagado do armazenamento — ele " +
    "continua acessível por URL direta. Avise quem cuida da infraestrutura."
  )
}

/**
 * AC8 — a URL que o `<img>` do card usa, com a marca de versão pendurada.
 *
 * ## Por que não é `logo_url` cru, apesar de a AC escrever `<img src={org.logo_url}>`
 *
 * O caminho no Storage é `{org_id}/logo.{ext}` — **fixo por extensão**. Trocar um PNG por outro
 * PNG produz a MESMA URL pública, e o Storage do Supabase serve objeto público com
 * `cache-control: max-age=3600`. Sem marca de versão, o operador que acabou de substituir o logo
 * continuaria vendo o antigo por até uma hora, com `200` na tela e a trilha registrando a troca:
 * a tela afirmando um estado que ela não está mostrando.
 *
 * `updated_at` é a marca certa porque é exatamente o que o trigger `set_updated_at` bomba na
 * MESMA transação do `UPDATE` que gravou a URL nova.
 *
 * `null` entra e `null` sai: não existe pré-visualização de logo que não existe, e inventar uma
 * URL aqui produziria um `<img>` quebrado no lugar do placeholder neutro.
 */
export function urlDePreVisualizacao(logoUrl: string | null, updatedAt: string): string | null {
  if (!logoUrl) return null
  const separador = logoUrl.includes("?") ? "&" : "?"
  return `${logoUrl}${separador}v=${encodeURIComponent(updatedAt)}`
}
