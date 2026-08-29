/**
 * Story 900-3b · AC2 — a decisão do banner de ambiente, isolada como função pura.
 *
 * ### Por que isto não mora dentro do `instrumentation.ts`
 *
 * A propriedade "o `pnpm dev` aponta para teste" é de runtime e depende da precedência de
 * dotenv do Next — nenhuma régua estática a enxerga. O banner é o instrumento certo, mas se
 * a decisão viver dentro do `register()`, o único juiz possível é um humano lendo stdout,
 * e isso é irrepetível. Decompondo: a **decisão** vira função pura testável em unidade, e o
 * `pnpm dev` continua sendo a evidência de **integração** — não a única prova.
 *
 * ### Por que NÃO reusar `lib/env.ts`
 *
 * Os getters de `lib/env.ts` **lançam** quando a variável falta. O banner precisa funcionar
 * exatamente no caso em que ela falta — usá-los aqui trocaria o aviso por um crash.
 *
 * ### Os três estados, e por que "ausente" não podia ser dobrado em "ok" (emenda D1)
 *
 * A decisão do C1 foi deliberada: `pnpm build` (sem flag) roda com `NODE_ENV=production` e
 * **não** lê `.env.development`; depois dos renames desta story nenhum arquivo da lista que
 * o `next build` consulta existe em `packages/web/`. Logo o build default fica sem nenhuma
 * variável de Supabase — o que é mais seguro do que assar produção por acidente.
 *
 * O problema é que esse build **não falha**: `lib/supabase/client.ts` usa
 * `process.env.NEXT_PUBLIC_SUPABASE_URL!` (non-null assertion, não o getter que lançaria),
 * então `undefined` é assado no bundle em silêncio. Com um tipo de dois estados, a
 * implementação natural seria `undefined → "ok"` ("não é o ref de produção, logo não
 * alerta") e o estado que a decisão do C1 criou de propósito subiria mudo. O terceiro
 * estado existe para dar carrasco a esse caso.
 *
 * ### O papel de `nodeEnv` — load-bearing nos DOIS sentidos
 *
 * A assinatura pedida pela AC2 recebe `nodeEnv`, e um parâmetro morto seria pior que
 * nenhum. Ele decide se o ref encontrado é o **esperado para aquele modo**:
 *
 * | ref | `nodeEnv` | veredito | por quê |
 * |---|---|---|---|
 * | produção | `production` | `ok` | é o deploy. Alertar aqui a cada boot da Vercel satura a régua e treina o time a ignorar o banner. |
 * | produção | qualquer outro | `alerta` | é o caso que a story existe para tornar visível (`dev:prod`, ou um rename esquecido). |
 * | teste | `production` | `alerta` | risco R5 da story: um `next start` sobre um `build:teste`, ou um deploy assado contra o banco de teste. |
 * | teste | qualquer outro | `ok` | o default novo do `pnpm dev`. |
 * | nenhum | qualquer | `ausente` | precede tudo — sem ref não há o que julgar (D1). |
 *
 * `nodeEnv` nunca cala um alerta que o ref sozinho levantaria em modo de desenvolvimento;
 * ele só acrescenta um alerta (linha 3) ou reconhece o deploy legítimo (linha 1).
 *
 * ### O banner nunca é silencioso
 *
 * Mesmo em `"ok"` o `instrumentation.ts` imprime uma linha nomeando o ref. Um veredito
 * verde que não mostra contra o que se está falando é indistinguível de nenhum banner.
 */

import {
  ehRefDeProducao,
  ehRefDeTeste,
  extrairRefDeUrlSupabase,
  REFS_PERMITIDOS_PRODUCAO,
  REFS_PERMITIDOS_TESTE,
} from "@trifold/shared"

/**
 * ⚠️ PR #524: aqui existiam `REF_PRODUCAO`/`REF_TESTE` como constantes próprias deste
 * arquivo. Eram iguais às dos scripts **hoje**, e livres para divergir amanhã — uma segunda
 * definição de "o que é produção", que é o defeito que a AC3 desta story existiu para matar.
 * Agora as duas pontas derivam de `@trifold/shared`
 * (`packages/shared/src/constants/supabase-refs.ts`), que é o único lugar onde os refs são
 * cadastrados. `packages/web` não pode importar de `scripts/`, por isso a fonte única mora
 * no pacote compartilhado, e não em `scripts/lib/db-env.ts`.
 *
 * Os nomes antigos seguem exportados porque os testes e o `textoDoBanner` os usam como
 * rótulo — mas agora são **derivados**, não declarados.
 */
function primeiro(conjunto: ReadonlySet<string>): string {
  const [v] = conjunto
  return v ?? ""
}

/** Ref do projeto Supabase de PRODUÇÃO. Identificador público, não segredo. */
export const REF_PRODUCAO = primeiro(REFS_PERMITIDOS_PRODUCAO)

/** Ref do projeto Supabase de TESTE (`trifold-crm-dev`). Identificador público. */
export const REF_TESTE = primeiro(REFS_PERMITIDOS_TESTE)

export type EstadoDoAmbiente = "ok" | "alerta" | "ausente"

/**
 * Extrai o project ref de uma URL `https://<ref>.supabase.co`.
 * Devolve `null` para tudo que não seja isso — incluindo `undefined`, string vazia,
 * string de placeholder e URL de outro host.
 */
export function extrairRef(url: string | undefined | null): string | null {
  if (typeof url !== "string") return null
  const limpa = url.trim()
  if (!limpa) return null
  return extrairRefDeUrlSupabase(limpa)
}

/**
 * Julga o ambiente a partir da URL do Supabase e do `NODE_ENV`.
 * Ver a tabela no cabeçalho do arquivo para a semântica completa.
 */
export function avaliarRefDoAmbiente(
  url: string | undefined,
  nodeEnv: string | undefined,
): EstadoDoAmbiente {
  const ref = extrairRef(url)
  if (ref === null) return "ausente"

  // Deriva da allowlist compartilhada, não de uma constante local — assim um ref de
  // produção acrescentado em `@trifold/shared` passa a ser reconhecido pelo banner
  // automaticamente, em vez de silenciosamente classificado como "não é produção".
  const ehProducao = ehRefDeProducao(ref)
  const modoProducao = nodeEnv === "production"

  if (ehProducao) return modoProducao ? "ok" : "alerta"
  return modoProducao ? "alerta" : "ok"
}

/**
 * Texto do banner. Separado do veredito para o `instrumentation.ts` não decidir nada —
 * ele só imprime.
 */
export function textoDoBanner(
  estado: EstadoDoAmbiente,
  url: string | undefined,
  nodeEnv: string | undefined,
): string {
  const ref = extrairRef(url)
  const modo = nodeEnv ?? "(NODE_ENV não definido)"

  if (estado === "ausente") {
    return [
      "",
      "\x1b[43m\x1b[30m ⚠  AMBIENTE AUSENTE \x1b[0m",
      "  Nenhum Supabase configurado — este build/boot NÃO fala com banco nenhum.",
      `  NEXT_PUBLIC_SUPABASE_URL = ${url === undefined ? "(indefinida)" : JSON.stringify(url)} · NODE_ENV = ${modo}`,
      "  Esperado em `pnpm build` (sem flag), por desenho da Story 900-3b.",
      "  Se você rodou `pnpm dev`, falta `packages/web/.env.development`.",
      "",
    ].join("\n")
  }

  if (estado === "alerta") {
    const causa =
      ehRefDeProducao(ref)
        ? "Este processo fala com o banco de PRODUÇÃO fora de um deploy de produção."
        : "Um processo em NODE_ENV=production está falando com o banco de TESTE."
    return [
      "",
      "\x1b[41m\x1b[97m ⛔  ATENÇÃO — AMBIENTE INESPERADO \x1b[0m",
      `  Supabase ref: ${ref} · NODE_ENV = ${modo}`,
      `  ${causa}`,
      "  `pnpm dev` (default) aponta para TESTE. `pnpm dev:prod` aponta para produção de propósito.",
      "",
    ].join("\n")
  }

  const rotulo = ehRefDeTeste(ref) ? "TESTE" : ehRefDeProducao(ref) ? "PRODUÇÃO" : "ref não catalogado"
  return `\x1b[32m✓\x1b[0m Supabase ref: ${ref} (${rotulo}) · NODE_ENV = ${modo}`
}
