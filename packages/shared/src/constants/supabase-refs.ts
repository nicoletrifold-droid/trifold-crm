/**
 * Story 900-3b — a ÚNICA definição de "que projeto Supabase é qual" em todo o monorepo.
 *
 * ## Por que isto mora em `@trifold/shared` e não em `scripts/lib/db-env.ts`
 *
 * A allowlist nasceu em `scripts/lib/db-env.ts` (AC3), para substituir uma denylist de
 * tamanho 1 que falhava **aberta**. Mas o banner de ambiente
 * (`packages/web/src/lib/env-banner.ts`) precisa da mesma definição, e `packages/web` **não
 * pode** importar de `scripts/` — são pacotes diferentes, e o Next empacotaria um arquivo
 * de operação dentro do bundle da aplicação.
 *
 * O resultado, apontado na revisão do PR #524, era uma **segunda definição**: o banner com
 * seu próprio `REF_PRODUCAO`, os scripts com `REFS_PERMITIDOS_PRODUCAO`. Iguais hoje, livres
 * para divergir amanhã — e "duas definições de o que é produção" é exatamente o defeito que
 * a AC3 existiu para matar. Este arquivo é o ponto único do qual os dois derivam.
 *
 * ## Fail-closed: allowlist dos DOIS ambientes, não só de produção
 *
 * Uma allowlist só de produção protege o que conhece e **libera o desconhecido**: um projeto
 * de produção criado amanhã, ainda não cadastrado, não seria reconhecido como produção e
 * passaria como se fosse teste. Por isso o ambiente de teste também tem allowlist: um ref
 * que não está em nenhuma das duas listas é **recusado**, não presumido inofensivo.
 *
 * Cadastrar um ref aqui é uma linha de diff que alguém revisa. É o custo, e é o ponto.
 */

/** Refs de PRODUÇÃO. Dado real de cliente vive aqui. */
export const REFS_PERMITIDOS_PRODUCAO: ReadonlySet<string> = new Set(["dsopqkqjkmhytudaaolv"])

/** Refs de TESTE/desenvolvimento. Nunca recebem dado de produção. */
export const REFS_PERMITIDOS_TESTE: ReadonlySet<string> = new Set(["xnxvygyfyyyzwhiuoehz"])

/**
 * Extrai o project ref de uma URL `https://<ref>.supabase.co`, **normalizado em minúsculas**.
 *
 * A normalização mora aqui, no ponto único de extração, e não em cada comparação — foi
 * exatamente esse o furo achado no PR #524: o regex de extração era case-insensitive e o
 * `Set.has()` é case-sensitive, então `https://DSOPQ….supabase.co` produzia um ref que
 * **não casava** com a allowlist e a guarda de produção falhava **aberta**. Normalizar em
 * cada comparador faria o próximo comparador nascer com o mesmo furo.
 */
export function extrairRefDeUrlSupabase(url: string | undefined | null): string | null {
  if (typeof url !== "string") return null
  const limpa = url.trim()
  if (!limpa) return null
  const m = limpa.match(/^https:\/\/([a-zA-Z0-9]+)\.supabase\.co\/?$/)
  return m?.[1] ? m[1].toLowerCase() : null
}

/** `true` se o ref é de produção. Aceita qualquer caixa. */
export function ehRefDeProducao(ref: string | null | undefined): boolean {
  return typeof ref === "string" && REFS_PERMITIDOS_PRODUCAO.has(ref.toLowerCase())
}

/** `true` se o ref é de teste. Aceita qualquer caixa. */
export function ehRefDeTeste(ref: string | null | undefined): boolean {
  return typeof ref === "string" && REFS_PERMITIDOS_TESTE.has(ref.toLowerCase())
}
