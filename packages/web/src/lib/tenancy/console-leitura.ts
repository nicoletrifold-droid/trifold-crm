/**
 * Epic 900 · Console de plataforma — o vocabulário dos TRÊS estados de uma leitura.
 *
 * ## O defeito que este arquivo existe para tornar impossível
 *
 * O PostgREST não lança em falha: devolve `{ data: null, error }`. Quem escreve `data ?? []`
 * transforma "não consegui ler" em "li e não havia nada", e o segundo vira TEXTO na tela:
 * "sem administrador", "Não conectado", "Nenhuma ação registrada". São afirmações sobre o mundo
 * — e nenhuma delas foi medida.
 *
 * `leituraFalhou()` (em `console-visao-geral.ts`) já produzia o SINAL. O que faltava era o
 * vocabulário para CONSUMI-LO: enquanto cada tela escrevia `lista.length === 0 ? "nenhuma" : …`,
 * o sinal existia e nenhum consumidor o lia. Foi assim que a Visão geral ficou com o sinal
 * `adminsFalhou` criado e três consumidores cegos a ele, e foi assim que a casca da 900-57
 * nasceu inteira sem ele.
 *
 * Por isso cada função aqui recebe o `falhou` como campo OBRIGATÓRIO: esquecer de passá-lo é
 * erro de compilação, não uma tela que mente. Passá-lo como `false` literal compila — e é a
 * mutação que `console-fail-closed.test.ts` mede no texto-fonte dos call sites.
 *
 * ## Fail-closed aqui NÃO é "mostrar zero"
 *
 * `notFound()` numa falha de leitura é fail-closed (nada de errado aparece), e a casca da empresa
 * o mantém de propósito. Já "sem administrador" e "nenhuma ação registrada" não são: afirmam uma
 * AUSÊNCIA que ninguém mediu. A distinção é a mesma do `—` versus o `0` da Visão geral.
 */

import { deriveAdminInviteStatus, type AdminInviteStatus } from "@web/lib/tenancy/admin-invite"

/**
 * O estado de um bloco que desenha o resultado de uma leitura de lista.
 *
 * Três, e não dois: `"vazio"` é uma AFIRMAÇÃO ("não há nada"), e só pode ser feita quando a
 * consulta voltou. `"falhou"` vence sempre — inclusive quando algumas linhas chegaram, porque
 * uma página parcial não autoriza afirmar o total.
 */
export type EstadoDaLeitura = "falhou" | "vazio" | "cheio"

export function estadoDaLeitura(entrada: {
  falhou: boolean
  quantidade: number
}): EstadoDaLeitura {
  if (entrada.falhou) return "falhou"
  return entrada.quantidade === 0 ? "vazio" : "cheio"
}

/** O texto que um bloco de lista mostra quando a consulta que o alimentaria não voltou. */
export const AVISO_DE_LEITURA_QUE_NAO_VOLTOU =
  "Não foi possível ler estes dados agora. Isto não quer dizer que não haja nenhum — recarregue a página."

/**
 * O estado do convite do admin, com o quarto valor que o banco não produz: `"desconhecido"`.
 *
 * {@link deriveAdminInviteStatus} devolve três estados a partir de duas colunas — e quando a
 * consulta de `users` não volta, a ausência de linha de admin é indistinguível de "não li". Sem
 * este quarto estado a tela diz "sem administrador" (Visão geral) ou "Nenhum administrador
 * convidado para esta empresa" (Resumo) sobre uma empresa que pode ter um admin ativo.
 *
 * A derivação dos outros três é DELEGADA, e não reimplementada: duas telas do mesmo console
 * discordando sobre o mesmo fato é o defeito QA-900-51-2 em outra roupa.
 */
export type StatusDeAdminDeclarado = AdminInviteStatus | "desconhecido"

export function statusDeAdminDeclarado(entrada: {
  falhou: boolean
  adminInviteEmail: string | null
  admin: { id: string; authId: string | null } | null
}): StatusDeAdminDeclarado {
  if (entrada.falhou) return "desconhecido"
  return deriveAdminInviteStatus({
    adminInviteEmail: entrada.adminInviteEmail,
    admin: entrada.admin,
  })
}

/**
 * Os rótulos curtos da coluna "admin" na lista "Entraram recentemente" da Visão geral.
 *
 * `"admin: —"` é o MESMO travessão que `formatarContagem` devolve para uma contagem sem leitura,
 * e na mesma tela: o card "Convites pendentes" logo acima mostra `—` na mesma falha. Um rótulo
 * novo aqui faria a tela declarar a mesma ignorância de duas formas.
 */
export const ROTULOS_DE_ADMIN_NA_LISTA: Readonly<Record<StatusDeAdminDeclarado, string>> = {
  active: "admin ativo",
  pending: "admin pendente",
  none: "sem admin",
  desconhecido: "admin: —",
}

/**
 * O status da empresa na faixa de Identidade do Resumo.
 *
 * O Resumo repete a consulta de `organizations` que a casca já fez (ela precisa de
 * `admin_invite_email`), então as duas podem divergir: a da casca volta, a do Resumo não, e o
 * `org?.is_active ? "● ativa" : "○ inativa"` escrevia **"inativa"** sobre uma empresa no ar.
 * Desativar uma empresa é a ação mais cara do console — o operador não pode ler esse rótulo
 * saído de uma consulta que falhou.
 */
export type EstadoDaEmpresaDeclarado = "desconhecido" | "ativa" | "inativa"

export function estadoDaEmpresaDeclarado(entrada: {
  falhou: boolean
  org: { is_active: boolean } | null | undefined
}): EstadoDaEmpresaDeclarado {
  if (entrada.falhou || !entrada.org) return "desconhecido"
  return entrada.org.is_active ? "ativa" : "inativa"
}

/**
 * Corta a página no limite da tela e devolve a EVIDÊNCIA de que havia mais.
 *
 * A forma anterior era `linhas.length >= LIMITE`, que com exatamente `LIMITE` registros acende o
 * aviso "há mais registros" sem que exista uma linha a mais — afirmação sem evidência, a mesma
 * classe do teto de 1.000 do PostgREST que a Visão geral trata com `≥`.
 *
 * O chamador tem que buscar `limite + 1`. É esse registro excedente, e só ele, que prova a
 * existência de "mais" — e ele NÃO é renderizado, senão a tela mostraria 101 linhas dizendo que
 * mostra 100. Um chamador que esquecer de somar 1 na consulta faz `haMais` nunca acender: o
 * argumento do `.limit()` é medido no texto-fonte por `console-fail-closed.test.ts`.
 */
export function recortarComExcedente<T>(
  linhas: readonly T[],
  limite: number,
): { visiveis: T[]; haMais: boolean } {
  return { visiveis: linhas.slice(0, limite), haMais: linhas.length > limite }
}
