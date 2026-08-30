/**
 * Story 900-21b · AC1 — validador estrutural de `docs/audits/admin-client-allowlist.json`.
 *
 * ## O que este arquivo NÃO é
 *
 * Não é o carrasco de completude da allowlist. Ele valida a **forma da justificativa** — se um
 * caminho aparece em duas seções, se uma entrada de `itera-orgs` cita a linha do loop, se um alvo
 * da Onda 2 venceu o prazo. Quem enxerga um `createAdminClient()` novo fora da allowlist é o
 * ESLint por AST, rodado num subprocesso por `scripts/admin-client-allowlist.test.ts`. As duas
 * réguas são necessárias e nenhuma sozinha basta: um `grep` mediria o arquivo, não o comportamento
 * (medido no parecer @po: `grep -rl "createAdminClient("` acusa 2 falso-positivos que o AST não
 * acusa); e uma régua de AST não vê um motivo copiado que mente sobre o que o arquivo faz.
 *
 * ## Regra 0 existe porque as Regras 1-3 aprovam o vazio
 *
 * Se `itera-orgs` fosse grafada `iteraOrgs`, as Regras 1-3 iterariam ZERO entradas e devolveriam
 * `[]` — verde por vacuidade, o mesmo defeito que a `900-3c` pagou uma rodada para descobrir. A
 * Regra 0 exige que as quatro seções existam, sejam objetos, não sejam vazias e tenham pelo menos
 * as contagens re-triadas em 2026-08-29 (16 / 24 / 12 / 12).
 *
 * ## Regra 3 itera ENTRADAS, não campos (ressalva do parecer @po, v2)
 *
 * A redação original era "todo `alvosExpiramEm` precisa ser >= hoje" — que itera sobre o campo.
 * Uma entrada de `alvos-onda-2` **sem** o campo nunca venceria, e a Regra 0 (`>= 12`) aceitaria
 * uma 13ª assim: a isenção com prazo viraria isenção permanente pela porta dos fundos. Aqui a
 * regra é "toda ENTRADA tem `alvosExpiramEm` E ele é >= hoje".
 */

/** Seções cujas entradas são `caminho -> motivo` (string). */
const SECOES_DE_MOTIVO = ["plataforma", "itera-orgs", "legitimos"] as const
/** Seção cujas entradas são `caminho -> { motivo, alvosExpiramEm }`. */
const SECAO_COM_PRAZO = "alvos-onda-2" as const

/** Todas as seções que a Regra 1 compara entre si. */
const SECOES = [...SECOES_DE_MOTIVO, SECAO_COM_PRAZO] as const
export type Secao = (typeof SECOES)[number]

/**
 * Contagens mínimas medidas na re-triagem de 2026-08-29 (Story 900-21b, AC1) e **re-medidas pela
 * Story 900-23**, que executou a correção dos alvos.
 *
 * São mínimos, não igualdades: a allowlist pode ganhar entrada legítima sem quebrar o teste — mas
 * não pode ESVAZIAR uma seção, que é o modo de falha que a Regra 0 existe para pegar.
 *
 * ⚠️ **Os mínimos sobem junto com a realidade, de propósito.** Um mínimo que fica para trás para
 * de pegar encolhimento: `itera-orgs` caindo de 29 para 24 numa story futura passaria batido se o
 * piso continuasse 24.
 */
export const MINIMOS: Record<Secao, number> = {
  // 16 → 17 (900-23): `nicole-health` reclassificado de `alvos-onda-2` para cá — vigia de
  // plataforma, agrega erro de IA de todas as orgs num canal único, permanente.
  plataforma: 17,
  // 24 → 29 (900-23): +`meta-ads-intelligence`, +`meta-capi-dispatch` (+ o `.test.ts` irmão),
  // +`followup` (os três corrigidos, agora iteram de fato) e +`lib/tenancy/for-each-org.ts`.
  "itera-orgs": 29,
  /**
   * 12 → 3 (900-23). **Este é o estado TERMINAL da seção**, não um número baixo arbitrário: os 3
   * que sobram são os órfãos não agendados (`calendly-sync`, `supremo-history-sync`,
   * `supremo-sync`), cuja decisão o plano aprovado adiou para a Onda 3. Quando a Onda 3 decidir o
   * destino deles, a seção fica vazia e a Regra 0 passa a acender — que é o comportamento certo:
   * seção vazia significa "a estrutura da allowlist mudou", e isso precisa de dono.
   */
  "alvos-onda-2": 3,
  legitimos: 12,
}

export interface Violacao {
  /** 0 = vivacidade da seção · 1 = caminho duplicado · 2 = `itera-orgs` sem `:linha` · 3 = prazo */
  regra: 0 | 1 | 2 | 3
  secao?: string
  caminho?: string
  mensagem: string
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** `YYYY-MM-DD` da data local — comparação lexicográfica é estável e não depende de fuso. */
function comoDataIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * @param json  conteúdo já parseado de `admin-client-allowlist.json`
 * @param hoje  injetável só para teste; em uso real é a data corrente — é o que faz
 *              `alvosExpiramEm` ser uma bomba-relógio de verdade, e não papel de parede.
 */
export function validarAllowlist(json: unknown, hoje: Date = new Date()): Violacao[] {
  const v: Violacao[] = []

  if (!ehObjeto(json)) {
    return [{ regra: 0, mensagem: "allowlist não é um objeto JSON" }]
  }

  // ── Regra 0 — vivacidade das seções ────────────────────────────────────────────────────────
  for (const secao of SECOES) {
    const bruto = json[secao]
    if (bruto === undefined) {
      v.push({ regra: 0, secao, mensagem: `seção "${secao}" ausente (grafia errada? seção removida?)` })
      continue
    }
    if (!ehObjeto(bruto)) {
      v.push({ regra: 0, secao, mensagem: `seção "${secao}" não é um objeto` })
      continue
    }
    const qtd = Object.keys(bruto).length
    if (qtd === 0) {
      v.push({ regra: 0, secao, mensagem: `seção "${secao}" está vazia` })
      continue
    }
    if (qtd < MINIMOS[secao]) {
      v.push({
        regra: 0,
        secao,
        mensagem: `seção "${secao}" tem ${qtd} entradas, abaixo do mínimo re-triado de ${MINIMOS[secao]}`,
      })
    }
  }

  // ── Regra 1 — caminho em duas seções ───────────────────────────────────────────────────────
  const ondeApareceu = new Map<string, string[]>()
  for (const secao of SECOES) {
    const bruto = json[secao]
    if (!ehObjeto(bruto)) continue
    for (const caminho of Object.keys(bruto)) {
      ondeApareceu.set(caminho, [...(ondeApareceu.get(caminho) ?? []), secao])
    }
  }
  for (const [caminho, secoes] of ondeApareceu) {
    if (secoes.length > 1) {
      v.push({
        regra: 1,
        caminho,
        mensagem: `"${caminho}" aparece em ${secoes.length} seções: ${secoes.join(", ")}`,
      })
    }
  }

  // ── Regra 2 — `itera-orgs` sem `:linha` no motivo ──────────────────────────────────────────
  const itera = json["itera-orgs"]
  if (ehObjeto(itera)) {
    for (const [caminho, motivo] of Object.entries(itera)) {
      if (typeof motivo !== "string") {
        v.push({ regra: 2, secao: "itera-orgs", caminho, mensagem: `"${caminho}": motivo não é string` })
        continue
      }
      if (!/:\d+/.test(motivo)) {
        v.push({
          regra: 2,
          secao: "itera-orgs",
          caminho,
          mensagem: `"${caminho}": motivo de itera-orgs precisa citar arquivo:linha do loop — não há ":" seguido de dígito`,
        })
      }
    }
  }

  // As outras duas seções de motivo não exigem `:linha`, mas exigem motivo não vazio: uma entrada
  // sem justificativa é uma isenção sem dono, e é assim que allowlist apodrece.
  for (const secao of SECOES_DE_MOTIVO) {
    const bruto = json[secao]
    if (!ehObjeto(bruto)) continue
    for (const [caminho, motivo] of Object.entries(bruto)) {
      if (typeof motivo !== "string" || motivo.trim() === "") {
        v.push({ regra: 0, secao, caminho, mensagem: `"${caminho}": motivo ausente ou vazio em "${secao}"` })
      }
    }
  }

  // ── Regra 3 — toda entrada de `alvos-onda-2` TEM prazo, e o prazo não venceu ────────────────
  const alvos = json[SECAO_COM_PRAZO]
  if (ehObjeto(alvos)) {
    const hojeIso = comoDataIso(hoje)
    for (const [caminho, entrada] of Object.entries(alvos)) {
      if (!ehObjeto(entrada)) {
        v.push({
          regra: 3,
          secao: SECAO_COM_PRAZO,
          caminho,
          mensagem: `"${caminho}": entrada de alvos-onda-2 precisa ser { motivo, alvosExpiramEm }`,
        })
        continue
      }
      if (typeof entrada.motivo !== "string" || entrada.motivo.trim() === "") {
        v.push({ regra: 3, secao: SECAO_COM_PRAZO, caminho, mensagem: `"${caminho}": motivo ausente ou vazio` })
      }
      const prazo = entrada.alvosExpiramEm
      if (typeof prazo !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(prazo) || Number.isNaN(Date.parse(prazo))) {
        v.push({
          regra: 3,
          secao: SECAO_COM_PRAZO,
          caminho,
          mensagem: `"${caminho}": alvosExpiramEm ausente ou fora do formato YYYY-MM-DD — isenção com prazo virando permanente pela porta dos fundos`,
        })
        continue
      }
      if (prazo < hojeIso) {
        v.push({
          regra: 3,
          secao: SECAO_COM_PRAZO,
          caminho,
          mensagem: `"${caminho}": prazo ${prazo} venceu (hoje é ${hojeIso}) — a Onda 2 atrasou; reavaliar a classificação, não empurrar a data`,
        })
      }
    }
  }

  return v
}
