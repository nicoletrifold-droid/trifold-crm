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

/** Ref do projeto Supabase de PRODUÇÃO. Identificador público, não segredo. */
export const REF_PRODUCAO = "dsopqkqjkmhytudaaolv"

/** Ref do projeto Supabase de TESTE (`trifold-crm-dev`). Identificador público. */
export const REF_TESTE = "xnxvygyfyyyzwhiuoehz"

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
  const m = limpa.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i)
  return m?.[1] ? m[1].toLowerCase() : null
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

  const ehProducao = ref === REF_PRODUCAO
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
      ref === REF_PRODUCAO
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

  const rotulo = ref === REF_TESTE ? "TESTE" : ref === REF_PRODUCAO ? "PRODUÇÃO" : "ref não catalogado"
  return `\x1b[32m✓\x1b[0m Supabase ref: ${ref} (${rotulo}) · NODE_ENV = ${modo}`
}
