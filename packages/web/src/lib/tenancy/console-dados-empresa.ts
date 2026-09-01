/**
 * Story 900-62 · AC2/AC4/AC7/AC8/AC9 — validação, normalização e desfecho da edição dos dados de
 * uma empresa, FORA do componente.
 *
 * ## Por que este módulo existe em vez de lógica dentro do `.tsx`
 *
 * `vitest.config.ts` inclui `packages/web/src/**\/*.test.ts` — e **não** `.tsx`. Decisão escrita
 * dentro de um componente é decisão sem carrasco: o gate da `900-60` mediu isso (QA-900-60-1),
 * onde acrescentar um `aoFechar()` ao ramo de erro deixava `tsc` rc=0 e a suíte INTEIRA verde.
 * Aqui, cada decisão tem um `it` que fica vermelho quando ela muda.
 *
 * ## Uma única implementação de validação, usada nos DOIS lados
 *
 * `validarDadosDaEmpresa()` é chamada pela rota (`api/platform/orgs/[id]/dados/route.ts`, que é
 * a fonte da verdade) **e** pelo diálogo (para desabilitar "Salvar" antes do round-trip). A AC7.5
 * pede que a validação do cliente "espelhe a da rota" — a forma mais barata de garantir espelho é
 * não ter duas implementações. Se fossem duas, a divergência entre elas seria invisível: o
 * operador veria o botão liberado e levaria um `400`.
 *
 * ## Nada aqui reescreve algoritmo de validação
 *
 * E-mail, telefone e CNPJ vêm de `@web/lib/validation/contato.ts` (Stories 80-1 e 75-282), que já
 * têm dígito verificador de verdade. A escolha de `isValidCnpj` e **não** de `cpfCnpjError` é
 * medida, não estilística: `cpfCnpjError` aceita 11 dígitos como CPF válido, então um CPF
 * digitado no campo "CNPJ" passaria — o campo é CNPJ, a régua é de CNPJ.
 *
 * ## `null` não chega ao banco (Task 2.2b)
 *
 * `normalizeCpfCnpj('')` devolve **`null`** (medido em `contato.ts:66-69`, e é o contrato certo
 * para a coluna nullable de onde ela veio). Passar esse `null` adiante era o gatilho do defeito
 * medido pelo @po: sob a forma `jsonb_set` da v0.2, ele anulava a coluna `settings` INTEIRA. A
 * migration `252` já não usa `jsonb_set` — mas a normalização daqui devolve `""` de qualquer
 * jeito, porque é isso que a comparação de no-op da AC4 e a de `campos_alterados` esperam:
 * "campo vazio" tem UMA representação só, dos dois lados.
 */

import {
  formatPhoneBR,
  isValidCnpj,
  isValidEmail,
  isValidPhoneBR,
  normalizeCpfCnpj,
  normalizeEmail,
} from "@web/lib/validation/contato"

/**
 * A MESMA regex de `provision_org` (`supabase/migrations/240_provision_org.sql:60`),
 * reaproveitada tal como está. Duas grafias diferentes de "slug válido" no mesmo sistema é como
 * se cria uma empresa que o console aceita criar e recusa editar.
 */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Tetos de tamanho. `name`, `slug` e `razao_social` param em 255 porque é o teto REAL da coluna
 * `varchar(255)` de `organizations` (`001_base_schema.sql:60`) — não um número escolhido aqui.
 * `contato_nome` segue a mesma família. `endereco` é o único cap de engenharia declarado (AC2):
 * não existe precedente de endereço estruturado em nenhuma migration do repositório, e inventar
 * um schema de CEP/logradouro/UF que ninguém pediu seria o Artigo IV pelo avesso.
 */
export const LIMITES = {
  name: 255,
  contatoNome: 255,
  fiscalRazaoSocial: 255,
  fiscalEndereco: 500,
} as const

/** Os OITO campos, como o operador os digita (com máscara, com maiúscula, sem `trim`). */
export interface DadosDaEmpresaEditaveis {
  name: string
  slug: string
  contatoNome: string
  contatoEmail: string
  contatoTelefone: string
  fiscalCnpj: string
  fiscalRazaoSocial: string
  fiscalEndereco: string
}

/** Os OITO campos como vão para o banco — e nenhum deles é `null`. Ver o bloco do topo. */
export type DadosNormalizados = DadosDaEmpresaEditaveis

export interface ErroDeValidacao {
  /** O código que a rota devolve no corpo e que o diálogo traduz (AC9). */
  codigo: string
  /** A frase que o operador lê. */
  mensagem: string
}

export interface ResultadoDaValidacao {
  erro: ErroDeValidacao | null
  /** Preenchido SEMPRE — inclusive quando há erro, para a rota não precisar recalcular. */
  normalizado: DadosNormalizados
}

/** Aceita `unknown` de propósito: o corpo da requisição é JSON de fora, não um objeto tipado. */
function texto(v: unknown): string {
  return typeof v === "string" ? v : ""
}

/**
 * AC2 — a tabela de validação da story, em código.
 *
 * Ordem das checagens = ordem da tabela: identidade primeiro (os dois obrigatórios), contato
 * depois, fiscal por último. Só o PRIMEIRO erro volta: mostrar seis mensagens de uma vez num
 * diálogo de três seções esconde qual delas o operador precisa consertar agora.
 */
export function validarDadosDaEmpresa(entrada: Partial<Record<keyof DadosDaEmpresaEditaveis, unknown>>): ResultadoDaValidacao {
  const name = texto(entrada.name).trim()
  const slug = texto(entrada.slug).trim()
  const contatoNome = texto(entrada.contatoNome).trim()
  const contatoEmailCru = texto(entrada.contatoEmail).trim()
  const contatoTelefoneCru = texto(entrada.contatoTelefone).trim()
  const fiscalCnpjCru = texto(entrada.fiscalCnpj).trim()
  const fiscalRazaoSocial = texto(entrada.fiscalRazaoSocial).trim()
  const fiscalEndereco = texto(entrada.fiscalEndereco).trim()

  const normalizado: DadosNormalizados = {
    name,
    slug,
    contatoNome,
    contatoEmail: normalizeEmail(contatoEmailCru),
    // `formatPhoneBR("")` devolve `""` — a máscara não fabrica parênteses de um campo vazio.
    contatoTelefone: formatPhoneBR(contatoTelefoneCru),
    // `?? ""` é a Task 2.2b: `normalizeCpfCnpj("")` devolve `null`, e `null` não chega ao banco.
    fiscalCnpj: normalizeCpfCnpj(fiscalCnpjCru) ?? "",
    fiscalRazaoSocial,
    fiscalEndereco,
  }

  const erro = primeiroErro({
    name,
    slug,
    contatoNome,
    contatoEmailCru,
    contatoTelefoneCru,
    fiscalCnpjCru,
    fiscalRazaoSocial,
    fiscalEndereco,
  })

  return { erro, normalizado }
}

function primeiroErro(v: {
  name: string
  slug: string
  contatoNome: string
  contatoEmailCru: string
  contatoTelefoneCru: string
  fiscalCnpjCru: string
  fiscalRazaoSocial: string
  fiscalEndereco: string
}): ErroDeValidacao | null {
  if (!v.name) {
    return { codigo: "NOME_OBRIGATORIO", mensagem: "O nome da empresa é obrigatório." }
  }
  if (v.name.length > LIMITES.name) {
    return { codigo: "NOME_LONGO_DEMAIS", mensagem: `O nome passa de ${LIMITES.name} caracteres.` }
  }
  if (!v.slug) {
    return { codigo: "SLUG_OBRIGATORIO", mensagem: "O identificador é obrigatório." }
  }
  if (!SLUG_RE.test(v.slug)) {
    return {
      codigo: "SLUG_INVALIDO",
      mensagem: "Identificador inválido — use minúsculas, números e hífen (ex.: acme-imoveis).",
    }
  }
  // Os seis abaixo são OPCIONAIS: vazio nunca é erro. Exigi-los bloquearia o caso de uso do dia 1
  // — corrigir um nome digitado errado numa empresa que ainda não tem contato nem fiscal.
  if (v.contatoNome.length > LIMITES.contatoNome) {
    return {
      codigo: "CONTATO_NOME_LONGO_DEMAIS",
      mensagem: `O nome do responsável passa de ${LIMITES.contatoNome} caracteres.`,
    }
  }
  if (v.contatoEmailCru && !isValidEmail(v.contatoEmailCru)) {
    return { codigo: "CONTATO_EMAIL_INVALIDO", mensagem: "E-mail do responsável inválido." }
  }
  if (v.contatoTelefoneCru && !isValidPhoneBR(v.contatoTelefoneCru)) {
    return {
      codigo: "CONTATO_TELEFONE_INVALIDO",
      mensagem: "Telefone do responsável inválido — use DDD + número.",
    }
  }
  // `isValidCnpj`, e NÃO `cpfCnpjError`: aquele aceitaria um CPF de 11 dígitos neste campo.
  if (v.fiscalCnpjCru && !isValidCnpj(v.fiscalCnpjCru)) {
    return { codigo: "FISCAL_CNPJ_INVALIDO", mensagem: "CNPJ inválido — confira os dígitos." }
  }
  if (v.fiscalRazaoSocial.length > LIMITES.fiscalRazaoSocial) {
    return {
      codigo: "FISCAL_RAZAO_SOCIAL_LONGA_DEMAIS",
      mensagem: `A razão social passa de ${LIMITES.fiscalRazaoSocial} caracteres.`,
    }
  }
  if (v.fiscalEndereco.length > LIMITES.fiscalEndereco) {
    return {
      codigo: "FISCAL_ENDERECO_LONGO_DEMAIS",
      mensagem: `O endereço passa de ${LIMITES.fiscalEndereco} caracteres.`,
    }
  }
  return null
}

/**
 * AC7/AC13 — os valores iniciais dos seis campos novos, lidos de `organizations.settings`.
 *
 * ⚠️ O `settings` que chega aqui pode ser `undefined` por DOIS motivos completamente diferentes,
 * e esta função não tem como distingui-los — quem precisa distinguir é a página (AC13): a coluna
 * estar vazia, ou a **projeção** não ter pedido a coluna. O segundo caso é o que a AC13 existe
 * para impedir com uma régua estática, porque o desfecho dele é perda de dado: o operador abre o
 * diálogo para corrigir o nome, os seis campos vêm em branco, ele salva, e o contato e o fiscal
 * que já estavam gravados são sobrescritos por vazio — com `200` na tela.
 */
export function lerContatoEFiscal(
  settings: unknown,
): Omit<DadosDaEmpresaEditaveis, "name" | "slug"> {
  const raiz = (settings ?? {}) as Record<string, unknown>
  const contato = (raiz.contato ?? {}) as Record<string, unknown>
  const fiscal = (raiz.fiscal ?? {}) as Record<string, unknown>
  return {
    contatoNome: texto(contato.nome),
    contatoEmail: texto(contato.email),
    contatoTelefone: texto(contato.telefone),
    fiscalCnpj: texto(fiscal.cnpj),
    fiscalRazaoSocial: texto(fiscal.razao_social),
    fiscalEndereco: texto(fiscal.endereco),
  }
}

const CHAVES: ReadonlyArray<keyof DadosDaEmpresaEditaveis> = [
  "name",
  "slug",
  "contatoNome",
  "contatoEmail",
  "contatoTelefone",
  "fiscalCnpj",
  "fiscalRazaoSocial",
  "fiscalEndereco",
]

/**
 * AC7.5 — "Salvar" fica desabilitado enquanto NENHUM dos oito mudou.
 *
 * A comparação é sobre os valores NORMALIZADOS dos dois lados, e isso importa: digitar
 * `ANA@EXEMPLO.COM` sobre um `ana@exemplo.com` já gravado não é mudança — `normalizeEmail`
 * derruba os dois para a mesma coisa, e liberar o botão ali prometeria uma edição que o banco ia
 * classificar como no-op (AC4) e devolver `200` sem gravar nada.
 */
export function houveMudanca(
  inicial: DadosDaEmpresaEditaveis,
  atual: DadosDaEmpresaEditaveis,
): boolean {
  const a = validarDadosDaEmpresa(inicial).normalizado
  const b = validarDadosDaEmpresa(atual).normalizado
  return CHAVES.some((k) => a[k] !== b[k])
}

/** AC7.5 — o botão "Salvar" só libera com mudança real E sem erro de formato. */
export function podeSalvar(
  inicial: DadosDaEmpresaEditaveis,
  atual: DadosDaEmpresaEditaveis,
): boolean {
  return validarDadosDaEmpresa(atual).erro === null && houveMudanca(inicial, atual)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// AC8 — o que a UI declara. Medido, não intuitivo.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Varredura completa de `.slug` em `packages/web/src` (84 ocorrências) não encontrou nenhuma rota
 * `[slug]`, resolução de tenant por subdomínio, nem uso em roteamento de webhook — o roteamento
 * de leads usa `org_id`/identificadores de canal (`webhook-org.ts`), nunca `organizations.slug`.
 * A frase diz exatamente isso, e nada além disso.
 */
export const AVISO_DO_IDENTIFICADOR =
  "O identificador não é usado para acessar o sistema nem para rotear mensagens — é só o nome " +
  "técnico exibido no console. Precisa ser único entre as empresas."

/**
 * A honestidade que a `900-63` vai precisar repetir sobre o logo: guardar um dado não é o mesmo
 * que ele ter efeito. Nenhuma fatura é gerada a partir destes campos hoje, porque não existe
 * fundação de cobrança nenhuma no sistema.
 */
export const AVISO_DOS_DADOS_FISCAIS =
  "Esses dados ainda não alimentam nenhuma fatura automaticamente — servem para ter o cadastro " +
  "pronto antes de a cobrança existir."

// ─────────────────────────────────────────────────────────────────────────────────────────────
// AC9/AC10 — o desfecho do envio
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface CorpoDaRespostaDaRota {
  error?: unknown
  message?: unknown
}

export interface DesfechoDaEdicao {
  /**
   * Fechar o diálogo é AFIRMAR ao operador que gravou. Só o `200` autoriza — e aqui `200` quer
   * dizer que o `UPDATE` e a linha de trilha aconteceram na MESMA transação da migration `252`.
   */
  fecha: boolean
  /** A mensagem que o operador lê. `null` **só** no sucesso; nunca a string vazia. */
  erro: string | null
}

/**
 * AC9 — as frases por código de erro.
 *
 * Elas vivem no CLIENTE, e não só no servidor, por uma razão: `CONFLITO_DE_CONCORRENCIA` precisa
 * dizer ao operador **o que fazer** ("recarregue a página"), e essa instrução é sobre a tela, não
 * sobre o banco. Um `message` genérico do servidor não teria como saber que existe uma página
 * para recarregar.
 */
export const MENSAGEM_POR_CODIGO: Record<string, string> = {
  CONTATO_EMAIL_INVALIDO: "E-mail do responsável inválido.",
  CONTATO_TELEFONE_INVALIDO: "Telefone do responsável inválido — use DDD + número.",
  FISCAL_CNPJ_INVALIDO: "CNPJ inválido — confira os dígitos.",
  CONFLITO_DE_CONCORRENCIA:
    "Os dados foram alterados por outra pessoa enquanto você editava. Recarregue a página para " +
    "ver a versão atual antes de tentar de novo.",
  SLUG_EM_USO: "Esse identificador já está em uso por outra empresa.",
}

/**
 * AC9/AC10 — decide o desfecho do envio a partir da resposta da rota.
 *
 * ## Falha NÃO fecha, sucesso FECHA — e é essa a decisão que precisa de carrasco
 *
 * Um diálogo que fecha em cima de uma falha descarta os oito campos já digitados e convida o
 * operador a tentar de novo um `5xx` que, na verdade, pode ter gravado. Escrita dentro do
 * componente, essa linha não teria juiz nenhum (`.tsx` fica fora do `include` do vitest).
 *
 * ## Por que o código VENCE o `message` do servidor
 *
 * O corpo de erro traz os dois. O `message` do servidor é verdadeiro mas às vezes cru (o
 * PostgREST fala de "schema cache"); o mapa acima traduz para a linguagem da tela. Códigos que o
 * mapa não conhece caem no primeiro campo NÃO-BRANCO — `""` não é nullish, e `?? ` deixaria o
 * operador olhando um diálogo aberto sem uma palavra sobre o que houve.
 */
export function decidirDesfechoDaEdicao(
  ok: boolean,
  status: number,
  corpo: CorpoDaRespostaDaRota,
): DesfechoDaEdicao {
  if (ok) return { fecha: true, erro: null }

  const codigo = typeof corpo.error === "string" ? corpo.error : ""
  const conhecida = MENSAGEM_POR_CODIGO[codigo]
  if (conhecida) return { fecha: false, erro: conhecida }

  const doServidor = [corpo.message, corpo.error].find(
    (m): m is string => typeof m === "string" && m.trim() !== "",
  )
  return { fecha: false, erro: doServidor ?? `Falhou (HTTP ${status}).` }
}
